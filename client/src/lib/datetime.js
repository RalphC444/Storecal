// Date, time, and calendar helpers shared across the app. All day math is done
// in local time via "YYYY-MM-DD" keys to avoid the UTC shift toISOString would
// introduce (which could leave "today" unselected near midnight).

// { value: minutesSinceMidnight, label: "9:00 AM" } for 6:00 AM – 10:00 PM, every 30 min.
export const TIME_OPTIONS = (() => {
  const opts = [];
  for (let min = 360; min <= 1320; min += 30) {
    const h = Math.floor(min / 60),
      m = min % 60;
    const label = `${h > 12 ? h - 12 : h === 0 ? 12 : h}:${m.toString().padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
    opts.push({ value: min, label });
  }
  return opts;
})();

// "HH:MM" slots for the appointment form (6:00 AM – 9:00 PM, every 15 min).
export const TIME_SLOTS = (() => {
  const opts = [];
  for (let min = 360; min <= 1260; min += 15) {
    const h = Math.floor(min / 60),
      m = min % 60;
    const value = `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
    const label = `${h > 12 ? h - 12 : h === 0 ? 12 : h}:${m.toString().padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
    opts.push({ value, label });
  }
  return opts;
})();

export const DAYS_FULL = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export const DURATIONS = [15, 30, 45, 60, 75, 90, 105, 120, 150, 180];

// Today as local "YYYY-MM-DD" (matches the calendar's day columns).
export const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// The Sunday on or before today (local), as "YYYY-MM-DD" — the biweekly anchor.
export const sundayKey = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// Local "YYYY-MM-DD" for a Date.
export function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function parseYmd(str) {
  const [y, m, d] = str.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDaysKey(str, n) {
  const d = parseYmd(str);
  d.setDate(d.getDate() + n);
  return ymd(d);
}

// Sunday (start) of the week containing `str`.
export function weekStartOf(str) {
  const d = parseYmd(str);
  d.setDate(d.getDate() - d.getDay());
  return ymd(d);
}

// "HH:MM" → minutes since midnight.
export function toMin(tv) {
  if (!tv) return 0;
  const [h, m] = tv.split(":").map(Number);
  return h * 60 + m;
}

// "HH:MM" → "9:00 AM".
export function fmtTime(tv) {
  if (!tv) return "";
  const [h, m] = tv.split(":").map(Number);
  return `${h > 12 ? h - 12 : h === 0 ? 12 : h}:${m.toString().padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

// "2024-03-05" → "Mar 5".
export function fmtShort(str) {
  return parseYmd(str).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// Sidebar day label — "Today · Tuesday, Mar 5" for today/tomorrow, else the long form.
export function fmtSideDay(str) {
  const date = parseYmd(str);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((date - today) / 86400000);
  const long = date.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
  if (diff === 0) return `Today · ${long}`;
  if (diff === 1) return `Tomorrow · ${long}`;
  return long;
}
