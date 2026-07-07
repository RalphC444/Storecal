const { Router } = require("express");
const { getDb } = require("../db");
const { ObjectId } = require("mongodb");
const { resolveShopId } = require("../shopScope");

const router = Router();

function normaliseRanges(rec) {
  if (rec.ranges && rec.ranges.length > 0) return rec.ranges;
  return [{ startMin: rec.startMin ?? 540, endMin: rec.endMin ?? 1080 }];
}

// Build a 7-day array from workingHours records for one week key ("A" | "B").
// Records with no `week` field belong to week "A" (backward compatible with the
// pre-biweekly schema).
function buildWeek(records, weekKey) {
  return Array.from({ length: 7 }, (_, weekday) => {
    const rec = records.find(
      (r) => r.weekday === weekday && (r.week || "A") === weekKey
    );
    return {
      weekday,
      enabled: !!rec,
      ranges: rec ? normaliseRanges(rec) : [{ startMin: 540, endMin: 1080 }],
      breaks: rec?.breaks ?? [],
    };
  });
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

// The Sunday (local) on or before `date`, as YYYY-MM-DD — used as the A/B anchor.
function sundayOf(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return d.toISOString().slice(0, 10);
}

// GET /api/availability/:providerId
// Returns weekly hours (week A + B), the recurrence meta, and per-date overrides.
router.get("/:providerId", async (req, res) => {
  try {
    const db = await getDb();
    const shopId = await resolveShopId(req, db);
    const providerId = req.params.providerId;

    const [records, metaDoc, overrides] = await Promise.all([
      db.collection("workingHours").find({ providerId, shopId }).toArray(),
      db.collection("scheduleMeta").findOne({ providerId, shopId }),
      db.collection("scheduleOverrides")
        .find({ providerId, shopId, date: { $gte: todayKey() } })
        .sort({ date: 1 })
        .toArray(),
    ]);

    const meta = {
      biweekly: metaDoc?.biweekly || false,
      anchorDate: metaDoc?.anchorDate || sundayOf(new Date()),
    };

    res.json({
      meta,
      weekA: buildWeek(records, "A"),
      weekB: buildWeek(records, "B"),
      overrides: overrides.map((o) => ({
        _id: o._id.toString(),
        date: o.date,
        closed: !!o.closed,
        ranges: o.ranges || [],
        breaks: o.breaks || [],
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Turn a UI day into workingHours docs for the given week key (or none if off).
function daysToDocs(providerId, shopId, days, weekKey, biweekly) {
  return (days || [])
    .filter((d) => d.enabled && d.ranges?.length > 0)
    .map((d) => {
      const doc = {
        providerId,
        shopId,
        weekday: d.weekday,
        ranges: d.ranges.map((r) => ({ startMin: Number(r.startMin), endMin: Number(r.endMin) })),
        breaks: (d.breaks ?? []).map((b) => ({ startMin: Number(b.startMin), endMin: Number(b.endMin) })),
      };
      // Only stamp a week label when biweekly is on, so single-pattern
      // schedules stay byte-compatible with the public booking reader.
      if (biweekly) doc.week = weekKey;
      return doc;
    });
}

// PUT /api/availability/:providerId — save weekly hours + recurrence meta.
router.put("/:providerId", async (req, res) => {
  try {
    const { weekA, weekB, meta } = req.body;
    if (!Array.isArray(weekA)) {
      return res.status(400).json({ error: "weekA must be an array" });
    }

    const db = await getDb();
    const shopId = await resolveShopId(req, db);
    const providerId = req.params.providerId;
    const biweekly = !!meta?.biweekly;

    await db.collection("workingHours").deleteMany({ providerId, shopId });

    const docs = daysToDocs(providerId, shopId, weekA, "A", biweekly);
    if (biweekly) docs.push(...daysToDocs(providerId, shopId, weekB, "B", biweekly));
    if (docs.length > 0) await db.collection("workingHours").insertMany(docs);

    await db.collection("scheduleMeta").updateOne(
      { providerId, shopId },
      { $set: { biweekly, anchorDate: meta?.anchorDate || sundayOf(new Date()), updatedAt: new Date() } },
      { upsert: true }
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/availability/:providerId/overrides — set one calendar day's hours.
// Body: { date, closed, ranges, breaks }. Upserts by (provider, date).
router.post("/:providerId/overrides", async (req, res) => {
  try {
    const { date, closed, ranges, breaks } = req.body;
    if (!date) return res.status(400).json({ error: "A date is required" });

    const db = await getDb();
    const shopId = await resolveShopId(req, db);
    const providerId = req.params.providerId;

    const doc = {
      providerId,
      shopId,
      date,
      closed: !!closed,
      ranges: closed ? [] : (ranges || []).map((r) => ({ startMin: Number(r.startMin), endMin: Number(r.endMin) })),
      breaks: closed ? [] : (breaks || []).map((b) => ({ startMin: Number(b.startMin), endMin: Number(b.endMin) })),
      updatedAt: new Date(),
    };

    await db.collection("scheduleOverrides").updateOne(
      { providerId, shopId, date },
      { $set: doc, $setOnInsert: { createdAt: new Date() } },
      { upsert: true }
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/availability/:providerId/overrides/:id — remove a day override.
router.delete("/:providerId/overrides/:id", async (req, res) => {
  try {
    const db = await getDb();
    const shopId = await resolveShopId(req, db);
    await db.collection("scheduleOverrides").deleteOne({
      _id: new ObjectId(req.params.id),
      providerId: req.params.providerId,
      shopId,
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
