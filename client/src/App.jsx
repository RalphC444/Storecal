import { useState, useEffect, useCallback, useRef } from "react";

// ── Helpers ───────────────────────────────────────────────────────────────────

const TIME_OPTIONS = (() => {
  const opts = [];
  for (let min = 360; min <= 1320; min += 30) {
    const h = Math.floor(min / 60), m = min % 60;
    const label = `${h > 12 ? h - 12 : h === 0 ? 12 : h}:${m.toString().padStart(2,"0")} ${h >= 12 ? "PM" : "AM"}`;
    opts.push({ value: min, label });
  }
  return opts;
})();

// "HH:MM" slots for the appointment form (6:00 AM – 9:00 PM, every 15 min).
const TIME_SLOTS = (() => {
  const opts = [];
  for (let min = 360; min <= 1260; min += 15) {
    const h = Math.floor(min / 60), m = min % 60;
    const value = `${h.toString().padStart(2,"0")}:${m.toString().padStart(2,"0")}`;
    const label = `${h > 12 ? h - 12 : h === 0 ? 12 : h}:${m.toString().padStart(2,"0")} ${h >= 12 ? "PM" : "AM"}`;
    opts.push({ value, label });
  }
  return opts;
})();

const DAYS_FULL = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const DURATIONS = [15, 30, 45, 60, 75, 90, 105, 120, 150, 180];

// Local YYYY-MM-DD (matches the calendar's day columns; avoids the UTC shift
// toISOString would introduce, which could leave "today" unselected near midnight).
const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
};

// The Sunday on or before today (local), as YYYY-MM-DD — the biweekly anchor.
const sundayKey = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
};

function dateKey(offsetDays) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

// Local YYYY-MM-DD (avoids the UTC shift toISOString would introduce).
function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function parseYmd(str) {
  const [y, m, d] = str.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function addDaysKey(str, n) {
  const d = parseYmd(str); d.setDate(d.getDate() + n); return ymd(d);
}
// Sunday (start) of the week containing `str`.
function weekStartOf(str) {
  const d = parseYmd(str); d.setDate(d.getDate() - d.getDay()); return ymd(d);
}
// "HH:MM" → minutes since midnight.
function toMin(tv) {
  if (!tv) return 0;
  const [h, m] = tv.split(":").map(Number);
  return h * 60 + m;
}

function fmtDayHeading(str) {
  const [y, mo, d] = str.split("-").map(Number);
  const date = new Date(y, mo - 1, d);
  const today = new Date(); today.setHours(0,0,0,0);
  const diff = Math.round((date - today) / 86400000);
  const long = date.toLocaleDateString("en-US", { weekday:"long", month:"long", day:"numeric" });
  if (diff === 0) return `Today · ${long}`;
  if (diff === 1) return `Tomorrow · ${long}`;
  return long;
}

function fmtTime(tv) {
  if (!tv) return "";
  const [h, m] = tv.split(":").map(Number);
  return `${h > 12 ? h - 12 : h === 0 ? 12 : h}:${m.toString().padStart(2,"0")} ${h >= 12 ? "PM" : "AM"}`;
}

function fmtShort(str) {
  return parseYmd(str).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function fmtSideDay(str) {
  const date = parseYmd(str);
  const today = new Date(); today.setHours(0,0,0,0);
  const diff = Math.round((date - today) / 86400000);
  const long = date.toLocaleDateString("en-US", { weekday:"long", month:"short", day:"numeric" });
  if (diff === 0) return `Today · ${long}`;
  if (diff === 1) return `Tomorrow · ${long}`;
  return long;
}

const STATUSES = ["pending", "confirmed", "completed", "cancelled"];
// Statuses an owner can set by hand — "completed" is automatic (see effStatus).
const MANUAL_STATUSES = ["pending", "confirmed", "cancelled"];
const STATUS_LABEL = {
  pending: "Pending", confirmed: "Confirmed", completed: "Completed", cancelled: "Cancelled",
};

// Effective status: an appointment auto-completes once its end time has passed
// (a past day, or today with end ≤ now). Cancelled/completed are left as-is.
function effStatus(a, durationOf) {
  if (a.status === "cancelled" || a.status === "completed") return a.status;
  const today = todayKey();
  if (a.dateKey < today) return "completed";
  if (a.dateKey === today) {
    const now = new Date();
    const endMin = toMin(a.timeValue) + (durationOf ? durationOf(a.service) : 45);
    if (endMin <= now.getHours() * 60 + now.getMinutes()) return "completed";
  }
  return a.status;
}

// Team wording per vertical (hair / nail / barber), driven by shop.businessType.
const TEAM_LABEL = {
  salon: "Staff", hair: "Staff", barber: "Staff", nail: "Staff", generic: "Staff",
};

// Inline stroke icons (no dependency). 24-grid, inherits currentColor.
function Icon({ name }) {
  const paths = {
    calendar: <><rect x="3" y="4.5" width="18" height="16" rx="2" /><path d="M3 9h18M8 3v3M16 3v3" /></>,
    clients: <><circle cx="9" cy="8" r="3.1" /><path d="M2.7 19a6.3 6.3 0 0 1 12.6 0" /><path d="M16.5 5.6a3 3 0 0 1 0 5.8M17.5 19a6.3 6.3 0 0 0-2-4.6" /></>,
    scissors: <><circle cx="6" cy="6.5" r="2.3" /><circle cx="6" cy="17.5" r="2.3" /><path d="M8 8l12 8.5M8 16l12-8.5" /></>,
    plus: <path d="M12 5v14M5 12h14" />,
    menu: <path d="M3 6h18M3 12h18M3 18h18" />,
    chevronLeft: <path d="M15 6l-6 6 6 6" />,
    chevronRight: <path d="M9 6l6 6-6 6" />,
    clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
    tag: <><path d="M20.6 13.4l-7.2 7.2a1.9 1.9 0 0 1-2.7 0l-6.9-6.9A1.9 1.9 0 0 1 3.3 12.4V5a1.7 1.7 0 0 1 1.7-1.7h7.4a1.9 1.9 0 0 1 1.3.6l6.9 6.9a1.9 1.9 0 0 1 0 2.6z" /><circle cx="7.8" cy="7.8" r="1.2" /></>,
    signout: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5M21 12H9" /></>,
  };
  return (
    <svg className="ico" viewBox="0 0 24 24" width="20" height="20" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

// Only surfaces `active` after `ms` — avoids loader flashes on fast responses.
function useDelayed(active, ms = 500) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!active) { setShown(false); return; }
    const t = setTimeout(() => setShown(true), ms);
    return () => clearTimeout(t);
  }, [active, ms]);
  return shown;
}

// Consistent page loader — spinner only appears if loading exceeds 500ms.
function Loader() {
  const show = useDelayed(true, 500);
  if (!show) return null;
  return <div className="loader"><span className="spinner" aria-label="Loading" /></div>;
}

