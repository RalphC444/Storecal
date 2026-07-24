import { useState, useEffect, useCallback } from "react";
import { toast } from "../../components/Toast";
import { Icon } from "../../components/Icon";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { ConfirmDialog } from "../../components/ConfirmDialog";

// Admin CRM + cold outreach (superadmin). Prospects, pipeline, notes, CSV import,
// and one-off preview/send (dry-run by default) via Resend.
const STATUSES = ["new", "contacted", "replied", "interested", "not_interested", "customer", "bounced", "unsubscribed", "paused"];
const VERTICALS = ["beauty", "nails", "auto"];
const label = (s) => (s || "").replace(/_/g, " ");

export function AdminCRM() {
  const [stats, setStats] = useState(null);
  const [prospects, setProspects] = useState(null);
  const [filters, setFilters] = useState({ status: "", vertical: "", q: "", due: false });
  const [selectedId, setSelectedId] = useState(null);
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [running, setRunning] = useState(false);
  const [err, setErr] = useState("");

  const loadStats = useCallback(() => {
    fetch("/api/admin/crm/stats").then((r) => r.json()).then(setStats).catch(() => {});
  }, []);
  const loadProspects = useCallback(() => {
    const p = new URLSearchParams();
    if (filters.due) p.set("due", "1");
    else if (filters.status) p.set("status", filters.status);
    if (filters.vertical) p.set("vertical", filters.vertical);
    if (filters.q) p.set("q", filters.q);
    setProspects(null);
    fetch(`/api/admin/crm/prospects?${p}`).then((r) => r.json())
      .then((d) => Array.isArray(d) ? setProspects(d) : setErr(d.error || "Could not load"))
      .catch(() => setErr("Could not load prospects"));
  }, [filters]);
  useEffect(() => { loadStats(); }, [loadStats]);
  useEffect(() => { loadProspects(); }, [loadProspects]);
  const reload = () => { loadStats(); loadProspects(); };

  if (selectedId) {
    return <CrmDetail id={selectedId} onBack={() => { setSelectedId(null); reload(); }} onChanged={reload} />;
  }

  const tiles = stats ? [
    { l: "Prospects", v: stats.total },
    { l: "With email", v: stats.withEmail, sub: `${stats.total ? Math.round((stats.withEmail / stats.total) * 100) : 0}% reachable` },
    { l: "Due now", v: stats.due || 0, sub: "ready for a touch" },
    { l: "Contacted", v: stats.byStatus?.contacted || 0 },
    { l: "Interested", v: stats.byStatus?.interested || 0 },
    { l: "Emails sent", v: stats.sent },
  ] : [];

  return (
    <>
      <div className="adminconsole__titlerow">
        <div>
          <h1 className="adminconsole__title">Outreach CRM</h1>
          <p className="adminconsole__sub">Prospect pipeline + cold email. Sending is a dry run unless you confirm a live send.</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="action" onClick={() => setRunning(true)}>Run sequence…</button>
          <button className="action" onClick={() => setImporting(true)}>Import CSV</button>
          <button className="btn" onClick={() => setAdding(true)}>+ Add prospect</button>
        </div>
      </div>

      {err && <p className="form__error">{err}</p>}
      {stats && (
        <div className="adminconsole__summary">
          {tiles.map((t) => (
            <div className="adminconsole__sumtile" key={t.l}>
              <span className="adminconsole__sumlabel">{t.l}</span><b>{t.v}</b>
              {t.sub && <span className="adminconsole__sumsub">{t.sub}</span>}
            </div>
          ))}
        </div>
      )}

      <div className="crm__toolbar">
        <input className="clients-search" placeholder="Search name, email, city, phone…"
          value={filters.q} onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))} />
        <select className="calendar__filter" value={filters.vertical} onChange={(e) => setFilters((f) => ({ ...f, vertical: e.target.value }))}>
          <option value="">All verticals</option>
          {VERTICALS.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
        <select className="calendar__filter" value={filters.status} disabled={filters.due} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}>
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}
        </select>
        <button className={"action" + (filters.due ? " action--on" : "")} onClick={() => setFilters((f) => ({ ...f, due: !f.due }))}>
          Due now{stats?.due ? ` (${stats.due})` : ""}
        </button>
      </div>

      {!prospects ? <LoadingSpinner />
        : prospects.length === 0 ? <p className="empty">No prospects match.</p>
        : (
          <div className="adminconsole__tablewrap">
            <table className="adminconsole__table adminconsole__table--rows">
              <thead>
                <tr><th>Business</th><th>Vertical</th><th>Status</th><th>Email</th><th>Phone</th><th>Location</th><th aria-label="Open"></th></tr>
              </thead>
              <tbody>
                {prospects.map((p) => (
                  <tr key={p._id} className="adminconsole__row" onClick={() => setSelectedId(p._id)}>
                    <td><div className="adminconsole__name">{p.businessName}</div></td>
                    <td>{p.vertical || "—"}</td>
                    <td><span className="actbadge">{label(p.status)}</span></td>
                    <td className={p.email ? "" : "adminconsole__dim"}>{p.email || "no email"}</td>
                    <td className={p.phone ? "adminconsole__phone" : "adminconsole__dim"}>{p.phone || "—"}</td>
                    <td>{[p.city, p.state].filter(Boolean).join(", ")}</td>
                    <td className="adminconsole__chevron"><Icon name="chevronRight" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      <p className="crm__count">{prospects ? `${prospects.length} shown` : ""}</p>

      {adding && <AddProspectModal onClose={() => setAdding(false)} onDone={() => { setAdding(false); reload(); }} />}
      {importing && <ImportModal onClose={() => setImporting(false)} onDone={() => { setImporting(false); reload(); }} />}
      {running && <RunModal onClose={() => setRunning(false)} onDone={reload} />}
    </>
  );
}

// The sequence engine, driven from the UI: preview who's due (dry run), then
// optionally send the batch live (respects the server's daily cap).
function RunModal({ onClose, onDone }) {
  const [vertical, setVertical] = useState("");
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [confirmLive, setConfirmLive] = useState(false);
  const [err, setErr] = useState("");

  const run = useCallback(async (dryRun) => {
    setErr(""); setBusy(true); setConfirmLive(false);
    const res = await fetch("/api/admin/crm/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dryRun, vertical: vertical || undefined }) });
    const d = await res.json().catch(() => ({})); setBusy(false);
    if (res.ok) { setData(d); if (!dryRun) { toast(`Sent ${d.counts.ok}, failed ${d.counts.failed}, skipped ${d.counts.skipped}`); onDone?.(); } }
    else setErr(d.error || "Run failed");
  }, [vertical, onDone]);
  useEffect(() => { run(true); }, [run]);

  return (
    <div className="modal" onMouseDown={onClose}>
      <div className="modal__panel modal__panel--wide" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal__head"><h2 className="modal__title">Run outreach sequence</h2><button className="modal__x" onClick={onClose} aria-label="Close">✕</button></div>
        <div className="form">
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <select className="calendar__filter" value={vertical} onChange={(e) => setVertical(e.target.value)} disabled={busy}>
              <option value="">All verticals</option>
              {VERTICALS.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
            <button className="action" onClick={() => run(true)} disabled={busy}>Preview (dry run)</button>
            <button className="btn" onClick={() => setConfirmLive(true)} disabled={busy || !data || data.dueCount === 0}>Send all due (live)</button>
          </div>
          {err && <p className="form__error">{err}</p>}
          {busy && <LoadingSpinner />}
          {data && !busy && (
            <>
              <p className="panel__hint" style={{ marginTop: 12 }}>
                {data.dryRun ? "Dry run — nothing sent. " : "Done. "}
                {data.dueCount} due · {data.counts.ok} {data.dryRun ? "would send" : "sent"} · {data.counts.failed} failed · {data.counts.skipped} skipped.
                {" "}Sent today: {data.sentToday}/{data.dailyCap}.
              </p>
              <div className="adminconsole__tablewrap" style={{ maxHeight: "42vh", overflowY: "auto" }}>
                <table className="adminconsole__table adminconsole__table--rows">
                  <thead><tr><th>Business</th><th>Step</th><th>To</th><th>Result</th></tr></thead>
                  <tbody>
                    {data.results.map((r, i) => (
                      <tr key={i}>
                        <td>{r.business}</td><td>{r.step}</td>
                        <td className={r.to ? "" : "adminconsole__dim"}>{r.to || "—"}</td>
                        <td>{r.status}{r.error ? ` — ${r.error}` : ""}</td>
                      </tr>
                    ))}
                    {data.results.length === 0 && <tr><td colSpan={4} className="adminconsole__dim">Nobody is due right now.</td></tr>}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
      {confirmLive && (
        <ConfirmDialog
          title="Send the whole due batch live?"
          message={`This sends the next sequence step to ${data?.dueCount || 0} due prospect(s) via Resend now (up to the ${data?.dailyCap || 40}/day cap). Make sure the physical mailing address in the template is set (CAN-SPAM).`}
          confirmLabel="Send batch"
          onCancel={() => setConfirmLive(false)}
          onConfirm={() => run(false)}
        />
      )}
    </div>
  );
}

function CrmDetail({ id, onBack, onChanged }) {
  const [p, setP] = useState(null);
  const [notes, setNotes] = useState("");
  const [note, setNote] = useState("");
  const [preview, setPreview] = useState(null);
  const [confirmSend, setConfirmSend] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(() => {
    fetch(`/api/admin/crm/prospects/${id}`).then((r) => r.json())
      .then((d) => { setP(d); setNotes(d.notes || ""); }).catch(() => setErr("Could not load"));
  }, [id]);
  useEffect(() => { load(); }, [load]);

  if (!p) return <LoadingSpinner />;

  const patch = async (body, msg) => {
    const res = await fetch(`/api/admin/crm/prospects/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (res.ok) { toast(msg || "Saved"); load(); onChanged?.(); } else setErr("Could not save");
  };
  const addNote = async () => {
    if (!note.trim()) return;
    await fetch(`/api/admin/crm/prospects/${id}/note`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: note.trim() }) });
    setNote(""); toast("Note added"); load();
  };
  const doPreview = async () => {
    setErr(""); setBusy(true);
    const res = await fetch(`/api/admin/crm/prospects/${id}/send`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dryRun: true }) });
    const d = await res.json(); setBusy(false);
    if (res.ok) setPreview(d); else setErr(d.error || "Could not render");
  };
  const doSend = async () => {
    setConfirmSend(false); setErr(""); setBusy(true);
    const res = await fetch(`/api/admin/crm/prospects/${id}/send`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dryRun: false }) });
    const d = await res.json(); setBusy(false);
    if (res.ok) { toast(`Sent to ${d.to}`); setPreview(null); load(); onChanged?.(); }
    else setErr(d.error || "Send failed");
  };
  const suppress = async () => {
    await fetch("/api/admin/crm/suppress", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: p.email }) });
    toast("Suppressed — will not be contacted"); load(); onChanged?.();
  };

  const loc = [p.address, p.city, p.state].filter(Boolean).join(", ");
  return (
    <div className="acd">
      <button className="linklike clientdetail__back" onClick={onBack}>← All prospects</button>
      <div className="clientdetail__head">
        <div>
          <h1 className="clientdetail__name">{p.businessName}</h1>
          <span className="clientdetail__meta">{p.vertical || "—"} · {loc || "no location"}</span>
        </div>
        <span className="actbadge">{label(p.status)}</span>
      </div>
      {err && <p className="form__error">{err}</p>}

      <div className="settings__content" style={{ maxWidth: 680 }}>
        <section className="settings__card">
          <div className="settings__cardhead"><h3 className="settings__cardtitle">Contact</h3></div>
          <div className="acd__deflist">
            <div className="acd__row"><span className="acd__row-l">Email</span><span className="acd__row-v">{p.email || "—"}</span></div>
            <div className="acd__row"><span className="acd__row-l">Phone</span><span className="acd__row-v">{p.phone || "—"}</span></div>
            <div className="acd__row"><span className="acd__row-l">Website</span><span className="acd__row-v">{p.website || "—"}</span></div>
            <div className="acd__row"><span className="acd__row-l">Source</span><span className="acd__row-v">{p.source || "—"}</span></div>
          </div>
        </section>

        <section className="settings__card">
          <div className="settings__cardhead"><h3 className="settings__cardtitle">Pipeline</h3></div>
          <div className="acd__deflist" style={{ marginBottom: 12 }}>
            <div className="acd__row"><span className="acd__row-l">Sequence</span><span className="acd__row-v">step {p.sequenceStep || 0} / 3</span></div>
            <div className="acd__row"><span className="acd__row-l">Next touch</span><span className="acd__row-v">{p.nextActionAt ? new Date(p.nextActionAt).toLocaleDateString() : ((p.sequenceStep || 0) >= 3 ? "sequence complete" : "ready now")}</span></div>
          </div>
          <label className="field"><span className="field__label">Status</span>
            <select value={p.status} onChange={(e) => patch({ status: e.target.value }, "Status updated")}>
              {STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}
            </select>
          </label>
          <label className="field" style={{ marginTop: 12 }}><span className="field__label">Notes</span>
            <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => notes !== (p.notes || "") && patch({ notes }, "Notes saved")} placeholder="Private notes…" />
          </label>
        </section>

        <section className="settings__card">
          <div className="settings__cardhead">
            <h3 className="settings__cardtitle">Outreach email</h3>
            <p className="settings__carddesc">Sends step {Math.min((p.sequenceStep || 0) + 1, 3)} of 3 for the {p.vertical || "—"} sequence, then schedules the next follow-up. Preview first; a live send goes out via Resend with reply-to storecal.support@gmail.com.</p>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="action" onClick={doPreview} disabled={busy}>Preview email</button>
            <button className="btn" onClick={() => setConfirmSend(true)} disabled={busy || !p.email}>Send now (live)</button>
            {p.email && <button className="action action--danger" onClick={suppress}>Suppress</button>}
          </div>
          {!p.email && <p className="panel__hint" style={{ marginTop: 8 }}>No email on file — add one (or use the phone number) before sending.</p>}
          {preview && (
            <div className="crm__preview">
              <div className="crm__preview-to">To: {preview.to || "(no email)"} · <b>{preview.subject}</b></div>
              <pre className="crm__preview-body">{preview.body}</pre>
            </div>
          )}
        </section>

        <section className="settings__card">
          <div className="settings__cardhead"><h3 className="settings__cardtitle">Log a call / note</h3></div>
          <div className="invite__row">
            <input className="invite__link" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. called, left voicemail" />
            <button className="btn" onClick={addNote}>Add</button>
          </div>
          {(p.activities?.length > 0 || p.emails?.length > 0) && (
            <div className="crm__history">
              {[...(p.emails || []).map((e) => ({ t: e.createdAt, k: e.status === "sent" ? "email sent" : e.status, d: e.subject })),
                ...(p.activities || []).map((a) => ({ t: a.createdAt, k: a.type.replace(/_/g, " "), d: a.detail }))]
                .sort((a, b) => new Date(a.t) - new Date(b.t))
                .map((row, i) => (
                  <div className="crm__hist-row" key={i}>
                    <span className="crm__hist-k">{row.k}</span>
                    <span className="crm__hist-d">{row.d}</span>
                    <span className="crm__hist-t">{row.t ? new Date(row.t).toLocaleDateString() : ""}</span>
                  </div>
                ))}
            </div>
          )}
        </section>
      </div>

      {confirmSend && (
        <ConfirmDialog
          title={`Send a live email to ${p.businessName}?`}
          message={`This sends the step-1 outreach email to ${p.email} right now via Resend. Make sure the physical mailing address in the template is set (CAN-SPAM).`}
          confirmLabel="Send it"
          onCancel={() => setConfirmSend(false)}
          onConfirm={doSend}
        />
      )}
    </div>
  );
}

function AddProspectModal({ onClose, onDone }) {
  const [form, setForm] = useState({ businessName: "", vertical: "beauty", contactName: "", email: "", phone: "", website: "", city: "", state: "NY" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  async function submit(e) {
    e.preventDefault(); setErr("");
    if (!form.businessName.trim()) { setErr("Business name is required"); return; }
    setBusy(true);
    const res = await fetch("/api/admin/crm/prospects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    const d = await res.json().catch(() => ({})); setBusy(false);
    if (res.ok) { toast("Prospect added"); onDone(); } else setErr(d.error || "Could not add");
  }
  return (
    <div className="modal" onMouseDown={onClose}>
      <div className="modal__panel" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal__head"><h2 className="modal__title">Add prospect</h2><button className="modal__x" onClick={onClose} aria-label="Close">✕</button></div>
        <form className="form" onSubmit={submit}>
          <label className="field"><span className="field__label">Business name</span>
            <input value={form.businessName} onChange={(e) => set("businessName", e.target.value)} required /></label>
          <div className="form__row form__row--2">
            <label className="field"><span className="field__label">Vertical</span>
              <select value={form.vertical} onChange={(e) => set("vertical", e.target.value)}>{VERTICALS.map((v) => <option key={v} value={v}>{v}</option>)}</select></label>
            <label className="field"><span className="field__label">Contact name</span>
              <input value={form.contactName} onChange={(e) => set("contactName", e.target.value)} /></label>
          </div>
          <div className="form__row form__row--2">
            <label className="field"><span className="field__label">Email</span>
              <input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} /></label>
            <label className="field"><span className="field__label">Phone</span>
              <input value={form.phone} onChange={(e) => set("phone", e.target.value)} /></label>
          </div>
          <div className="form__row form__row--2">
            <label className="field"><span className="field__label">City</span>
              <input value={form.city} onChange={(e) => set("city", e.target.value)} /></label>
            <label className="field"><span className="field__label">State</span>
              <input value={form.state} onChange={(e) => set("state", e.target.value)} /></label>
          </div>
          {err && <p className="form__error">{err}</p>}
          <div className="form__actions">
            <button type="button" className="action" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn" disabled={busy}>{busy ? "Adding…" : "Add prospect"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ImportModal({ onClose, onDone }) {
  const [csv, setCsv] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function submit() {
    setErr(""); setBusy(true);
    const res = await fetch("/api/admin/crm/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ csv }) });
    const d = await res.json().catch(() => ({})); setBusy(false);
    if (res.ok) { toast(`Imported: ${d.added} new, ${d.updated} updated, ${d.skipped} skipped`); onDone(); }
    else setErr(d.error || "Import failed");
  }
  return (
    <div className="modal" onMouseDown={onClose}>
      <div className="modal__panel modal__panel--wide" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal__head"><h2 className="modal__title">Import prospects (CSV)</h2><button className="modal__x" onClick={onClose} aria-label="Close">✕</button></div>
        <div className="form">
          <p className="panel__hint">Paste CSV with a header row. Recognized columns: <code>business_name</code> (required), vertical, contact_name, email, phone, website, address, city, state, source. Existing prospects (matched by name + city) only get blank fields filled — nothing is overwritten.</p>
          <textarea rows={10} value={csv} onChange={(e) => setCsv(e.target.value)} placeholder={"business_name,vertical,email,phone,city,state\nBloom Nail Studio,nails,hi@bloom.com,(914) 555-0100,Yonkers,NY"} style={{ fontFamily: "ui-monospace, Menlo, monospace", fontSize: "0.8rem" }} />
          {err && <p className="form__error">{err}</p>}
          <div className="form__actions">
            <button type="button" className="action" onClick={onClose}>Cancel</button>
            <button className="btn" onClick={submit} disabled={busy || !csv.trim()}>{busy ? "Importing…" : "Import"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
