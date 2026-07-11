const { Router } = require("express");
const { ObjectId } = require("mongodb");
const { getDb } = require("../lib/db");

const router = Router();

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

    const records = await db
      .collection("timeOff")
      .find({ providerId: req.params.providerId, endDate: { $gte: recentCutoff() } })
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
    const result = await db.collection("timeOff").insertOne({
      providerId: req.params.providerId,
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
    const result = await db.collection("timeOff").deleteOne({
      _id: new ObjectId(req.params.timeoffId),
      providerId: req.params.providerId,
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
