const { Router } = require("express");
const { getDb } = require("../lib/db");
const { ObjectId } = require("mongodb");
const { requireAuth, requireOwner } = require("../lib/auth");

const router = Router();

// Plan catalog. `amount` is in cents — Checkout builds the price inline, so no
// Stripe dashboard products/price IDs are required to start charging.
const PLANS = [
  { id: "booking", name: "Booking access", amount: 3500, price: "$35/mo", blurb: "The online booking widget for your existing website" },
  { id: "website", name: "Website + Booking", amount: 9900, price: "$99/mo", blurb: "A custom website for your business with booking built in" },
  // Reduced partner rate — same as Booking access, assigned per-shop from the
  // admin console. Not shown on the public marketing site.
  { id: "booking-reduced", name: "Booking access (reduced)", amount: 2500, price: "$25/mo", blurb: "The online booking widget for your existing website — reduced rate" },
];

function stripeClient() {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  return require("stripe")(process.env.STRIPE_SECRET_KEY);
}

// ── Custom-branding add-on ───────────────────────────────────────────────────
// A recurring line item added ON TOP of the shop's plan that unlocks logo +
// color on the hosted booking page. Price is operator-set per shop (cents);
// default $5. The item is tagged metadata.addon="branding" so we can find it.
const BRANDING_DEFAULT_CENTS = 500;
const BRANDING_PRODUCT_ID = "storecal-branding";
const brandingPriceOf = (shop) => Number.isInteger(shop?.brandingAddonPrice) ? shop.brandingAddonPrice : BRANDING_DEFAULT_CENTS;

// Reuse a Product + a Price per amount (immutable prices → one per cents value),
// keyed by a deterministic lookup_key so we never create duplicates.
async function ensureBrandingPrice(stripe, cents) {
  try { await stripe.products.retrieve(BRANDING_PRODUCT_ID); }
  catch (e) {
    if (e && e.code === "resource_missing") await stripe.products.create({ id: BRANDING_PRODUCT_ID, name: "StoreCal Custom Branding" });
    else throw e;
  }
  const key = `storecal-branding-${cents}`;
  const found = await stripe.prices.list({ lookup_keys: [key], limit: 1 });
  if (found.data[0]) return found.data[0].id;
  const price = await stripe.prices.create({
    product: BRANDING_PRODUCT_ID, unit_amount: cents, currency: "usd",
    recurring: { interval: "month" }, lookup_key: key,
  });
  return price.id;
}
// The branding line item on a subscription, if present.
const brandingItemOf = (sub) => (sub?.items?.data || []).find((i) => i && i.metadata && i.metadata.addon === "branding") || null;

// Ensure the shop has a Stripe customer, creating one on first use. If the
// stored id doesn't exist in the current Stripe mode (e.g. after switching from
// test to live keys — customers are mode-specific), create a fresh one.
async function ensureCustomer(stripe, db, shop) {
  if (shop.stripeCustomerId) {
    try {
      const existing = await stripe.customers.retrieve(shop.stripeCustomerId);
      if (existing && !existing.deleted) return shop.stripeCustomerId;
    } catch (e) {
      if (!e || e.code !== "resource_missing") throw e; // real error → surface it
      // resource_missing → fall through and create a new customer for this mode
    }
  }
  const customer = await stripe.customers.create({
    name: shop.name,
    metadata: { shopId: shop._id.toString() },
  });
  await db.collection("shops").updateOne({ _id: shop._id }, { $set: { stripeCustomerId: customer.id } });
  return customer.id;
}

