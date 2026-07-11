// Server-side availability math: compute a provider's open time ranges for a
// given calendar date (weekly hours + biweekly A/B + per-date overrides + breaks
// + time off), and validate that a requested appointment fits inside them.
// Mirrors the client's openRangesFor logic so bookings can't be made outside a
// stylist's working hours from the admin OR the public booking widget.

function normaliseRanges(rec) {
  if (rec.ranges && rec.ranges.length > 0) return rec.ranges;
  return [{ startMin: rec.startMin ?? 540, endMin: rec.endMin ?? 1080 }];
}

function sundayOf(dateKey) {
  const d = new Date(dateKey + "T00:00:00");
  d.setDate(d.getDate() - d.getDay());
  return d.toISOString().slice(0, 10);
}

// Biweekly parity: which week (A/B) a date lands on relative to the anchor Sunday.
function weekKeyFor(dateKey, anchorDate) {
  const a = new Date((anchorDate || sundayOf(dateKey)) + "T00:00:00");
  const d = new Date(dateKey + "T00:00:00");
  const weeks = Math.floor((d - a) / (7 * 24 * 3600 * 1000));
  return weeks % 2 === 0 ? "A" : "B";
}

// Remove `blocks` (breaks) from `ranges`, returning the remaining open sub-ranges.
function subtract(ranges, blocks) {
  let result = ranges.map((r) => ({ ...r }));
  for (const b of blocks || []) {
    const next = [];
    for (const r of result) {
      if (b.endMin <= r.startMin || b.startMin >= r.endMin) { next.push(r); continue; }
      if (b.startMin > r.startMin) next.push({ startMin: r.startMin, endMin: b.startMin });
      if (b.endMin < r.endMin) next.push({ startMin: b.endMin, endMin: r.endMin });
    }
    result = next;
  }
  return result;
}

// { configured, ranges }. configured=false means the provider has no schedule
// set at all → callers should NOT enforce (don't block a stylist who hasn't set
// hours yet). ranges=[] with configured=true means that day is a day off.
async function openRangesForDate(db, shopId, providerId, dateKey) {
  const [records, metaDoc, override, timeoffs] = await Promise.all([
    db.collection("workingHours").find({ providerId, shopId }).toArray(),
    db.collection("scheduleMeta").findOne({ providerId, shopId }),
    db.collection("scheduleOverrides").findOne({ providerId, shopId, date: dateKey }),
    db.collection("timeOff").find({ providerId, startDate: { $lte: dateKey }, endDate: { $gte: dateKey } }).toArray(),
  ]);

  if (timeoffs.length > 0) return { configured: true, ranges: [] }; // on leave

  if (override) {
    if (override.closed) return { configured: true, ranges: [] };
    return { configured: true, ranges: subtract(normaliseRanges(override), override.breaks || []) };
  }

  if (records.length === 0) return { configured: false, ranges: [] };

  const biweekly = metaDoc?.biweekly || false;
  const weekday = new Date(dateKey + "T00:00:00").getDay();
  const weekKey = biweekly ? weekKeyFor(dateKey, metaDoc?.anchorDate) : "A";
  const rec = records.find((r) => r.weekday === weekday && (r.week || "A") === weekKey);
  if (!rec) return { configured: true, ranges: [] }; // scheduled day off
  return { configured: true, ranges: subtract(normaliseRanges(rec), rec.breaks || []) };
}

function timeToMin(t) {
  const [h, m] = String(t).split(":").map(Number);
  return h * 60 + (m || 0);
}

// Overlap of two open-range lists (both must allow the time).
function intersect(a, b) {
  const out = [];
  for (const x of a) for (const y of b) {
    const s = Math.max(x.startMin, y.startMin), e = Math.min(x.endMin, y.endMin);
    if (e > s) out.push({ startMin: s, endMin: e });
  }
  return out;
}

const fits = (ranges, start, end) => ranges.some((r) => start >= r.startMin && start < r.endMin && end <= r.endMin);

// The store's own hours live under the "shop" pseudo-provider. Bookings must be
// inside BOTH the shop's open hours (if set) AND the staff member's hours (if
// set) — an unconfigured schedule imposes no constraint.
async function checkWithinHours(db, shopId, providerId, dateKey, timeValue, durationMin) {
  if (!dateKey || !timeValue) return null;
  const start = timeToMin(timeValue);
  const end = start + (Number(durationMin) || 0);

  const shop = await openRangesForDate(db, shopId, "shop", dateKey);
  if (shop.configured) {
    if (shop.ranges.length === 0) return "The shop is closed that day.";
    if (!fits(shop.ranges, start, end)) return "That time is outside the shop's opening hours.";
  }

  if (providerId) {
    const prov = await openRangesForDate(db, shopId, providerId, dateKey);
    if (prov.configured) {
      if (prov.ranges.length === 0) return "This staff member isn't working that day. Pick a day they're available.";
      if (!fits(prov.ranges, start, end)) return "That time is outside this staff member's working hours.";
    }
  }
  return null;
}

// The bookable ranges for a provider on a date, combining shop + staff hours.
// null means no schedule is set anywhere (caller decides whether to offer times).
async function effectiveRanges(db, shopId, providerId, dateKey) {
  const [prov, shop] = await Promise.all([
    openRangesForDate(db, shopId, providerId, dateKey),
    openRangesForDate(db, shopId, "shop", dateKey),
  ]);
  if (prov.configured && shop.configured) return intersect(prov.ranges, shop.ranges);
  if (prov.configured) return prov.ranges;
  if (shop.configured) return shop.ranges;
  return null;
}

module.exports = { openRangesForDate, checkWithinHours, effectiveRanges };
