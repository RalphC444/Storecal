import { useState, useEffect, useCallback } from "react";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { DAYS_FULL, TIME_OPTIONS, sundayKey, todayKey } from "../../lib/datetime";

export function fmtMin(min) {
  const h = Math.floor(min / 60), m = min % 60;
  return `${h > 12 ? h - 12 : h === 0 ? 12 : h}:${m.toString().padStart(2,"0")} ${h >= 12 ? "PM" : "AM"}`;
}

// Which week (A/B) a given date falls in, relative to the anchor Sunday.
export function weekKeyFor(anchorDate, date) {
  const anchor = new Date(`${anchorDate}T00:00:00`);
  const d = new Date(date); d.setHours(0,0,0,0);
  d.setDate(d.getDate() - d.getDay()); // Sunday of that week
  const weeks = Math.round((d - anchor) / (7 * 86400000));
  return weeks % 2 === 0 ? "A" : "B";
}

export function fmtOverrideDate(str) {
  const [y, mo, d] = str.split("-").map(Number);
  return new Date(y, mo - 1, d).toLocaleDateString("en-US", { weekday:"short", month:"short", day:"numeric" });
}

// One day row in the weekly editor.
export function DayRow({ day, onToggle, onStart, onEnd }) {
  const r = day.ranges?.[0] || { startMin: 540, endMin: 1080 };
  return (
    <div className={`scheduleday${!day.enabled ? " scheduleday--off" : ""}`}>
      <label className="scheduleday__toggle">
        <input type="checkbox" checked={day.enabled} onChange={onToggle} />
        <span>{DAYS_FULL[day.weekday]}</span>
      </label>
      {day.enabled ? (
        <div className="scheduleday__times">
          <select value={r.startMin} onChange={e => onStart(parseInt(e.target.value))}>
            {TIME_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <span className="timerange__to">to</span>
          <select value={r.endMin} onChange={e => onEnd(parseInt(e.target.value))}>
            {TIME_OPTIONS.filter(o => o.value > r.startMin).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      ) : <span className="scheduleday__closed">Closed</span>}
    </div>
  );
}

export function ScheduleEditor({ provider, mode, docked, onSaved }) {
  const [week, setWeek] = useState(null);
  const [overrides, setOverrides] = useState([]);
  const [timeOff, setTimeOff]   = useState([]);
  const [saving, setSaving]     = useState(false);
  const [saveMsg, setSaveMsg]   = useState("");
  const [showExtras, setShowExtras] = useState(false); // closures & time off (secondary)

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
    if (res.ok) { setTimeout(() => setSaveMsg(""), 2500); onSaved?.(); }
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
    if (res.ok) { setOvDate(todayKey()); setOvMode("closed"); loadAvailability(); onSaved?.(); }
  }
  async function removeOverride(id) {
    await fetch(`/api/availability/${provider._id}/overrides/${id}`, { method: "DELETE" });
    setOverrides(p => p.filter(o => o._id !== id));
    onSaved?.();
  }
  async function addTimeOff() {
    if (!newStart || !newEnd) return;
    const res = await fetch(`/api/timeoff/${provider._id}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ startDate: newStart, endDate: newEnd, reason: newReason }),
    });
    if (res.ok) { setNewStart(""); setNewEnd(""); setNewReason(""); loadTimeOff(); onSaved?.(); }
  }
  async function removeTimeOff(id) {
    await fetch(`/api/timeoff/${provider._id}/${id}`, { method: "DELETE" });
    setTimeOff(p => p.filter(t => t._id !== id));
    onSaved?.();
  }

  if (!week) return <LoadingSpinner />;

  return (
    <div className="schedule schedule--stacked">
      <div className="schedule__block">
        <h3 className="schedule__label">Weekly hours</h3>
        <p className="schedule__hint">Toggle a day open or closed, then set the open and close times. Repeats every week.</p>
        {week.map(day => (
          <DayRow
            key={day.weekday}
            day={day}
            onToggle={() => toggleDay(day.weekday)}
            onStart={(v) => setStart(day.weekday, v)}
            onEnd={(v) => setEnd(day.weekday, v)}
          />
        ))}
        {!docked && (
          <div className="schedule__save">
            <button className="btn" onClick={saveSchedule} disabled={saving}>
              {saving ? "Saving…" : "Save hours"}
            </button>
            {saveMsg && <span className="schedule__msg">{saveMsg}</span>}
          </div>
        )}
      </div>

      <div className="schedule__block">
        {(() => {
          const upcoming = overrides.filter(o => o.date >= todayKey());
          const count = upcoming.length + timeOff.length;
          return (
            <>
              <button type="button" className="schedule__disc" onClick={() => setShowExtras(s => !s)} aria-expanded={showExtras}>
                <span className="schedule__disc-main">
                  <span className="schedule__disc-title">Closures &amp; time off</span>
                  <span className="schedule__disc-sub">Close early, block a day, or add a vacation</span>
                </span>
                <span className="schedule__disc-right">
                  {count > 0 && <span className="schedule__disc-badge">{count}</span>}
                  <span className={`schedule__chev${showExtras ? " schedule__chev--open" : ""}`}>›</span>
                </span>
              </button>

              {showExtras && (
                <div className="schedule__extras">
                  <div className="schedule__sub">
                    <h4 className="schedule__subhead">Change a specific day</h4>
                    <p className="schedule__hint">Override the recurring hours for one date — close early, block the day, or open a normally-closed day. Doesn’t change your weekly hours.</p>
                    <div className="override-add">
                      <input type="date" value={ovDate} min={todayKey()} onChange={e => setOvDate(e.target.value)} />
                      <select value={ovMode} onChange={e => setOvMode(e.target.value)}>
                        <option value="closed">Closed</option>
                        <option value="hours">Custom hours</option>
                      </select>
                      {ovMode === "hours" && (
                        <span className="override-add__hours">
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
                    {upcoming.length === 0
                      ? <p className="empty empty--sm">No single-day changes.</p>
                      : upcoming.map(o => (
                        <div key={o._id} className="block-item">
                          <span className="block-item__date">{fmtOverrideDate(o.date)}</span>
                          <span className="block-item__reason">
                            {o.closed ? "Closed" : o.ranges.map(r => `${fmtMin(r.startMin)}–${fmtMin(r.endMin)}`).join(", ")}
                          </span>
                          <button className="block-item__rm" onClick={() => removeOverride(o._id)}>Remove</button>
                        </div>
                      ))}
                  </div>

                  <div className="schedule__sub">
                    <h4 className="schedule__subhead">Time off</h4>
                    <p className="schedule__hint">Block a multi-day stretch — vacation, training, etc.</p>
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
                      ))}
                  </div>
                </div>
              )}
            </>
          );
        })()}
      </div>

      {docked && (
        <div className="schedule__dock">
          <span className="schedule__dock-hint">Single-day changes &amp; time off save instantly.</span>
          <span className="schedule__dock-actions">
            {saveMsg && <span className="schedule__msg">{saveMsg}</span>}
            <button className="btn" onClick={saveSchedule} disabled={saving}>
              {saving ? "Saving…" : "Save hours"}
            </button>
          </span>
        </div>
      )}
    </div>
  );
}

// ── Settings (account for all; billing for owner) ───────────────────────────

