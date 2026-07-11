import { useState, useEffect, useCallback } from "react";
import { toast, ToastHost } from "../../components/Toast";
import { Icon } from "../../components/Icon";
import { BrandLogo } from "../../components/BrandLogo";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { Toggle } from "../../components/Toggle";

// ── Platform operator console ────────────────────────────────────────────────
// A simplified admin view (not a store view) for managing clients: change each
// shop's plan and booking access. Super-admin only.
// Booking control maps to (bookingActive, demo). Shared by the table + detail.
const bookingValueOf = (s) =>
  s.freeForLife ? "free"
  : s.bookingActive === true ? "on"
  : s.bookingActive === false ? "off"
  : s.demo ? "demo" : "auto";
// Each mode clears the others so they never conflict. "free" = comped for life:
// booking always on and all payment UI hidden in the client's owner app.
const bookingPatchFor = (v) =>
  v === "free" ? { freeForLife: true, bookingActive: null, demo: false }
  : v === "on" ? { freeForLife: false, bookingActive: true }
  : v === "off" ? { freeForLife: false, bookingActive: false }
  : v === "demo" ? { freeForLife: false, bookingActive: null, demo: true }
  : { freeForLife: false, bookingActive: null, demo: false };
const BOOKING_LABEL = { demo: "Demo", auto: "Auto", on: "On", off: "Off — call us", free: "Free for life" };
const planLabelOf = (s) => s.planId === "website" ? "$99 · Website + Booking" : "$35 · Booking";
const fmtRenewDate = (ms) => ms ? new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : null;

