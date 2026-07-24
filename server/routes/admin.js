// Platform-operator API: manage every shop (client) — create, list, update
// (plan / booking access / contact), and delete. Super-admin only.
const { Router } = require("express");
const { getDb } = require("../lib/db");
const { ObjectId } = require("mongodb");
const { requireAuth, requireSuperAdmin, hashPassword } = require("../lib/auth");
const { generatePublicKey } = require("../lib/shopScope");

const router = Router();
const PLAN_IDS = ["booking", "website", "booking-reduced"];
const NEW_CLIENT_PASSWORD = "storecal123"; // owner logs in with this, then must change it

// Booking-form presets per vertical (kept in sync with set-business-type.js).
const BOOKING_PRESETS = {
  salon: { vehicle: false, pet: false, providerPicker: true, providerLabel: "Choose your stylist", serviceLabel: "Select a service", notesLabel: "Anything we should know? (optional)", notesPlaceholder: "Allergies, preferences, inspiration photos, or anything else…" },
  grooming: { vehicle: false, pet: true, providerPicker: true, providerLabel: "Choose your groomer", serviceLabel: "Select a service", notesLabel: "Anything we should know? (optional)", notesPlaceholder: "Temperament, matting, sensitivities, or special requests…" },
  auto: { vehicle: true, pet: false, providerPicker: false, providerLabel: "", serviceLabel: "Select a service", notesLabel: "Describe the issue (optional)", notesPlaceholder: "What symptoms, noises, or concerns should we know about?" },
  generic: { vehicle: false, pet: false, providerPicker: false, providerLabel: "", serviceLabel: "Select a service", notesLabel: "Notes (optional)", notesPlaceholder: "Anything we should know before your appointment?" },
};

function stripeClient() {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  try { return require("stripe")(process.env.STRIPE_SECRET_KEY); } catch { return null; }
}

// Free-month comps are 100%-off coupons applied to the subscription. One free
// month is a `duration: once` coupon (waives the next invoice only); N months is
// a `duration: repeating, duration_in_months: N`. Coupons are reused by a fixed
// id per length so we never pile up duplicates in Stripe.
const MAX_FREE_MONTHS = 6;
function freeMonthCouponId(months) { return months <= 1 ? "storecal-free-1mo" : `storecal-free-${months}mo`; }
async function ensureFreeCoupon(stripe, months) {
  const id = freeMonthCouponId(months);
  try {
    return await stripe.coupons.retrieve(id);
  } catch (e) {
    if (!e || e.code !== "resource_missing") throw e;
    const params = months <= 1
      ? { id, percent_off: 100, duration: "once", name: "1 free month (StoreCal)" }
      : { id, percent_off: 100, duration: "repeating", duration_in_months: months, name: `${months} free months (StoreCal)` };
    return stripe.coupons.create(params);
  }
}

// Extract the coupon id from a subscription discount across Stripe API shapes.
// In 2026-06-24.dahlia the coupon lives at discount.source.coupon (an id);
// older versions put it at discount.coupon (id or inline object).
function couponIdOfDiscount(d) {
  if (!d || typeof d !== "object") return null;
  if (d.source && d.source.type === "coupon" && d.source.coupon) {
    return typeof d.source.coupon === "string" ? d.source.coupon : d.source.coupon.id;
  }
  if (d.coupon) return typeof d.coupon === "string" ? d.coupon : d.coupon.id;
  return null;
}
// Our free-month coupons are created with deterministic ids (storecal-free-<N>mo),
// so we read the month count straight from the id — no need to fetch the coupon.
function freeMonthsFromCouponId(id) {
  const m = id && /^storecal-free-(\d+)mo$/.exec(id);
  return m ? Number(m[1]) : 0;
}
// How many whole months of free comp are on a subscription (0 = none).
function freeDiscountOf(sub) {
  const ds = Array.isArray(sub?.discounts) ? sub.discounts : (sub?.discount ? [sub.discount] : []);
  for (const d of ds) {
    const months = freeMonthsFromCouponId(couponIdOfDiscount(d));
    if (months) return { months };
  }
  return null;
}
// The renewal timestamp (ms). Recent Stripe API versions moved
// current_period_end off the Subscription onto each subscription item, so read
// the item first and fall back to the legacy field for older library pins.
function renewsAtMs(sub) {
  const item = sub?.items?.data?.[0];
  const secs = item?.current_period_end || sub?.current_period_end || null;
  return secs ? secs * 1000 : null;
}
// Add N whole months to a ms timestamp (keeps day-of-month like Stripe cycles).
function addMonths(ms, n) {
  if (!ms || !n) return ms;
  const d = new Date(ms);
  d.setMonth(d.getMonth() + n);
  return d.getTime();
}

