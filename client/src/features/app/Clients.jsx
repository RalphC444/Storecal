import { useState, useEffect, useCallback, useRef } from "react";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { useIsMobile } from "../../lib/hooks";
import { STATUS_LABEL, effStatus } from "../../lib/appointments";
import { fmtShort, fmtTime, todayKey } from "../../lib/datetime";
import { AppointmentModal } from "./Appointments";

export function ClientsView({ providers, services, durationOf, onApptSaved, addReq, businessType }) {
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
        businessType={businessType}
        onApptSaved={onApptSaved}
        onBack={() => setSelectedId(null)}
        onDeleted={() => { setSelectedId(null); load(); }}
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
          <LoadingSpinner />
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

export function ClientForm({ onClose, onSave }) {
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

export function ClientProfile({ clientId, providers, services, durationOf, businessType, onApptSaved, onBack, onDeleted }) {
  const [data, setData] = useState(null);
  const [notes, setNotes] = useState("");
  const [savedNotes, setSavedNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(null); // appointment modal
  const [delErr, setDelErr] = useState("");

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

  async function deleteClient() {
    setDelErr("");
    if (!window.confirm(`Delete ${data.name || "this client"}? Their profile is removed; past appointments are kept.`)) return;
    const res = await fetch(`/api/clients/${clientId}`, { method: "DELETE" });
    if (!res.ok) { const { error } = await res.json().catch(() => ({})); setDelErr(error || "Could not delete client"); return; }
    onApptSaved?.(); onDeleted?.();
  }

  if (!data) return <div className="pageview"><div className="pv__body"><LoadingSpinner /></div></div>;

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

        <section className="sp__block">
          {delErr && <p className="form__error">{delErr}</p>}
          <button className="action action--danger" onClick={deleteClient}>Delete client</button>
        </section>
      </div>

      {editing && (
        <AppointmentModal
          appt={editing}
          providers={providers}
          services={services}
          durationOf={durationOf}
          businessType={businessType}
          onClose={() => setEditing(null)}
          onSave={saveAppt}
          onStatusChange={updateStatus}
        />
      )}
    </div>
  );
}

// ── Appointment form (create + edit) ────────────────────────────────────────

