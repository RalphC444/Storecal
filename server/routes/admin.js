// Platform-operator API: manage every shop (client) — their plan and whether
// online booking is turned on. Super-admin only.
const { Router } = require("express");
const { getDb } = require("../db");
const { ObjectId } = require("mongodb");
const { requireAuth, requireSuperAdmin, hashPassword, generateTempPassword, signInvite } = require("../auth");
const { generatePublicKey } = require("../shopScope");

const router = Router();
const PLAN_IDS = ["booking", "website"];

// Booking-form presets per vertical (kept in sync with set-business-type.js).
const BOOKING_PRESETS = {
  salon: { vehicle: false, pet: false, providerPicker: true, providerLabel: "Choose your stylist", serviceLabel: "Select a service", notesLabel: "Anything we should know? (optional)", notesPlaceholder: "Allergies, preferences, inspiration photos, or anything else…" },
  grooming: { vehicle: false, pet: true, providerPicker: true, providerLabel: "Choose your groomer", serviceLabel: "Select a service", notesLabel: "Anything we should know? (optional)", notesPlaceholder: "Temperament, matting, sensitivities, or special requests…" },
  auto: { vehicle: true, pet: false, providerPicker: false, providerLabel: "", serviceLabel: "Select a service", notesLabel: "Describe the issue (optional)", notesPlaceholder: "What symptoms, noises, or concerns should we know about?" },
  generic: { vehicle: false, pet: false, providerPicker: false, providerLabel: "", serviceLabel: "Select a service", notesLabel: "Notes (optional)", notesPlaceholder: "Anything we should know before your appointment?" },
};

router.use(requireAuth, requireSuperAdmin);

// POST /api/admin/shops — create a new client (shop + owner login).
// Body: { businessName, email, businessType?, planId? }. Returns the store key
// and a one-time invite link the owner uses to set their password.
router.post("/shops", async (req, res) => {
  try {
    const { businessName, email } = req.body;
    if (!businessName || !businessName.trim()) return res.status(400).json({ error: "Business name is required" });
    if (!email || !email.trim()) return res.status(400).json({ error: "Owner email is required" });
    const businessType = BOOKING_PRESETS[req.body.businessType] ? req.body.businessType : "salon";
    const planId = PLAN_IDS.includes(req.body.planId) ? req.body.planId : "booking";

    const db = await getDb();
    const em = email.trim().toLowerCase();
    if (await db.collection("users").findOne({ email: em })) {
      return res.status(409).json({ error: "An account with that email already exists" });
    }

    let slug = (businessName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")) || "shop";
    if (await db.collection("shops").findOne({ slug })) slug += "-" + Math.random().toString(36).slice(2, 6);

    const shopRes = await db.collection("shops").insertOne({
      slug, name: businessName.trim(), businessType, booking: BOOKING_PRESETS[businessType],
      publicKey: generatePublicKey(), planId, promptBilling: true, createdAt: new Date(),
    });
    const shopId = shopRes.insertedId.toString();
    const shop = await db.collection("shops").findOne({ _id: shopRes.insertedId });

    // Owner login: created with an unusable placeholder + one-time invite link.
    const placeholder = generateTempPassword() + generateTempPassword();
    const userRes = await db.collection("users").insertOne({
      email: em, passwordHash: await hashPassword(placeholder), name: businessName.trim(),
      role: "owner", shopId, mustChangePassword: true, createdAt: new Date(),
    });
    const inviteToken = signInvite(userRes.insertedId.toString());
    await db.collection("users").updateOne({ _id: userRes.insertedId }, { $set: { inviteToken } });

    // Owner is a bookable provider by default (mirrors self-registration).
    await db.collection("providers").insertOne({
      shopId, name: businessName.trim(), email: em, bio: "", photo: "",
      active: true, ownerUserId: userRes.insertedId.toString(), serviceIds: [], sortOrder: 0, createdAt: new Date(),
    });

    const origin = req.headers.origin || "";
    res.status(201).json({
      _id: shopId, publicKey: shop.publicKey, slug,
      inviteUrl: origin ? `${origin}/invite?token=${inviteToken}` : null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/shops — every client with plan + booking status + counts.
router.get("/shops", async (_req, res) => {
  try {
    const db = await getDb();
    const shops = await db.collection("shops").find({}).sort({ createdAt: 1 }).toArray();

    // Service + staff counts per shop, in two grouped queries (no N+1).
    const countBy = async (coll, match) => {
      const rows = await db.collection(coll).aggregate([
        ...(match ? [{ $match: match }] : []),
        { $group: { _id: "$shopId", n: { $sum: 1 } } },
      ]).toArray();
      const m = {};
      rows.forEach((r) => { m[r._id] = r.n; });
      return m;
    };
    const [svc, staff] = await Promise.all([
      countBy("services"),
      countBy("providers", { active: true }),
    ]);

    res.json(shops.map((s) => {
      const id = s._id.toString();
      return {
        _id: id,
        name: s.name,
        slug: s.slug,
        publicKey: s.publicKey || null,
        businessType: s.businessType || "generic",
        planId: PLAN_IDS.includes(s.planId) ? s.planId : "booking",
        // null = "auto" (follows subscription); true/false = explicit override.
        bookingActive: typeof s.bookingActive === "boolean" ? s.bookingActive : null,
        subscribed: s.subscribed === true,
        promptBilling: s.promptBilling === true,
        services: svc[id] || 0,
        staff: staff[id] || 0,
        createdAt: s.createdAt || null,
      };
    }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/admin/shops/:id — update a client's plan and/or booking access.
// Body: { planId?: "booking"|"website", bookingActive?: true|false|null }.
router.patch("/shops/:id", async (req, res) => {
  try {
    const db = await getDb();
    const set = {}, unset = {};

    if (req.body.planId !== undefined) {
      if (!PLAN_IDS.includes(req.body.planId)) return res.status(400).json({ error: "Invalid plan" });
      set.planId = req.body.planId;
    }
    if (req.body.bookingActive !== undefined) {
      if (req.body.bookingActive === null) unset.bookingActive = ""; // back to auto
      else set.bookingActive = !!req.body.bookingActive;
    }
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

module.exports = router;
