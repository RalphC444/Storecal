const { Router } = require("express");
const { getDb } = require("../db");
const { ObjectId } = require("mongodb");
const { resolveShopId } = require("../shopScope");

const router = Router();

// GET /api/services — the shop's service menu (feeds the booking widget too).
router.get("/", async (req, res) => {
  try {
    const db = await getDb();
    const shopId = await resolveShopId(req, db);
    if (!shopId) return res.status(404).json({ error: "Shop not found" });

    const services = await db.collection("services")
      .find({ shopId }).sort({ sortOrder: 1, name: 1 }).toArray();

    res.json(services.map((s) => ({
      _id: s._id.toString(),
      name: s.name,
      durationMin: s.durationMin || null,
      price: s.price || "",
      sortOrder: s.sortOrder ?? 0,
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/services — add a service.
router.post("/", async (req, res) => {
  try {
    const { name, durationMin, price, sortOrder } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: "Service name is required" });

    const db = await getDb();
    const shopId = await resolveShopId(req, db);
    if (!shopId) return res.status(404).json({ error: "Shop not found" });

    const doc = {
      shopId,
      name: name.trim(),
      durationMin: durationMin ? Number(durationMin) : null,
      price: (price || "").trim(),
      sortOrder: Number(sortOrder) || 0,
      createdAt: new Date(),
    };
    const result = await db.collection("services").insertOne(doc);
    // Enable the new service for every staff member by default (they can opt out
    // in their profile). Keeps "all staff offer everything" as the baseline.
    await db.collection("providers").updateMany(
      { shopId }, { $addToSet: { serviceIds: result.insertedId.toString() } }
    );
    res.status(201).json({ success: true, _id: result.insertedId.toString() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/services/:id — edit a service.
router.put("/:id", async (req, res) => {
  try {
    const { name, durationMin, price, sortOrder } = req.body;
    if (name !== undefined && !name.trim()) return res.status(400).json({ error: "Service name cannot be empty" });

    const db = await getDb();
    const shopId = await resolveShopId(req, db);
    if (!shopId) return res.status(404).json({ error: "Shop not found" });

    const set = { updatedAt: new Date() };
    if (name !== undefined) set.name = name.trim();
    if (durationMin !== undefined) set.durationMin = durationMin ? Number(durationMin) : null;
    if (price !== undefined) set.price = (price || "").trim();
    if (sortOrder !== undefined) set.sortOrder = Number(sortOrder) || 0;

    const result = await db.collection("services").updateOne(
      { _id: new ObjectId(req.params.id), shopId }, { $set: set }
    );
    if (result.matchedCount === 0) return res.status(404).json({ error: "Service not found" });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/services/:id
router.delete("/:id", async (req, res) => {
  try {
    const db = await getDb();
    const shopId = await resolveShopId(req, db);
    if (!shopId) return res.status(404).json({ error: "Shop not found" });

    const result = await db.collection("services").deleteOne({ _id: new ObjectId(req.params.id), shopId });
    if (result.deletedCount === 0) return res.status(404).json({ error: "Service not found" });
    // Remove it from every staff member's offered list.
    await db.collection("providers").updateMany({ shopId }, { $pull: { serviceIds: req.params.id } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