// True when the viewport is phone-sized (drives the single-day calendar).
function useIsMobile(bp = 860) {
  const [m, setM] = useState(() => typeof window !== "undefined" && window.innerWidth <= bp);
  useEffect(() => {
    const on = () => setM(window.innerWidth <= bp);
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, [bp]);
  return m;
}

// ── Root ──────────────────────────────────────────────────────────────────────

function AdminApp({ user, onSignOut, onUserChange }) {
  const [providers, setProviders] = useState([]);
  const [services, setServices] = useState([]);
  const [shopName, setShopName] = useState("Salon Booking");
  const [businessType, setBusinessType] = useState("salon");
  const isProvider = user.role === "provider";
  const [view, setView] = useState("calendar"); // "calendar" | "clients" | "providers"
  // Providers only ever see their own calendar — lock the filter to themselves.
  const [selected, setSelected] = useState(isProvider ? user.providerId : "all");

  const [appts, setAppts] = useState([]);
  const [loading, setLoading] = useState(true);

  const [weekStart, setWeekStart] = useState(weekStartOf(todayKey()));
  const [selectedDay, setSelectedDay] = useState(todayKey());

  const [editing, setEditing] = useState(null); // null | {} | {…appt}
  const [storeHoursOpen, setStoreHoursOpen] = useState(false);
  const [addReq, setAddReq] = useState(0); // bump to trigger the active tab's "add" modal

  const [mobileOpen, setMobileOpen] = useState(false); // drawer on small screens

  const loadProviders = useCallback(() => {
    fetch("/api/providers")
      .then(r => r.json())
      .then(data => Array.isArray(data) && setProviders(data));
  }, []);

  useEffect(() => {
    loadProviders();
    fetch("/api/shop-config")
      .then(r => r.json())
      .then(cfg => {
        if (Array.isArray(cfg.services)) setServices(cfg.services);
        if (cfg.shop?.name) setShopName(cfg.shop.name);
        if (cfg.shop?.businessType) setBusinessType(cfg.shop.businessType);
      })
      .catch(() => {});
  }, [loadProviders]);

  const teamLabel = TEAM_LABEL[businessType] || TEAM_LABEL.generic;
  const isMobile = useIsMobile();

  const weekEnd = addDaysKey(weekStart, 6);

  const loadAppts = useCallback(() => {
    setLoading(true);
    const p = new URLSearchParams({ from: weekStart, to: weekEnd });
    if (selected !== "all") p.set("providerId", selected);
    fetch(`/api/appointments?${p}`)
      .then(r => r.json())
      .then(data => Array.isArray(data) && setAppts(data))
      .finally(() => setLoading(false));
  }, [weekStart, weekEnd, selected]);

  useEffect(() => { loadAppts(); }, [loadAppts]);

  async function saveAppt(id, payload) {
    const res = await fetch(id ? `/api/appointments/${id}` : "/api/appointments", {
      method: id ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const { error } = await res.json().catch(() => ({}));
      throw new Error(error || "Could not save the appointment");
    }
    setEditing(null);
    loadAppts();
  }

  async function updateStatus(id, status) {
    await fetch(`/api/appointments/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setAppts(prev => prev.map(a => a._id === id ? { ...a, status } : a));
    // Cancelling removes it from the calendar, so close the modal too.
    setEditing(e => {
      if (!e || e._id !== id) return e;
      return status === "cancelled" ? null : { ...e, status };
    });
  }

  const durationOf = useCallback((serviceName) => {
    const s = services.find(x => x.name === serviceName);
    return s?.durationMin || 45;
  }, [services]);

  const dayAppts = appts
    .filter(a => a.dateKey === selectedDay)
    .sort((a, b) => toMin(a.timeValue) - toMin(b.timeValue));

  function goToday() {
    const t = todayKey();
    setWeekStart(weekStartOf(t));
    setSelectedDay(t);
  }
  // Mobile shows one day; step by day and keep the week in sync.
  function stepDay(n) {
    const d = addDaysKey(selectedDay, n);
    setSelectedDay(d);
    setWeekStart(weekStartOf(d));
  }
  function newAt(dateKeyStr, min) {
    const hh = String(Math.floor(min / 60)).padStart(2, "0");
    const mm = String(min % 60).padStart(2, "0");
    setEditing({
      dateKey: dateKeyStr,
      timeValue: `${hh}:${mm}`,
      providerId: selected !== "all" ? selected : undefined,
    });
  }

  // Hours banner: prompt to add store/work hours until a schedule exists.
  const [hoursNeeded, setHoursNeeded] = useState(false);
  const [provHoursOpen, setProvHoursOpen] = useState(false);
  const hoursId = user.role === "owner" ? "shop" : user.providerId;
  const recheckHours = useCallback(() => {
    if (!hoursId) { setHoursNeeded(false); return; }
    fetch(`/api/availability/${hoursId}`).then(r => r.json()).then(av => {
      const open = av?.weekA?.some(d => d.enabled) || av?.weekB?.some(d => d.enabled);
      setHoursNeeded(!open);
    }).catch(() => {});
  }, [hoursId]);
  useEffect(() => { recheckHours(); }, [recheckHours]);
  const myProvider = providers.find(p => p._id === user.providerId);
  function openHours() {
    if (user.role === "owner") setStoreHoursOpen(true);
    else if (myProvider) setProvHoursOpen(true);
  }

  // Owner manages the whole shop; a provider gets a scoped set of tabs and a
  // "My profile" tab to self-manage their bio, services and hours.
  const NAV = isProvider ? [
    { key: "calendar", label: "My calendar", icon: "calendar" },
    { key: "clients", label: "Clients", icon: "clients" },
    { key: "myprofile", label: "My profile", icon: "scissors" },
  ] : [
    { key: "calendar", label: "Calendar", icon: "calendar" },
    { key: "providers", label: teamLabel, icon: "scissors" },
    { key: "clients", label: "Clients", icon: "clients" },
    { key: "services", label: "Services", icon: "tag" },
  ];
  const go = (v) => { setView(v); setMobileOpen(false); };

  // Context action shown fixed in the mobile top nav, per active tab.
  const topAction =
    view === "calendar" ? (isProvider ? { label: "My hours", onClick: openHours } : { label: "Store hours", onClick: () => setStoreHoursOpen(true) })
    : view === "myprofile" ? { label: "My hours", onClick: openHours }
    : view === "providers" ? { label: `Add ${teamLabel.replace(/s$/, "").toLowerCase()}`, onClick: () => setAddReq(n => n + 1) }
    : view === "services" ? { label: "Add service", onClick: () => setAddReq(n => n + 1) }
    : { label: "Add client", onClick: () => setAddReq(n => n + 1) };

  const hoursLabel = user.role === "owner" ? "store hours" : "work hours";

  return (
    <div className="viewport">
      {hoursNeeded && (
        <div className="hoursbanner">
          <span>⚠️ Add your {hoursLabel} so clients can book — it only takes a minute.</span>
          <button className="hoursbanner__cta" onClick={openHours}>Add {hoursLabel}</button>
        </div>
      )}
      <div className={`shell${mobileOpen ? " shell--open" : ""}`}>
      <div className="scrim" onClick={() => setMobileOpen(false)} />

      <aside className="sidebar">
        <div className="sidebar__top">
          <div className="saas">
            <span className="saas__mark"><Icon name="calendar" /></span>
            <span className="saas__name">StoreCal</span>
          </div>
          <div className="ws">{shopName}</div>
        </div>

        <nav className="navlist">
          {NAV.map(n => (
            <button
              key={n.key}
              className={`navlink${view === n.key ? " navlink--on" : ""}`}
              onClick={() => go(n.key)}
              title={n.label}
            >
              <Icon name={n.icon} />
              <span className="navlink__txt">{n.label}</span>
              {n.badge > 0 && <span className="navbadge">{n.badge}</span>}
            </button>
          ))}
        </nav>

        <div className="sidebar__spacer" />

        <button className="newbtn" onClick={() => { setEditing({ dateKey: selectedDay }); setMobileOpen(false); }} title="New appointment">
          <Icon name="plus" /><span className="navlink__txt">New appointment</span>
        </button>

        <div className="uprof">
          <button className="uprof__acct" onClick={() => go("settings")} title="Account settings">
            <span className="uprof__av">{(user.name || user.email).slice(0, 1).toUpperCase()}<span className="uprof__dot" /></span>
            <span className="uprof__meta">
              <span className="uprof__name">{user.name || user.email}</span>
              <span className="uprof__role">{user.role === "owner" ? "Owner" : "Staff"} · Settings</span>
            </span>
          </button>
          <button className="uprof__out" onClick={onSignOut} title="Sign out" aria-label="Sign out">
            <Icon name="signout" />
          </button>
        </div>
      </aside>

      <main className="content">
        <div className="topbar">
          <button className="hamburger" onClick={() => setMobileOpen(true)} aria-label="Open menu">
            <Icon name="menu" />
          </button>
          <span className="topbar__title">{shopName}</span>
          <button className="topbar__cta" onClick={topAction.onClick}>{topAction.label}</button>
        </div>

        {view === "calendar" ? (
          <WeekCalendar
            weekStart={weekStart}
            selectedDay={selectedDay}
            appts={appts}
            loading={loading}
            providers={providers}
            providerId={selected}
            teamLabel={teamLabel}
            isMobile={isMobile}
            lockProvider={isProvider}
            onSelectProvider={setSelected}
            durationOf={durationOf}
            onPrev={() => isMobile ? stepDay(-1) : setWeekStart(w => addDaysKey(w, -7))}
            onNext={() => isMobile ? stepDay(1) : setWeekStart(w => addDaysKey(w, 7))}
            onToday={goToday}
            onSelectDay={setSelectedDay}
            onSelectAppt={a => setEditing(a)}
            onNewAt={newAt}
            hoursLabel={isProvider ? "My hours" : "Store hours"}
            onStoreHours={openHours}
          />
        ) : view === "myprofile" ? (
          <ProviderSelfView provider={myProvider} onChange={loadProviders} onEditHours={() => setProvHoursOpen(true)} />
        ) : view === "providers" ? (
          <ProvidersView onChange={loadProviders} teamLabel={teamLabel} addReq={addReq} />
        ) : view === "services" ? (
          <ServicesView providers={providers} teamLabel={teamLabel} onProvidersChange={loadProviders} addReq={addReq} />
        ) : view === "settings" ? (
          <SettingsView user={user} onUserChange={onUserChange} onSignOut={onSignOut} />
        ) : (
          <ClientsView providers={providers} services={services} durationOf={durationOf} onApptSaved={loadAppts} addReq={addReq} />
        )}
      </main>

      {view === "calendar" && (
        <button className="fab" onClick={() => setEditing({ dateKey: selectedDay })} aria-label="New appointment">
          <Icon name="plus" />
        </button>
      )}

      {editing && (
        <AppointmentModal
          appt={editing}
          providers={providers}
          services={services}
          durationOf={durationOf}
          onClose={() => setEditing(null)}
          onSave={saveAppt}
          onStatusChange={updateStatus}
        />
      )}

      {storeHoursOpen && <StoreHoursModal onClose={() => { setStoreHoursOpen(false); recheckHours(); }} />}
      {provHoursOpen && myProvider && (
        <ProviderHoursModal provider={myProvider} onClose={() => { setProvHoursOpen(false); recheckHours(); }} />
      )}
      </div>
    </div>
  );
}

// ── Week calendar (Teams-style day × time grid) ─────────────────────────────

const DAY_START = 480;   // 8:00 AM
const DAY_END   = 1260;  // 9:00 PM
const PX_PER_MIN = 1.1;  // taller rows; grid overflows viewport slightly → small scroll
const GRID_H = (DAY_END - DAY_START) * PX_PER_MIN;
const DAYS_SHORT = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

// 30-minute click-to-create slots (each gets its own hover/active state).
const SLOTS = [];
for (let m = DAY_START; m < DAY_END; m += 30) SLOTS.push(m);

// Lay out a day's appointments into side-by-side lanes so overlapping bookings
// split the column width (like Teams) instead of stacking on top of each other.
function packDay(list, durationOf) {
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

// Open ranges for one date given a provider's availability + time off.
// Returns [] when closed, or null when we have no availability data (e.g. "all").
function openRangesFor(dateStr, av, timeoff) {
  if (!av) return null;
  const ov = av.overrides?.find(o => o.date === dateStr);
  if (ov) return ov.closed ? [] : ov.ranges;
  if (timeoff?.some(t => dateStr >= t.startDate && dateStr <= t.endDate)) return [];
  const weekKey = av.meta?.biweekly ? weekKeyFor(av.meta.anchorDate, dateStr) : "A";
  const week = weekKey === "A" ? av.weekA : av.weekB;
  const weekday = parseYmd(dateStr).getDay();
  const day = week?.find(d => d.weekday === weekday);
  return day?.enabled ? day.ranges : [];
}

function WeekCalendar({
  weekStart, selectedDay, appts, loading, providers, providerId, teamLabel, isMobile,
  lockProvider, hoursLabel = "Store hours",
  onSelectProvider, durationOf,
  onPrev, onNext, onToday, onSelectDay, onSelectAppt, onNewAt, onStoreHours,
}) {
  const [av, setAv] = useState(null);
  const [timeoff, setTimeoff] = useState([]);

  useEffect(() => {
    if (providerId === "all") { setAv(null); setTimeoff([]); return; }
    fetch(`/api/availability/${providerId}`).then(r => r.json()).then(setAv).catch(() => setAv(null));
    fetch(`/api/timeoff/${providerId}`).then(r => r.json()).then(d => Array.isArray(d) && setTimeoff(d)).catch(() => {});
  }, [providerId]);

  // Cancelled appointments drop off the calendar (still kept in client history).
  const shown = appts.filter(a => a.status !== "cancelled");

  // Mobile shows just the selected day; desktop shows the full week.
  const days = isMobile ? [selectedDay] : Array.from({ length: 7 }, (_, i) => addDaysKey(weekStart, i));
  const hours = [];
  for (let h = DAY_START / 60; h < DAY_END / 60; h++) hours.push(h);

  const todayStr = todayKey();
  const title = isMobile
    ? parseYmd(selectedDay).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })
    : parseYmd(weekStart).toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  // "Today" is active only when today is actually in view AND selected — so it
  // reverts to secondary when you paginate away or pick another day.
  const isTodayView = selectedDay === todayStr && days.includes(todayStr);
  const colStyle = { gridTemplateColumns: `repeat(${days.length}, 1fr)` };

  return (
    <div className="cal">
      <div className="cal__top">
        <div className="cal__nav">
          <button className={`navbtn${isTodayView ? " navbtn--on" : ""}`} onClick={onToday}>Today</button>
          <button className="navbtn navbtn--icon" onClick={onPrev} aria-label="Previous"><Icon name="chevronLeft" /></button>
          <button className="navbtn navbtn--icon" onClick={onNext} aria-label="Next"><Icon name="chevronRight" /></button>
        </div>
        <h1 className="cal__title">{title}</h1>
        <span className="cal__stat">
          <span className="cal__stat-l">Total appointments</span>
          <span className="cal__stat-n">{loading ? "…" : shown.length}</span>
        </span>
        {!lockProvider && (
          <label className="cal__view">
            <span className="cal__view-l">View:</span>
            <select className="cal__filter" value={providerId} onChange={e => onSelectProvider(e.target.value)}>
              <option value="all">All {(teamLabel || "team").toLowerCase()}</option>
              {providers.map(p => <option key={p._id} value={p._id}>{p.name}</option>)}
            </select>
          </label>
        )}
        <button className="navbtn navbtn--cta cal__storehours" onClick={onStoreHours}>
          <Icon name="clock" /> {hoursLabel}
        </button>
      </div>

      <div className="cal__grid">
        {loading && <div className="cal__loading"><Loader /></div>}
        <div className="cal__scroll">
          {/* Day headers (sticky, share the scroll container so they align with columns) */}
          <div className="cal__headrow">
            <div className="cal__corner" />
            <div className="cal__heads" style={colStyle}>
              {days.map(d => {
                const dt = parseYmd(d);
                const isToday = d === todayStr;
                const isSel = d === selectedDay;
                return (
                  <button
                    key={d}
                    className={`cal__head${isSel ? " cal__head--sel" : ""}`}
                    onClick={() => onSelectDay(d)}
                  >
                    <span className="cal__hday">{DAYS_SHORT[dt.getDay()]}</span>
                    <span className={`cal__hnum${isToday ? " cal__hnum--today" : ""}`}>{dt.getDate()}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Time gutter + day columns */}
          <div className="cal__body">
            <div className="cal__gutter" style={{ height: GRID_H }}>
              {hours.map(h => (
                <div key={h} className="cal__hourlabel" style={{ height: 60 * PX_PER_MIN }}>
                  {h === 12 ? "12 PM" : h > 12 ? `${h - 12} PM` : `${h} AM`}
                </div>
              ))}
            </div>

            <div className="cal__cols" style={{ height: GRID_H, ...colStyle }}>
          {days.map(d => {
            const open = openRangesFor(d, av, timeoff);
            const list = shown.filter(a => a.dateKey === d);
            // "Scoped" = viewing a single provider → off time is un-bookable + tinted.
            const scoped = !!av;
            const isToday = d === todayStr;
            const isOpenAt = (min) => !scoped || (open || []).some(r => min >= r.startMin && min < r.endMin);
            const colCls = scoped ? "cal__col cal__col--scoped" : `cal__col${isToday ? " cal__col--today" : ""}`;
            return (
              <div key={d} className={colCls}>
                {/* hour lines */}
                {hours.slice(1).map((h, i) => (
                  <div key={h} className="cal__line" style={{ top: (i + 1) * 60 * PX_PER_MIN }} />
                ))}

                {/* open-hours shading (white "bookable" bands over the tinted closed base) */}
                {open && open.map((r, i) => (
                  <div
                    key={i}
                    className="cal__open"
                    style={{
                      top: (Math.max(r.startMin, DAY_START) - DAY_START) * PX_PER_MIN,
                      height: (Math.min(r.endMin, DAY_END) - Math.max(r.startMin, DAY_START)) * PX_PER_MIN,
                    }}
                  />
                ))}

                {/* click-to-create slots — blocked outside a provider's working hours */}
                <div className="cal__slots">
                  {SLOTS.map(min => {
                    const blocked = scoped && !isOpenAt(min);
                    return (
                      <button
                        key={min}
                        className={`cal__slot${blocked ? " cal__slot--blocked" : ""}`}
                        style={{ height: 30 * PX_PER_MIN }}
                        disabled={blocked}
                        title={blocked ? "Not working — can't book" : `New appointment · ${fmtTime(`${String(Math.floor(min/60)).padStart(2,"0")}:${String(min%60).padStart(2,"0")}`)}`}
                        onClick={blocked ? undefined : () => onNewAt(d, min)}
                      />
                    );
                  })}
                </div>

                {/* appointments (lane-packed) */}
                {packDay(list, durationOf).map(({ a, start, lane, lanes }) => {
                  const dur = durationOf(a.service);
                  const top = (start - DAY_START) * PX_PER_MIN;
                  const height = Math.max(dur * PX_PER_MIN, 20);
                  const left = `calc(${(lane / lanes) * 100}% + 2px)`;
                  const width = `calc(${100 / lanes}% - 4px)`;
                  const compact = height < 44;
                  const svcText = `${a.service || ""}${providerId === "all" && a.providerName ? ` · ${a.providerName}` : ""}`;
                  return (
                    <button
                      key={a._id}
                      className={`evt evt--${effStatus(a, durationOf)}${compact ? " evt--compact" : ""}`}
                      style={{ top, height, left, width }}
                      onClick={e => { e.stopPropagation(); onSelectAppt(a); }}
                      title={`${fmtTime(a.timeValue)} · ${a.client?.name || ""}${svcText ? " · " + svcText : ""}`}
                    >
                      {compact ? (
                        <span className="evt__line">
                          <span className="evt__time">{fmtTime(a.timeValue)}</span>
                          <span className="evt__name">{a.client?.name || "—"}</span>
                        </span>
                      ) : (
                        <>
                          <span className="evt__time">{fmtTime(a.timeValue)}</span>
                          <span className="evt__name">{a.client?.name || "—"}</span>
                          {height > 58 && lanes < 3 && svcText.trim() && <span className="evt__svc">{svcText}</span>}
                        </>
                      )}
                    </button>
                  );
                })}

                {/* now line */}
                {isToday && nowMin >= DAY_START && nowMin <= DAY_END && (
                  <div className="cal__now" style={{ top: (nowMin - DAY_START) * PX_PER_MIN }} />
                )}
              </div>
            );
          })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Schedule editing surfaced in a modal from the calendar sidebar.
function ScheduleModal({ providers, initialProviderId, onClose }) {
  return (
    <div className="modal" onMouseDown={onClose}>
      <div className="modal__panel modal__panel--wide" onMouseDown={e => e.stopPropagation()}>
        <div className="modal__head">
          <h2 className="modal__title">Hours &amp; time off</h2>
          <button className="modal__x" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="modal__scroll">
          <ScheduleView providers={providers} initialProviderId={initialProviderId} />
        </div>
      </div>
    </div>
  );
}

// Store-level hours & closures. Reuses the SAME schedule editor as providers,
// bound to a "shop" entity — so weekly hours, single-day "close early", and
// time off all work identically to a stylist's schedule.
function StoreHoursModal({ onClose }) {
  return (
    <div className="modal" onMouseDown={onClose}>
      <div className="modal__panel modal__panel--wide" onMouseDown={e => e.stopPropagation()}>
        <div className="modal__head">
          <h2 className="modal__title">Store hours &amp; closures</h2>
          <button className="modal__x" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <p className="modal__note">Set the shop’s open hours, close early on a specific day, or block whole days. Staff can’t be booked outside these hours.</p>
        <div className="modal__scroll">
          <ScheduleEditor provider={{ _id: "shop", name: "Store" }} mode="store" />
        </div>
      </div>
    </div>
  );
}

// ── Appointment row ───────────────────────────────────────────────────────────

function ApptRow({ appt: a, showProvider, showVehicle, onStatusChange, onEdit }) {
  const [open, setOpen] = useState(false);
  const done = a.status === "completed" || a.status === "cancelled";

  return (
    <div className={`row${open ? " row--open" : ""}${done ? " row--done" : ""}`}>
      <button className="row__head" onClick={() => setOpen(o => !o)}>
        <span className="row__time">{fmtTime(a.timeValue)}</span>
        <span className="row__name">{a.client?.name || "—"}</span>
        <span className="row__svc">{a.service || "—"}</span>
        {showProvider && <span className="row__provider">{a.providerName || ""}</span>}
        <span className={`tag tag--${a.status}`}>{STATUS_LABEL[a.status]}</span>
      </button>

      {open && (
        <div className="row__detail">
          <dl className="detail">
            <div>
              <dt>Client</dt>
              <dd>{a.client?.name || "—"}</dd>
              {a.client?.phone && <dd><a href={`tel:${a.client.phone}`}>{a.client.phone}</a></dd>}
              {a.client?.email && <dd><a href={`mailto:${a.client.email}`}>{a.client.email}</a></dd>}
            </div>
            {showVehicle && (
              <div>
                <dt>Vehicle</dt>
                <dd>{[a.vehicle?.year,a.vehicle?.make,a.vehicle?.model,a.vehicle?.trim].filter(Boolean).join(" ") || "—"}</dd>
              </div>
            )}
            <div>
              <dt>Service</dt>
              <dd>{a.service || "—"}</dd>
              {a.issueDescription && <dd className="detail__note">{a.issueDescription}</dd>}
            </div>
            {showProvider && (
              <div>
                <dt>Staff</dt>
                <dd>{a.providerName || "—"}</dd>
              </div>
            )}
          </dl>

          <div className="actions">
            {STATUSES.map(s => (
              <button
                key={s}
                className={`action${a.status === s ? " action--on" : ""}`}
                onClick={() => onStatusChange(a._id, s)}
                disabled={a.status === s}
              >{STATUS_LABEL[s]}</button>
            ))}
            <button className="action action--edit" onClick={onEdit}>Edit details</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Schedule view ─────────────────────────────────────────────────────────────

function ScheduleView({ providers, initialProviderId }) {
  const [mode, setMode] = useState("owner"); // "owner" | "stylist"
  const [providerId, setProviderId] = useState(initialProviderId || null);

  useEffect(() => {
    if (!providerId && providers[0]) setProviderId(providers[0]._id);
  }, [providers, providerId]);

  const provider = providers.find(p => p._id === providerId);

  return (
    <main className="main">
      <div className="modebar">
        <div className="seg">
          <button
            className={`seg__btn${mode === "owner" ? " seg__btn--on" : ""}`}
            onClick={() => setMode("owner")}
          >Owner</button>
          <button
            className={`seg__btn${mode === "stylist" ? " seg__btn--on" : ""}`}
            onClick={() => setMode("stylist")}
          >Staff</button>
        </div>
        {mode === "stylist" && (
          <label className="modebar__as">
            Viewing as
            <select value={providerId || ""} onChange={e => setProviderId(e.target.value)}>
              {providers.map(p => <option key={p._id} value={p._id}>{p.name}</option>)}
            </select>
          </label>
        )}
      </div>

      {mode === "owner" && (
        <div className="provider-tabs">
          {providers.map(p => (
            <button
              key={p._id}
              className={`ptab${providerId === p._id ? " ptab--on" : ""}`}
              onClick={() => setProviderId(p._id)}
            >{p.name}</button>
          ))}
        </div>
      )}

      {provider && (
        <ScheduleEditor key={provider._id + mode} provider={provider} mode={mode} />
      )}
    </main>
  );
}

// ── Providers ────────────────────────────────────────────────────────────────

function ProvidersView({ onChange, teamLabel, addReq }) {
  const [list, setList] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [editing, setEditing] = useState(null); // null | {} | {…provider}
  const [invite, setInvite] = useState(null);   // { name, url } after adding w/ email
  const [err, setErr] = useState("");

  // Open the add-stylist modal when the top-nav action fires (ignore mount).
  const addSeen = useRef(addReq);
  useEffect(() => { if (addReq !== addSeen.current) { addSeen.current = addReq; setSelectedId(null); setEditing({}); } }, [addReq]);

  const load = useCallback(() => {
    fetch("/api/providers?all=1").then(r => r.json()).then(d => Array.isArray(d) && setList(d));
  }, []);
  useEffect(() => { load(); }, [load]);

  async function save(p) {
    setErr("");
    const res = await fetch(p._id ? `/api/providers/${p._id}` : "/api/providers", {
      method: p._id ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(p),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setErr(data.error || "Could not save"); return; }
    setEditing(null); load(); onChange?.();
    // New stylist with an email → surface the one-time invite link to share.
    if (!p._id && data.inviteToken) {
      setInvite({ name: p.name, url: `${window.location.origin}/invite?token=${data.inviteToken}` });
    }
  }
  async function toggleActive(p) {
    await fetch(`/api/providers/${p._id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !p.active }),
    });
    load(); onChange?.();
  }
  async function remove(p) {
    setErr("");
    const res = await fetch(`/api/providers/${p._id}`, { method: "DELETE" });
    if (!res.ok) { const { error } = await res.json().catch(() => ({})); setErr(error || "Could not delete"); return; }
    setSelectedId(null); load(); onChange?.();
  }

  const selected = list?.find(p => p._id === selectedId);
  const label = teamLabel || "Staff";

  return (
    <>
      {selected ? (
        <StylistProfile
          provider={selected}
          err={err}
          onBack={() => { setErr(""); setSelectedId(null); }}
          onEdit={() => setEditing(selected)}
          onToggleActive={() => toggleActive(selected)}
          onDelete={() => remove(selected)}
          onSaved={() => { load(); onChange?.(); }}
        />
      ) : (
        <div className="pageview">
          <div className="pv__head">
            <h1 className="pv__title">{label}</h1>
            <button className="btn btn--new" onClick={() => setEditing({})}>+ Add {label.replace(/s$/, "").toLowerCase()}</button>
          </div>
          <div className="pv__body">
            {err && <p className="form__error">{err}</p>}
            {!list ? <Loader />
              : list.length === 0 ? <p className="empty">No {label.toLowerCase()} yet.</p>
              : (
                <div className="pgrid">
                  {list.map(p => (
                    <StylistCard key={p._id} provider={p} onOpen={() => setSelectedId(p._id)} />
                  ))}
                </div>
              )
            }
          </div>
        </div>
      )}

      {editing && <ProviderForm provider={editing} onClose={() => setEditing(null)} onSave={save} />}
      {invite && <InviteModal invite={invite} onClose={() => setInvite(null)} />}
    </>
  );
}

