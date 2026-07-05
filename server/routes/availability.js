const { Router } = require("express");
const { getDb } = require("../db");

const router = Router();

function getShopSlug() {
  return process.env.SHOP_SLUG || "default";
}

function normaliseRanges(rec) {
  if (rec.ranges && rec.ranges.length > 0) return rec.ranges;
  return [{ startMin: rec.startMin ?? 540, endMin: rec.endMin ?? 1080 }];
}

// GET /api/availability/:providerId
router.get("/:providerId", async (req, res) => {
  try {
    const db = await getDb();
    const shop = await db.collection("shops").findOne({ slug: getShopSlug() });

    const records = await db
      .collection("workingHours")
      .find({ providerId: req.params.providerId, shopId: shop._id.toString() })
      .toArray();

    const schedule = Array.from({ length: 7 }, (_, weekday) => {
      const rec = records.find((r) => r.weekday === weekday);
      return {
        weekday,
        enabled: !!rec,
        ranges: rec ? normaliseRanges(rec) : [{ startMin: 540, endMin: 1080 }],
        breaks: rec?.breaks ?? [],
      };
    });

    res.json({ schedule });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/availability/:providerId
router.put("/:providerId", async (req, res) => {
  try {
    const { schedule } = req.body;
    if (!Array.isArray(schedule)) {
      return res.status(400).json({ error: "schedule must be an array" });
    }

    const db = await getDb();
    const shop = await db.collection("shops").findOne({ slug: getShopSlug() });
    const providerId = req.params.providerId;
    const shopId = shop._id.toString();

    await db.collection("workingHours").deleteMany({ providerId, shopId });

    const enabled = schedule.filter((d) => d.enabled && d.ranges?.length > 0);
    if (enabled.length > 0) {
      await db.collection("workingHours").insertMany(
        enabled.map((d) => ({
          providerId,
          shopId,
          weekday: d.weekday,
          ranges: d.ranges.map((r) => ({
            startMin: Number(r.startMin),
            endMin: Number(r.endMin),
          })),
          breaks: (d.breaks ?? []).map((b) => ({
            startMin: Number(b.startMin),
            endMin: Number(b.endMin),
          })),
        }))
      );
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
