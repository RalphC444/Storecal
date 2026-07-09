// Photo galleries: a shop gallery (grooming/salon work) plus an optional gallery
// per staff member. Images are compact data-URLs in their own collection so the
// public shop-config stays lean. Read is public; writes are owner-only for the
// shop gallery, and owner-or-self for a staff gallery.
const { Router } = require("express");
const { getDb } = require("../db");
const { ObjectId } = require("mongodb");
const { resolveShopId } = require("../shopScope");
const { requireAuth } = require("../auth");

const router = Router();
const MAX_SHOP = 40;
const MAX_STAFF = 15;

const publicImg = (i) => ({ _id: i._id.toString(), url: i.url, caption: i.caption || "", cover: i.cover === true, providerId: i.providerId || null });

// Can the signed-in user manage this gallery? Owner → shop + any staff gallery.
// Provider → only their own staff gallery (never the shop gallery).
function canManage(auth, providerId) {
  if (auth?.role === "owner") return true;
  if (auth?.role === "provider" && providerId && auth.providerId === providerId) return true;
  return false;
}

// GET /api/gallery?key=[&providerId=] — shop gallery, or a staff member's gallery.
router.get("/", async (req, res) => {
  try {
    const db = await getDb();
    const shopId = await resolveShopId(req, db);
    if (!shopId) return res.status(404).json({ error: "Shop not found" });
    // scope=staff → every staff member's photos (grouped client-side by providerId).
    // providerId=<id> → one staff member's photos. Otherwise the shop gallery.
    const providerId = req.query.providerId || null;
    let filter;
    if (req.query.scope === "staff") filter = { shopId, providerId: { $ne: null } };
    else if (providerId) filter = { shopId, providerId };
    else filter = { shopId, providerId: null };
    const imgs = await db.collection("gallery").find(filter).sort({ createdAt: -1, _id: -1 }).toArray();
    res.json(imgs.map(publicImg));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/gallery — add an image. Body: { url, caption?, providerId? }.
router.post("/", requireAuth, async (req, res) => {
  try {
    const db = await getDb();
    const shopId = req.auth.shopId;
    const url = String(req.body.url || "");
    if (!url.startsWith("data:image/")) return res.status(400).json({ error: "A valid image is required" });

    const providerId = req.body.providerId || null;
    if (!canManage(req.auth, providerId)) return res.status(403).json({ error: "Not allowed" });
    if (providerId) {
      const prov = await db.collection("providers").findOne({ _id: (() => { try { return new ObjectId(providerId); } catch { return null; } })(), shopId });
      if (!prov) return res.status(404).json({ error: "Staff member not found" });
    }

    const max = providerId ? MAX_STAFF : MAX_SHOP;
    const count = await db.collection("gallery").countDocuments(providerId ? { shopId, providerId } : { shopId, providerId: null });
    if (count >= max) return res.status(400).json({ error: `Gallery is full (max ${max} photos)` });

    const doc = { shopId, providerId, url, caption: String(req.body.caption || "").trim(), sortOrder: count, createdAt: new Date() };
    const r = await db.collection("gallery").insertOne(doc);
    res.status(201).json(publicImg({ ...doc, _id: r.insertedId }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/gallery/:id — set the shop cover (owner). Body: { cover, caption? }.
router.patch("/:id", requireAuth, async (req, res) => {
  try {
    const db = await getDb();
    const shopId = req.auth.shopId;
    let _id;
    try { _id = new ObjectId(req.params.id); } catch { return res.status(400).json({ error: "Bad id" }); }
    const img = await db.collection("gallery").findOne({ _id, shopId });
    if (!img) return res.status(404).json({ error: "Image not found" });
    if (!canManage(req.auth, img.providerId || null)) return res.status(403).json({ error: "Not allowed" });

    const set = {};
    if (req.body.cover !== undefined) {
      if (img.providerId) return res.status(400).json({ error: "Only the shop gallery has a cover" });
      set.cover = !!req.body.cover;
      if (set.cover) await db.collection("gallery").updateMany({ shopId, providerId: null, _id: { $ne: _id } }, { $set: { cover: false } });
    }
    if (req.body.caption !== undefined) set.caption = String(req.body.caption).trim();
    if (!Object.keys(set).length) return res.status(400).json({ error: "Nothing to update" });
    await db.collection("gallery").updateOne({ _id, shopId }, { $set: set });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/gallery/:id — remove an image (owner, or the staff member for their own).
router.delete("/:id", requireAuth, async (req, res) => {
  try {
    const db = await getDb();
    let _id;
    try { _id = new ObjectId(req.params.id); } catch { return res.status(400).json({ error: "Bad id" }); }
    const shopId = req.auth.shopId;
    const img = await db.collection("gallery").findOne({ _id, shopId });
    if (!img) return res.status(404).json({ error: "Image not found" });
    if (!canManage(req.auth, img.providerId || null)) return res.status(403).json({ error: "Not allowed" });

    await db.collection("gallery").deleteOne({ _id, shopId });
    // If a shop cover was removed, promote the newest remaining shop photo to cover.
    if (img.cover && !img.providerId) {
      const newest = await db.collection("gallery").find({ shopId, providerId: null }).sort({ createdAt: -1, _id: -1 }).limit(1).next();
      if (newest) await db.collection("gallery").updateOne({ _id: newest._id }, { $set: { cover: true } });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