// Shows the one-time invite link for the owner to copy + share.
function InviteModal({ invite, onClose }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard?.writeText(invite.url).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  }
  return (
    <div className="modal" onMouseDown={onClose}>
      <div className="modal__panel" onMouseDown={e => e.stopPropagation()}>
        <div className="modal__head">
          <h2 className="modal__title">Invite {invite.name}</h2>
          <button className="modal__x" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="form">
          <p className="sp__hint">Send {invite.name} this link. When they open it they’ll set a password and be connected to your store. The link works once and expires in 14 days.</p>
          <div className="invite__row">
            <input className="invite__link" readOnly value={invite.url} onFocus={e => e.target.select()} />
            <button className="btn" onClick={copy}>{copied ? "Copied!" : "Copy"}</button>
          </div>
          <div className="form__actions">
            <button className="btn" onClick={onClose}>Done</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Today's working status for a stylist, derived from their availability.
function useTodayStatus(provider) {
  const [status, setStatus] = useState(null);
  useEffect(() => {
    if (!provider.active) { setStatus({ kind: "hidden", label: "Not bookable" }); return; }
    let alive = true;
    Promise.all([
      fetch(`/api/availability/${provider._id}`).then(r => r.json()).catch(() => null),
      fetch(`/api/timeoff/${provider._id}`).then(r => r.json()).catch(() => []),
    ]).then(([av, timeoff]) => {
      if (!alive) return;
      const open = openRangesFor(todayKey(), av, Array.isArray(timeoff) ? timeoff : []);
      if (!open || open.length === 0) { setStatus({ kind: "off", label: "Off today" }); return; }
      const now = new Date();
      const nowMin = now.getHours() * 60 + now.getMinutes();
      const start = Math.min(...open.map(r => r.startMin));
      const end = Math.max(...open.map(r => r.endMin));
      if (nowMin < start) setStatus({ kind: "soon", label: `Comes in ${fmtMin(start)}` });
      else if (nowMin <= end) setStatus({ kind: "working", label: "Working today" });
      else setStatus({ kind: "off", label: "Done for the day" });
    });
    return () => { alive = false; };
  }, [provider._id, provider.active]);
  return status;
}

function StylistCard({ provider: p, onOpen }) {
  const status = useTodayStatus(p);
  return (
    <button className={`pcard${!p.active ? " pcard--off" : ""}`} onClick={onOpen}>
      <div className="pcard__top">
        <span className="pav">{p.name.slice(0, 1).toUpperCase()}</span>
        <div className="pcard__id">
          <span className="pcard__name">{p.name}</span>
          {status && (
            <span className={`wstat wstat--${status.kind}`}>
              <i className="wdot" />{status.label}
            </span>
          )}
        </div>
      </div>
      <p className="pcard__bio">{p.bio || <em>No bio yet</em>}</p>
      <span className="pcard__go">View profile →</span>
    </button>
  );
}

// Owner-facing: fetch + copy a provider's one-time sign-up link (until active).
function InviteLinkButton({ providerId, hasEmail }) {
  const [url, setUrl] = useState("");
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState(false);
  async function gen() {
    setErr("");
    const res = await fetch(`/api/providers/${providerId}/invite`, { method: "POST" });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) { setErr(d.error || "Could not create link"); return; }
    const link = `${window.location.origin}/invite?token=${d.inviteToken}`;
    setUrl(link);
    navigator.clipboard?.writeText(link).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }).catch(() => {});
  }
  if (!hasEmail) return <p className="sp__hint">Add an email for this staff member first to create a sign-up link.</p>;
  return (
    <div>
      {url ? (
        <div className="invite__row">
          <input className="invite__link" readOnly value={url} onFocus={e => e.target.select()} />
          <button className="btn" onClick={gen}>{copied ? "Copied!" : "Copy again"}</button>
        </div>
      ) : (
        <button className="btn" onClick={gen}>Get sign-up link</button>
      )}
      {err && <p className="form__error">{err}</p>}
    </div>
  );
}