// GET /api/billing — live subscription status for the owner's shop.
router.get("/", requireAuth, requireOwner, async (req, res) => {
  try {
    const db = await getDb();
    const shop = await db.collection("shops").findOne({ _id: new ObjectId(req.auth.shopId) });

    // Ask Stripe directly whether this shop has an active subscription (no
    // webhooks needed). Determines whether the "subscribe to enable booking"
    // prompt shows and whether online booking is turned on.
    let subscribed = false, planId = null, status = null, renewsAt = null, freeMonthActive = false, freeMonths = 0, freeResumesAt = null, trialing = false, brandingActive = false;
    const stripe = stripeClient();
    if (stripe && shop?.stripeCustomerId) {
      try {
        const subs = await stripe.subscriptions.list({ customer: shop.stripeCustomerId, status: "all", limit: 5, expand: ["data.discounts"] });
        const active = subs.data.find((s) => ["active", "trialing", "past_due"].includes(s.status));
        if (active) {
          subscribed = true;
          status = active.status;
          planId = active.metadata?.planId || null;
          trialing = active.status === "trialing";
          brandingActive = !!brandingItemOf(active); // paid custom-branding add-on on the sub
          // Renewal date: recent Stripe API versions keep current_period_end on
          // the subscription item, not the subscription itself.
          const item = active.items?.data?.[0];
          const secs = item?.current_period_end || active.current_period_end || null;
          renewsAt = secs ? secs * 1000 : null;
          // Free-month comp: our coupons carry deterministic ids (storecal-free-<N>mo).
          // In 2026-06-24.dahlia the coupon id lives at discount.source.coupon;
          // older versions use discount.coupon — handle both.
          const ds = Array.isArray(active.discounts) ? active.discounts : (active.discount ? [active.discount] : []);
          for (const d of ds) {
            const cid = d && typeof d === "object"
              ? ((d.source && d.source.type === "coupon" && d.source.coupon) || d.coupon)
              : null;
            const id = typeof cid === "string" ? cid : (cid && cid.id);
            const mm = id && /^storecal-free-(\d+)mo$/.exec(id);
            if (mm) {
              freeMonths = Number(mm[1]);
              freeMonthActive = true;
              if (renewsAt) { const r = new Date(renewsAt); r.setMonth(r.getMonth() + freeMonths); freeResumesAt = r.getTime(); }
              break;
            }
          }
        }
      } catch { /* treat as not subscribed */ }
      // Cache results on the shop so the public booking page can gate without a
      // Stripe call: `subscribed` (booking CTAs) and `brandingAddon` (whether the
      // hosted page applies the custom logo/color).
      const brandingUnlocked = brandingActive || shop?.brandingAddonComp === true;
      try { await db.collection("shops").updateOne({ _id: shop._id }, { $set: { subscribed, brandingAddon: brandingUnlocked } }); } catch { /* non-fatal */ }
    }

    // The plan the operator assigned this shop (set via set-plan.js); the
    // Subscribe button charges this. Defaults to the first plan if unset.
    const assignedPlan = PLANS.find((p) => p.id === shop?.planId) || PLANS[0];

    // Custom-branding add-on state for the owner's Settings gate.
    const brandingComped = shop?.brandingAddonComp === true;
    const brandingPrice = brandingPriceOf(shop);

    res.json({
      subscribed,
      planId,
      status,
      renewsAt,          // next payment date (ms), or when the trial's first charge lands
      trialing,          // subscription is in its free-trial window
      freeMonthActive,   // operator comped upcoming invoice(s)
      freeMonths,        // how many whole months are comped
      freeResumesAt,     // when normal billing resumes (ms)
      firstMonthFree: shop?.firstMonthFree === true, // new signups start with a free month
      // "Free until N bookings" trial (operator-assigned per shop).
      bookingTrial: shop?.bookingTrial === true,
      bookingTrialLimit: (Number.isInteger(shop?.bookingTrialLimit) && shop.bookingTrialLimit > 0) ? shop.bookingTrialLimit : 3,
      bookingTrialUsed: Math.max(0, (shop?.publicBookingCount || 0) - (Number.isInteger(shop?.bookingTrialBaseline) ? shop.bookingTrialBaseline : 0)),
      bookingTrialEnded: !!shop?.bookingTrialEndedAt,
      assignedPlanId: assignedPlan.id,
      assignedPlan,
      // Custom-branding add-on:
      brandingPrice,                                   // cents/mo added on top of the plan
      brandingActive,                                  // paid add-on is on their subscription
      brandingComped,                                  // operator granted it free
      brandingUnlocked: brandingActive || brandingComped, // controls unlocked either way
      freeForLife: shop?.freeForLife === true, // comped account → hide all billing UI
      // Demo-mode accounts (operator "Booking access → Demo") aren't nagged to
      // subscribe — booking is already on and they're not a paying customer yet.
      promptBilling: shop?.promptBilling === true && shop?.freeForLife !== true && shop?.demo !== true,
      stripeConfigured: !!process.env.STRIPE_SECRET_KEY,
      mode: (process.env.STRIPE_SECRET_KEY || "").startsWith("sk_live") ? "live" : "test",
      plans: PLANS,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/billing/checkout — start a subscription for a plan.
// Body: { planId }. Returns a Stripe Checkout URL to redirect to.
router.post("/checkout", requireAuth, requireOwner, async (req, res) => {
  const stripe = stripeClient();
  if (!stripe) return res.status(400).json({ error: "Billing isn't connected yet." });
  try {
    const db = await getDb();
    const shop = await db.collection("shops").findOne({ _id: new ObjectId(req.auth.shopId) });
    if (!shop) return res.status(404).json({ error: "Shop not found" });

    // Use the plan the operator assigned to this shop (shop.planId). An explicit
    // planId in the request still wins; otherwise fall back to the first plan.
    const plan = PLANS.find((p) => p.id === (req.body.planId || shop.planId)) || PLANS[0];
    if (!plan) return res.status(400).json({ error: "No plan configured" });

    const customerId = await ensureCustomer(stripe, db, shop);
    const origin = req.headers.origin || "http://localhost:5173";

    const subscription_data = { metadata: { shopId: req.auth.shopId, planId: plan.id } };
    const sessionParams = {
      mode: "subscription",
      customer: customerId,
      line_items: [{
        quantity: 1,
        price_data: {
          currency: "usd",
          product_data: { name: `StoreCal ${plan.name}` },
          unit_amount: plan.amount,
          recurring: { interval: "month" },
        },
      }],
      metadata: { shopId: req.auth.shopId, planId: plan.id },
      subscription_data,
      success_url: `${origin}/?billing=success`,
      cancel_url: `${origin}/?billing=cancelled`,
    };

    // Trial handling — both capture the card now (Checkout skips card collection
    // during a trial unless we force it).
    if (shop.bookingTrial === true) {
      // "Free until N bookings": a long time-trial we END programmatically once
      // the shop hits its booking threshold (see lib/bookingTrial.js). Baseline
      // the counter so only bookings AFTER subscribing count toward the free run.
      subscription_data.trial_period_days = 3650; // ~never by time; ended by bookings
      sessionParams.payment_method_collection = "always";
      await db.collection("shops").updateOne(
        { _id: shop._id },
        { $set: { bookingTrialBaseline: shop.publicBookingCount || 0 }, $unset: { bookingTrialEndedAt: "" } }
      );
    } else if (shop.firstMonthFree === true) {
      // First month free: 30-day trial, first real charge lands automatically after.
      subscription_data.trial_period_days = 30;
      sessionParams.payment_method_collection = "always";
    }

    const session = await stripe.checkout.sessions.create(sessionParams);
    res.json({ url: session.url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/billing/portal — Stripe Billing Customer Portal (manage card + plan).
router.post("/portal", requireAuth, requireOwner, async (req, res) => {
  const stripe = stripeClient();
  if (!stripe) return res.status(400).json({ error: "Billing isn't connected yet." });
  try {
    const db = await getDb();
    const shop = await db.collection("shops").findOne({ _id: new ObjectId(req.auth.shopId) });
    if (!shop) return res.status(404).json({ error: "Shop not found" });

    const customerId = await ensureCustomer(stripe, db, shop);
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: req.headers.origin || "http://localhost:5173",
    });
    res.json({ url: session.url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/billing/branding — owner unlocks (or removes) the custom-branding
// add-on. Body: { on }. Adds/removes a recurring line item on their live
// subscription at the shop's configured price, on top of the plan.
router.post("/branding", requireAuth, requireOwner, async (req, res) => {
  const stripe = stripeClient();
  if (!stripe) return res.status(400).json({ error: "Billing isn't connected yet." });
  try {
    const db = await getDb();
    const shop = await db.collection("shops").findOne({ _id: new ObjectId(req.auth.shopId) });
    if (!shop) return res.status(404).json({ error: "Shop not found" });
    const on = req.body.on !== false;

    // Comped shops don't get charged — just flip the access flag.
    if (shop.brandingAddonComp === true) {
      await db.collection("shops").updateOne({ _id: shop._id }, { $set: { brandingAddon: on } });
      return res.json({ success: true, brandingUnlocked: on, brandingActive: false });
    }

    if (!shop.stripeCustomerId) return res.status(400).json({ error: "Start your subscription first, then add custom branding." });
    const subs = await stripe.subscriptions.list({ customer: shop.stripeCustomerId, status: "all", limit: 5 });
    const active = subs.data.find((s) => ["active", "trialing", "past_due"].includes(s.status));
    if (!active) return res.status(400).json({ error: "You need an active subscription before adding custom branding." });

    const existing = brandingItemOf(active);
    if (on) {
      if (!existing) {
        const price = await ensureBrandingPrice(stripe, brandingPriceOf(shop));
        await stripe.subscriptionItems.create({ subscription: active.id, price, quantity: 1, metadata: { addon: "branding" } });
      }
    } else if (existing) {
      await stripe.subscriptionItems.del(existing.id); // proration credited automatically
    }
    await db.collection("shops").updateOne({ _id: shop._id }, { $set: { brandingAddon: on } });
    res.json({ success: true, brandingUnlocked: on, brandingActive: on });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
