const { Router } = require("express");
const { getDb } = require("../db");

const router = Router();

// When auth is wired up later, pull shopId from req.user.shopId instead of env
function getShopSlug() {
  return process.env.SHOP_SLUG || "default";
}

router.get("/", async (req, res) => {
  try {
    const db = await getDb();
    const shop = await db.collection("shops").findOne({ slug: getShopSlug() });
    if (!shop) return res.status(404).json({ error: "Shop not found — run the seed script first" });

    const providers = await db
      .collection("providers")
      .find({ shopId: shop._id.toString(), active: true })
      .sort({ sortOrder: 1, name: 1 })
      .toArray();

    res.json(
      providers.map((p) => ({
        _id: p._id.toString(),
        name: p.name,
        bio: p.bio || "",
      }))
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
