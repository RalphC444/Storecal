import { useState, useEffect, useCallback } from "react";

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

const DAYS_FULL = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

const todayKey = () => new Date().toISOString().slice(0, 10);

function dateKey(offsetDays) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
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

const STATUSES = ["pending", "confirmed", "completed", "cancelled"];
const STATUS_LABEL = {
  pending: "Pending", confirmed: "Confirmed", completed: "Completed", cancelled: "Cancelled",
};

// ── Root ──────────────────────────────────────────────────────────────────────

export default function App() {
  const [providers, setProviders] = useState([]);
  const [view, setView] = useState("appointments"); // "appointments" | "schedule"
  const [providerFilter, setProviderFilter] = useState("all");

  const [appts, setAppts] = useState([]);
  const [loading, setLoading] = useState(true);

  const [from, setFrom] = useState(dateKey(0));
  const [to, setTo]     = useState(dateKey(30));

  useEffect(() => {
    fetch("/api/providers")
      .then(r => r.json())
      .then(data => Array.isArray(data) && setProviders(data));
  }, []);

  const loadAppts = useCallback(() => {
    setLoading(true);
    const p = new URLSearchParams({ from, to });
    if (providerFilter !== "all") p.set("providerId", providerFilter);
    fetch(`/api/appointments?${p}`)
      .then(r => r.json())
      .then(data => Array.isArray(data) && setAppts(data))
      .finally(() => setLoading(false));
  }, [from, to, providerFilter]);

  useEffect(() => { loadAppts(); }, [loadAppts]);

  async function updateStatus(id, status) {
    await fetch(`/api/appointments/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setAppts(prev => prev.map(a => a._id === id ? { ...a, status } : a));
  }

  const pendingCount = appts.filter(a => a.status === "pending").length;

  const grouped = appts.reduce((acc, a) => {
    (acc[a.dateKey] = acc[a.dateKey] || []).push(a);
    return acc;
  }, {});

  const showProviderName = providerFilter === "all";

  return (
    <div className="page">
      <header className="header">
        <div className="header__brand">Salon Booking</div>
        <nav className="header__views">
          <button
            className={`viewtab${view === "appointments" ? " viewtab--on" : ""}`}
            onClick={() => setView("appointments")}
          >Appointments</button>
          <button
            className={`viewtab${view === "schedule" ? " viewtab--on" : ""}`}
            onClick={() => setView("schedule")}
          >Schedule</button>
        </nav>
      </header>

      {view === "appointments" ? (
        <main className="main">
          {/* Provider calendars */}
          <div className="provider-tabs">
            <button
              className={`ptab${providerFilter === "all" ? " ptab--on" : ""}`}
              onClick={() => setProviderFilter("all")}
            >All Appointments</button>
            {providers.map(p => (
              <button
                key={p._id}
                className={`ptab${providerFilter === p._id ? " ptab--on" : ""}`}
                onClick={() => setProviderFilter(p._id)}
              >{p.name}</button>
            ))}
          </div>

          {/* Summary + date range */}
          <div className="summary">
            <span className="summary__count">
              {loading ? "…" : `${appts.length} appointment${appts.length !== 1 ? "s" : ""}`}
              {!loading && pendingCount > 0 && ` · ${pendingCount} pending`}
            </span>
            <div className="range">
              <input type="date" value={from} onChange={e => setFrom(e.target.value)} />
              <span>→</span>
              <input type="date" value={to} min={from} onChange={e => setTo(e.target.value)} />
            </div>
          </div>

          {/* Appointment list */}
          {!loading && appts.length === 0 && (
            <p className="empty">No appointments in this range.</p>
          )}

          {!loading && Object.entries(grouped).map(([dk, list]) => (
            <section key={dk} className="day">
              <h2 className="day__heading">{fmtDayHeading(dk)}</h2>
              <div className="day__list">
                {list.map(a => (
                  <ApptRow
                    key={a._id}
                    appt={a}
                    showProvider={showProviderName}
                    onStatusChange={updateStatus}
                  />
                ))}
              </div>
            </section>
          ))}
        </main>
      ) : (
        <ScheduleView providers={providers} />
      )}
    </div>
  );
}

// ── Appointment row ───────────────────────────────────────────────────────────

function ApptRow({ appt: a, showProvider, onStatusChange }) {
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
            <div>
              <dt>Vehicle</dt>
              <dd>{[a.vehicle?.year,a.vehicle?.make,a.vehicle?.model,a.vehicle?.trim].filter(Boolean).join(" ") || "—"}</dd>
            </div>
            <div>
              <dt>Service</dt>
              <dd>{a.service || "—"}</dd>
              {a.issueDescription && <dd className="detail__note">{a.issueDescription}</dd>}
            </div>
            {showProvider && (
              <div>
                <dt>Provider</dt>
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
          </div>
        </div>
      )}
    </div>
  );
}

// ── Schedule view ─────────────────────────────────────────────────────────────

function ScheduleView({ providers }) {
  const [providerId, setProviderId] = useState(null);

  useEffect(() => {
    if (!providerId && providers[0]) setProviderId(providers[0]._id);
  }, [providers, providerId]);

  const provider = providers.find(p => p._id === providerId);

  return (
    <main className="main">
      <div className="provider-tabs">
        {providers.map(p => (
          <button
            key={p._id}
            className={`ptab${providerId === p._id ? " ptab--on" : ""}`}
            onClick={() => setProviderId(p._id)}
          >{p.name}</button>
        ))}
      </div>
      {provider && <ScheduleEditor key={provider._id} provider={provider} />}
    </main>
  );
}

function ScheduleEditor({ provider }) {
  const [schedule, setSchedule] = useState(null);
  const [timeOff, setTimeOff]   = useState([]);
  const [saving, setSaving]     = useState(false);
  const [saveMsg, setSaveMsg]   = useState("");
  const [newStart, setNewStart] = useState("");
  const [newEnd, setNewEnd]     = useState("");
  const [newReason, setNewReason] = useState("");

  const loadTimeOff = useCallback(() => {
    fetch(`/api/timeoff/${provider._id}`)
      .then(r => r.json())
      .then(d => Array.isArray(d) && setTimeOff(d));
  }, [provider._id]);

  useEffect(() => {
    setSchedule(null);
    fetch(`/api/availability/${provider._id}`)
      .then(r => r.json())
      .then(d => d.schedule && setSchedule(d.schedule));
    loadTimeOff();
  }, [provider._id, loadTimeOff]);

  function toggleDay(w) {
    setSchedule(p => p.map(d => d.weekday === w ? { ...d, enabled: !d.enabled } : d));
  }
  function updateRange(w, ri, field, value) {
    setSchedule(p => p.map(d => d.weekday !== w ? d :
      { ...d, ranges: d.ranges.map((r,i) => i === ri ? { ...r, [field]: parseInt(value) } : r) }));
  }
  function addRange(w) {
    setSchedule(p => p.map(d => {
      if (d.weekday !== w) return d;
      const last = d.ranges[d.ranges.length - 1];
      return { ...d, ranges: [...d.ranges, { startMin: Math.min(last.endMin+30,1320), endMin: Math.min(last.endMin+90,1380) }] };
    }));
  }
  function removeRange(w, ri) {
    setSchedule(p => p.map(d => d.weekday !== w ? d : { ...d, ranges: d.ranges.filter((_,i) => i !== ri) }));
  }
  function addBreak(w) {
    setSchedule(p => p.map(d => d.weekday !== w ? d : { ...d, breaks: [...(d.breaks||[]), { startMin: 720, endMin: 780 }] }));
  }
  function updateBreak(w, bi, field, value) {
    setSchedule(p => p.map(d => d.weekday !== w ? d :
      { ...d, breaks: (d.breaks||[]).map((b,i) => i === bi ? { ...b, [field]: parseInt(value) } : b) }));
  }
  function removeBreak(w, bi) {
    setSchedule(p => p.map(d => d.weekday !== w ? d : { ...d, breaks: (d.breaks||[]).filter((_,i) => i !== bi) }));
  }

  async function saveSchedule() {
    setSaving(true); setSaveMsg("");
    const res = await fetch(`/api/availability/${provider._id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ schedule }),
    });
    setSaveMsg(res.ok ? "Saved" : "Error saving");
    if (res.ok) setTimeout(() => setSaveMsg(""), 2500);
    setSaving(false);
  }

  async function addTimeOff() {
    if (!newStart || !newEnd) return;
    const res = await fetch(`/api/timeoff/${provider._id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ startDate: newStart, endDate: newEnd, reason: newReason }),
    });
    if (res.ok) { setNewStart(""); setNewEnd(""); setNewReason(""); loadTimeOff(); }
  }

  async function removeTimeOff(id) {
    await fetch(`/api/timeoff/${provider._id}/${id}`, { method: "DELETE" });
    setTimeOff(p => p.filter(t => t._id !== id));
  }

  if (!schedule) return <p className="empty">Loading…</p>;

  return (
    <div className="sched">
      <div className="sched__block">
        <h3 className="sched__label">Weekly Hours</h3>
        {schedule.map(day => (
          <div key={day.weekday} className={`sday${!day.enabled ? " sday--off" : ""}`}>
            <label className="sday__toggle">
              <input type="checkbox" checked={day.enabled} onChange={() => toggleDay(day.weekday)} />
              <span>{DAYS_FULL[day.weekday]}</span>
            </label>
            {day.enabled ? (
              <div className="sday__ranges">
                {day.ranges.map((r, ri) => (
                  <div key={ri} className="trange">
                    <select value={r.startMin} onChange={e => updateRange(day.weekday, ri, "startMin", e.target.value)}>
                      {TIME_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    <span>–</span>
                    <select value={r.endMin} onChange={e => updateRange(day.weekday, ri, "endMin", e.target.value)}>
                      {TIME_OPTIONS.filter(o => o.value > r.startMin).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    {day.ranges.length > 1 && <button className="trange__rm" onClick={() => removeRange(day.weekday, ri)}>✕</button>}
                  </div>
                ))}
                {(day.breaks||[]).map((b, bi) => (
                  <div key={bi} className="trange trange--break">
                    <span className="trange__tag">break</span>
                    <select value={b.startMin} onChange={e => updateBreak(day.weekday, bi, "startMin", e.target.value)}>
                      {TIME_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    <span>–</span>
                    <select value={b.endMin} onChange={e => updateBreak(day.weekday, bi, "endMin", e.target.value)}>
                      {TIME_OPTIONS.filter(o => o.value > b.startMin).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    <button className="trange__rm" onClick={() => removeBreak(day.weekday, bi)}>✕</button>
                  </div>
                ))}
                <div className="sday__add">
                  <button onClick={() => addRange(day.weekday)}>+ hours</button>
                  <button onClick={() => addBreak(day.weekday)}>+ break</button>
                </div>
              </div>
            ) : <span className="sday__closed">Closed</span>}
          </div>
        ))}
        <div className="sched__save">
          <button className="btn" onClick={saveSchedule} disabled={saving}>
            {saving ? "Saving…" : "Save Hours"}
          </button>
          {saveMsg && <span className="sched__msg">{saveMsg}</span>}
        </div>
      </div>

      <div className="sched__block">
        <h3 className="sched__label">Blocked Dates</h3>
        <div className="block-add">
          <input type="date" value={newStart} onChange={e => setNewStart(e.target.value)} />
          <span>–</span>
          <input type="date" value={newEnd} min={newStart} onChange={e => setNewEnd(e.target.value)} />
          <input type="text" placeholder="Reason" value={newReason} onChange={e => setNewReason(e.target.value)} />
          <button className="btn" onClick={addTimeOff} disabled={!newStart || !newEnd}>Add</button>
        </div>
        {timeOff.length === 0
          ? <p className="empty empty--sm">No blocked dates.</p>
          : timeOff.map(t => (
            <div key={t._id} className="block-item">
              <span>{t.startDate === t.endDate ? t.startDate : `${t.startDate} – ${t.endDate}`}</span>
              {t.reason && <span className="block-item__reason">{t.reason}</span>}
              <button className="block-item__rm" onClick={() => removeTimeOff(t._id)}>Remove</button>
            </div>
          ))
        }
      </div>
    </div>
  );
}