// Live subscription status, renewal date, payments made, and comp state.
async function subInfo(stripe, customerId) {
  const empty = { subscribed: false, renewsAt: null, status: null, paymentsCompleted: 0, freeMonthActive: false, freeMonths: 0, freeResumesAt: null, brandingActive: false };
  try {
    const subs = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 5, expand: ["data.discounts"] });
    const active = subs.data.find((s) => ["active", "trialing", "past_due"].includes(s.status));
    if (!active) return empty;
    // Count real payments (paid invoices with a non-zero amount — a comped $0
    // invoice is still "paid" in Stripe but isn't a payment the client made).
    let paymentsCompleted = 0;
    try {
      const invoices = await stripe.invoices.list({ customer: customerId, status: "paid", limit: 100 });
      paymentsCompleted = invoices.data.filter((inv) => (inv.amount_paid || 0) > 0).length;
    } catch { /* leave 0 */ }
    const renewsAt = renewsAtMs(active);
    const free = freeDiscountOf(active);
    const freeMonths = free ? free.months : 0;
    const brandingActive = !!(active.items?.data || []).find((i) => i && i.metadata && i.metadata.addon === "branding");
    return {
      subscribed: true,
      status: active.status,
      renewsAt,
      paymentsCompleted,
      freeMonthActive: freeMonths > 0,
      freeMonths,
      // Billing resumes after the free run: the next charge is at renewsAt, so
      // it resumes renewsAt + freeMonths months (null for a "forever" comp).
      freeResumesAt: freeMonths > 0 ? addMonths(renewsAt, freeMonths) : null,
      brandingActive,
    };
  } catch { return empty; }
}

router.use(requireAuth, requireSuperAdmin);

