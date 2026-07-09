// Photo gallery for a shop (e.g. grooming befores/afters, salon work). Images
// are stored as compact data-URLs in their own collection so the public
// shop-config stays lean. Read is public (feeds the website gallery); writes
// are owner-only.
const { Router } = require("express");
const { getDb } = require("../db");
const { ObjectId } = require("mongodb");
const { resolveShopId } = require("../shopScope");
const { requireAuth, requireOwner } = require("../auth");

const router = Router();
const MAX_IMAGES = 40;

// GET /api/gallery?key= — the shop's gallery images (public).
router.get("/", async (req, res) => {
  try {
    const db = await getDb();
    const shopId = await resolveShopId(req, db);
    if (!shopId) return res.status(404).json({ error: "Shop not found" });
    // Newest first — recent photos lead the gallery (and the admin grid).
    const imgs = await db.collection("gallery").find({ shopId }).sort({ createdAt: -1, _id: -1 }).toArray();
    res.json(imgs.map((i) => ({ _id: i._id.toString(), url: i.url, caption: i.caption || "", cover: i.cover === true })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/gallery — add an image (owner). Body: { url: dataURL, caption? }.
router.post("/", requireAuth, requireOwner, async (req, res) => {
  try {
    const db = await getDb();
    const shopId = req.auth.shopId;
    const url = String(req.body.url || "");
    if (!url.startsWith("data:image/")) return res.status(400).json({ error: "A valid image is required" });

    const count = await db.collection("gallery").countDocuments({ shopId });
    if (count >= MAX_IMAGES) return res.status(400).json({ error: `Gallery is full (max ${MAX_IMAGES} images)` });

    const doc = { shopId, url, caption: String(req.body.caption || "").trim(), sortOrder: count, createdAt: new Date() };
    const r = await db.collection("gallery").insertOne(doc);
    res.status(201).json({ _id: r.insertedId.toString(), url: doc.url, caption: doc.caption });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/gallery/:id — set an image as the cover (owner). The cover shows
// in the website hero and is excluded from the gallery grid. Body: { cover }.
router.patch("/:id", requireAuth, requireOwner, async (req, res) => {
  try {
    const db = await getDb();
    const shopId = req.auth.shopId;
    let _id;
    try { _id = new ObjectId(req.params.id); } catch { return res.status(400).json({ error: "Bad id" }); }
    const set = {};
    if (req.body.cover !== undefined) {
      set.cover = !!req.body.cover;
      // Only one cover per shop — clear it on the others first.
      if (set.cover) await db.collection("gallery").updateMany({ shopId, _id: { $ne: _id } }, { $set: { cover: false } });
    }
    if (req.body.caption !== undefined) set.caption = String(req.body.caption).trim();
    if (!Object.keys(set).length) return res.status(400).json({ error: "Nothing to update" });
    const r = await db.collection("gallery").updateOne({ _id, shopId }, { $set: set });
    if (!r.matchedCount) return res.status(404).json({ error: "Image not found" });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/gallery/:id — remove an image (owner).
router.delete("/:id", requireAuth, requireOwner, async (req, res) => {
  try {
    const db = await getDb();
    let _id;
    try { _id = new ObjectId(req.params.id); } catch { return res.status(400).json({ error: "Bad id" }); }
    const shopId = req.auth.shopId;
    const img = await db.collection("gallery").findOne({ _id, shopId });
    const r = await db.collection("gallery").deleteOne({ _id, shopId });
    if (!r.deletedCount) return res.status(404).json({ error: "Image not found" });
    // If the cover was removed, promote the most recent remaining photo to cover.
    if (img && img.cover) {
      const newest = await db.collection("gallery").find({ shopId }).sort({ createdAt: -1, _id: -1 }).limit(1).next();
      if (newest) await db.collection("gallery").updateOne({ _id: newest._id }, { $set: { cover: true } });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
