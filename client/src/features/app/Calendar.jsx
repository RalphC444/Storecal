import { useState, useEffect, useRef } from "react";
import { Icon } from "../../components/Icon";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { STATUSES, STATUS_LABEL, effStatus } from "../../lib/appointments";
import { addDaysKey, fmtTime, parseYmd, todayKey } from "../../lib/datetime";
import { DAY_START, DAY_END, PX_PER_MIN, GRID_H, DAYS_SHORT, SLOTS, packDay, openRangesFor } from "./availability";
import { ScheduleEditor } from "./Scheduling";

export function WeekCalendar({
  weekStart, selectedDay, appts, loading, providers, providerId, teamLabel, isMobile,
  lockProvider, hoursLabel = "Store hours", hoursVersion,
  onSelectProvider, durationOf,
  onPrev, onNext, onToday, onSelectDay, onSelectAppt, onNewAt, onStoreHours,
}) {
  const [av, setAv] = useState(null);
  const [timeoff, setTimeoff] = useState([]);
  const [shopAv, setShopAv] = useState(null);
  const [shopTimeoff, setShopTimeoff] = useState([]);

  useEffect(() => {
    if (providerId === "all") { setAv(null); setTimeoff([]); return; }
    fetch(`/api/availability/${providerId}`).then(r => r.json()).then(setAv).catch(() => setAv(null));
    fetch(`/api/timeoff/${providerId}`).then(r => r.json()).then(d => Array.isArray(d) && setTimeoff(d)).catch(() => {});
  }, [providerId, hoursVersion]);

  // Store hours apply to every column (even "all staff"), so closed times show.
  useEffect(() => {
    fetch(`/api/availability/shop`).then(r => r.json()).then(setShopAv).catch(() => setShopAv(null));
    fetch(`/api/timeoff/shop`).then(r => r.json()).then(d => Array.isArray(d) && setShopTimeoff(d)).catch(() => {});
  }, [hoursVersion]);

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
    <div className="calendar">
      <div className="calendar__top">
        <div className="calendar__nav">
          <button className={`navbutton${isTodayView ? " navbutton--on" : ""}`} onClick={onToday}>Today</button>
          <button className="navbutton navbutton--icon" onClick={onPrev} aria-label="Previous"><Icon name="chevronLeft" /></button>
          <button className="navbutton navbutton--icon" onClick={onNext} aria-label="Next"><Icon name="chevronRight" /></button>
        </div>
        <h1 className="calendar__title">{title}</h1>
        <span className="calendar__stat">
          <span className="calendar__stat-l">Total appointments</span>
          <span className="calendar__stat-n">{loading ? "…" : shown.length}</span>
        </span>
        {!lockProvider && (
          <label className="calendar__view">
            <span className="calendar__view-l">View:</span>
            <select className="calendar__filter" value={providerId} onChange={e => onSelectProvider(e.target.value)}>
              <option value="all">All {(teamLabel || "team").toLowerCase()}</option>
              {providers.map(p => <option key={p._id} value={p._id}>{p.name}</option>)}
            </select>
          </label>
        )}
        {onStoreHours && (
          <button className="navbutton navbutton--cta calendar__storehours" onClick={onStoreHours}>
            <Icon name="clock" /> {hoursLabel}
          </button>
        )}
      </div>

      <div className="calendar__grid">
        {loading && <div className="calendar__loading"><LoadingSpinner /></div>}
        <div className="calendar__scroll">
          {/* Day headers (sticky, share the scroll container so they align with columns) */}
          <div className="calendar__headrow">
            <div className="calendar__corner" />
            <div className="calendar__heads" style={colStyle}>
              {days.map(d => {
                const dt = parseYmd(d);
                const isToday = d === todayStr;
                const isSel = d === selectedDay;
                return (
                  <button
                    key={d}
                    className={`calendar__head${isSel ? " calendar__head--sel" : ""}`}
                    onClick={() => onSelectDay(d)}
                  >
                    <span className="calendar__hday">{DAYS_SHORT[dt.getDay()]}</span>
                    <span className={`calendar__hnum${isToday ? " calendar__hnum--today" : ""}`}>{dt.getDate()}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Time gutter + day columns */}
          <div className="calendar__body">
            <div className="calendar__gutter" style={{ height: GRID_H }}>
              {hours.map(h => (
                <div key={h} className="calendar__hourlabel" style={{ height: 60 * PX_PER_MIN }}>
                  {h === 12 ? "12 PM" : h > 12 ? `${h - 12} PM` : `${h} AM`}
                </div>
              ))}
            </div>

            <div className="calendar__cols" style={{ height: GRID_H, ...colStyle }}>
          {days.map(d => {
            // The calendar reflects the STORE's schedule only — its open hours,
            // time off, and breaks — regardless of which stylist is being viewed.
            // null = store hours never configured → no constraint. [] = closed all day.
            const open = shopAv?.configured ? openRangesFor(d, shopAv, shopTimeoff) : null;
            const list = shown.filter(a => a.dateKey === d);
            // "Constrained" = there are hours to enforce → closed time is tinted + un-bookable.
            const scoped = open !== null;
            const isToday = d === todayStr;
            const isOpenAt = (min) => !scoped || open.some(r => min >= r.startMin && min < r.endMin);
            const colCls = scoped ? "calendar__col calendar__col--scoped" : `calendar__col${isToday ? " calendar__col--today" : ""}`;
            return (
              <div key={d} className={colCls}>
                {/* hour lines */}
                {hours.slice(1).map((h, i) => (
                  <div key={h} className="calendar__line" style={{ top: (i + 1) * 60 * PX_PER_MIN }} />
                ))}

                {/* open-hours shading (white "bookable" bands over the tinted closed base) */}
                {open && open.map((r, i) => (
                  <div
                    key={i}
                    className="calendar__open"
                    style={{
                      top: (Math.max(r.startMin, DAY_START) - DAY_START) * PX_PER_MIN,
                      height: (Math.min(r.endMin, DAY_END) - Math.max(r.startMin, DAY_START)) * PX_PER_MIN,
                    }}
                  />
                ))}

                {/* click-to-create slots — blocked outside a provider's working hours */}
                <div className="calendar__slots">
                  {SLOTS.map(min => {
                    const blocked = scoped && !isOpenAt(min);
                    return (
                      <button
                        key={min}
                        className={`calendar__slot${blocked ? " calendar__slot--blocked" : ""}`}
                        style={{ height: 30 * PX_PER_MIN }}
                        disabled={blocked}
                        title={blocked ? "Closed — can't book" : `New appointment · ${fmtTime(`${String(Math.floor(min/60)).padStart(2,"0")}:${String(min%60).padStart(2,"0")}`)}`}
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
                      className={`apptblock apptblock--${effStatus(a, durationOf)}${compact ? " apptblock--compact" : ""}`}
                      style={{ top, height, left, width }}
                      onClick={e => { e.stopPropagation(); onSelectAppt(a); }}
                      title={`${fmtTime(a.timeValue)} · ${a.client?.name || ""}${svcText ? " · " + svcText : ""}`}
                    >
                      {compact ? (
                        <span className="apptblock__line">
                          <span className="apptblock__time">{fmtTime(a.timeValue)}</span>
                          <span className="apptblock__name">{a.client?.name || "—"}</span>
                        </span>
                      ) : (
                        <>
                          <span className="apptblock__time">{fmtTime(a.timeValue)}</span>
                          <span className="apptblock__name">{a.client?.name || "—"}</span>
                          {height > 58 && lanes < 3 && svcText.trim() && <span className="apptblock__svc">{svcText}</span>}
                        </>
                      )}
                    </button>
                  );
                })}

                {/* now line */}
                {isToday && nowMin >= DAY_START && nowMin <= DAY_END && (
                  <div className="calendar__now" style={{ top: (nowMin - DAY_START) * PX_PER_MIN }} />
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

export function StoreHoursModal({ onClose, onSaved }) {
  return (
    <div className="modal" onMouseDown={onClose}>
      <div className="modal__panel modal__panel--wide" onMouseDown={e => e.stopPropagation()}>
        <div className="modal__head">
          <h2 className="modal__title">Store hours &amp; closures</h2>
          <button className="modal__x" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="modal__banner">
          <span className="modal__banner-ico"><Icon name="calendar" /></span>
          <span>These are the hours shown on your booking site — clients can only book within them. Set your weekly hours below, or add one-off closures &amp; time off.</span>
        </div>
        <div className="modal__scroll modal__scroll--docked">
          <ScheduleEditor provider={{ _id: "shop", name: "Store" }} mode="store" docked onSaved={onSaved} />
        </div>
      </div>
    </div>
  );
}

// ── Appointment row ───────────────────────────────────────────────────────────

export function ApptRow({ appt: a, showProvider, showVehicle, onStatusChange, onEdit }) {
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

export function ScheduleView({ providers, initialProviderId }) {
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
              className={`providertab${providerId === p._id ? " providertab--on" : ""}`}
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

