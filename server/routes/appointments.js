const { Router } = require("express");
const { getDb } = require("../db");

const router = Router();

function getShopSlug() {
  return process.env.SHOP_SLUG || "default";
}

// GET /api/appointments
// Query params: from, to (YYYY-MM-DD), providerId, status
router.get("/", async (req, res) => {
  try {
    const db = await getDb();
    const shop = await db.collection("shops").findOne({ slug: getShopSlug() });
    if (!shop) return res.status(404).json({ error: "Shop not found" });

    const shopId = shop._id.toString();
    const { from, to, status, providerId } = req.query;

    const filter = { shopId };

    if (from || to) {
      filter.dateKey = {};
      if (from) filter.dateKey.$gte = from;
      if (to) filter.dateKey.$lte = to;
    }

    if (status && status !== "all") {
      filter.status = status;
    }

    if (providerId && providerId !== "all") {
      filter.providerId = providerId;
    }

    const appointments = await db
      .collection("appointments")
      .find(filter)
      .sort({ dateKey: 1, timeValue: 1 })
      .toArray();

    res.json(
      appointments.map((a) => ({
        _id: a._id.toString(),
        dateKey: a.dateKey,
        timeValue: a.timeValue,
        providerId: a.providerId || null,
        providerName: a.providerName || "",
        client: a.client || {},
        service: a.service || "",
        issueDescription: a.issueDescription || "",
        vehicle: a.vehicle || {},
        status: a.status || "pending",
        createdAt: a.createdAt,
      }))
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/appointments/:id — update status
router.patch("/:id", async (req, res) => {
  try {
    const { ObjectId } = require("mongodb");
    const { status } = req.body;

    if (!["pending", "confirmed", "cancelled", "completed"].includes(status)) {
      return res.status(400).json({ error: "Invalid status value" });
    }

    const db = await getDb();
    const result = await db.collection("appointments").updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { status, updatedAt: new Date() } }
    );

    if (result.matchedCount === 0) return res.status(404).json({ error: "Appointment not found" });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
