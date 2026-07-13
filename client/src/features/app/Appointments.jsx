import { useState, useEffect } from "react";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { MANUAL_STATUSES, STATUS_LABEL, effStatus } from "../../lib/appointments";
import { PET_WEIGHTS } from "../../lib/businessTypes";
import { TIME_SLOTS, fmtSideDay, fmtTime, parseYmd, toMin, todayKey } from "../../lib/datetime";
import { openRangesFor } from "./availability";
import { fmtMin } from "./Scheduling";

export function AppointmentModal({ appt, providers, services, durationOf, businessType, onClose, onSave, onStatusChange }) {
  const isExisting = !!appt._id;
  const [mode, setMode] = useState(isExisting ? "view" : "edit");

  if (mode === "view") {
    return (
      <AppointmentDetail
        appt={appt}
        durationOf={durationOf}
        businessType={businessType}
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
      businessType={businessType}
      onSave={onSave}
      onCancel={isExisting ? () => setMode("view") : onClose}
      onClose={onClose}
    />
  );
}

// Read view for an already-scheduled appointment.
export function AppointmentDetail({ appt: a, durationOf, businessType, onEdit, onStatusChange, onClose }) {
  const eff = effStatus(a, durationOf);
  const isDone = eff === "completed";
  const isPet = businessType === "grooming"; // grooming widget collects pet name/breed/weight
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelMsg, setCancelMsg] = useState("");
  return (
    <div className="modal" onMouseDown={onClose}>
      <div className="modal__panel" onMouseDown={e => e.stopPropagation()}>
        <div className="modal__head">
          <h2 className="modal__title">Appointment</h2>
          <button className="modal__x" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="appointmentview">
          <div className="appointmentview__when">
            <span className="appointmentview__time">{fmtTime(a.timeValue)}</span>
            <span className={`tag tag--${eff}`}>{STATUS_LABEL[eff]}</span>
          </div>
          <div className="appointmentview__date">{fmtSideDay(a.dateKey)}</div>

          <dl className="appointmentview__dl">
            <div>
              <dt>Client</dt>
              <dd>{a.client?.name || "—"}</dd>
              {a.client?.phone && <dd><a href={`tel:${a.client.phone}`}>{a.client.phone}</a></dd>}
              {a.client?.email && <dd><a href={`mailto:${a.client.email}`}>{a.client.email}</a></dd>}
            </div>
            {isPet && (
              <>
                <div><dt>Pet’s name</dt><dd>{a.pet?.name || "—"}</dd></div>
                <div><dt>Breed</dt><dd>{a.pet?.breed || "—"}</dd></div>
                <div><dt>Weight</dt><dd>{a.pet?.weight || "—"}</dd></div>
              </>
            )}
            <div><dt>Service</dt><dd>{a.service || "—"}</dd></div>
            {a.addons?.length > 0 && <div><dt>Add-ons</dt><dd>{a.addons.map(x => x.name + (x.price ? ` (${x.price})` : "")).join(", ")}</dd></div>}
            {businessType !== "auto" && <div><dt>Staff</dt><dd>{a.providerName || "—"}</dd></div>}
            {a.issueDescription && <div className="appointmentview__notes"><dt>Notes</dt><dd>{a.issueDescription}</dd></div>}
          </dl>

          <div className="appointmentview__status">
            <span className="field__label">Status</span>
            {isDone ? (
              <p className="appointmentview__done">Automatically marked <b>completed</b> — the appointment time has passed.</p>
            ) : (
              <>
                <div className="actions">
                  {MANUAL_STATUSES.map(s => (
                    <button
                      key={s}
                      className={`action${a.status === s ? " action--on" : ""}`}
                      disabled={a.status === s}
                      onClick={() => s === "cancelled" ? setConfirmCancel(true) : onStatusChange(a._id, s)}
                    >{STATUS_LABEL[s]}</button>
                  ))}
                </div>
                <p className="appointmentview__note">Cancelling emails the client a notice automatically. Status changes to Pending/Confirmed don’t notify them.</p>
              </>
            )}
          </div>
        </div>

        {confirmCancel && (
          <div className="modal" onMouseDown={() => setConfirmCancel(false)}>
            <div className="modal__panel" onMouseDown={e => e.stopPropagation()}>
              <div className="modal__head">
                <h2 className="modal__title">Cancel this appointment?</h2>
                <button className="modal__x" onClick={() => setConfirmCancel(false)} aria-label="Close">✕</button>
              </div>
              <div className="form">
                <p className="panel__hint" style={{ marginTop: 0 }}>
                  {a.client?.email
                    ? <>We’ll email <b>{a.client.email}</b> a cancellation notice. Add a message they’ll see (optional):</>
                    : "This client has no email on file, so no notice can be sent. Please contact them directly."}
                </p>
                <label className="field">
                  <span className="field__label">Message to the client <span className="field__hint">— from you or your staff</span></span>
                  <textarea rows={3} value={cancelMsg} onChange={e => setCancelMsg(e.target.value)}
                    placeholder="e.g. So sorry — we’ve had to close today for a family emergency. Please call us to rebook." />
                </label>
                <div className="form__actions">
                  <button type="button" className="action" onClick={() => setConfirmCancel(false)}>Keep appointment</button>
                  <button type="button" className="btn btn--danger"
                    onClick={() => { onStatusChange(a._id, "cancelled", cancelMsg.trim()); setConfirmCancel(false); }}>
                    {a.client?.email ? "Cancel & notify client" : "Cancel appointment"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

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
export function AppointmentEditor({ appt, providers, services, isExisting, businessType, onSave, onCancel, onClose }) {
  const isPet = businessType === "grooming"; // collect pet name/breed/weight, matching the widget
  // Auto shops have no bookable service providers — their staff are admins. So
  // appointments aren't assigned to a person; hide the Staff picker entirely.
  const isAuto = businessType === "auto";
  const [form, setForm] = useState({
    dateKey: appt.dateKey || todayKey(),
    timeValue: appt.timeValue || "09:00",
    providerId: appt.providerId || (isAuto ? "" : (providers[0]?._id ?? "")),
    service: appt.service || (services[0]?.name ?? ""),
    name: appt.client?.name || "",
    phone: appt.client?.phone || "",
    email: appt.client?.email || "",
    petName: appt.pet?.name || "",
    petBreed: appt.pet?.breed || "",
    petWeight: appt.pet?.weight || "",
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

  // Staff availability for the selected day/time (so it's clear before booking).
  const [provAv, setProvAv] = useState(null);
  const [provTimeoff, setProvTimeoff] = useState([]);
  useEffect(() => {
    if (!form.providerId) { setProvAv(null); setProvTimeoff([]); return; }
    fetch(`/api/availability/${form.providerId}`).then(r => r.json()).then(setProvAv).catch(() => setProvAv(null));
    fetch(`/api/timeoff/${form.providerId}`).then(r => r.json()).then(d => Array.isArray(d) && setProvTimeoff(d)).catch(() => {});
  }, [form.providerId]);

  const durMin = (services.find(x => x.name === form.service)?.durationMin) || 45;
  const avail = (() => {
    if (!form.providerId || !provAv || !provAv.configured) return null; // hours not set → don't warn
    const prov = providers.find(p => p._id === form.providerId);
    const name = prov?.name || "This staff member";
    const ranges = openRangesFor(form.dateKey, provAv, provTimeoff);
    const weekday = parseYmd(form.dateKey).toLocaleDateString("en-US", { weekday: "long" });
    if (!ranges || ranges.length === 0) return { ok: false, text: `${name} isn’t scheduled on ${weekday}. Pick another day or staff member.` };
    const start = toMin(form.timeValue);
    const fits = ranges.some(r => start >= r.startMin && start < r.endMin && start + durMin <= r.endMin);
    if (!fits) {
      const hrs = ranges.map(r => `${fmtMin(r.startMin)}–${fmtMin(r.endMin)}`).join(", ");
      return { ok: false, text: `${name} works ${hrs} that day — ${fmtTime(form.timeValue)} is outside their hours.` };
    }
    return { ok: true, text: `${name} is available then.` };
  })();

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
        pet: isPet ? { name: form.petName.trim(), breed: form.petBreed.trim(), weight: form.petWeight } : undefined,
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

          {isPet && (
            <div className="form__row form__row--2">
              <label className="field">
                <span className="field__label">Pet’s name</span>
                <input type="text" value={form.petName} onChange={e => set("petName", e.target.value)} placeholder="e.g. Biscuit" />
              </label>
              <label className="field">
                <span className="field__label">Breed</span>
                <input type="text" value={form.petBreed} onChange={e => set("petBreed", e.target.value)} placeholder="e.g. Golden Retriever" />
              </label>
              <label className="field">
                <span className="field__label">Weight</span>
                <select value={form.petWeight} onChange={e => set("petWeight", e.target.value)}>
                  <option value="">—</option>
                  {PET_WEIGHTS.map(w => <option key={w} value={w}>{w}</option>)}
                </select>
              </label>
            </div>
          )}

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

          <div className={isAuto ? "form__row" : "form__row form__row--2"}>
            {/* Auto shops don't assign appointments to a person (staff are admins). */}
            {!isAuto && (
              <label className="field">
                <span className="field__label">Staff</span>
                <select value={form.providerId} onChange={e => set("providerId", e.target.value)}>
                  <option value="">Unassigned</option>
                  {providers.map(p => <option key={p._id} value={p._id}>{p.name}</option>)}
                </select>
              </label>
            )}
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

          {avail && (
            <p className={`appt-avail${avail.ok ? " appt-avail--ok" : " appt-avail--warn"}`}>
              {avail.ok ? "✓ " : "⚠️ "}{avail.text}
            </p>
          )}

          <label className="field">
            <span className="field__label">Notes</span>
            <textarea rows={2} value={form.issueDescription} onChange={e => set("issueDescription", e.target.value)} placeholder="Allergies, preferences, reference photos…" />
          </label>

          {error && <p className="form__error">{error}</p>}

          <div className="form__actions">
            <button type="button" className="action" onClick={onCancel}>Cancel</button>
            <button type="submit" className="btn" disabled={saving || (avail && !avail.ok)}>
              {saving ? "Saving…" : isExisting ? "Save changes" : "Create appointment"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Minutes-since-midnight → "9:00 AM"
