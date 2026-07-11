const { Router } = require("express");
const { ObjectId } = require("mongodb");
const { getDb } = require("../lib/db");
const { resolveShop } = require("../lib/shopScope");
const { requireAuth, requireOwner } = require("../lib/auth");

const router = Router();

// Fallback config if a shop predates the businessType migration.
const DEFAULT_BOOKING = {
  vehicle: false,
  pet: false,
  providerPicker: false,
  providerLabel: "",
  serviceLabel: "Select a service",
  notesLabel: "Notes (optional)",
  notesPlaceholder: "Anything we should know before your appointment?",
};

// Local YYYY-MM-DD for "today" (matches the date the owner picks in the editor).
function todayKeyLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
// Whether the announcement banner should currently show: it needs a message and,
// if an auto-hide date is set, today must still be before it (disappears ON that date).
function bannerActive(shop) {
  if (!shop.announcement) return false;
  if (!shop.announcementUntil) return true;
  return todayKeyLocal() < shop.announcementUntil;
}

// GET /api/shop-config
// One call the booking widget can consume: shop identity + booking-form config,
// the service menu, and the bookable providers.
router.get("/", async (req, res) => {
  try {
    const db = await getDb();
    const shop = await resolveShop(req, db);
    if (!shop) return res.status(404).json({ error: "Shop not found" });

    // Short cache: client sites hit this on every visitor; 30s shaves DB load
    // while keeping menu/booking-gate changes near-live.
    res.set("Cache-Control", "public, max-age=30");

    const shopId = shop._id.toString();

    const [services, providers] = await Promise.all([
      db.collection("services").find({ shopId }).sort({ sortOrder: 1, name: 1 }).toArray(),
      db.collection("providers").find({ shopId, active: true }).sort({ sortOrder: 1, name: 1 }).toArray(),
    ]);

    // Whether online booking is turned on for this shop. Gates the widget CTAs:
    // when false, the site shows a "call us" option instead of the booking app.
    // Order matters — booking stays on through demo/pre-delivery, and only the
    // explicit Off or a delivered-but-unpaid account is gated:
    //  1. explicit shop.bookingActive (true/false) always wins,
    //  2. an active subscription (synced onto shop.subscribed) → on,
    //  3. no billing configured (dev / self-host) → on,
    //  4. demo mode (default until the operator marks it delivered) → on,
    //  5. otherwise (delivered + unpaid) → off ("call us").
    const stripeConfigured = !!process.env.STRIPE_SECRET_KEY;
    let bookingActive;
    if (shop.freeForLife === true) bookingActive = true; // comped account — always on
    else if (typeof shop.bookingActive === "boolean") bookingActive = shop.bookingActive;
    else if (shop.subscribed === true) bookingActive = true;
    else if (!stripeConfigured) bookingActive = true;
    else if (shop.demo !== false) bookingActive = true;
    else bookingActive = false;

    res.json({
      bookingActive,
      // Website content toggles (operator-controlled). Default on.
      showStaff: shop.showStaff !== false,
      showGallery: shop.showGallery !== false,
      showStaffGalleries: shop.showStaffGalleries !== false,
      // Owner-set announcement banner ("We're on vacation…"). "" = no banner.
      // An optional announcementUntil (YYYY-MM-DD) auto-hides it: once today is
      // on or past that date, the public banner is suppressed (raw value still
      // returned so the Settings editor can show/adjust the schedule).
      announcement: bannerActive(shop) ? (shop.announcement || "") : "",
      announcementUntil: shop.announcementUntil || "",
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
        // The owner is a bookable provider too — the widget shows the shop
        // gallery (not a personal one) as their preview.
        isOwner: !!p.ownerUserId,
        // Which services this staff member offers — lets the widget show only
        // the staff who can do the chosen service.
        serviceIds: (p.serviceIds || []).map(String),
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/shop-config — owner updates their own website banner message.
// Body: { announcement }. Empty string clears it (no banner).
router.patch("/", requireAuth, requireOwner, async (req, res) => {
  try {
    const db = await getDb();
    const announcement = String(req.body.announcement || "").trim().slice(0, 250);
    // Optional auto-hide date (YYYY-MM-DD). Anything else clears the schedule.
    // Clearing the message also clears any schedule.
    let announcementUntil = String(req.body.announcementUntil || "").trim();
    if (!announcement || !/^\d{4}-\d{2}-\d{2}$/.test(announcementUntil)) announcementUntil = "";
    await db.collection("shops").updateOne(
      { _id: new ObjectId(req.auth.shopId) },
      { $set: { announcement, announcementUntil, updatedAt: new Date() } }
    );
    res.json({ success: true, announcement, announcementUntil });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
