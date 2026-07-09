// Platform-operator API: manage every shop (client) — create, list, update
// (plan / booking access / contact), and delete. Super-admin only.
const { Router } = require("express");
const { getDb } = require("../db");
const { ObjectId } = require("mongodb");
const { requireAuth, requireSuperAdmin, hashPassword } = require("../auth");
const { generatePublicKey } = require("../shopScope");

const router = Router();
const PLAN_IDS = ["booking", "website"];
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
// Live subscription status + renewal date for a Stripe customer.
async function subInfo(stripe, customerId) {
  try {
    const subs = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 5 });
    const active = subs.data.find((s) => ["active", "trialing", "past_due"].includes(s.status));
    if (!active) return { subscribed: false, renewsAt: null, status: null };
    return { subscribed: true, status: active.status, renewsAt: active.current_period_end ? active.current_period_end * 1000 : null };
  } catch { return { subscribed: false, renewsAt: null, status: null }; }
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

    // Owner is a bookable provider by default (mirrors self-registration).
    await db.collection("providers").insertOne({
      shopId, name: businessName.trim(), email: em, bio: "", photo: "",
      active: true, ownerUserId: userRes.insertedId.toString(), serviceIds: [], sortOrder: 0, createdAt: new Date(),
    });

    const origin = req.headers.origin || "";
    res.status(201).json({
      _id: shopId, publicKey: shop.publicKey, slug,
      ownerEmail: em, tempPassword: NEW_CLIENT_PASSWORD,
      bookingUrl: origin ? `${origin}/book?key=${shop.publicKey}` : null,
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
    const ownerBy = {}; owners.forEach((u) => { ownerBy[u.shopId] = u.email; });

    const [svc, staff] = await Promise.all([countBy("services"), countBy("providers", { active: true })]);

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
        demo: s.demo !== false, // on until the operator marks the client delivered
        showStaff: s.showStaff !== false,
        showGallery: s.showGallery !== false,
        subscribed: sub ? sub.subscribed : (s.subscribed === true),
        renewsAt: sub ? sub.renewsAt : null,
        promptBilling: s.promptBilling === true,
        ownerEmail: ownerBy[id] || "",
        phone: s.phone || "",
        website: s.website || "",
        services: svc[id] || 0,
        staff: staff[id] || 0,
        createdAt: s.createdAt || null,
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
    if (req.body.showStaff !== undefined) set.showStaff = !!req.body.showStaff;
    if (req.body.showGallery !== undefined) set.showGallery = !!req.body.showGallery;

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
