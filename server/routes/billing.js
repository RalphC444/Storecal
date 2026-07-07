const { Router } = require("express");
const { getDb } = require("../db");
const { ObjectId } = require("mongodb");
const { requireAuth, requireOwner } = require("../auth");

const router = Router();

// Plan catalog. `amount` is in cents — Checkout builds the price inline, so no
// Stripe dashboard products/price IDs are required to start charging.
const PLANS = [
  { id: "starter", name: "Starter", amount: 2900, price: "$29/mo", blurb: "1 location, up to 3 staff" },
  { id: "pro", name: "Pro", amount: 5900, price: "$59/mo", blurb: "Unlimited staff, reminders, analytics" },
];

function stripeClient() {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  return require("stripe")(process.env.STRIPE_SECRET_KEY);
}

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
    let subscribed = false, planId = null, status = null;
    const stripe = stripeClient();
    if (stripe && shop?.stripeCustomerId) {
      try {
        const subs = await stripe.subscriptions.list({ customer: shop.stripeCustomerId, status: "all", limit: 5 });
        const active = subs.data.find((s) => ["active", "trialing", "past_due"].includes(s.status));
        if (active) { subscribed = true; status = active.status; planId = active.metadata?.planId || null; }
      } catch { /* treat as not subscribed */ }
    }

    res.json({
      subscribed,
      planId,
      status,
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
    const plan = PLANS.find((p) => p.id === req.body.planId);
    if (!plan) return res.status(400).json({ error: "Unknown plan" });

    const db = await getDb();
    const shop = await db.collection("shops").findOne({ _id: new ObjectId(req.auth.shopId) });
    if (!shop) return res.status(404).json({ error: "Shop not found" });

    const customerId = await ensureCustomer(stripe, db, shop);
    const origin = req.headers.origin || "http://localhost:5173";
    const session = await stripe.checkout.sessions.create({
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
      subscription_data: { metadata: { shopId: req.auth.shopId, planId: plan.id } },
      success_url: `${origin}/?billing=success`,
      cancel_url: `${origin}/?billing=cancelled`,
    });
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

module.exports = router;
