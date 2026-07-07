const { Router } = require("express");
const { getDb } = require("../db");
const { resolveShop } = require("../shopScope");

const router = Router();

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
    const shop = await resolveShop(req, db);
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
        publicKey: shop.publicKey || null,
        address: shop.address || "",
        phone: shop.phone || "",
        businessType: shop.businessType || "generic",
        booking: shop.booking || DEFAULT_BOOKING,
      },
      addons: shop.addons || [],
      services: services.map((s) => ({
        _id: s._id.toString(),
        name: s.name,
        description: s.description || "",
        durationMin: s.durationMin || null,
        price: s.price || "",
      })),
      providers: providers.map((p) => ({
        _id: p._id.toString(),
        name: p.name,
        bio: p.bio || "",
        photo: p.photo || "",
        // Which services this staff member offers — lets the widget show only
        // the staff who can do the chosen service.
        serviceIds: (p.serviceIds || []).map(String),
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