// Read-only for the owner — providers manage their own profile, services & hours.
function StylistProfile({ provider: p, err, onBack, onDelete }) {
  const [services, setServices] = useState([]);
  useEffect(() => { fetch("/api/services").then(r => r.json()).then(d => Array.isArray(d) && setServices(d)); }, []);
  const offered = services.filter(s => (p.serviceIds || []).includes(s._id));

  return (
    <div className="pageview">
      <div className="pv__head pv__head--bar">
        <button className="backlink" onClick={onBack}>← All staff</button>
        <button className="linkbtn linkbtn--danger" onClick={onDelete}>Remove from team</button>
      </div>
      <div className="pv__body">
        {err && <p className="form__error">{err}</p>}

        <div className="sp__hero">
          <span className="pav pav--lg">{p.name.slice(0, 1).toUpperCase()}</span>
          <div className="sp__hero-main">
            <h1 className="sp__name">{p.name}</h1>
            <span className={`pv__badge${p.active ? " pv__badge--on" : ""}`}>{p.active ? "Active — bookable" : "Hidden — not bookable"}</span>
          </div>
        </div>

        <p className="sp__readonly">Read-only — {p.name} manages their own profile, services and hours.</p>

        <section className="sp__block">
          <h3 className="sched__label">Account</h3>
          {p.accountStatus === "active" ? (
            <p className="sp__hint">✓ {p.name} has set up their account.</p>
          ) : (
            <>
              <p className="sp__hint">{p.name} hasn’t set up their account yet. Share their sign-up link — opening it lets them set a password and access their calendar.</p>
              <InviteLinkButton providerId={p._id} hasEmail={!!p.email} />
            </>
          )}
        </section>

        <section className="sp__block">
          <h3 className="sched__label">Details</h3>
          <dl className="sp__dl sp__dl--grid">
            <div><dt>Email</dt><dd>{p.email ? <a href={`mailto:${p.email}`}>{p.email}</a> : "—"}</dd></div>
            <div className="sp__dl-wide"><dt>Specialties &amp; bio</dt><dd>{p.bio || "—"}</dd></div>
          </dl>
        </section>

        <section className="sp__block">
          <h3 className="sched__label">Services offered</h3>
          <div className="svcprov__chips">
            {offered.length > 0
              ? offered.map(s => <span key={s._id} className="chip chip--on chip--static">{s.name}</span>)
              : <span className="ct__dim">No services set.</span>}
          </div>
        </section>

        <section className="sp__block">
          <h3 className="sched__label">Hours</h3>
          <HoursReview providerId={p._id} />
        </section>
      </div>
    </div>
  );
}

