const { Router } = require("express");
const { getDb } = require("../db");
const { ObjectId } = require("mongodb");
const { hashPassword, generateTempPassword, signInvite } = require("../auth");
const { sendInvite } = require("../mailer");
const { resolveShopId } = require("../shopScope");

const router = Router();

// Build the absolute invite URL the provider clicks (origin + /invite?token=).
function inviteUrl(req, token) {
  const origin = req.headers.origin || "http://localhost:5173";
  return `${origin}/invite?token=${token}`;
}

// GET /api/providers            → active providers (booking + calendar use this)
// GET /api/providers?all=1      → every provider, incl. inactive (admin manage)
router.get("/", async (req, res) => {
  try {
    const db = await getDb();
    const shopId = await resolveShopId(req, db);
    if (!shopId) return res.status(404).json({ error: "Shop not found — run the seed script first" });

    const filter = { shopId };
    if (req.query.all !== "1") filter.active = true;

    const providers = await db
      .collection("providers")
      .find(filter)
      .sort({ sortOrder: 1, name: 1 })
      .toArray();

    // Account status per provider: none | invited (not yet set up) | active.
    const ids = providers.map((p) => p._id.toString());
    const users = await db.collection("users").find({ shopId, providerId: { $in: ids } }).toArray();
    const byProvider = {};
    for (const u of users) byProvider[u.providerId] = u.mustChangePassword ? "invited" : "active";

    res.json(
      providers.map((p) => ({
        _id: p._id.toString(),
        name: p.name,
        bio: p.bio || "",
        email: p.email || "",
        active: p.active !== false,
        sortOrder: p.sortOrder ?? 0,
        serviceIds: p.serviceIds || [],
        accountStatus: byProvider[p._id.toString()] || "none",
      }))
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/providers — add a stylist
router.post("/", async (req, res) => {
  try {
    const { name, bio, email, active, sortOrder } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: "Name is required" });

    const db = await getDb();
    const shopId = await resolveShopId(req, db);
    if (!shopId) return res.status(404).json({ error: "Shop not found" });

    // New staff offer every service by default (they can narrow it in their profile).
    const allServices = await db.collection("services").find({ shopId }).toArray();
    const doc = {
      shopId,
      name: name.trim(),
      bio: bio?.trim() || "",
      email: email?.trim() || "",
      active: active !== false,
      sortOrder: Number(sortOrder) || 0,
      serviceIds: Array.isArray(req.body.serviceIds) ? req.body.serviceIds.map(String) : allServices.map((s) => s._id.toString()),
      createdAt: new Date(),
    };
    const result = await db.collection("providers").insertOne(doc);
    const providerId = result.insertedId.toString();

    // If an email was given, auto-provision a provider login bound to this shop
    // + provider, and mint a one-time invite link the owner shares. The provider
    // clicks it → sets their password → connected. No password to hand off.
    let inviteToken = null;
    const em = (email || "").trim().toLowerCase();
    if (em && !(await db.collection("users").findOne({ email: em }))) {
      const placeholder = generateTempPassword() + generateTempPassword(); // unusable until they set one
      const userRes = await db.collection("users").insertOne({
        email: em, passwordHash: await hashPassword(placeholder), name: doc.name,
        role: "provider", shopId, providerId, mustChangePassword: true, createdAt: new Date(),
      });
      inviteToken = signInvite(userRes.insertedId.toString());
      await db.collection("users").updateOne({ _id: userRes.insertedId }, { $set: { inviteToken } });
    }
    // Auto-email the invite when email is configured; otherwise the client shows
    // the copy-able link (origin + /invite?token=...).
    let emailed = false;
    if (inviteToken) {
      try { emailed = await sendInvite(em, doc.name, inviteUrl(req, inviteToken)); } catch { emailed = false; }
    }
    res.status(201).json({ success: true, _id: providerId, inviteToken, emailed });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/providers/:id/invite — get a fresh one-time invite link for a
// provider who hasn't set up their account yet (owner shares it).
router.post("/:id/invite", async (req, res) => {
  try {
    const db = await getDb();
    const shopId = await resolveShopId(req, db);
    const providerId = req.params.id;
    const provider = await db.collection("providers").findOne({ _id: new ObjectId(providerId), shopId });
    if (!provider) return res.status(404).json({ error: "Provider not found" });

    let user = await db.collection("users").findOne({ shopId, providerId });
    if (user && !user.mustChangePassword) {
      return res.status(400).json({ error: "This staff member has already set up their account." });
    }
    if (!user) {
      const em = (provider.email || "").trim().toLowerCase();
      if (!em) return res.status(400).json({ error: "Add an email for this staff member first." });
      if (await db.collection("users").findOne({ email: em })) {
        return res.status(409).json({ error: "That email is already in use." });
      }
      const placeholder = generateTempPassword() + generateTempPassword();
      const r = await db.collection("users").insertOne({
        email: em, passwordHash: await hashPassword(placeholder), name: provider.name,
        role: "provider", shopId, providerId, mustChangePassword: true, createdAt: new Date(),
      });
      user = await db.collection("users").findOne({ _id: r.insertedId });
    }
    const token = signInvite(user._id.toString());
    await db.collection("users").updateOne({ _id: user._id }, { $set: { inviteToken: token } });
    let emailed = false;
    try { emailed = await sendInvite(user.email, provider.name, inviteUrl(req, token)); } catch { emailed = false; }
    res.json({ inviteToken: token, emailed });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/providers/:id — edit a stylist (name, bio, email, active, order)
router.put("/:id", async (req, res) => {
  try {
    const { name, bio, email, active, sortOrder } = req.body;
    if (name !== undefined && !name.trim()) return res.status(400).json({ error: "Name cannot be empty" });

    const db = await getDb();
    const shopId = await resolveShopId(req, db);
    if (!shopId) return res.status(404).json({ error: "Shop not found" });

    const { serviceIds } = req.body;
    const set = { updatedAt: new Date() };
    if (name !== undefined) set.name = name.trim();
    if (bio !== undefined) set.bio = bio.trim();
    if (email !== undefined) set.email = email.trim();
    if (active !== undefined) set.active = !!active;
    if (sortOrder !== undefined) set.sortOrder = Number(sortOrder) || 0;
    if (Array.isArray(serviceIds)) set.serviceIds = serviceIds.map(String);

    const result = await db.collection("providers").updateOne(
      { _id: new ObjectId(req.params.id), shopId },
      { $set: set }
    );
    if (result.matchedCount === 0) return res.status(404).json({ error: "Provider not found" });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/providers/:id — remove a stylist. Blocked if they have upcoming
// appointments (deactivate instead) to avoid orphaning bookings.
router.delete("/:id", async (req, res) => {
  try {
    const db = await getDb();
    const shopId = await resolveShopId(req, db);
    if (!shopId) return res.status(404).json({ error: "Shop not found" });

    const upcoming = await db.collection("appointments").countDocuments({
      shopId,
      providerId: req.params.id,
      status: { $in: ["pending", "confirmed"] },
    });
    if (upcoming > 0) {
      return res.status(409).json({
        error: `This staff member has ${upcoming} upcoming appointment(s). Deactivate them instead of deleting.`,
      });
    }

    const result = await db.collection("providers").deleteOne({ _id: new ObjectId(req.params.id), shopId });
    if (result.deletedCount === 0) return res.status(404).json({ error: "Provider not found" });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
