import { useState, useEffect, useCallback, useRef } from "react";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { Icon } from "../../components/Icon";
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
  const [importing, setImporting] = useState(false);
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
      className={`clienttable__th${num ? " clienttable__num" : ""}${sort.key === k ? " clienttable__th--on" : ""}`}
      onClick={() => setSort(s => ({ key: k, dir: s.key === k ? -s.dir : 1 }))}
    >
      {label}<span className="clienttable__arrow">{sort.key === k ? (sort.dir > 0 ? " ↑" : " ↓") : ""}</span>
    </th>
  );

  return (
    <div className="pageview">
      <div className="pageview__head">
        <h1 className="pageview__title">
          Customers
          {!loading && <span className="pageview__count">{clients.length}</span>}
        </h1>
        <div className="pageview__actions">
          <button className="action" onClick={() => setImporting(true)}>Import</button>
          <button className="btn btn--new" onClick={() => setAdding(true)}>+ Add customer</button>
        </div>
      </div>
      <div className={`pageview__body${isMobile ? "" : " pageview__body--flush"}`}>
        {(clients.length > 0 || q) && (
          <div className="clients-toolbar">
            <input
              className="clients-search"
              type="search"
              placeholder="Search name, phone, or email"
              value={q}
              onChange={e => setQ(e.target.value)}
            />
          </div>
        )}
        {loading && clients.length === 0 ? (
          <LoadingSpinner />
        ) : !loading && clients.length === 0 ? (
          q ? (
            <div className="clients-empty">
              <span className="clients-empty__icon"><Icon name="clients" /></span>
              <h2 className="clients-empty__title">No matches</h2>
              <p className="clients-empty__text">Nothing matched “{q}”. Try a different name, phone, or email.</p>
              <button className="action" onClick={() => setQ("")}>Clear search</button>
            </div>
          ) : (
            <div className="clients-empty">
              <span className="clients-empty__icon"><Icon name="clients" /></span>
              <h2 className="clients-empty__title">No customers yet</h2>
              <p className="clients-empty__text">
                Every booking adds a customer here automatically — with their name, phone, email, and
                visit history. When someone books online or you add an appointment, they’ll show up here.
              </p>
              <div className="clients-empty__actions">
                <button className="btn" onClick={() => setAdding(true)}>+ Add a customer</button>
                <button className="action" onClick={() => setImporting(true)}>Import from a spreadsheet</button>
              </div>
              <p className="clients-empty__hint">Already have a customer list? Import an Excel or CSV file — or share your booking link (Settings → Booking) so customers book themselves.</p>
            </div>
          )
        ) : isMobile ? (
          <div className="ccardlist">
            {sorted.map(c => (
              <button key={c._id} className="ccardm" onClick={() => setSelectedId(c._id)}>
                <span className="avatarpic">{(c.name || "?").slice(0, 1).toUpperCase()}</span>
                <span className="ccardm__body">
                  <span className="ccardm__name">{c.name || "—"}</span>
                  {c.phone && <span className="ccardm__line">{c.phone}</span>}
                  {c.email && <span className="ccardm__line">{c.email}</span>}
                  <span className="ccardm__meta">
                    <span>Last visit: {c.lastVisit ? fmtShort(c.lastVisit) : "None yet"}</span>
                    <span>Next appt: {c.nextVisit ? <b className="clienttable__next">{fmtShort(c.nextVisit)}</b> : "None booked"}</span>
                  </span>
                </span>
                <span className="ccardm__view">View →</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="clienttable__wrap">
            <table className="ctable">
              <thead>
                <tr>
                  <Th k="name" label="Client" />
                  <th className="clienttable__th">Phone</th>
                  <th className="clienttable__th">Email</th>
                  <Th k="lastVisit" label="Last visit" />
                  <Th k="nextVisit" label="Next visit" />
                </tr>
              </thead>
              <tbody>
                {sorted.map(c => (
                  <tr key={c._id} className="clienttable__row" onClick={() => setSelectedId(c._id)}>
                    <td className="clienttable__client">
                      <span className="avatarpic avatarpic--sm">{(c.name || "?").slice(0, 1).toUpperCase()}</span>
                      <span className="clienttable__name">{c.name || "—"}</span>
                    </td>
                    <td className="clienttable__contact">{c.phone || <span className="clienttable__dim">—</span>}</td>
                    <td className="clienttable__contact">{c.email || <span className="clienttable__dim">—</span>}</td>
                    <td>{c.lastVisit ? fmtShort(c.lastVisit) : <span className="clienttable__dim">—</span>}</td>
                    <td>{c.nextVisit ? <span className="clienttable__next">{fmtShort(c.nextVisit)}</span> : <span className="clienttable__dim">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {adding && <ClientForm onClose={() => setAdding(false)} onSave={createClient} />}
      {importing && <ImportCustomers onClose={() => setImporting(false)} onDone={() => { setImporting(false); load(); }} />}
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
          <h2 className="modal__title">Add customer</h2>
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
            <button type="submit" className="btn" disabled={saving}>{saving ? "Saving…" : "Add customer"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Import customers from an Excel (.xlsx/.xls) or CSV file. Parses in the browser
// with SheetJS (lazy-loaded so it stays out of the main bundle), auto-detects
// the Name / Phone / Email / Notes columns, shows a preview, then bulk-posts the
// cleaned rows to /api/clients/import (which dedupes by phone/email).
const HEADER_ALIASES = {
  name: ["name", "full name", "fullname", "customer", "customer name", "client", "client name", "contact", "contact name"],
  firstName: ["first name", "firstname", "first", "given name"],
  lastName: ["last name", "lastname", "last", "surname", "family name"],
  phone: ["phone", "phone number", "phonenumber", "mobile", "mobile number", "cell", "cell phone", "telephone", "tel", "contact number"],
  email: ["email", "e-mail", "email address", "e-mail address", "mail"],
  notes: ["notes", "note", "comments", "comment", "remarks", "memo"],
};

function detectColumns(headerRow) {
  const map = {};
  headerRow.forEach((cell, i) => {
    const h = String(cell || "").trim().toLowerCase();
    if (!h) return;
    for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
      if (map[field] === undefined && aliases.includes(h)) { map[field] = i; break; }
    }
  });
  return map;
}
const looksLikeHeader = (map) => Object.keys(map).length > 0;

function rowsFromSheet(aoa) {
  // Drop fully-empty rows.
  const grid = aoa.filter((r) => r.some((c) => String(c ?? "").trim() !== ""));
  if (!grid.length) return { rows: [], detected: null };

  const map = detectColumns(grid[0]);
  let detected, dataRows;
  if (looksLikeHeader(map)) {
    detected = map;
    dataRows = grid.slice(1);
  } else {
    // No recognizable header → assume Name, Phone, Email, Notes by position.
    detected = { name: 0, phone: 1, email: 2, notes: 3 };
    dataRows = grid;
  }
  const at = (row, i) => (i === undefined ? "" : String(row[i] ?? "").trim());
  const rows = dataRows.map((r) => {
    let name = at(r, detected.name);
    if (!name && (detected.firstName !== undefined || detected.lastName !== undefined)) {
      name = `${at(r, detected.firstName)} ${at(r, detected.lastName)}`.trim();
    }
    return { name, phone: at(r, detected.phone), email: at(r, detected.email), notes: at(r, detected.notes) };
  }).filter((x) => x.name || x.phone || x.email);
  return { rows, detected };
}

export function ImportCustomers({ onClose, onDone }) {
  const [fileName, setFileName] = useState("");
  const [parsing, setParsing] = useState(false);
  const [rows, setRows] = useState(null);
  const [detected, setDetected] = useState(null);
  const [error, setError] = useState("");
  const [importing, setImp] = useState(false);
  const [result, setResult] = useState(null);

  async function onFile(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setError(""); setRows(null); setResult(null); setFileName(file.name); setParsing(true);
    try {
      const XLSX = await import("xlsx");
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      if (!ws) throw new Error("That file has no sheets.");
      const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: "" });
      const { rows: parsed, detected: det } = rowsFromSheet(aoa);
      if (!parsed.length) throw new Error("No customers found. Make sure the file has a Name, Phone, or Email column.");
      setRows(parsed); setDetected(det);
    } catch (err) {
      setError(err.message || "Couldn't read that file.");
    } finally {
      setParsing(false);
    }
  }

  async function runImport() {
    setImp(true); setError("");
    try {
      const res = await fetch("/api/clients/import", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rows }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "Import failed");
      setResult(d);
    } catch (err) {
      setError(err.message);
    } finally {
      setImp(false);
    }
  }

  const detectedLabel = detected
    ? ["name", "phone", "email", "notes"].filter((f) => detected[f] !== undefined || (f === "name" && (detected.firstName !== undefined || detected.lastName !== undefined)))
        .map((f) => f[0].toUpperCase() + f.slice(1)).join(" · ")
    : "";
  const preview = rows ? rows.slice(0, 5) : [];

  return (
    <div className="modal" onMouseDown={onClose}>
      <div className="modal__panel" onMouseDown={e => e.stopPropagation()}>
        <div className="modal__head">
          <h2 className="modal__title">Import customers</h2>
          <button className="modal__x" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {result ? (
          <div className="form">
            <div className="import__done">
              <span className="clients-empty__icon"><Icon name="clients" /></span>
              <h3 className="import__done-title">Import complete</h3>
              <p className="import__done-text">
                <b>{result.added}</b> added{result.merged ? <>, <b>{result.merged}</b> matched an existing customer</> : null}
                {result.skipped ? <>, <b>{result.skipped}</b> skipped (no name, phone, or email)</> : null}.
              </p>
            </div>
            <div className="form__actions">
              <button className="btn" onClick={onDone}>Done</button>
            </div>
          </div>
        ) : (
          <div className="form">
            <p className="panel__hint" style={{ marginTop: 0 }}>
              Upload an Excel (<code>.xlsx</code>) or CSV file. We’ll look for <b>Name</b>, <b>Phone</b>, <b>Email</b>, and <b>Notes</b> columns
              (a header row is recommended). Customers already on file are matched by phone or email — no duplicates.
            </p>

            <label className="import__drop">
              <input type="file" accept=".xlsx,.xls,.csv" onChange={onFile} hidden />
              <span className="import__drop-main">{fileName || "Choose a spreadsheet…"}</span>
              <span className="import__drop-sub">{parsing ? "Reading…" : ".xlsx, .xls, or .csv"}</span>
            </label>

            {error && <p className="form__error">{error}</p>}

            {rows && (
              <>
                <p className="import__summary">
                  Found <b>{rows.length}</b> customer{rows.length === 1 ? "" : "s"}
                  {detectedLabel && <> · columns: {detectedLabel}</>}
                </p>
                <div className="import__preview">
                  <table className="ctable">
                    <thead><tr><th>Name</th><th>Phone</th><th>Email</th></tr></thead>
                    <tbody>
                      {preview.map((r, i) => (
                        <tr key={i}>
                          <td>{r.name || <span className="clienttable__dim">—</span>}</td>
                          <td>{r.phone || <span className="clienttable__dim">—</span>}</td>
                          <td>{r.email || <span className="clienttable__dim">—</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {rows.length > preview.length && <p className="import__more">+ {rows.length - preview.length} more…</p>}
                </div>
              </>
            )}

            <div className="form__actions">
              <button type="button" className="action" onClick={onClose}>Cancel</button>
              <button type="button" className="btn" disabled={!rows || importing} onClick={runImport}>
                {importing ? "Importing…" : rows ? `Import ${rows.length} customer${rows.length === 1 ? "" : "s"}` : "Import"}
              </button>
            </div>
          </div>
        )}
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
    if (!window.confirm(`Delete ${data.name || "this customer"}? Their profile is removed; past appointments are kept.`)) return;
    const res = await fetch(`/api/clients/${clientId}`, { method: "DELETE" });
    if (!res.ok) { const { error } = await res.json().catch(() => ({})); setDelErr(error || "Could not delete client"); return; }
    onApptSaved?.(); onDeleted?.();
  }

  if (!data) return <div className="pageview"><div className="pageview__body"><LoadingSpinner /></div></div>;

  const dirty = notes !== savedNotes;
  const newForClient = () => setEditing({
    dateKey: todayKey(),
    client: { name: data.name, phone: data.phone, email: data.email },
  });

  return (
    <div className="pageview">
      <div className="pageview__head pageview__head--bar">
        <button className="backlink" onClick={onBack}>← All customers</button>
        <button className="btn" onClick={newForClient}>+ New appointment</button>
      </div>
      <div className="pageview__body">
        <div className="panel__hero">
          <span className="avatarpic avatarpic--lg">{(data.name || "?").slice(0, 1).toUpperCase()}</span>
          <div className="panel__hero-main">
            <h1 className="panel__name">{data.name || "—"}</h1>
            <div className="profile__contact">
              {data.phone && <a href={`tel:${data.phone}`}>{data.phone}</a>}
              {data.email && <a href={`mailto:${data.email}`}>{data.email}</a>}
              {!data.phone && !data.email && <span className="clienttable__dim">No contact on file</span>}
            </div>
          </div>
        </div>

        <section className="panel__block">
          <h3 className="schedule__label">Notes</h3>
          <textarea
            className="profile__notes"
            rows={3}
            placeholder="Preferences, formulas, allergies, anything to remember…"
            value={notes}
            onChange={e => setNotes(e.target.value)}
          />
          <div className="schedule__save">
            <button className="btn" onClick={saveNotes} disabled={!dirty || saving}>
              {saving ? "Saving…" : "Save notes"}
            </button>
            {!dirty && savedNotes && <span className="schedule__msg">Saved</span>}
          </div>
        </section>

        <section className="panel__block">
          <h3 className="schedule__label">Appointments · {data.history.length}</h3>
          {data.history.length === 0
            ? <p className="empty empty--sm">No appointments yet. Use “New appointment” to book one.</p>
            : (
              <div className="appointmentlist">
                {data.history.map(h => {
                  const eff = effStatus(h, durationOf);
                  return (
                    <button key={h._id} className="appointmentlist__row" onClick={() => setEditing(h)}>
                      <span className="appointmentlist__when">
                        <span className="appointmentlist__date">{fmtShort(h.dateKey)}</span>
                        <span className="appointmentlist__time">{fmtTime(h.timeValue)}</span>
                      </span>
                      <span className="appointmentlist__main">
                        <span className="appointmentlist__svc">{h.service || "Appointment"}</span>
                        {h.providerName && <span className="appointmentlist__prov">{h.providerName}</span>}
                      </span>
                      <span className={`pill pill--${eff}`}>{STATUS_LABEL[eff]}</span>
                    </button>
                  );
                })}
              </div>
            )
          }
        </section>

        <section className="panel__block">
          {delErr && <p className="form__error">{delErr}</p>}
          <button className="action action--danger" onClick={deleteClient}>Delete customer</button>
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

