import { parseYmd, toMin } from "../../lib/datetime";
import { weekKeyFor } from "./Scheduling";

export const DAY_START = 480;   // 8:00 AM
export const DAY_END   = 1260;  // 9:00 PM
export const PX_PER_MIN = 1.1;  // taller rows; grid overflows viewport slightly → small scroll
export const GRID_H = (DAY_END - DAY_START) * PX_PER_MIN;
export const DAYS_SHORT = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

// 30-minute click-to-create slots (each gets its own hover/active state).
export const SLOTS = [];
for (let m = DAY_START; m < DAY_END; m += 30) SLOTS.push(m);

// Lay out a day's appointments into side-by-side lanes so overlapping bookings
// split the column width (like Teams) instead of stacking on top of each other.
export function packDay(list, durationOf) {
  const evs = list
    .map(a => {
      const start = toMin(a.timeValue);
      return { a, start, end: start + Math.max(durationOf(a.service), 20) };
    })
    .sort((p, q) => p.start - q.start || p.end - q.end);

  const out = [];
  let group = [], groupEnd = -1;
  const flush = () => {
    const laneEnds = [];
    group.forEach(e => {
      let lane = laneEnds.findIndex(end => end <= e.start);
      if (lane === -1) { lane = laneEnds.length; laneEnds.push(e.end); }
      else laneEnds[lane] = e.end;
      e.lane = lane;
    });
    group.forEach(e => { e.lanes = laneEnds.length; out.push(e); });
    group = [];
  };
  evs.forEach(e => {
    if (group.length && e.start >= groupEnd) flush();
    group.push(e);
    groupEnd = Math.max(groupEnd, e.end);
  });
  flush();
  return out;
}

// Remove break blocks from open ranges, returning the remaining sub-ranges.
// Mirrors the server's availabilityCheck.subtract so the calendar shows exactly
// the bookable time (breaks render as closed).
export function subtractBreaks(ranges, blocks) {
  let result = (ranges || []).map(r => ({ ...r }));
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

// Open ranges for one date given an availability doc + time off, with breaks
// removed. Returns [] when closed, or null when there's no availability data.
export function openRangesFor(dateStr, av, timeoff) {
  if (!av) return null;
  const ov = av.overrides?.find(o => o.date === dateStr);
  if (ov) return ov.closed ? [] : subtractBreaks(ov.ranges, ov.breaks);
  if (timeoff?.some(t => dateStr >= t.startDate && dateStr <= t.endDate)) return [];
  const weekKey = av.meta?.biweekly ? weekKeyFor(av.meta.anchorDate, dateStr) : "A";
  const week = weekKey === "A" ? av.weekA : av.weekB;
  const weekday = parseYmd(dateStr).getDay();
  const day = week?.find(d => d.weekday === weekday);
  return day?.enabled ? subtractBreaks(day.ranges, day.breaks) : [];
}

