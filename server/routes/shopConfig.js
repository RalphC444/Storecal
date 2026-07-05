const { Router } = require("express");
const { getDb } = require("../db");

const router = Router();

function getShopSlug() {
  return process.env.SHOP_SLUG || "default";
}

// Fallback config if a shop predates the businessType migration.
const DEFAULT_BOOKING = {
  vehicle: false,
  providerPicker: false,
  providerLabel: "",
  serviceLabel: "Select a service",
  notesLabel: "Notes (optional)",
  notesPlaceholder: "Anything we should know before your appointment?",
};

// GET /api/shop-config
// One call the booking widget can consume: shop identity + booking-form config,
// the service menu, and the bookable providers.
router.get("/", async (req, res) => {
  try {
    const db = await getDb();
    const slug = req.query.slug || getShopSlug();
    const shop = await db.collection("shops").findOne({ slug });
    if (!shop) return res.status(404).json({ error: "Shop not found" });

    const shopId = shop._id.toString();

    const [services, providers] = await Promise.all([
      db.collection("services").find({ shopId }).sort({ sortOrder: 1, name: 1 }).toArray(),
      db.collection("providers").find({ shopId, active: true }).sort({ sortOrder: 1, name: 1 }).toArray(),
    ]);

    res.json({
      shop: {
        slug: shop.slug,
        name: shop.name,
        address: shop.address || "",
        phone: shop.phone || "",
        businessType: shop.businessType || "generic",
        booking: shop.booking || DEFAULT_BOOKING,
      },
      services: services.map((s) => ({
        _id: s._id.toString(),
        name: s.name,
        durationMin: s.durationMin || null,
        price: s.price || "",
      })),
      providers: providers.map((p) => ({
        _id: p._id.toString(),
        name: p.name,
        bio: p.bio || "",
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
