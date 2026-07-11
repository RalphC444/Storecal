import { useState, useEffect, useCallback, useRef } from "react";
import { Icon } from "../../components/Icon";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { toast } from "../../components/Toast";
import { DURATIONS } from "../../lib/datetime";

export function ServicesView({ providers, teamLabel, onProvidersChange, addReq }) {
  const [services, setServices] = useState(null);
  const [editing, setEditing] = useState(null);   // service form
  const [confirmDel, setConfirmDel] = useState(null); // service pending deletion
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
    const isEdit = !!s._id;
    const res = await fetch(isEdit ? `/api/services/${s._id}` : "/api/services", {
      method: isEdit ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(s),
    });
    if (!res.ok) { const { error } = await res.json().catch(() => ({})); setErr(error || "Could not save"); return; }
    setEditing(null); load();
    toast(isEdit ? "Service updated" : "Service added");
  }
  async function remove(s) {
    const res = await fetch(`/api/services/${s._id}`, { method: "DELETE" });
    load(); onProvidersChange?.();
    if (res.ok) toast("Service deleted");
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
          {!services ? <LoadingSpinner />
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
                      <button className="linkbtn linkbtn--danger" onClick={() => setConfirmDel(s)}>Delete</button>
                    </span>
                  </div>
                ))}
                <button className="svc-add" onClick={() => setEditing({})}>
                  <Icon name="plus" /> Add service
                </button>
              </div>
            )}
        </section>

        <AddonsSection />
      </div>

      {editing && <ServiceForm service={editing} onClose={() => setEditing(null)} onSave={save} />}
      {confirmDel && (
        <ConfirmDialog
          title={`Delete “${confirmDel.name}”?`}
          message="This removes the service from your menu, the booking widget, and every staff member who offers it. Past appointments keep their record. This can’t be undone."
          confirmLabel="Delete service"
          onCancel={() => setConfirmDel(null)}
          onConfirm={async () => { await remove(confirmDel); setConfirmDel(null); }}
        />
      )}
    </div>
  );
}

// Generic confirm dialog for destructive actions.
// Optional booking add-ons (name + price) — offered during checkout.
// Auto-saves on any change (no Save button); a toast confirms each save.
export function AddonsSection() {
  const [rows, setRows] = useState(null);
  const savedRef = useRef("");   // JSON of the last-persisted payload (skips no-op saves)
  const timerRef = useRef(null);

  useEffect(() => {
    fetch("/api/addons").then(r => r.json())
      // The input edits just the number; the "$" is a fixed prefix in the UI and
      // is re-added on save (mirrors ServiceForm), so state never holds a "$".
      .then(d => {
        const loaded = Array.isArray(d) ? d.map(a => ({ name: a.name || "", price: (a.price || "").replace(/[^0-9.]/g, "") })) : [];
        savedRef.current = JSON.stringify(cleanAddons(loaded)); // seed so load doesn't trigger a save
        setRows(loaded);
      })
      .catch(() => { savedRef.current = "[]"; setRows([]); });
  }, []);

  const set = (i, k, v) => setRows(rs => rs.map((r, j) => j === i ? { ...r, [k]: v } : r));
  const add = () => setRows(rs => [...rs, { name: "", price: "" }]);
  const remove = (i) => setRows(rs => rs.filter((_, j) => j !== i));
  // Keep only digits and a single decimal point (e.g. "10", "10.5") — no stray "$".
  const cleanPrice = (v) => {
    const s = v.replace(/[^0-9.]/g, "");
    const dot = s.indexOf(".");
    return dot === -1 ? s : s.slice(0, dot + 1) + s.slice(dot + 1).replace(/\./g, "");
  };

  // Debounced auto-save: persists whenever the cleaned list actually changes.
  useEffect(() => {
    if (rows === null) return; // still loading
    const addons = cleanAddons(rows);
    const payload = JSON.stringify(addons);
    if (payload === savedRef.current) return; // nothing meaningful changed
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      const res = await fetch("/api/addons", {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ addons }),
      });
      if (res.ok) { savedRef.current = payload; toast("Add-ons saved"); }
    }, 700);
    return () => clearTimeout(timerRef.current);
  }, [rows]);

  return (
    <section className="sp__block">
      <h3 className="sched__label">Add-ons</h3>
      <p className="sp__hint">Optional extras clients can add at checkout (e.g. Teeth Brushing $10). Changes save automatically.</p>
      {!rows ? <LoadingSpinner /> : (
        <div className="addon-rows">
          {rows.map((r, i) => (
            <div key={i} className="addon-row">
              <input className="addon-row__name" type="text" value={r.name} placeholder="Add-on name" onChange={e => set(i, "name", e.target.value)} />
              <div className="field__money addon-row__price">
                <span className="field__money-sym">$</span>
                <input className="field__money-input" type="text" inputMode="decimal" value={r.price} placeholder="10" onChange={e => set(i, "price", cleanPrice(e.target.value))} />
              </div>
              <button className="linkbtn linkbtn--danger" onClick={() => remove(i)}>Remove</button>
            </div>
          ))}
          <button className="svc-add" onClick={add}><Icon name="plus" /> Add an add-on</button>
        </div>
      )}
    </section>
  );
}

// Normalize add-on rows into the persisted shape (drops blank names, re-adds "$").
export function cleanAddons(rows) {
  return rows
    .map(r => ({ name: r.name.trim(), price: r.price.trim() ? "$" + r.price.trim() : "" }))
    .filter(r => r.name);
}

export function ServiceForm({ service, onClose, onSave }) {
  const isEdit = !!service._id;
  const [form, setForm] = useState({
    name: service.name || "", description: service.description || "", durationMin: service.durationMin || "",
    // The input edits just the number; the "$" is a fixed prefix in the UI.
    price: (service.price || "").replace(/[^0-9.]/g, ""),
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (f, v) => setForm(s => ({ ...s, [f]: v }));

  async function submit(e) {
    e.preventDefault();
    if (!form.name.trim()) { setError("Service name is required."); return; }
    setSaving(true);
    // Store the price with the "$" so it displays consistently everywhere.
    const price = form.price ? `$${form.price}` : "";
    try { await onSave({ ...service, ...form, price }); } catch (err) { setError(err.message); setSaving(false); }
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
          <label className="field">
            <span className="field__label">Description <span className="field__hint">— shown on your website</span></span>
            <textarea rows={2} value={form.description} onChange={e => set("description", e.target.value)} placeholder="A precision cut tailored to your hair, finished with a blow-dry." />
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
              <div className="field__money">
                <span className="field__money-sym">$</span>
                <input
                  className="field__money-input"
                  type="text"
                  inputMode="decimal"
                  value={form.price}
                  onChange={e => set("price", e.target.value.replace(/[^0-9.]/g, ""))}
                  placeholder="65"
                />
              </div>
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