// A provider's own profile — edit bio, choose which services they offer, and
// manage their hours. This is the provider-role counterpart to the owner's
// read-only StylistProfile.
function ProviderSelfView({ provider, onChange, onEditHours }) {
  const [services, setServices] = useState([]);
  const [bio, setBio] = useState(provider?.bio || "");
  const [ids, setIds] = useState(provider?.serviceIds || []);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => { fetch("/api/services").then(r => r.json()).then(d => Array.isArray(d) && setServices(d)); }, []);
  useEffect(() => {
    if (provider) { setBio(provider.bio || ""); setIds(provider.serviceIds || []); }
  }, [provider?._id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!provider) return <div className="pageview"><div className="pv__body"><Loader /></div></div>;

  const toggle = (sid) => { setSaved(false); setIds(prev => prev.includes(sid) ? prev.filter(x => x !== sid) : [...prev, sid]); };

  async function save() {
    setSaving(true); setErr(""); setSaved(false);
    const res = await fetch(`/api/providers/${provider._id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bio, serviceIds: ids }),
    });
    setSaving(false);
    if (!res.ok) { const { error } = await res.json().catch(() => ({})); setErr(error || "Could not save"); return; }
    setSaved(true); onChange?.();
  }

  return (
    <div className="pageview">
      <div className="pv__head">
        <h1 className="pv__title">My profile</h1>
        <button className="btn btn--new" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save changes"}</button>
      </div>
      <div className="pv__body">
        {err && <p className="form__error">{err}</p>}

        <div className="sp__hero">
          <span className="pav pav--lg">{provider.name.slice(0, 1).toUpperCase()}</span>
          <div className="sp__hero-main">
            <h1 className="sp__name">{provider.name}</h1>
            <span className={`pv__badge${provider.active ? " pv__badge--on" : ""}`}>{provider.active ? "Active — bookable" : "Hidden — not bookable"}</span>
          </div>
        </div>

        <section className="sp__block">
          <h3 className="sched__label">Specialties &amp; bio</h3>
          <p className="sp__hint">Shown to clients when they book with you.</p>
          <textarea className="selfbio" rows={3} value={bio} onChange={e => { setSaved(false); setBio(e.target.value); }} placeholder="Your specialties, experience…" />
        </section>

        <section className="sp__block">
          <h3 className="sched__label">Services I offer</h3>
          <p className="sp__hint">Pick the services clients can book with you. The menu &amp; prices are set by your manager.</p>
          <div className="svcprov__chips">
            {services.length === 0 ? <span className="ct__dim">No services in the menu yet.</span>
              : services.map(s => (
                <button key={s._id} type="button" className={`chip chip--btn${ids.includes(s._id) ? " chip--on" : ""}`} onClick={() => toggle(s._id)}>
                  {s.name}
                </button>
              ))}
          </div>
        </section>

        <section className="sp__block">
          <div className="sp__block-head">
            <h3 className="sched__label">My hours</h3>
            <button className="btn" onClick={onEditHours}>Edit hours</button>
          </div>
          <HoursReview providerId={provider._id} />
        </section>

        {saved && <p className="sp__saved">✓ Changes saved.</p>}
      </div>
    </div>
  );
}

// Read-only weekly-hours + time-off summary for the manager to review.
function HoursReview({ providerId }) {
  const [av, setAv] = useState(null);
  const [timeoff, setTimeoff] = useState([]);

  useEffect(() => {
    fetch(`/api/availability/${providerId}`).then(r => r.json()).then(setAv).catch(() => {});
    fetch(`/api/timeoff/${providerId}`).then(r => r.json()).then(d => Array.isArray(d) && setTimeoff(d)).catch(() => {});
  }, [providerId]);

  if (!av) return <Loader />;

  const fmtRanges = (day) => {
    if (!day.enabled) return <span className="hr__closed">Closed</span>;
    const hrs = day.ranges.map(r => `${fmtMin(r.startMin)} – ${fmtMin(r.endMin)}`).join(", ");
    const brk = (day.breaks || []).length
      ? ` · break ${day.breaks.map(b => `${fmtMin(b.startMin)}–${fmtMin(b.endMin)}`).join(", ")}` : "";
    return <span>{hrs}{brk}</span>;
  };

  const weekTable = (week, title) => (
    <div className="hr__week">
      {title && <div className="hr__wk">{title}</div>}
      {week.map(day => (
        <div key={day.weekday} className={`hr__row${!day.enabled ? " hr__row--off" : ""}`}>
          <span className="hr__day">{DAYS_FULL[day.weekday]}</span>
          {fmtRanges(day)}
        </div>
      ))}
    </div>
  );

  return (
    <div className="hr">
      {av.meta?.biweekly ? (
        <div className="hr__weeks">
          {weekTable(av.weekA, "Week A")}
          {weekTable(av.weekB, "Week B")}
        </div>
      ) : weekTable(av.weekA)}

      {(av.overrides?.length > 0) && (
        <div className="hr__extra">
          <div className="hr__xlabel">Single-day changes</div>
          {av.overrides.map(o => (
            <div key={o._id} className="hr__xrow">
              <span>{o.date}</span>
              <span>{o.closed ? "Closed" : o.ranges.map(r => `${fmtMin(r.startMin)}–${fmtMin(r.endMin)}`).join(", ")}</span>
            </div>
          ))}
        </div>
      )}

      {timeoff.length > 0 && (
        <div className="hr__extra">
          <div className="hr__xlabel">Time off</div>
          {timeoff.map(t => (
            <div key={t._id} className="hr__xrow">
              <span>{t.startDate === t.endDate ? t.startDate : `${t.startDate} – ${t.endDate}`}</span>
              <span>{t.reason || "—"}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ProviderForm({ provider, onClose, onSave }) {
  const isEdit = !!provider._id;
  const [form, setForm] = useState({
    name: provider.name || "",
    bio: provider.bio || "",
    email: provider.email || "",
    active: provider.active !== false,
  });
  const [saving, setSaving] = useState(false);
  const set = (f, v) => setForm(s => ({ ...s, [f]: v }));

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    await onSave({ ...provider, ...form });
    setSaving(false);
  }

  return (
    <div className="modal" onMouseDown={onClose}>
      <div className="modal__panel" onMouseDown={e => e.stopPropagation()}>
        <div className="modal__head">
          <h2 className="modal__title">{isEdit ? "Edit staff" : "Add staff"}</h2>
          <button className="modal__x" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <form className="form" onSubmit={submit}>
          <label className="field">
            <span className="field__label">Name</span>
            <input type="text" value={form.name} onChange={e => set("name", e.target.value)} placeholder="Full name" required />
          </label>
          <label className="field">
            <span className="field__label">Email <span className="field__hint">— used for their login when accounts are enabled</span></span>
            <input type="email" value={form.email} onChange={e => set("email", e.target.value)} placeholder="name@email.com" />
          </label>
          <label className="field">
            <span className="field__label">Bio</span>
            <textarea rows={2} value={form.bio} onChange={e => set("bio", e.target.value)} placeholder="Specialties, experience…" />
          </label>
          <label className="switch switch--field">
            <input type="checkbox" checked={form.active} onChange={e => set("active", e.target.checked)} />
            <span>Bookable (shown to clients &amp; on the calendar)</span>
          </label>
          <div className="form__actions">
            <button type="button" className="action" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn" disabled={saving}>{saving ? "Saving…" : isEdit ? "Save" : "Add staff"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Services ─────────────────────────────────────────────────────────────────

function ServicesView({ providers, teamLabel, onProvidersChange, addReq }) {
  const [services, setServices] = useState(null);
  const [editing, setEditing] = useState(null);   // service form
  const [err, setErr] = useState("");
  const singular = (teamLabel || "staff").replace(/s$/, "").toLowerCase();

  const addSeen = useRef(addReq);
  useEffect(() => { if (addReq !== addSeen.current) { addSeen.current = addReq; setEditing({}); } }, [addReq]);

  const load = useCallback(() => {
    fetch("/api/services").then(r => r.json()).then(d => Array.isArray(d) && setServices(d));
  }, []);
  useEffect(() => { load(); }, [load]);

  async function save(s) {
    setErr("");
    const res = await fetch(s._id ? `/api/services/${s._id}` : "/api/services", {
      method: s._id ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(s),
    });
    if (!res.ok) { const { error } = await res.json().catch(() => ({})); setErr(error || "Could not save"); return; }
    setEditing(null); load();
  }
  async function remove(s) {
    await fetch(`/api/services/${s._id}`, { method: "DELETE" });
    load(); onProvidersChange?.();
  }

  const nameById = Object.fromEntries((services || []).map(s => [s._id, s.name]));

  return (
    <div className="pageview">
      <div className="pv__head">
        <h1 className="pv__title">Services</h1>
        <button className="btn btn--new" onClick={() => setEditing({})}>+ Add service</button>
      </div>
      <div className="pv__body">
        {err && <p className="form__error">{err}</p>}

        <section className="sp__block">
          <h3 className="sched__label">Service menu</h3>
          <p className="sp__hint">The services clients can book online — name, length, and price.</p>
          {!services ? <Loader />
            : (
              <div className="svc-list">
                {services.map(s => (
                  <div key={s._id} className="svc-row">
                    <span className="svc-row__name">{s.name}</span>
                    <span className="svc-row__meta">
                      {s.durationMin ? `${s.durationMin} min` : "—"}{s.price ? ` · ${s.price}` : ""}
                    </span>
                    <span className="svc-row__acts">
                      <button className="linkbtn" onClick={() => setEditing(s)}>Edit</button>
                      <button className="linkbtn linkbtn--danger" onClick={() => remove(s)}>Delete</button>
                    </span>
                  </div>
                ))}
                <button className="svc-add" onClick={() => setEditing({})}>
                  <Icon name="plus" /> Add service
                </button>
              </div>
            )}
        </section>

        <section className="sp__block">
          <h3 className="sched__label">{teamLabel} &amp; services</h3>
          <p className="sp__hint">Which services each {singular} offers — set by each {singular} in their profile.</p>
          {providers.length === 0 ? <p className="empty empty--sm">No {teamLabel?.toLowerCase()} yet.</p>
            : providers.map(p => {
              const offered = (p.serviceIds || []).map(id => nameById[id]).filter(Boolean);
              return (
                <div key={p._id} className="svcprov">
                  <div className="svcprov__head">
                    <span className="svcprov__name"><span className="pav pav--sm">{p.name.slice(0, 1).toUpperCase()}</span>{p.name}</span>
                  </div>
                  <div className="svcprov__chips">
                    {offered.length > 0
                      ? offered.map(n => <span key={n} className="chip chip--on chip--static">{n}</span>)
                      : <span className="ct__dim">No services set yet.</span>}
                  </div>
                </div>
              );
            })}
        </section>
      </div>

      {editing && <ServiceForm service={editing} onClose={() => setEditing(null)} onSave={save} />}
    </div>
  );
}

function ServiceForm({ service, onClose, onSave }) {
  const isEdit = !!service._id;
  const [form, setForm] = useState({
    name: service.name || "", durationMin: service.durationMin || "", price: service.price || "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (f, v) => setForm(s => ({ ...s, [f]: v }));

  async function submit(e) {
    e.preventDefault();
    if (!form.name.trim()) { setError("Service name is required."); return; }
    setSaving(true);
    try { await onSave({ ...service, ...form }); } catch (err) { setError(err.message); setSaving(false); }
  }

  return (
    <div className="modal" onMouseDown={onClose}>
      <div className="modal__panel" onMouseDown={e => e.stopPropagation()}>
        <div className="modal__head">
          <h2 className="modal__title">{isEdit ? "Edit service" : "Add service"}</h2>
          <button className="modal__x" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <form className="form" onSubmit={submit}>
          <label className="field">
            <span className="field__label">Service name</span>
            <input type="text" value={form.name} onChange={e => set("name", e.target.value)} placeholder="e.g. Women's Haircut" required />
          </label>
          <div className="form__row form__row--2">
            <label className="field">
              <span className="field__label">Duration</span>
              <select value={form.durationMin} onChange={e => set("durationMin", e.target.value)}>
                <option value="">—</option>
                {DURATIONS.map(m => {
                  const h = Math.floor(m / 60), mm = m % 60;
                  return <option key={m} value={m}>{h ? `${h} hr${mm ? ` ${mm} min` : ""}` : `${mm} min`}</option>;
                })}
              </select>
            </label>
            <label className="field">
              <span className="field__label">Price</span>
              <input type="text" value={form.price} onChange={e => set("price", e.target.value)} placeholder="From $65" />
            </label>
          </div>
          {error && <p className="form__error">{error}</p>}
          <div className="form__actions">
            <button type="button" className="action" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn" disabled={saving}>{saving ? "Saving…" : isEdit ? "Save" : "Add service"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Editable hours for one provider (from the Services tab).
function ProviderHoursModal({ provider, onClose }) {
  return (
    <div className="modal" onMouseDown={onClose}>
      <div className="modal__panel modal__panel--wide" onMouseDown={e => e.stopPropagation()}>
        <div className="modal__head">
          <h2 className="modal__title">{provider.name}’s hours</h2>
          <button className="modal__x" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="modal__scroll">
          <ScheduleEditor provider={provider} mode="owner" />
        </div>
      </div>
    </div>
  );
}

// ── Clients ─────────────────────────────────────────────────────────────────

function ClientsView({ providers, services, durationOf, onApptSaved, addReq }) {
  const [clients, setClients] = useState([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [sort, setSort] = useState({ key: "name", dir: 1 });
  const [adding, setAdding] = useState(false);
  const isMobile = useIsMobile();

  // Open the add-client modal when the top-nav action fires (ignore mount).
  const addSeen = useRef(addReq);
  useEffect(() => { if (addReq !== addSeen.current) { addSeen.current = addReq; setSelectedId(null); setAdding(true); } }, [addReq]);

  const load = useCallback(() => {
    setLoading(true);
    const p = q.trim() ? `?q=${encodeURIComponent(q.trim())}` : "";
    fetch(`/api/clients${p}`)
      .then(r => r.json())
      .then(d => Array.isArray(d) && setClients(d))
      .finally(() => setLoading(false));
  }, [q]);

  useEffect(() => {
    const t = setTimeout(load, 200); // debounce search
    return () => clearTimeout(t);
  }, [load]);

  async function createClient(form) {
    const res = await fetch("/api/clients", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
    });
    if (!res.ok) { const { error } = await res.json().catch(() => ({})); throw new Error(error || "Could not add client"); }
    const { _id } = await res.json().catch(() => ({}));
    setAdding(false);
    load();
    if (_id) setSelectedId(_id); // jump into the new client's profile
  }

  if (selectedId) {
    return (
      <ClientProfile
        clientId={selectedId}
        providers={providers}
        services={services}
        durationOf={durationOf}
        onApptSaved={onApptSaved}
        onBack={() => setSelectedId(null)}
      />
    );
  }

  const sorted = [...clients].sort((a, b) => {
    const k = sort.key;
    if (k === "name") return sort.dir * (a.name || "").localeCompare(b.name || "");
    if (k === "lastVisit" || k === "nextVisit") {
      const av = a[k] || "", bv = b[k] || "";
      return sort.dir * (av < bv ? -1 : av > bv ? 1 : 0);
    }
    return sort.dir * ((a[k] || 0) - (b[k] || 0));
  });

  const Th = ({ k, label, num }) => (
    <th
      className={`ct__th${num ? " ct__num" : ""}${sort.key === k ? " ct__th--on" : ""}`}
      onClick={() => setSort(s => ({ key: k, dir: s.key === k ? -s.dir : 1 }))}
    >
      {label}<span className="ct__arrow">{sort.key === k ? (sort.dir > 0 ? " ↑" : " ↓") : ""}</span>
    </th>
  );

  return (
    <div className="pageview">
      <div className="pv__head">
        <h1 className="pv__title">
          Clients
          {!loading && <span className="pv__count">{clients.length}</span>}
        </h1>
        <div className="ct__tools">
          <input
            className="clients-search"
            type="search"
            placeholder="Search name, phone, or email"
            value={q}
            onChange={e => setQ(e.target.value)}
          />
          <button className="btn btn--new" onClick={() => setAdding(true)}>+ Add client</button>
        </div>
      </div>
      <div className={`pv__body${isMobile ? "" : " pv__body--flush"}`}>
        {loading && clients.length === 0 ? (
          <Loader />
        ) : !loading && clients.length === 0 ? (
          <p className="empty">{q ? "No clients match your search." : "No clients yet."}</p>
        ) : isMobile ? (
          <div className="ccardlist">
            {sorted.map(c => (
              <button key={c._id} className="ccardm" onClick={() => setSelectedId(c._id)}>
                <span className="pav">{(c.name || "?").slice(0, 1).toUpperCase()}</span>
                <span className="ccardm__body">
                  <span className="ccardm__name">{c.name || "—"}</span>
                  {c.phone && <span className="ccardm__line">{c.phone}</span>}
                  {c.email && <span className="ccardm__line">{c.email}</span>}
                  <span className="ccardm__meta">
                    <span>Last visit: {c.lastVisit ? fmtShort(c.lastVisit) : "None yet"}</span>
                    <span>Next appt: {c.nextVisit ? <b className="ct__next">{fmtShort(c.nextVisit)}</b> : "None booked"}</span>
                  </span>
                </span>
                <span className="ccardm__view">View →</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="ct__wrap">
            <table className="ctable">
              <thead>
                <tr>
                  <Th k="name" label="Client" />
                  <th className="ct__th">Phone</th>
                  <th className="ct__th">Email</th>
                  <Th k="lastVisit" label="Last visit" />
                  <Th k="nextVisit" label="Next visit" />
                </tr>
              </thead>
              <tbody>
                {sorted.map(c => (
                  <tr key={c._id} className="ct__row" onClick={() => setSelectedId(c._id)}>
                    <td className="ct__client">
                      <span className="pav pav--sm">{(c.name || "?").slice(0, 1).toUpperCase()}</span>
                      <span className="ct__name">{c.name || "—"}</span>
                    </td>
                    <td className="ct__contact">{c.phone || <span className="ct__dim">—</span>}</td>
                    <td className="ct__contact">{c.email || <span className="ct__dim">—</span>}</td>
                    <td>{c.lastVisit ? fmtShort(c.lastVisit) : <span className="ct__dim">—</span>}</td>
                    <td>{c.nextVisit ? <span className="ct__next">{fmtShort(c.nextVisit)}</span> : <span className="ct__dim">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {adding && <ClientForm onClose={() => setAdding(false)} onSave={createClient} />}
    </div>
  );
}

function ClientForm({ onClose, onSave }) {
  const [form, setForm] = useState({ name: "", phone: "", email: "", notes: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (f, v) => setForm(s => ({ ...s, [f]: v }));

  async function submit(e) {
    e.preventDefault();
    if (!form.name.trim()) { setError("Name is required."); return; }
    setSaving(true);
    try { await onSave(form); } catch (err) { setError(err.message); setSaving(false); }
  }

  return (
    <div className="modal" onMouseDown={onClose}>
      <div className="modal__panel" onMouseDown={e => e.stopPropagation()}>
        <div className="modal__head">
          <h2 className="modal__title">Add client</h2>
          <button className="modal__x" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <form className="form" onSubmit={submit}>
          <label className="field">
            <span className="field__label">Name</span>
            <input type="text" value={form.name} onChange={e => set("name", e.target.value)} placeholder="Full name" required />
          </label>
          <div className="form__row form__row--2">
            <label className="field">
              <span className="field__label">Phone</span>
              <input type="tel" value={form.phone} onChange={e => set("phone", e.target.value)} placeholder="(555) 000-0000" />
            </label>
            <label className="field">
              <span className="field__label">Email</span>
              <input type="email" value={form.email} onChange={e => set("email", e.target.value)} placeholder="name@email.com" />
            </label>
          </div>
          <label className="field">
            <span className="field__label">Notes</span>
            <textarea rows={2} value={form.notes} onChange={e => set("notes", e.target.value)} placeholder="Preferences, formulas, allergies…" />
          </label>
          {error && <p className="form__error">{error}</p>}
          <div className="form__actions">
            <button type="button" className="action" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn" disabled={saving}>{saving ? "Saving…" : "Add client"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ClientProfile({ clientId, providers, services, durationOf, onApptSaved, onBack }) {
  const [data, setData] = useState(null);
  const [notes, setNotes] = useState("");
  const [savedNotes, setSavedNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(null); // appointment modal

  const reload = useCallback(() => {
    fetch(`/api/clients/${clientId}`)
      .then(r => r.json())
      .then(d => { setData(d); setNotes(d.notes || ""); setSavedNotes(d.notes || ""); });
  }, [clientId]);

  useEffect(() => { reload(); }, [reload]);

  async function saveNotes() {
    setSaving(true);
    const res = await fetch(`/api/clients/${clientId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ notes }),
    });
    if (res.ok) setSavedNotes(notes);
    setSaving(false);
  }

  async function saveAppt(id, payload) {
    const res = await fetch(id ? `/api/appointments/${id}` : "/api/appointments", {
      method: id ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
    });
    if (!res.ok) { const { error } = await res.json().catch(() => ({})); throw new Error(error || "Could not save the appointment"); }
    setEditing(null); reload(); onApptSaved?.();
  }
  async function updateStatus(id, status) {
    await fetch(`/api/appointments/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }),
    });
    setEditing(null); reload(); onApptSaved?.();
  }

  if (!data) return <div className="pageview"><div className="pv__body"><Loader /></div></div>;

  const dirty = notes !== savedNotes;
  const newForClient = () => setEditing({
    dateKey: todayKey(),
    client: { name: data.name, phone: data.phone, email: data.email },
  });

  return (
    <div className="pageview">
      <div className="pv__head pv__head--bar">
        <button className="backlink" onClick={onBack}>← All clients</button>
        <button className="btn" onClick={newForClient}>+ New appointment</button>
      </div>
      <div className="pv__body">
        <div className="sp__hero">
          <span className="pav pav--lg">{(data.name || "?").slice(0, 1).toUpperCase()}</span>
          <div className="sp__hero-main">
            <h1 className="sp__name">{data.name || "—"}</h1>
            <div className="profile__contact">
              {data.phone && <a href={`tel:${data.phone}`}>{data.phone}</a>}
              {data.email && <a href={`mailto:${data.email}`}>{data.email}</a>}
              {!data.phone && !data.email && <span className="ct__dim">No contact on file</span>}
            </div>
          </div>
        </div>

        <section className="sp__block">
          <h3 className="sched__label">Notes</h3>
          <textarea
            className="profile__notes"
            rows={3}
            placeholder="Preferences, formulas, allergies, anything to remember…"
            value={notes}
            onChange={e => setNotes(e.target.value)}
          />
          <div className="sched__save">
            <button className="btn" onClick={saveNotes} disabled={!dirty || saving}>
              {saving ? "Saving…" : "Save notes"}
            </button>
            {!dirty && savedNotes && <span className="sched__msg">Saved</span>}
          </div>
        </section>

        <section className="sp__block">
          <h3 className="sched__label">Appointments · {data.history.length}</h3>
          {data.history.length === 0
            ? <p className="empty empty--sm">No appointments yet. Use “New appointment” to book one.</p>
            : (
              <div className="alist">
                {data.history.map(h => {
                  const eff = effStatus(h, durationOf);
                  return (
                    <button key={h._id} className="alist__row" onClick={() => setEditing(h)}>
                      <span className="alist__when">
                        <span className="alist__date">{fmtShort(h.dateKey)}</span>
                        <span className="alist__time">{fmtTime(h.timeValue)}</span>
                      </span>
                      <span className="alist__main">
                        <span className="alist__svc">{h.service || "Appointment"}</span>
                        {h.providerName && <span className="alist__prov">{h.providerName}</span>}
                      </span>
                      <span className={`pill pill--${eff}`}>{STATUS_LABEL[eff]}</span>
                    </button>
                  );
                })}
              </div>
            )
          }
        </section>
      </div>

      {editing && (
        <AppointmentModal
          appt={editing}
          providers={providers}
          services={services}
          durationOf={durationOf}
          onClose={() => setEditing(null)}
          onSave={saveAppt}
          onStatusChange={updateStatus}
        />
      )}
    </div>
  );
}

// ── Appointment form (create + edit) ────────────────────────────────────────

function AppointmentModal({ appt, providers, services, durationOf, onClose, onSave, onStatusChange }) {
  const isExisting = !!appt._id;
  const [mode, setMode] = useState(isExisting ? "view" : "edit");

  if (mode === "view") {
    return (
      <AppointmentDetail
        appt={appt}
        durationOf={durationOf}
        onEdit={() => setMode("edit")}
        onStatusChange={onStatusChange}
        onClose={onClose}
      />
    );
  }
  return (
    <AppointmentEditor
      appt={appt}
      providers={providers}
      services={services}
      isExisting={isExisting}
      onSave={onSave}
      onCancel={isExisting ? () => setMode("view") : onClose}
      onClose={onClose}
    />
  );
}

// Read view for an already-scheduled appointment.
function AppointmentDetail({ appt: a, durationOf, onEdit, onStatusChange, onClose }) {
  const eff = effStatus(a, durationOf);
  const isDone = eff === "completed";
  return (
    <div className="modal" onMouseDown={onClose}>
      <div className="modal__panel" onMouseDown={e => e.stopPropagation()}>
        <div className="modal__head">
          <h2 className="modal__title">Appointment</h2>
          <button className="modal__x" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="apptview">
          <div className="apptview__when">
            <span className="apptview__time">{fmtTime(a.timeValue)}</span>
            <span className={`tag tag--${eff}`}>{STATUS_LABEL[eff]}</span>
          </div>
          <div className="apptview__date">{fmtSideDay(a.dateKey)}</div>

          <dl className="apptview__dl">
            <div>
              <dt>Client</dt>
              <dd>{a.client?.name || "—"}</dd>
              {a.client?.phone && <dd><a href={`tel:${a.client.phone}`}>{a.client.phone}</a></dd>}
              {a.client?.email && <dd><a href={`mailto:${a.client.email}`}>{a.client.email}</a></dd>}
            </div>
            <div><dt>Service</dt><dd>{a.service || "—"}</dd></div>
            <div><dt>Staff</dt><dd>{a.providerName || "—"}</dd></div>
            {a.issueDescription && <div className="apptview__notes"><dt>Notes</dt><dd>{a.issueDescription}</dd></div>}
          </dl>

          <div className="apptview__status">
            <span className="field__label">Status</span>
            {isDone ? (
              <p className="apptview__done">Automatically marked <b>completed</b> — the appointment time has passed.</p>
            ) : (
              <div className="actions">
                {MANUAL_STATUSES.map(s => (
                  <button
                    key={s}
                    className={`action${a.status === s ? " action--on" : ""}`}
                    disabled={a.status === s}
                    onClick={() => onStatusChange(a._id, s)}
                  >{STATUS_LABEL[s]}</button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="form__actions modal__foot">
          <button className="action" onClick={onClose}>Close</button>
          <button className="btn" onClick={onEdit}>Edit details</button>
        </div>
      </div>
    </div>
  );
}

// Create / edit form with client typeahead + autofill. No status field —
// status is managed from the read view.
function AppointmentEditor({ appt, providers, services, isExisting, onSave, onCancel, onClose }) {
  const [form, setForm] = useState({
    dateKey: appt.dateKey || todayKey(),
    timeValue: appt.timeValue || "09:00",
    providerId: appt.providerId || (providers[0]?._id ?? ""),
    service: appt.service || (services[0]?.name ?? ""),
    name: appt.client?.name || "",
    phone: appt.client?.phone || "",
    email: appt.client?.email || "",
    issueDescription: appt.issueDescription || "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Client typeahead
  const [suggestions, setSuggestions] = useState([]);
  const [showSug, setShowSug] = useState(false);
  const [matched, setMatched] = useState(!!appt.client?.name); // an existing client is attached

  function set(field, value) { setForm(f => ({ ...f, [field]: value })); }

  useEffect(() => {
    if (!showSug) return;
    const term = form.name.trim();
    if (term.length < 1) { setSuggestions([]); return; }
    const t = setTimeout(() => {
      fetch(`/api/clients?q=${encodeURIComponent(term)}`)
        .then(r => r.json())
        .then(d => Array.isArray(d) && setSuggestions(d.slice(0, 6)))
        .catch(() => {});
    }, 180);
    return () => clearTimeout(t);
  }, [form.name, showSug]);

  function pickClient(c) {
    setForm(f => ({ ...f, name: c.name, phone: c.phone || "", email: c.email || "" }));
    setMatched(true);
    setShowSug(false);
  }
  function onNameChange(v) {
    setForm(f => ({ ...f, name: v }));
    setMatched(false);
    setShowSug(true);
  }

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (!form.name.trim()) { setError("Client name is required."); return; }
    setSaving(true);
    try {
      await onSave(appt._id, {
        dateKey: form.dateKey,
        timeValue: form.timeValue,
        providerId: form.providerId || null,
        service: form.service,
        client: { name: form.name.trim(), phone: form.phone.trim(), email: form.email.trim() },
        issueDescription: form.issueDescription,
        status: appt.status, // preserve status on edit; undefined on new → server defaults to pending
      });
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <div className="modal" onMouseDown={onClose}>
      <div className="modal__panel" onMouseDown={e => e.stopPropagation()}>
        <div className="modal__head">
          <h2 className="modal__title">{isExisting ? "Edit appointment" : "New appointment"}</h2>
          <button className="modal__x" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <form className="form" onSubmit={submit}>
          {/* Client first — search existing or add new */}
          <div className="field field--ta">
            <span className="field__label">Client</span>
            <input
              type="text"
              value={form.name}
              onChange={e => onNameChange(e.target.value)}
              onFocus={() => setShowSug(true)}
              onBlur={() => setTimeout(() => setShowSug(false), 150)}
              placeholder="Search customers or type a new name"
              autoComplete="off"
              required
            />
            {matched && form.name && <span className="ta__flag">Existing</span>}
            {!matched && form.name.trim() && <span className="ta__flag ta__flag--new">New client</span>}
            {showSug && suggestions.length > 0 && (
              <ul className="ta__list">
                {suggestions.map(c => (
                  <li key={c._id}>
                    <button type="button" className="ta__opt" onMouseDown={() => pickClient(c)}>
                      <span className="ta__name">{c.name}</span>
                      <span className="ta__sub">{c.phone || c.email || "no contact on file"}{c.visits ? ` · ${c.visits} visit${c.visits !== 1 ? "s" : ""}` : ""}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="form__row form__row--2">
            <label className="field">
              <span className="field__label">Phone {matched ? "" : "(optional)"}</span>
              <input type="tel" value={form.phone} onChange={e => set("phone", e.target.value)} placeholder="(555) 000-0000" />
            </label>
            <label className="field">
              <span className="field__label">Email {matched ? "" : "(optional)"}</span>
              <input type="email" value={form.email} onChange={e => set("email", e.target.value)} placeholder="name@email.com" />
            </label>
          </div>

          <div className="form__row form__row--2">
            <label className="field">
              <span className="field__label">Date</span>
              <input type="date" value={form.dateKey} onChange={e => set("dateKey", e.target.value)} required />
            </label>
            <label className="field">
              <span className="field__label">Time</span>
              <select value={form.timeValue} onChange={e => set("timeValue", e.target.value)}>
                {TIME_SLOTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
          </div>

          <div className="form__row form__row--2">
            <label className="field">
              <span className="field__label">Staff</span>
              <select value={form.providerId} onChange={e => set("providerId", e.target.value)}>
                <option value="">Unassigned</option>
                {providers.map(p => <option key={p._id} value={p._id}>{p.name}</option>)}
              </select>
            </label>
            <label className="field">
              <span className="field__label">Service</span>
              {services.length > 0 ? (
                <select value={form.service} onChange={e => set("service", e.target.value)}>
                  <option value="">—</option>
                  {services.map(s => <option key={s._id} value={s.name}>{s.name}</option>)}
                </select>
              ) : (
                <input type="text" value={form.service} onChange={e => set("service", e.target.value)} placeholder="Service" />
              )}
            </label>
          </div>

          <label className="field">
            <span className="field__label">Notes</span>
            <textarea rows={2} value={form.issueDescription} onChange={e => set("issueDescription", e.target.value)} placeholder="Allergies, preferences, reference photos…" />
          </label>

          {error && <p className="form__error">{error}</p>}

          <div className="form__actions">
            <button type="button" className="action" onClick={onCancel}>Cancel</button>
            <button type="submit" className="btn" disabled={saving}>
              {saving ? "Saving…" : isExisting ? "Save changes" : "Create appointment"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Minutes-since-midnight → "9:00 AM"
function fmtMin(min) {
  const h = Math.floor(min / 60), m = min % 60;
  return `${h > 12 ? h - 12 : h === 0 ? 12 : h}:${m.toString().padStart(2,"0")} ${h >= 12 ? "PM" : "AM"}`;
}

// Which week (A/B) a given date falls in, relative to the anchor Sunday.
function weekKeyFor(anchorDate, date) {
  const anchor = new Date(`${anchorDate}T00:00:00`);
  const d = new Date(date); d.setHours(0,0,0,0);
  d.setDate(d.getDate() - d.getDay()); // Sunday of that week
  const weeks = Math.round((d - anchor) / (7 * 86400000));
  return weeks % 2 === 0 ? "A" : "B";
}

function fmtOverrideDate(str) {
  const [y, mo, d] = str.split("-").map(Number);
  return new Date(y, mo - 1, d).toLocaleDateString("en-US", { weekday:"short", month:"short", day:"numeric" });
}

// One day row in the weekly editor.
function DayRow({ day, onToggle, onStart, onEnd }) {
  const r = day.ranges?.[0] || { startMin: 540, endMin: 1080 };
  return (
    <div className={`sday${!day.enabled ? " sday--off" : ""}`}>
      <label className="sday__toggle">
        <input type="checkbox" checked={day.enabled} onChange={onToggle} />
        <span>{DAYS_FULL[day.weekday]}</span>
      </label>
      {day.enabled ? (
        <div className="sday__times">
          <select value={r.startMin} onChange={e => onStart(parseInt(e.target.value))}>
            {TIME_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <span className="trange__to">to</span>
          <select value={r.endMin} onChange={e => onEnd(parseInt(e.target.value))}>
            {TIME_OPTIONS.filter(o => o.value > r.startMin).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      ) : <span className="sday__closed">Closed</span>}
    </div>
  );
}

function ScheduleEditor({ provider, mode }) {
  const [week, setWeek] = useState(null);
  const [overrides, setOverrides] = useState([]);
  const [timeOff, setTimeOff]   = useState([]);
  const [saving, setSaving]     = useState(false);
  const [saveMsg, setSaveMsg]   = useState("");

  // Single-day change form
  const [ovDate, setOvDate]   = useState(todayKey());
  const [ovMode, setOvMode]   = useState("closed"); // "closed" | "hours"
  const [ovStart, setOvStart] = useState(540);
  const [ovEnd, setOvEnd]     = useState(1080);

  // Time-off (multi-day) add-form
  const [newStart, setNewStart] = useState("");
  const [newEnd, setNewEnd]     = useState("");
  const [newReason, setNewReason] = useState("");

  const loadTimeOff = useCallback(() => {
    fetch(`/api/timeoff/${provider._id}`).then(r => r.json()).then(d => Array.isArray(d) && setTimeOff(d));
  }, [provider._id]);

  const loadAvailability = useCallback(() => {
    fetch(`/api/availability/${provider._id}`).then(r => r.json()).then(d => {
      if (d.weekA) setWeek(d.weekA);
      if (Array.isArray(d.overrides)) setOverrides(d.overrides);
    });
  }, [provider._id]);

  useEffect(() => { setWeek(null); loadAvailability(); loadTimeOff(); }, [loadAvailability, loadTimeOff]);

  const mut = (fn) => setWeek(p => p.map(fn));
  const toggleDay = (w) => mut(d => d.weekday !== w ? d
    : { ...d, enabled: !d.enabled, ranges: (d.ranges?.length ? d.ranges : [{ startMin: 540, endMin: 1080 }]) });
  const setStart = (w, v) => mut(d => d.weekday !== w ? d : { ...d, ranges: [{ startMin: v, endMin: Math.max((d.ranges?.[0]?.endMin ?? 1080), v + 30) }] });
  const setEnd   = (w, v) => mut(d => d.weekday !== w ? d : { ...d, ranges: [{ startMin: d.ranges?.[0]?.startMin ?? 540, endMin: v }] });

  async function saveSchedule() {
    setSaving(true); setSaveMsg("");
    const res = await fetch(`/api/availability/${provider._id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ meta: { biweekly: false, anchorDate: sundayKey() }, weekA: week, weekB: week }),
    });
    setSaveMsg(res.ok ? "Saved" : "Error saving");
    if (res.ok) setTimeout(() => setSaveMsg(""), 2500);
    setSaving(false);
  }

  async function addOverride() {
    if (!ovDate) return;
    const body = ovMode === "closed"
      ? { date: ovDate, closed: true }
      : { date: ovDate, closed: false, ranges: [{ startMin: ovStart, endMin: ovEnd }] };
    const res = await fetch(`/api/availability/${provider._id}/overrides`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    if (res.ok) { setOvDate(todayKey()); setOvMode("closed"); loadAvailability(); }
  }
  async function removeOverride(id) {
    await fetch(`/api/availability/${provider._id}/overrides/${id}`, { method: "DELETE" });
    setOverrides(p => p.filter(o => o._id !== id));
  }
  async function addTimeOff() {
    if (!newStart || !newEnd) return;
    const res = await fetch(`/api/timeoff/${provider._id}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ startDate: newStart, endDate: newEnd, reason: newReason }),
    });
    if (res.ok) { setNewStart(""); setNewEnd(""); setNewReason(""); loadTimeOff(); }
  }
  async function removeTimeOff(id) {
    await fetch(`/api/timeoff/${provider._id}/${id}`, { method: "DELETE" });
    setTimeOff(p => p.filter(t => t._id !== id));
  }

  if (!week) return <Loader />;

  return (
    <div className="sched sched--stacked">
      <div className="sched__block">
        <h3 className="sched__label">Weekly hours</h3>
        <p className="sched__hint">Toggle a day open or closed, then set the open and close times. Repeats every week.</p>
        {week.map(day => (
          <DayRow
            key={day.weekday}
            day={day}
            onToggle={() => toggleDay(day.weekday)}
            onStart={(v) => setStart(day.weekday, v)}
            onEnd={(v) => setEnd(day.weekday, v)}
          />
        ))}
        <div className="sched__save">
          <button className="btn" onClick={saveSchedule} disabled={saving}>
            {saving ? "Saving…" : "Save hours"}
          </button>
          {saveMsg && <span className="sched__msg">{saveMsg}</span>}
        </div>
      </div>

      <div className="sched__block">
        <h3 className="sched__label">Change a specific day</h3>
        <p className="sched__hint">Override the recurring hours for one date (defaults to today) — close early, block the day, or open a normally-closed day. This doesn’t change your weekly hours.</p>
        <div className="ov-add">
          <input type="date" value={ovDate} min={todayKey()} onChange={e => setOvDate(e.target.value)} />
          <select value={ovMode} onChange={e => setOvMode(e.target.value)}>
            <option value="closed">Closed</option>
            <option value="hours">Custom hours</option>
          </select>
          {ovMode === "hours" && (
            <span className="ov-add__hours">
              <select value={ovStart} onChange={e => setOvStart(parseInt(e.target.value))}>
                {TIME_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <span>–</span>
              <select value={ovEnd} onChange={e => setOvEnd(parseInt(e.target.value))}>
                {TIME_OPTIONS.filter(o => o.value > ovStart).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </span>
          )}
          <button className="btn" onClick={addOverride} disabled={!ovDate}>Add</button>
        </div>
        {(() => {
          const upcoming = overrides.filter(o => o.date >= todayKey());
          return upcoming.length === 0
            ? <p className="empty empty--sm">No single-day changes.</p>
            : upcoming.map(o => (
              <div key={o._id} className="block-item">
                <span className="block-item__date">{fmtOverrideDate(o.date)}</span>
                <span className="block-item__reason">
                  {o.closed ? "Closed" : o.ranges.map(r => `${fmtMin(r.startMin)}–${fmtMin(r.endMin)}`).join(", ")}
                </span>
                <button className="block-item__rm" onClick={() => removeOverride(o._id)}>Remove</button>
              </div>
            ));
        })()}
      </div>

      <div className="sched__block">
        <h3 className="sched__label">Time off</h3>
        <p className="sched__hint">Block a multi-day stretch — vacation, training, etc.</p>
        <div className="block-add">
          <input type="date" value={newStart} onChange={e => setNewStart(e.target.value)} />
          <span>–</span>
          <input type="date" value={newEnd} min={newStart} onChange={e => setNewEnd(e.target.value)} />
          <input type="text" placeholder="Reason" value={newReason} onChange={e => setNewReason(e.target.value)} />
          <button className="btn" onClick={addTimeOff} disabled={!newStart || !newEnd}>Add</button>
        </div>
        {timeOff.length === 0
          ? <p className="empty empty--sm">No time off scheduled.</p>
          : timeOff.map(t => (
            <div key={t._id} className="block-item">
              <span className="block-item__date">{t.startDate === t.endDate ? t.startDate : `${t.startDate} – ${t.endDate}`}</span>
              {t.reason && <span className="block-item__reason">{t.reason}</span>}
              <button className="block-item__rm" onClick={() => removeTimeOff(t._id)}>Remove</button>
            </div>
          ))
        }
      </div>
    </div>
  );
}

// ── Settings (account for all; billing for owner) ───────────────────────────

function SettingsView({ user, onUserChange, onSignOut }) {
  const [name, setName] = useState(user.name || "");
  const [savedName, setSavedName] = useState(user.name || "");
  const [msg, setMsg] = useState("");

  async function saveName() {
    const res = await fetch("/api/auth/profile", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }),
    });
    const d = await res.json().catch(() => ({}));
    if (res.ok && d.user) { setSavedName(d.user.name); onUserChange?.(d.user); setMsg("Saved"); setTimeout(() => setMsg(""), 2000); }
  }

  return (
    <div className="pageview">
      <div className="pv__head"><h1 className="pv__title">Settings</h1></div>
      <div className="pv__body">
        <section className="sp__block">
          <h3 className="sched__label">Account</h3>
          <div className="set__grid">
            <label className="field">
              <span className="field__label">Name</span>
              <input type="text" value={name} onChange={e => setName(e.target.value)} />
            </label>
            <label className="field">
              <span className="field__label">Email</span>
              <input type="email" value={user.email} readOnly disabled />
            </label>
          </div>
          <div className="sched__save">
            <button className="btn" onClick={saveName} disabled={name.trim() === savedName.trim() || !name.trim()}>Save</button>
            {msg && <span className="sched__msg">{msg}</span>}
          </div>
        </section>

        <section className="sp__block set__pwblock">
          <h3 className="sched__label">Password</h3>
          <ChangePasswordInline />
        </section>

        {user.role === "owner" && <BillingSection />}

        <section className="sp__block">
          <button className="action action--danger" onClick={onSignOut}>Sign out</button>
        </section>
      </div>
    </div>
  );
}

function ChangePasswordInline() {
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  async function submit(e) {
    e.preventDefault(); setErr(""); setMsg("");
    const res = await fetch("/api/auth/change-password", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword: cur, newPassword: next }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) { setErr(d.error || "Could not update"); return; }
    setCur(""); setNext(""); setMsg("Password updated"); setTimeout(() => setMsg(""), 2500);
  }
  return (
    <form className="set__grid" onSubmit={submit}>
      <label className="field">
        <span className="field__label">Current password</span>
        <input type="password" value={cur} onChange={e => setCur(e.target.value)} autoComplete="current-password" required />
      </label>
      <label className="field">
        <span className="field__label">New password</span>
        <input type="password" value={next} onChange={e => setNext(e.target.value)} placeholder="At least 8 characters" autoComplete="new-password" required />
      </label>
      <div className="sched__save set__span">
        <button className="btn" type="submit">Update password</button>
        {msg && <span className="sched__msg">{msg}</span>}
        {err && <span className="form__error" style={{ margin: 0 }}>{err}</span>}
      </div>
    </form>
  );
}

function BillingSection() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { fetch("/api/billing").then(r => r.json()).then(setData).catch(() => {}); }, []);

  async function openPortal() {
    setErr(""); setBusy(true);
    const res = await fetch("/api/billing/portal", { method: "POST" });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok && d.url) window.location.href = d.url;
    else setErr(d.error || "Could not open billing");
  }

  return (
    <section className="sp__block">
      <h3 className="sched__label">Subscription &amp; billing</h3>
      <p className="sp__hint">Only the store owner manages the subscription and payment method.</p>

      <div className="billing__now">
        <div>
          <span className="billing__label">Current plan</span>
          <span className="billing__plan">{data ? (data.plan === "trial" ? "Free trial" : data.plan) : "…"}</span>
        </div>
        <button className="btn" onClick={openPortal} disabled={busy}>{busy ? "Opening…" : "Manage payment & plan"}</button>
      </div>
      {err && <p className="form__error">{err}</p>}
      {data && !data.stripeConfigured && (
        <p className="sp__hint">Payments aren’t connected yet — add <code>STRIPE_SECRET_KEY</code> on the server to enable the customer portal.</p>
      )}
    </section>
  );
}

// ── Auth gate ────────────────────────────────────────────────────────────────

export default function App() {
  const [phase, setPhase] = useState("loading"); // loading | login | register | onboard | app
  const [user, setUser] = useState(null);
  const [fresh, setFresh] = useState(false); // just registered / first-login → run onboarding

  const [resetToken, setResetToken] = useState(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    const reset = params.get("reset");
    if (reset) {
      window.history.replaceState({}, "", window.location.pathname);
      setResetToken(reset); setPhase("reset"); return;
    }
    if (token) {
      fetch("/api/auth/accept-invite", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }),
      })
        .then(r => r.json().then(d => ({ ok: r.ok, d })))
        .then(({ ok, d }) => {
          window.history.replaceState({}, "", window.location.pathname); // strip token
          if (ok && d.user) { setUser(d.user); setPhase(d.user.mustChangePassword ? "changepw" : "app"); }
          else setPhase("login");
        })
        .catch(() => setPhase("login"));
      return;
    }
    fetch("/api/auth/me")
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (d?.user) { setUser(d.user); setPhase(d.user.mustChangePassword ? "changepw" : "app"); }
        else setPhase("login");
      })
      .catch(() => setPhase("login"));
  }, []);

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    setUser(null); setPhase("login");
  }

  if (phase === "loading") return <div className="authwrap"><Loader /></div>;

  if (phase === "login")
    return <LoginScreen onAuthed={u => { setUser(u); setPhase(u.mustChangePassword ? "changepw" : "app"); }} onForgot={() => setPhase("forgot")} />;

  if (phase === "forgot")
    return <ForgotPasswordScreen onBack={() => setPhase("login")} />;

  if (phase === "reset")
    return <ResetPasswordScreen token={resetToken} onAuthed={u => { setUser(u); setPhase(u.mustChangePassword ? "changepw" : "app"); }} onBack={() => setPhase("login")} />;

  if (phase === "changepw")
    return <ChangePasswordScreen forced onDone={() => { setFresh(true); setPhase("onboard"); }} />;

  if (phase === "onboard")
    return <OnboardingHours user={user} onDone={() => setPhase("app")} />;

  return <AdminApp user={user} onSignOut={signOut} onUserChange={setUser} />;
}

function AuthShell({ title, subtitle, children, footer }) {
  return (
    <div className="authwrap">
      <div className="authcard">
        <div className="authcard__brand">
          <span className="saas__mark"><Icon name="calendar" /></span>
          <span className="saas__name">StoreCal</span>
        </div>
        <h1 className="authcard__title">{title}</h1>
        {subtitle && <p className="authcard__sub">{subtitle}</p>}
        {children}
        {footer && <div className="authcard__foot">{footer}</div>}
      </div>
    </div>
  );
}

function LoginScreen({ onAuthed, onForgot }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault(); setErr(""); setBusy(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Could not sign in");
      onAuthed(d.user);
    } catch (e2) { setErr(e2.message); setBusy(false); }
  }

  return (
    <AuthShell title="Sign in" subtitle="Manage your bookings, team, and hours."
      footer={
        <p className="authnote">
          <b>Are you staff?</b> You don’t sign up here — ask your store owner for your invite link. Opening it signs you in and lets you set a password.
        </p>
      }>
      <form className="authform" onSubmit={submit}>
        <label className="field"><span className="field__label">Email</span>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="username" required /></label>
        <label className="field"><span className="field__label">Password</span>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" required /></label>
        {err && <p className="form__error">{err}</p>}
        <button type="submit" className="btn authbtn" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
        <button type="button" className="linkbtn authforgot" onClick={onForgot}>Forgot password?</button>
      </form>
    </AuthShell>
  );
}

function ForgotPasswordScreen({ onBack }) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  async function submit(e) {
    e.preventDefault();
    await fetch("/api/auth/forgot", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }),
    }).catch(() => {});
    setSent(true);
  }
  return (
    <AuthShell title="Reset password" subtitle="Enter your email and we’ll send reset instructions."
      footer={<button className="linkbtn" onClick={onBack}>← Back to sign in</button>}>
      {sent ? (
        <p className="authnote">If an account exists for <b>{email}</b>, you’ll receive a reset link shortly. If you’re staff and don’t get one, ask your store owner to resend your invite link.</p>
      ) : (
        <form className="authform" onSubmit={submit}>
          <label className="field"><span className="field__label">Email</span>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="username" required /></label>
          <button type="submit" className="btn authbtn">Send reset link</button>
        </form>
      )}
    </AuthShell>
  );
}

function ResetPasswordScreen({ token, onAuthed, onBack }) {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault(); setErr(""); setBusy(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, newPassword: pw }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Could not reset password");
      onAuthed(d.user);
    } catch (e2) { setErr(e2.message); setBusy(false); }
  }
  return (
    <AuthShell title="Choose a new password"
      footer={<button className="linkbtn" onClick={onBack}>← Back to sign in</button>}>
      <form className="authform" onSubmit={submit}>
        <label className="field"><span className="field__label">New password</span>
          <input type="password" value={pw} onChange={e => setPw(e.target.value)} placeholder="At least 8 characters" autoComplete="new-password" required /></label>
        {err && <p className="form__error">{err}</p>}
        <button type="submit" className="btn authbtn" disabled={busy}>{busy ? "Saving…" : "Set password"}</button>
      </form>
    </AuthShell>
  );
}

function RegisterScreen({ onAuthed, onBack }) {
  const [form, setForm] = useState({ businessName: "", email: "", password: "" });
  const set = (f, v) => setForm(s => ({ ...s, [f]: v }));
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault(); setErr(""); setBusy(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Could not create account");
      onAuthed(d.user);
    } catch (e2) { setErr(e2.message); setBusy(false); }
  }

  return (
    <AuthShell title="Create your account" subtitle="Set up your business in a minute."
      footer={<button className="linkbtn" onClick={onBack}>← Back to sign in</button>}>
      <form className="authform" onSubmit={submit}>
        <label className="field"><span className="field__label">Business name</span>
          <input type="text" value={form.businessName} onChange={e => set("businessName", e.target.value)} placeholder="Glamour Hair & Nails" required /></label>
        <label className="field"><span className="field__label">Your email</span>
          <input type="email" value={form.email} onChange={e => set("email", e.target.value)} autoComplete="username" required /></label>
        <label className="field"><span className="field__label">Password</span>
          <input type="password" value={form.password} onChange={e => set("password", e.target.value)} autoComplete="new-password" placeholder="At least 8 characters" required /></label>
        {err && <p className="form__error">{err}</p>}
        <button type="submit" className="btn authbtn" disabled={busy}>{busy ? "Creating…" : "Create account"}</button>
      </form>
    </AuthShell>
  );
}

function ChangePasswordScreen({ forced, onDone }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault(); setErr(""); setBusy(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Could not update password");
      onDone();
    } catch (e2) { setErr(e2.message); setBusy(false); }
  }

  return (
    <AuthShell title="Set your password" subtitle={forced ? "Choose a password to finish setting up your account." : "Update your password."}>
      <form className="authform" onSubmit={submit}>
        {!forced && (
          <label className="field"><span className="field__label">Current password</span>
            <input type="password" value={current} onChange={e => setCurrent(e.target.value)} required /></label>
        )}
        <label className="field"><span className="field__label">New password</span>
          <input type="password" value={next} onChange={e => setNext(e.target.value)} placeholder="At least 8 characters" autoComplete="new-password" required /></label>
        {err && <p className="form__error">{err}</p>}
        <button type="submit" className="btn authbtn" disabled={busy}>{busy ? "Saving…" : "Save password"}</button>
      </form>
    </AuthShell>
  );
}

// Final onboarding step — set hours (skippable; a banner nags until done).
function OnboardingHours({ user, onDone }) {
  const isOwner = user.role === "owner";
  const provider = isOwner ? { _id: "shop", name: "Store" } : { _id: user.providerId, name: user.name || "You" };
  return (
    <div className="authwrap authwrap--wide">
      <div className="authcard authcard--wide">
        <div className="authcard__brand">
          <span className="saas__mark"><Icon name="calendar" /></span>
          <span className="saas__name">StoreCal</span>
        </div>
        <h1 className="authcard__title">Add your {isOwner ? "store" : "work"} hours</h1>
        <p className="authcard__sub">This is the most important step — clients can only book during these hours. You can change them anytime.</p>
        <div className="onboard__editor">
          <ScheduleEditor provider={provider} mode={isOwner ? "store" : "stylist"} />
        </div>
        <div className="authcard__foot authcard__foot--split">
          <button className="linkbtn" onClick={onDone}>Skip for now</button>
          <button className="btn" onClick={onDone}>Done</button>
        </div>
      </div>
    </div>
  );
}
