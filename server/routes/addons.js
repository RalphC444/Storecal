// Optional booking add-ons (e.g. "Teeth Brushing +$10"). Stored as an array on
// the shop document — the whole list is read publicly (for the booking widget)
// and replaced by the owner in one save.
const { Router } = require("express");
const { getDb } = require("../db");
const { ObjectId } = require("mongodb");
const { resolveShop } = require("../shopScope");
const { requireAuth, requireOwner } = require("../auth");

const router = Router();

function clean(list) {
  return (Array.isArray(list) ? list : [])
    .map((a) => ({ name: String(a.name || "").trim(), price: String(a.price || "").trim() }))
    .filter((a) => a.name);
}

// GET /api/addons?key= — the shop's add-ons (public; feeds the booking widget).
router.get("/", async (req, res) => {
  try {
    const db = await getDb();
    const shop = await resolveShop(req, db);
    if (!shop) return res.status(404).json({ error: "Shop not found" });
    res.json(shop.addons || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/addons — replace the shop's add-ons (owner only).
router.put("/", requireAuth, requireOwner, async (req, res) => {
  try {
    const db = await getDb();
    const addons = clean(req.body.addons);
    await db.collection("shops").updateOne({ _id: new ObjectId(req.auth.shopId) }, { $set: { addons } });
    res.json({ addons });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