// POST /api/admin/shops — create a client (shop + owner login).
// Owner gets a known temporary password and must change it on first sign-in.
router.post("/shops", async (req, res) => {
  try {
    const { businessName, email } = req.body;
    if (!businessName || !businessName.trim()) return res.status(400).json({ error: "Business name is required" });
    if (!email || !email.trim()) return res.status(400).json({ error: "Owner email is required" });
    const businessType = BOOKING_PRESETS[req.body.businessType] ? req.body.businessType : "salon";
    const planId = PLAN_IDS.includes(req.body.planId) ? req.body.planId : "booking";
    const phone = (req.body.phone || "").trim();
    const website = (req.body.website || "").trim();

    const db = await getDb();
    const em = email.trim().toLowerCase();
    if (await db.collection("users").findOne({ email: em })) {
      return res.status(409).json({ error: "An account with that email already exists" });
    }

    let slug = (businessName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")) || "shop";
    if (await db.collection("shops").findOne({ slug })) slug += "-" + Math.random().toString(36).slice(2, 6);

    const shopRes = await db.collection("shops").insertOne({
      slug, name: businessName.trim(), businessType, booking: BOOKING_PRESETS[businessType],
      publicKey: generatePublicKey(), planId, phone, website,
      demo: true, promptBilling: true, createdAt: new Date(),
    });
    const shopId = shopRes.insertedId.toString();
    const shop = await db.collection("shops").findOne({ _id: shopRes.insertedId });

    // Owner login: known temp password, forced change on first sign-in.
    const userRes = await db.collection("users").insertOne({
      email: em, passwordHash: await hashPassword(NEW_CLIENT_PASSWORD), name: businessName.trim(),
      role: "owner", shopId, mustChangePassword: true, createdAt: new Date(),
    });

    // Owner is a bookable provider by default (mirrors self-registration) —
    // EXCEPT auto shops, which don't do per-staff booking. The provider row is
    // still created (inactive) so the no-staff fallback has a rep to attach the
    // booking to, but the owner never shows up as bookable staff.
    await db.collection("providers").insertOne({
      shopId, name: businessName.trim(), email: em, bio: "", photo: "",
      active: businessType !== "auto",
      ownerUserId: userRes.insertedId.toString(), serviceIds: [], sortOrder: 0, createdAt: new Date(),
    });

    const origin = req.headers.origin || "";
    res.status(201).json({
      _id: shopId, publicKey: shop.publicKey, slug,
      ownerEmail: em, tempPassword: NEW_CLIENT_PASSWORD,
      bookingUrl: origin ? `${origin}/book/${slug}` : null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/shops — every client with plan, booking, contact, subscription.
router.get("/shops", async (_req, res) => {
  try {
    const db = await getDb();
    const shops = await db.collection("shops").find({}).sort({ createdAt: 1 }).toArray();
    const ids = shops.map((s) => s._id.toString());

    const countBy = async (coll, match) => {
      const rows = await db.collection(coll).aggregate([
        ...(match ? [{ $match: match }] : []),
        { $group: { _id: "$shopId", n: { $sum: 1 } } },
      ]).toArray();
      const m = {}; rows.forEach((r) => { m[r._id] = r.n; }); return m;
    };
    const owners = await db.collection("users").find({ role: "owner", shopId: { $in: ids } }).toArray();
    const ownerBy = {}; const ownerActiveBy = {};
    owners.forEach((u) => { ownerBy[u.shopId] = u.email; ownerActiveBy[u.shopId] = u.lastActive || null; });

    // Usage: services, active staff, and appointments booked (all-time + this
    // calendar month) — so the operator can see how much each client uses.
    const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
    const [svc, staff, apptTotal, apptMonth, shopHours] = await Promise.all([
      countBy("services"),
      countBy("providers", { active: true }),
      countBy("appointments"),
      countBy("appointments", { createdAt: { $gte: monthStart } }),
      countBy("workingHours", { providerId: "shop" }), // shop-level hours = bookable
    ]);

    // Live subscription + renewal per shop that has a Stripe customer.
    const stripe = stripeClient();
    const subByShop = {};
    if (stripe) {
      await Promise.all(shops.filter((s) => s.stripeCustomerId).map(async (s) => {
        subByShop[s._id.toString()] = await subInfo(stripe, s.stripeCustomerId);
      }));
    }

    res.json(shops.map((s) => {
      const id = s._id.toString();
      const sub = subByShop[id];
      return {
        _id: id,
        name: s.name,
        slug: s.slug,
        publicKey: s.publicKey || null,
        businessType: s.businessType || "generic",
        planId: PLAN_IDS.includes(s.planId) ? s.planId : "booking",
        bookingActive: typeof s.bookingActive === "boolean" ? s.bookingActive : null,
        freeForLife: s.freeForLife === true, // comped account: always on, billing hidden
        demo: s.demo !== false, // on until the operator marks the client delivered
        showStaff: s.showStaff !== false,
        showGallery: s.showGallery !== false,
        showStaffGalleries: s.showStaffGalleries !== false,
        bookingEmailsOff: s.bookingEmailsOff === true, // operator disabled booking emails

        subscribed: sub ? sub.subscribed : (s.subscribed === true),
        renewsAt: sub ? sub.renewsAt : null,
        paymentsCompleted: sub ? sub.paymentsCompleted : 0,
        freeMonthActive: sub ? sub.freeMonthActive : false,
        freeMonths: sub ? sub.freeMonths : 0,
        freeResumesAt: sub ? sub.freeResumesAt : null,
        firstMonthFree: s.firstMonthFree === true, // new signups start with a 30-day free trial
        // "Free until N bookings" trial (operator-assigned).
        bookingTrial: s.bookingTrial === true,
        bookingTrialLimit: (Number.isInteger(s.bookingTrialLimit) && s.bookingTrialLimit > 0) ? s.bookingTrialLimit : 3,
        bookingTrialUsed: Math.max(0, (s.publicBookingCount || 0) - (Number.isInteger(s.bookingTrialBaseline) ? s.bookingTrialBaseline : 0)),
        bookingTrialEnded: !!s.bookingTrialEndedAt,
        // Custom-branding add-on (operator-configurable price + comp).
        brandingAddonPrice: Number.isInteger(s.brandingAddonPrice) ? s.brandingAddonPrice : 500,
        brandingAddonComp: s.brandingAddonComp === true,
        brandingActive: sub ? sub.brandingActive : false,
        promptBilling: s.promptBilling === true,
        ownerEmail: ownerBy[id] || "",
        phone: s.phone || "",
        website: s.website || "",
        services: svc[id] || 0,
        staff: staff[id] || 0,
        appointments: apptTotal[id] || 0,
        appointmentsThisMonth: apptMonth[id] || 0,
        emailsSent: s.usage?.emailsSent || 0,
        createdAt: s.createdAt || null,
        // ── Funnel / activation signals ──
        lastActive: ownerActiveBy[id] || null,
        activatedAt: s.activatedAt || null,
        // "Activated" = the booking page can actually take a booking (has a
        // service AND shop-level hours). Computed live so it's right even for
        // shops created before activatedAt tracking existed.
        activated: (svc[id] || 0) > 0 && (shopHours[id] || 0) > 0,
        firstBookingAt: s.firstBookingAt || null,
        firstPublicBookingAt: s.firstPublicBookingAt || null,
      };
    }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/admin/shops/:id — update plan, booking access, phone, or website.
router.patch("/shops/:id", async (req, res) => {
  try {
    const db = await getDb();
    const set = {}, unset = {};

    if (req.body.planId !== undefined) {
      if (!PLAN_IDS.includes(req.body.planId)) return res.status(400).json({ error: "Invalid plan" });
      set.planId = req.body.planId;
    }
    if (req.body.bookingActive !== undefined) {
      if (req.body.bookingActive === null) unset.bookingActive = "";
      else set.bookingActive = !!req.body.bookingActive;
    }
    if (req.body.phone !== undefined) set.phone = String(req.body.phone).trim();
    if (req.body.website !== undefined) set.website = String(req.body.website).trim();
    if (req.body.demo !== undefined) set.demo = !!req.body.demo;
    if (req.body.freeForLife !== undefined) set.freeForLife = !!req.body.freeForLife;
    if (req.body.firstMonthFree !== undefined) set.firstMonthFree = !!req.body.firstMonthFree;
    // "Free until N bookings" trial toggle + threshold.
    if (req.body.bookingTrial !== undefined) set.bookingTrial = !!req.body.bookingTrial;
    if (req.body.bookingTrialLimit !== undefined) {
      const n = Number(req.body.bookingTrialLimit);
      if (!Number.isInteger(n) || n < 1 || n > 100) return res.status(400).json({ error: "Free-booking limit must be between 1 and 100" });
      set.bookingTrialLimit = n;
    }
    // Custom-branding add-on price (sent in dollars → stored as cents) + comp grant.
    if (req.body.brandingAddonPrice !== undefined) {
      const dollars = Number(req.body.brandingAddonPrice);
      if (!Number.isFinite(dollars) || dollars < 0 || dollars > 100) return res.status(400).json({ error: "Branding price must be $0–$100" });
      set.brandingAddonPrice = Math.round(dollars * 100);
    }
    if (req.body.brandingAddonComp !== undefined) {
      set.brandingAddonComp = !!req.body.brandingAddonComp;
      set.brandingAddon = !!req.body.brandingAddonComp; // comp grants access immediately
    }
    if (req.body.showStaff !== undefined) set.showStaff = !!req.body.showStaff;
    if (req.body.showGallery !== undefined) set.showGallery = !!req.body.showGallery;
    if (req.body.showStaffGalleries !== undefined) set.showStaffGalleries = !!req.body.showStaffGalleries;
    if (req.body.bookingEmailsOff !== undefined) set.bookingEmailsOff = !!req.body.bookingEmailsOff;

    if (!Object.keys(set).length && !Object.keys(unset).length) {
      return res.status(400).json({ error: "Nothing to update" });
    }
    let query;
    try { query = { _id: new ObjectId(req.params.id) }; } catch { return res.status(400).json({ error: "Bad id" }); }
    const ops = {};
    if (Object.keys(set).length) ops.$set = set;
    if (Object.keys(unset).length) ops.$unset = unset;
    const r = await db.collection("shops").updateOne(query, ops);
    if (!r.matchedCount) return res.status(404).json({ error: "Shop not found" });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/shops/:id/free-month — set how many upcoming months are free.
// Body: { months: 0..MAX_FREE_MONTHS }. 0 removes any comp; N applies a 100%-off
// coupon covering the next N invoices, then billing resumes. Returns the fresh
// comp state (with the exact dates) so the console can show it immediately.
router.post("/shops/:id/free-month", async (req, res) => {
  const stripe = stripeClient();
  if (!stripe) return res.status(400).json({ error: "Billing isn't connected yet." });
  try {
    const db = await getDb();
    let _id; try { _id = new ObjectId(req.params.id); } catch { return res.status(400).json({ error: "Bad id" }); }
    const shop = await db.collection("shops").findOne({ _id });
    if (!shop) return res.status(404).json({ error: "Shop not found" });
    if (!shop.stripeCustomerId) return res.status(400).json({ error: "This client has no billing set up yet." });

    // Back-compat: { on: true/false } still works; { months } is preferred.
    let months = req.body.months !== undefined ? Number(req.body.months) : (req.body.on === false ? 0 : 1);
    if (!Number.isInteger(months) || months < 0 || months > MAX_FREE_MONTHS) {
      return res.status(400).json({ error: `Free months must be between 0 and ${MAX_FREE_MONTHS}.` });
    }

    const subs = await stripe.subscriptions.list({ customer: shop.stripeCustomerId, status: "all", limit: 5 });
    const active = subs.data.find((s) => ["active", "trialing", "past_due"].includes(s.status));
    if (!active) return res.status(400).json({ error: "This client has no active subscription to comp." });

    if (months === 0) {
      await stripe.subscriptions.update(active.id, { discounts: [] }); // clear any comp
    } else {
      const coupon = await ensureFreeCoupon(stripe, months);
      // Replacing discounts each time keeps exactly one comp on the sub.
      await stripe.subscriptions.update(active.id, { discounts: [{ coupon: coupon.id }] });
    }

    // Read back the live state so the UI reflects Stripe, not our assumption.
    const info = await subInfo(stripe, shop.stripeCustomerId);
    res.json({ success: true, freeMonths: info.freeMonths, freeMonthActive: info.freeMonthActive, renewsAt: info.renewsAt, freeResumesAt: info.freeResumesAt });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/admin/shops/:id — permanently remove a client and all its data.
router.delete("/shops/:id", async (req, res) => {
  try {
    const db = await getDb();
    let _id;
    try { _id = new ObjectId(req.params.id); } catch { return res.status(400).json({ error: "Bad id" }); }
    const shop = await db.collection("shops").findOne({ _id });
    if (!shop) return res.status(404).json({ error: "Shop not found" });
    const shopId = _id.toString();

    // Time off is keyed by providerId, so collect this shop's providers first.
    const provIds = (await db.collection("providers").find({ shopId }).toArray()).map((p) => p._id.toString());

    await Promise.all([
      db.collection("users").deleteMany({ shopId }),
      db.collection("providers").deleteMany({ shopId }),
      db.collection("services").deleteMany({ shopId }),
      db.collection("appointments").deleteMany({ shopId }),
      db.collection("clients").deleteMany({ shopId }),
      db.collection("workingHours").deleteMany({ shopId }),
      db.collection("scheduleMeta").deleteMany({ shopId }),
      db.collection("scheduleOverrides").deleteMany({ shopId }),
      db.collection("gallery").deleteMany({ shopId }),
      provIds.length ? db.collection("timeOff").deleteMany({ providerId: { $in: provIds } }) : Promise.resolve(),
    ]);
    await db.collection("shops").deleteOne({ _id });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
