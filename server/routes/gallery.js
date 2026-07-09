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
    const imgs = await db.collection("gallery").find({ shopId }).sort({ sortOrder: 1, _id: 1 }).toArray();
    res.json(imgs.map((i) => ({ _id: i._id.toString(), url: i.url, caption: i.caption || "" })));
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

// DELETE /api/gallery/:id — remove an image (owner).
router.delete("/:id", requireAuth, requireOwner, async (req, res) => {
  try {
    const db = await getDb();
    let _id;
    try { _id = new ObjectId(req.params.id); } catch { return res.status(400).json({ error: "Bad id" }); }
    const r = await db.collection("gallery").deleteOne({ _id, shopId: req.auth.shopId });
    if (!r.deletedCount) return res.status(404).json({ error: "Image not found" });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
