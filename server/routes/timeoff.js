const { Router } = require("express");
const { ObjectId } = require("mongodb");
const { getDb } = require("../lib/db");
const { resolveShopId } = require("../lib/shopScope");

const router = Router();

// Scope a time-off query to the requesting shop. Provider ids are globally
// unique so shopId is belt-and-suspenders there, but the "shop" pseudo-provider
// id is the SAME literal string for every tenant — without this scope one
// store's vacation would gray out every store's calendar and booking widget.
async function shopScopedFilter(req, db, providerId) {
  const shopId = await resolveShopId(req, db);
  return shopId ? { providerId, shopId } : { providerId };
}

// A UTC date a couple days back — a timezone-safe lower bound so a client's
// LOCAL "today" is never dropped by the server's UTC clock (see availability.js).
function recentCutoff() {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 2);
  return d.toISOString().slice(0, 10);
}

// GET /api/timeoff/:providerId  — upcoming (and last couple days)
router.get("/:providerId", async (req, res) => {
  try {
    const db = await getDb();

    const scope = await shopScopedFilter(req, db, req.params.providerId);
    const records = await db
      .collection("timeOff")
      .find({ ...scope, endDate: { $gte: recentCutoff() } })
      .sort({ startDate: 1 })
      .toArray();

    res.json(
      records.map((r) => ({
        _id: r._id.toString(),
        startDate: r.startDate,
        endDate: r.endDate,
        reason: r.reason || "",
      }))
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/timeoff/:providerId
router.post("/:providerId", async (req, res) => {
  try {
    const { startDate, endDate, reason } = req.body;
    if (!startDate || !endDate) {
      return res.status(400).json({ error: "startDate and endDate required" });
    }

    const db = await getDb();
    const shopId = await resolveShopId(req, db);
    const result = await db.collection("timeOff").insertOne({
      providerId: req.params.providerId,
      shopId,
      startDate,
      endDate,
      reason: reason || "",
      createdAt: new Date().toISOString(),
    });

    res.status(201).json({
      _id: result.insertedId.toString(),
      startDate,
      endDate,
      reason: reason || "",
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/timeoff/:providerId/:timeoffId
router.delete("/:providerId/:timeoffId", async (req, res) => {
  try {
    const db = await getDb();
    const scope = await shopScopedFilter(req, db, req.params.providerId);
    const result = await db.collection("timeOff").deleteOne({
      _id: new ObjectId(req.params.timeoffId),
      ...scope,
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({ error: "Not found" });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
