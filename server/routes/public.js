// Public, read-only endpoints a store's website can fetch to display its live
// service menu and staff. Keyed by the store's public key (?key=...), CORS-open,
// and returns only public-safe fields (no staff email/phone).
const { Router } = require("express");
const { getDb } = require("../db");
const { resolveShop } = require("../shopScope");

const router = Router();

// GET /api/public/services?key=STORE_KEY
router.get("/services", async (req, res) => {
  try {
    const db = await getDb();
    const shop = await resolveShop(req, db);
    if (!shop) return res.status(404).json({ error: "Shop not found" });
    const shopId = shop._id.toString();
    const services = await db.collection("services").find({ shopId }).sort({ sortOrder: 1, name: 1 }).toArray();
    res.json(services.map((s) => ({
      id: s._id.toString(),
      name: s.name,
      description: s.description || "",
      durationMin: s.durationMin || null,
      price: s.price || "",
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/public/staff?key=STORE_KEY
router.get("/staff", async (req, res) => {
  try {
    const db = await getDb();
    const shop = await resolveShop(req, db);
    if (!shop) return res.status(404).json({ error: "Shop not found" });
    const shopId = shop._id.toString();
    const providers = await db.collection("providers").find({ shopId, active: true }).sort({ sortOrder: 1, name: 1 }).toArray();
    res.json(providers.map((p) => ({
      id: p._id.toString(),
      name: p.name,
      bio: p.bio || "",
      photo: p.photo || "",
      serviceIds: (p.serviceIds || []).map(String),
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