export function AdminConsole({ user, onSignOut }) {
  const [shops, setShops] = useState(null);
  const [savingId, setSavingId] = useState(null);
  const [err, setErr] = useState("");
  const [adding, setAdding] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [delShop, setDelShop] = useState(null); // shop pending deletion

  const load = useCallback(() => {
    fetch("/api/admin/shops").then(r => r.json())
      .then(d => Array.isArray(d) ? setShops(d) : setErr(d.error || "Could not load clients"))
      .catch(() => setErr("Could not load clients"));
  }, []);
  useEffect(() => { load(); }, [load]);

  async function patch(id, body, label) {
    setSavingId(id); setErr("");
    setShops(list => list.map(s => s._id === id ? { ...s, ...body } : s)); // optimistic
    const res = await fetch(`/api/admin/shops/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    setSavingId(null);
    if (res.ok) toast(label || "Saved");
    else { setErr("Could not save — refreshing"); load(); }
  }

  async function del(shop) {
    const res = await fetch(`/api/admin/shops/${shop._id}`, { method: "DELETE" });
    if (res.ok) { setShops(list => list.filter(s => s._id !== shop._id)); setSelectedId(null); toast("Client deleted"); }
    else setErr("Could not delete client");
  }

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const selected = shops && shops.find(s => s._id === selectedId);

  return (
    <div className="viewport">
      <ToastHost />
      <div className="adminconsole">
        <header className="adminconsole__head">
          <span className="adminconsole__brand"><span className="brand__mark"><BrandLogo /></span> StoreCal Admin</span>
          <span className="adminconsole__user">{user.email} · <button className="linklike" onClick={onSignOut}>Sign out</button></span>
        </header>
        <div className="adminconsole__body">
          {selected ? (
            <AdminClientDetail
              shop={selected} origin={origin} saving={savingId === selected._id}
              onPatch={(body, label) => patch(selected._id, body, label)}
              onDelete={() => setDelShop(selected)}
              onBack={() => setSelectedId(null)}
            />
          ) : (
            <>
              <div className="adminconsole__titlerow">
                <div>
                  <h1 className="adminconsole__title">Clients</h1>
                  <p className="adminconsole__sub">Select a client to manage their plan, booking access, contact, and embed.</p>
                </div>
                <button className="btn" onClick={() => setAdding(true)}>+ Add client</button>
              </div>
              {err && <p className="form__error">{err}</p>}
              {!shops ? <LoadingSpinner />
                : shops.length === 0 ? <p className="empty">No clients yet.</p>
                : (
                  <div className="adminconsole__tablewrap">
                    <table className="adminconsole__table adminconsole__table--rows">
                      <thead>
                        <tr><th>Business</th><th>Contact</th><th>Plan</th><th>Booking</th><th>Subscription</th><th aria-label="Open"></th></tr>
                      </thead>
                      <tbody>
                        {shops.map(s => (
                          <tr key={s._id} className="adminconsole__row" onClick={() => setSelectedId(s._id)}>
                            <td>
                              <div className="adminconsole__name">{s.name}</div>
                              <div className="adminconsole__meta">{s.businessType} · {s.services} svc · {s.staff} staff</div>
                            </td>
                            <td className="adminconsole__contact">
                              <span>{s.ownerEmail || <span className="adminconsole__dim">no email</span>}</span>
                              <span className={s.phone ? "adminconsole__phone" : "adminconsole__dim"}>{s.phone || "no phone"}</span>
                            </td>
                            <td>{planLabelOf(s)}</td>
                            <td>{BOOKING_LABEL[bookingValueOf(s)]}</td>
                            <td>
                              <span className={"adminconsole__badge" + (s.subscribed || s.freeForLife ? " adminconsole__badge--on" : "")}>{s.freeForLife ? "Free for life" : s.subscribed ? "Subscribed" : "Not subscribed"}</span>
                              {s.subscribed && fmtRenewDate(s.renewsAt) && <div className="adminconsole__renew">Renews {fmtRenewDate(s.renewsAt)}</div>}
                            </td>
                            <td className="adminconsole__chevron"><Icon name="chevronRight" /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
            </>
          )}
        </div>
      </div>
      {adding && <AddClientModal origin={origin} onClose={() => setAdding(false)} onDone={() => { setAdding(false); load(); }} />}
      {delShop && (
        <ConfirmDialog
          title={`Delete “${delShop.name}”?`}
          message="This permanently removes the client — their login, staff, services, appointments, and all booking data. This can’t be undone."
          confirmLabel="Delete client"
          onCancel={() => setDelShop(null)}
          onConfirm={async () => { await del(delShop); setDelShop(null); }}
        />
      )}
    </div>
  );
}

// Full CRM-style profile for one client (opened from the clients table).
function AdminClientDetail({ shop: s, origin, saving, onPatch, onDelete, onBack }) {
  const [phone, setPhone] = useState(s.phone || "");
  const [website, setWebsite] = useState(s.website || "");
  const [copied, setCopied] = useState("");
  const bookingUrl = `${origin}/book?key=${s.publicKey}`;
  const embedCode =
    `<!-- StoreCal booking widget -->\n<script src="${origin}/embed.js" data-store="${s.publicKey}"></script>\n` +
    `<!-- Live content (services, staff, gallery) -->\n<script src="${origin}/storecal-data.js" data-store="${s.publicKey}"></script>`;
  // Content-block containers to drop on the site — only the enabled sections.
  const contentBlocks = [
    '<div data-storecal="services"></div>',
    s.showStaff !== false ? '<div data-storecal="staff"></div>' : null,
    s.showGallery !== false ? '<div data-storecal="gallery"></div>' : null,
  ].filter(Boolean).join("\n");
  const copy = (t, id) => navigator.clipboard?.writeText(t).then(() => { setCopied(id); setTimeout(() => setCopied(""), 1500); }).catch(() => {});
  const saveContact = (field, val) => { if ((s[field] || "") !== val.trim()) onPatch({ [field]: val.trim() }, "Contact updated"); };

  return (
    <div className="acd">
      <button className="linklike clientdetail__back" onClick={onBack}>← All clients</button>
      <div className="clientdetail__head">
        <div>
          <h1 className="clientdetail__name">{s.name}</h1>
          <span className="clientdetail__meta">{s.businessType} · {s.services} services · {s.staff} staff · <code>{s.publicKey}</code></span>
        </div>
        <span className={"adminconsole__badge" + (s.subscribed || s.freeForLife ? " adminconsole__badge--on" : "")}>{s.freeForLife ? "Free for life" : s.subscribed ? "Subscribed" : "Not subscribed"}</span>
      </div>

      <div className="clientdetail__grid">
        <section className="clientdetail__card">
          <h3 className="schedule__label">Plan &amp; booking</h3>
          <label className="field"><span className="field__label">Plan</span>
            <select value={s.planId} disabled={saving} onChange={e => onPatch({ planId: e.target.value }, "Plan updated")}>
              <option value="booking">Booking access — $35/mo</option>
              <option value="website">Website + Booking — $99/mo</option>
            </select>
          </label>
          <label className="field"><span className="field__label">Booking access</span>
            <select value={bookingValueOf(s)} disabled={saving} onChange={e => onPatch(bookingPatchFor(e.target.value), "Booking updated")}>
              <option value="demo">Demo — on until delivered</option>
              <option value="auto">Auto — follows payment</option>
              <option value="on">On — always</option>
              <option value="off">Off — “Call us”</option>
              <option value="free">Free for life — comped (no billing)</option>
            </select>
          </label>
          <p className="panel__hint">{s.freeForLife
            ? "Comped for life — booking always on, and no payment or billing shows in their account."
            : s.subscribed
            ? (fmtRenewDate(s.renewsAt) ? `Subscription renews ${fmtRenewDate(s.renewsAt)}.` : "Subscription active.")
            : "No active subscription."}</p>
        </section>

        <section className="clientdetail__card">
          <h3 className="schedule__label">Contact</h3>
          <label className="field"><span className="field__label">Owner email (login)</span>
            <input type="email" value={s.ownerEmail || ""} readOnly disabled /></label>
          <label className="field"><span className="field__label">Phone</span>
            <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} onBlur={() => saveContact("phone", phone)} placeholder="(555) 000-0000" /></label>
          <label className="field"><span className="field__label">Website</span>
            <input type="url" value={website} onChange={e => setWebsite(e.target.value)} onBlur={() => saveContact("website", website)} placeholder="https://theirsite.com" /></label>
        </section>
      </div>

      <section className="clientdetail__card">
        <h3 className="schedule__label">Staff &amp; content</h3>
        <p className="panel__hint" style={{ marginTop: -4, marginBottom: 14 }}>Turn sections on or off for this client (e.g. auto shops usually have no staff or gallery). Off hides them in their dashboard and on their website.</p>
        <div className="clientdetail__toggles">
          <Toggle checked={s.showStaff !== false} disabled={saving} label="Staff / team"
            onChange={v => onPatch({ showStaff: v }, v ? "Staff enabled" : "Staff disabled")} />
          <Toggle checked={s.showGallery !== false} disabled={saving} label="Photo gallery"
            onChange={v => onPatch({ showGallery: v }, v ? "Gallery enabled" : "Gallery disabled")} />
          <Toggle checked={s.showStaffGalleries !== false} disabled={saving} label="Per-staff galleries"
            onChange={v => onPatch({ showStaffGalleries: v }, v ? "Staff galleries on" : "Staff galleries off")} />
        </div>
      </section>

      <section className="clientdetail__card">
        <h3 className="schedule__label">Links &amp; embed</h3>
        <p className="panel__hint">Hosted booking page:</p>
        <div className="invite__row">
          <input className="invite__link" readOnly value={bookingUrl} onFocus={e => e.target.select()} />
          <a className="action" href={bookingUrl} target="_blank" rel="noreferrer">Open</a>
          <button className="btn" onClick={() => copy(bookingUrl, "book")}>{copied === "book" ? "Copied!" : "Copy"}</button>
        </div>
        <p className="panel__hint" style={{ marginTop: 14 }}>1. Embed code (add once, before &lt;/body&gt;):</p>
        <pre className="adminconsole__code">{embedCode}</pre>
        <button className="btn" onClick={() => copy(embedCode, "emb")}>{copied === "emb" ? "Copied!" : "Copy code"}</button>
        <p className="panel__hint" style={{ marginTop: 16 }}>2. Content blocks (place where each section should appear):</p>
        <pre className="adminconsole__code">{contentBlocks}</pre>
        <button className="btn" onClick={() => copy(contentBlocks, "blocks")}>{copied === "blocks" ? "Copied!" : "Copy blocks"}</button>
      </section>

      <section className="clientdetail__danger">
        <div>
          <h3 className="schedule__label">Delete client</h3>
          <p className="panel__hint">Permanently removes this client and all its data.</p>
        </div>
        <button className="btn btn--danger" onClick={onDelete}>Delete client</button>
      </section>
    </div>
  );
}


// Create a new client from the admin console: shop + owner login (temp password).
function AddClientModal({ origin, onClose, onDone }) {
  const [form, setForm] = useState({ businessName: "", email: "", phone: "", website: "", businessType: "salon", planId: "booking" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [result, setResult] = useState(null); // { publicKey, ownerEmail, tempPassword, bookingUrl }
  const [copied, setCopied] = useState("");
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const embedCode = (key) => `<script src="${origin}/embed.js" data-store="${key}"></script>`;
  function copy(text, id) { navigator.clipboard?.writeText(text || "").then(() => { setCopied(id); setTimeout(() => setCopied(""), 1500); }).catch(() => {}); }

  async function submit(e) {
    e.preventDefault(); setErr("");
    if (!form.businessName.trim()) { setErr("Business name is required"); return; }
    if (!form.email.trim()) { setErr("Owner email is required"); return; }
    setBusy(true);
    const res = await fetch("/api/admin/shops", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
    });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setErr(d.error || "Could not create client"); return; }
    setResult(d); toast("Client created");
  }

  return (
    <div className="modal" onMouseDown={onClose}>
      <div className="modal__panel" onMouseDown={e => e.stopPropagation()}>
        <div className="modal__head">
          <h2 className="modal__title">{result ? "Client created" : "Add client"}</h2>
          <button className="modal__x" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {result ? (
          <div className="form">
            <p className="panel__hint">Share these sign-in details with the owner. They’ll be asked to set a new password on first login.</p>
            <div className="adminconsole__creds">
              <div><span className="adminconsole__cred-l">Sign in at</span><b>{origin}</b></div>
              <div><span className="adminconsole__cred-l">Email</span><b>{result.ownerEmail}</b></div>
              <div><span className="adminconsole__cred-l">Temp password</span><b>{result.tempPassword}</b></div>
            </div>
            <button className="btn" style={{ marginTop: 6 }} onClick={() => copy(`Sign in at ${origin}\nEmail: ${result.ownerEmail}\nTemporary password: ${result.tempPassword}`, "creds")}>
              {copied === "creds" ? "Copied!" : "Copy sign-in details"}
            </button>
            {result.bookingUrl && (<>
              <p className="panel__hint" style={{ marginTop: 16 }}>Hosted booking page:</p>
              <div className="invite__row">
                <input className="invite__link" readOnly value={result.bookingUrl} onFocus={e => e.target.select()} />
                <button className="btn" onClick={() => copy(result.bookingUrl, "book")}>{copied === "book" ? "Copied!" : "Copy"}</button>
              </div>
            </>)}
            <p className="panel__hint" style={{ marginTop: 16 }}>Embed code for their website:</p>
            <div className="invite__row">
              <input className="invite__link" readOnly value={embedCode(result.publicKey)} onFocus={e => e.target.select()} />
              <button className="btn" onClick={() => copy(embedCode(result.publicKey), "emb")}>{copied === "emb" ? "Copied!" : "Copy"}</button>
            </div>
            <div className="form__actions"><button className="btn" onClick={onDone}>Done</button></div>
          </div>
        ) : (
          <form className="form" onSubmit={submit}>
            <label className="field"><span className="field__label">Business name</span>
              <input type="text" value={form.businessName} onChange={e => set("businessName", e.target.value)} placeholder="e.g. Bloom Nail Studio" required /></label>
            <div className="form__row form__row--2">
              <label className="field"><span className="field__label">Owner email</span>
                <input type="email" value={form.email} onChange={e => set("email", e.target.value)} placeholder="owner@email.com" required /></label>
              <label className="field"><span className="field__label">Phone (optional)</span>
                <input type="tel" value={form.phone} onChange={e => set("phone", e.target.value)} placeholder="(555) 000-0000" /></label>
            </div>
            <label className="field"><span className="field__label">Website (optional)</span>
              <input type="url" value={form.website} onChange={e => set("website", e.target.value)} placeholder="https://theirsite.com" /></label>
            <div className="form__row form__row--2">
              <label className="field"><span className="field__label">Business type</span>
                <select value={form.businessType} onChange={e => set("businessType", e.target.value)}>
                  <option value="salon">Salon / Barber / Nails</option>
                  <option value="grooming">Pet grooming</option>
                  <option value="auto">Auto</option>
                  <option value="generic">Other</option>
                </select></label>
              <label className="field"><span className="field__label">Plan</span>
                <select value={form.planId} onChange={e => set("planId", e.target.value)}>
                  <option value="booking">Booking access — $35/mo</option>
                  <option value="website">Website + Booking — $99/mo</option>
                </select></label>
            </div>
            {err && <p className="form__error">{err}</p>}
            <div className="form__actions">
              <button type="button" className="action" onClick={onClose}>Cancel</button>
              <button type="submit" className="btn" disabled={busy}>{busy ? "Creating…" : "Create client"}</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
