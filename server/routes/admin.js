// Platform-operator API: manage every shop (client) — their plan and whether
// online booking is turned on. Super-admin only.
const { Router } = require("express");
const { getDb } = require("../db");
const { ObjectId } = require("mongodb");
const { requireAuth, requireSuperAdmin } = require("../auth");

const router = Router();
const PLAN_IDS = ["booking", "website"];

router.use(requireAuth, requireSuperAdmin);

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
