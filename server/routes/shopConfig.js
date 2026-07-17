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

    // Caching depends on WHO is asking:
    //  • Public embed (resolved via ?key=/?slug=) → the URL already varies per
    //    shop, so a short shared cache is safe and shaves DB load on client sites.
    //  • Signed-in admin (resolved via the auth cookie) → the URL is the same
    //    "/api/shop-config" for EVERY account, differing only by cookie. A shared
    //    cache would serve the previous account's shop after switching logins
    //    (stale store name/config). Never cache that response.
    if (req.auth?.shopId) {
      res.set("Cache-Control", "no-store, private");
      res.set("Vary", "Cookie");
    } else {
      res.set("Cache-Control", "public, max-age=30");
    }

    const shopId = shop._id.toString();

    // Auto shops have no bookable staff — their team members are administrators
    // (they manage the store calendar, not their own bookings). So the public
    // widget never lists staff profiles for an auto shop; booking always targets
    // the shop itself (see availability.js "any" → book-the-shop path).
    const isAuto = shop.businessType === "auto";
    const [services, providers] = await Promise.all([
      db.collection("services").find({ shopId }).sort({ sortOrder: 1, name: 1 }).toArray(),
      isAuto ? [] : db.collection("providers").find({ shopId, active: true }).sort({ sortOrder: 1, name: 1 }).toArray(),
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
        website: shop.website || "",
        businessType: shop.businessType || "generic",
        booking: shop.booking || DEFAULT_BOOKING,
        // Branding for the hosted booking page (owner-configurable). Values are
        // always returned so the owner's editor can show them; the hosted page
        // only *applies* logo/accent/tagline when the branding add-on is unlocked.
        accent: shop.accent || "",
        logo: shop.logo || "",
        tagline: shop.tagline || "",
        brandingUnlocked: shop.brandingAddon === true || shop.brandingAddonComp === true,
        // External link-in-bio buttons shown on the hosted page (always free).
        links: Array.isArray(shop.links) ? shop.links : [],
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

// PATCH /api/shop-config — owner updates their storefront: the announcement
// banner and/or the hosted booking page branding. Every field is optional; only
// the keys present in the body are touched.
//  • announcement (+ announcementUntil): banner message and auto-hide date
//  • accent: hex color for the booking page + widget (e.g. "#4d4bd9"); "" clears
//  • logo:   image data-URL shown in the page header; "" clears
//  • tagline: short subtitle under the store name; "" clears
router.patch("/", requireAuth, requireOwner, async (req, res) => {
  try {
    const db = await getDb();
    const set = { updatedAt: new Date() };

    // Announcement banner (only when the caller sends it, so a branding-only
    // save doesn't wipe an existing banner).
    if (req.body.announcement !== undefined) {
      const announcement = String(req.body.announcement || "").trim().slice(0, 250);
      let announcementUntil = String(req.body.announcementUntil || "").trim();
      if (!announcement || !/^\d{4}-\d{2}-\d{2}$/.test(announcementUntil)) announcementUntil = "";
      set.announcement = announcement;
      set.announcementUntil = announcementUntil;
    }

    // Branding.
    if (req.body.accent !== undefined) {
      const a = String(req.body.accent || "").trim();
      // Accept a #rgb / #rrggbb hex color, else clear.
      set.accent = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(a) ? a : "";
    }
    if (req.body.logo !== undefined) {
      const l = String(req.body.logo || "").trim();
      // Only store a small inline image (data-URL) or clear it. Cap the size so
      // a huge upload can't bloat the shop doc / public config response.
      set.logo = /^data:image\//i.test(l) && l.length <= 800_000 ? l : "";
    }
    if (req.body.tagline !== undefined) {
      set.tagline = String(req.body.tagline || "").trim().slice(0, 120);
    }
    if (req.body.website !== undefined) {
      set.website = String(req.body.website || "").trim().slice(0, 300);
    }
    // External links (link-in-bio buttons). Keep label + url, cap the count.
    if (req.body.links !== undefined) {
      const arr = Array.isArray(req.body.links) ? req.body.links : [];
      set.links = arr.slice(0, 20)
        .map((l) => ({
          label: String((l && l.label) || "").trim().slice(0, 60),
          url: String((l && l.url) || "").trim().slice(0, 400),
        }))
        .filter((l) => l.url);
    }

    await db.collection("shops").updateOne({ _id: new ObjectId(req.auth.shopId) }, { $set: set });
    res.json({
      success: true,
      announcement: set.announcement,
      announcementUntil: set.announcementUntil,
      accent: set.accent,
      logo: set.logo,
      tagline: set.tagline,
      links: set.links,
      website: set.website,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
