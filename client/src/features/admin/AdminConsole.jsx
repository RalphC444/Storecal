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
const planLabelOf = (s) =>
  s.planId === "website" ? "$99 · Website + Booking"
  : s.planId === "booking-reduced" ? "$25 · Booking (reduced)"
  : "$35 · Booking";
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

  // Comp (or un-comp) the client's next invoice via Stripe. Hits Stripe, so
  // reload afterward to pull the fresh discount + renewal state.
  async function freeMonth(id, on) {
    setSavingId(id); setErr("");
    const res = await fetch(`/api/admin/shops/${id}/free-month`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ on }),
    });
    const d = await res.json().catch(() => ({}));
    setSavingId(null);
    if (res.ok) { toast(on ? "Next month comped" : "Free month removed"); load(); }
    else setErr(d.error || "Could not update the comp");
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
              onFreeMonth={(on) => freeMonth(selected._id, on)}
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
                              <div className="adminconsole__meta">{s.businessType} · {s.services} svc · {s.staff} staff · {s.appointments} appts</div>
                            </td>
                            <td className="adminconsole__contact">
                              <span>{s.ownerEmail || <span className="adminconsole__dim">no email</span>}</span>
                              <span className={s.phone ? "adminconsole__phone" : "adminconsole__dim"}>{s.phone || "no phone"}</span>
                            </td>
                            <td>{planLabelOf(s)}</td>
                            <td>{BOOKING_LABEL[bookingValueOf(s)]}</td>
                            <td>
                              <span className={"adminconsole__badge" + (s.subscribed || s.freeForLife ? " adminconsole__badge--on" : "")}>{s.freeForLife ? "Free for life" : s.subscribed ? "Subscribed" : "Not subscribed"}</span>
                              {s.subscribed && fmtRenewDate(s.renewsAt) && (
                                <div className="adminconsole__renew">
                                  {s.freeMonthActive ? "Next month free · " : ""}{s.freeMonthActive ? "then renews " : "Renews "}{fmtRenewDate(s.renewsAt)}
                                  {s.paymentsCompleted > 0 && <> · {s.paymentsCompleted} paid</>}
                                </div>
                              )}
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

// Section header + card, mirroring the owner Settings look so the in-org view
// reads like a settings page.
function AdCatHead({ title, desc }) {
  return (
    <header className="settings__cathead">
      <h2 className="settings__cattitle">{title}</h2>
      {desc && <p className="settings__catdesc">{desc}</p>}
    </header>
  );
}
function AdCard({ title, desc, children, className = "" }) {
  return (
    <section className={"settings__card " + className}>
      {(title || desc) && (
        <div className="settings__cardhead">
          {title && <h3 className="settings__cardtitle">{title}</h3>}
          {desc && <p className="settings__carddesc">{desc}</p>}
        </div>
      )}
      <div className="settings__cardbody">{children}</div>
    </section>
  );
}
function AdRow({ label, children }) {
  return <div className="acd__row"><span className="acd__row-l">{label}</span><span className="acd__row-v">{children}</span></div>;
}

// One client, managed like a settings page: a category rail on the left and the
// selected section's cards on the right. Same two-pane pattern as the owner app.
const ADMIN_SECTIONS = [
  { id: "overview", label: "Overview", icon: "clients" },
  { id: "plan", label: "Plan & billing", icon: "card" },
  { id: "booking", label: "Booking access", icon: "calendar" },
  { id: "features", label: "Features", icon: "settings" },
  { id: "contact", label: "Contact", icon: "user" },
  { id: "install", label: "Links & embed", icon: "globe" },
];

function AdminClientDetail({ shop: s, origin, saving, onPatch, onFreeMonth, onDelete, onBack }) {
  const [phone, setPhone] = useState(s.phone || "");
  const [website, setWebsite] = useState(s.website || "");
  const [copied, setCopied] = useState("");
  const [active, setActive] = useState("overview");

  const bookingUrl = `${origin}/book/${s.slug}`;
  const embedCode =
    `<!-- StoreCal booking widget -->\n<script src="${origin}/embed.js" data-store="${s.publicKey}"></script>\n` +
    `<!-- Live content (services, staff, gallery) -->\n<script src="${origin}/storecal-data.js" data-store="${s.publicKey}"></script>`;
  const contentBlocks = [
    '<div data-storecal="services"></div>',
    s.showStaff !== false ? '<div data-storecal="staff"></div>' : null,
    s.showGallery !== false ? '<div data-storecal="gallery"></div>' : null,
  ].filter(Boolean).join("\n");
  const copy = (t, id) => navigator.clipboard?.writeText(t).then(() => { setCopied(id); setTimeout(() => setCopied(""), 1500); }).catch(() => {});
  const saveContact = (field, val) => { if ((s[field] || "") !== val.trim()) onPatch({ [field]: val.trim() }, "Contact updated"); };

  const statusText = s.freeForLife ? "Free for life" : s.subscribed ? "Subscribed" : "Not subscribed";
  const bookingLink = (
    <div className="invite__row">
      <input className="invite__link" readOnly value={bookingUrl} onFocus={e => e.target.select()} />
      <a className="action" href={bookingUrl} target="_blank" rel="noreferrer">Open</a>
      <button className="btn" onClick={() => copy(bookingUrl, "book")}>{copied === "book" ? "Copied!" : "Copy"}</button>
    </div>
  );

  return (
    <div className="acd">
      <button className="linklike clientdetail__back" onClick={onBack}>← All clients</button>
      <div className="clientdetail__head">
        <div>
          <h1 className="clientdetail__name">{s.name}</h1>
          <span className="clientdetail__meta">{s.businessType} · {s.services} services · {s.staff} staff · {s.appointments} appts · <code>{s.publicKey}</code></span>
        </div>
        <span className={"adminconsole__badge" + (s.subscribed || s.freeForLife ? " adminconsole__badge--on" : "")}>{statusText}</span>
      </div>

      <div className="settings acd__settings">
        <nav className="settings__rail" aria-label="Client settings">
          <div className="settings__railgroup">
            {ADMIN_SECTIONS.map(sec => (
              <button key={sec.id}
                className={"settings__navitem" + (active === sec.id ? " is-active" : "")}
                onClick={() => setActive(sec.id)} aria-current={active === sec.id ? "true" : undefined}>
                <span className="settings__navicon"><Icon name={sec.icon} /></span>
                <span className="settings__navtext"><span className="settings__navlabel">{sec.label}</span></span>
              </button>
            ))}
          </div>
          <button className={"settings__navitem settings__navitem--danger" + (active === "danger" ? " is-active" : "")}
            onClick={() => setActive("danger")} aria-current={active === "danger" ? "true" : undefined}>
            <span className="settings__navicon"><Icon name="trash" /></span>
            <span className="settings__navtext"><span className="settings__navlabel">Danger zone</span></span>
          </button>
        </nav>

        <div className="settings__content">
          {active === "overview" && (<>
            <AdCatHead title="Overview" desc="A snapshot of this client." />
            <AdCard title="Status">
              <div className="acd__deflist">
                <AdRow label="Subscription">{s.freeMonthActive ? "Subscribed · next month free" : statusText}</AdRow>
                <AdRow label="Plan">{planLabelOf(s)}</AdRow>
                <AdRow label="Booking access">{BOOKING_LABEL[bookingValueOf(s)]}</AdRow>
                {!s.freeForLife && s.subscribed && (
                  <AdRow label="Next payment">{fmtRenewDate(s.renewsAt) || (s.freeMonthActive ? "$0" : "—")}</AdRow>
                )}
                {!s.freeForLife && s.subscribed && <AdRow label="Payments made">{s.paymentsCompleted}</AdRow>}
              </div>
            </AdCard>
            <AdCard title="Usage" desc="Email count is tracked from when tracking was added — earlier sends aren’t included.">
              <div className="clientdetail__usage">
                <div className="clientdetail__stat"><span className="clientdetail__stat-l">Appointments (all-time)</span><span className="clientdetail__stat-v">{s.appointments}</span></div>
                <div className="clientdetail__stat"><span className="clientdetail__stat-l">This month</span><span className="clientdetail__stat-v">{s.appointmentsThisMonth}</span></div>
                <div className="clientdetail__stat"><span className="clientdetail__stat-l">Emails sent</span><span className="clientdetail__stat-v">{s.emailsSent}</span></div>
              </div>
            </AdCard>
            <AdCard title="Booking page" desc="The client’s hosted booking link.">{bookingLink}</AdCard>
          </>)}

          {active === "plan" && (<>
            <AdCatHead title="Plan & billing" desc="What this client is charged and their subscription state." />
            <AdCard title="Plan">
              <label className="field"><span className="field__label">Monthly plan</span>
                <select value={s.planId} disabled={saving} onChange={e => onPatch({ planId: e.target.value }, "Plan updated")}>
                  <option value="booking">Booking access — $35/mo</option>
                  <option value="booking-reduced">Booking access (reduced) — $25/mo</option>
                  <option value="website">Website + Booking — $99/mo</option>
                </select>
              </label>
            </AdCard>

            {s.freeForLife ? (
              <AdCard title="Subscription">
                <p className="panel__hint" style={{ margin: 0 }}>Comped for life — booking is always on and no billing shows in their account. Change this under <b>Booking access</b>.</p>
              </AdCard>
            ) : s.subscribed ? (
              <AdCard title="Subscription">
                <div className="clientdetail__subsummary">
                  <div className="clientdetail__stat"><span className="clientdetail__stat-l">{s.freeMonthActive ? "Next payment (free)" : "Next payment"}</span><span className="clientdetail__stat-v">{fmtRenewDate(s.renewsAt) || (s.freeMonthActive ? "$0" : "—")}</span></div>
                  <div className="clientdetail__stat"><span className="clientdetail__stat-l">Payments made</span><span className="clientdetail__stat-v">{s.paymentsCompleted}</span></div>
                </div>
                <div className="clientdetail__toggles" style={{ marginTop: 16 }}>
                  <Toggle checked={!!s.freeMonthActive} disabled={saving} label="Give next month free" onChange={v => onFreeMonth(v)} />
                </div>
                <p className="panel__hint" style={{ marginTop: 8 }}>{s.freeMonthActive
                  ? `Next invoice is comped — they’ll be charged $0${fmtRenewDate(s.renewsAt) ? ` on ${fmtRenewDate(s.renewsAt)}` : ""}, then billing resumes. They see a “next month is on us” note in their account.`
                  : "Waives their next invoice (100% off, one time). Billing resumes automatically the month after."}</p>
              </AdCard>
            ) : (
              <AdCard title="Subscription" desc="This client hasn’t subscribed yet.">
                <div className="clientdetail__toggles">
                  <Toggle checked={!!s.firstMonthFree} disabled={saving} label="First month free (new signup)"
                    onChange={v => onPatch({ firstMonthFree: v }, v ? "First month free on" : "First month free off")} />
                </div>
                <p className="panel__hint" style={{ marginTop: 8 }}>When on, their subscribe checkout saves the card now, charges $0 today, and starts billing after a 30-day free month.</p>
              </AdCard>
            )}
          </>)}

          {active === "booking" && (<>
            <AdCatHead title="Booking access" desc="Whether online booking is on, and how it’s gated." />
            <AdCard title="Access mode">
              <label className="field"><span className="field__label">Booking access</span>
                <select value={bookingValueOf(s)} disabled={saving} onChange={e => onPatch(bookingPatchFor(e.target.value), "Booking updated")}>
                  <option value="demo">Demo — on until delivered</option>
                  <option value="auto">Auto — follows payment</option>
                  <option value="on">On — always</option>
                  <option value="off">Off — “Call us”</option>
                  <option value="free">Free for life — comped (no billing)</option>
                </select>
              </label>
              <p className="panel__hint" style={{ marginTop: 4 }}>
                <b>Demo</b> keeps booking on while you build/deliver. <b>Auto</b> follows their Stripe subscription. <b>On</b>/<b>Off</b> force it regardless of payment. <b>Free for life</b> comps them and hides all billing in their account.
              </p>
            </AdCard>
          </>)}

          {active === "features" && (<>
            <AdCatHead title="Features" desc="Turn sections and notifications on or off for this client." />
            <AdCard title="Content" desc="Off hides these in their dashboard and on their website. Auto shops usually have no staff or gallery.">
              <div className="clientdetail__toggles">
                <Toggle checked={s.showStaff !== false} disabled={saving} label="Staff / team" onChange={v => onPatch({ showStaff: v }, v ? "Staff enabled" : "Staff disabled")} />
                <Toggle checked={s.showGallery !== false} disabled={saving} label="Photo gallery" onChange={v => onPatch({ showGallery: v }, v ? "Gallery enabled" : "Gallery disabled")} />
                <Toggle checked={s.showStaffGalleries !== false} disabled={saving} label="Per-staff galleries" onChange={v => onPatch({ showStaffGalleries: v }, v ? "Staff galleries on" : "Staff galleries off")} />
              </div>
            </AdCard>
            <AdCard title="Booking emails" desc="When on, a booking emails the customer a confirmation and notifies the owner & assigned staff. Off sends no booking emails at all — bookings still work.">
              <div className="clientdetail__toggles">
                <Toggle checked={!s.bookingEmailsOff} disabled={saving} label="Booking emails" onChange={v => onPatch({ bookingEmailsOff: !v }, v ? "Booking emails on" : "Booking emails off")} />
              </div>
            </AdCard>
          </>)}

          {active === "contact" && (<>
            <AdCatHead title="Contact" desc="How to reach the owner. The email is their login and can’t be changed here." />
            <AdCard>
              <label className="field"><span className="field__label">Owner email (login)</span>
                <input type="email" value={s.ownerEmail || ""} readOnly disabled /></label>
              <label className="field"><span className="field__label">Phone</span>
                <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} onBlur={() => saveContact("phone", phone)} placeholder="(555) 000-0000" /></label>
              <label className="field"><span className="field__label">Website</span>
                <input type="url" value={website} onChange={e => setWebsite(e.target.value)} onBlur={() => saveContact("website", website)} placeholder="https://theirsite.com" /></label>
            </AdCard>
          </>)}

          {active === "install" && (<>
            <AdCatHead title="Links & embed" desc="The hosted booking link and the code for the client’s own website." />
            <AdCard title="Hosted booking page">{bookingLink}</AdCard>
            <AdCard title="Website embed" desc="Add once, before the closing body tag.">
              <pre className="adminconsole__code">{embedCode}</pre>
              <button className="btn" onClick={() => copy(embedCode, "emb")}>{copied === "emb" ? "Copied!" : "Copy code"}</button>
            </AdCard>
            <AdCard title="Content blocks" desc="Place where each section should appear on their site.">
              <pre className="adminconsole__code">{contentBlocks}</pre>
              <button className="btn" onClick={() => copy(contentBlocks, "blocks")}>{copied === "blocks" ? "Copied!" : "Copy blocks"}</button>
            </AdCard>
          </>)}

          {active === "danger" && (<>
            <AdCatHead title="Danger zone" desc="Irreversible actions." />
            <AdCard title="Delete this client" desc={`Permanently removes ${s.name} — login, staff, services, appointments, and all booking data. This can’t be undone.`} className="acd__danger">
              <button className="btn btn--danger" onClick={onDelete}>Delete client</button>
            </AdCard>
          </>)}
        </div>
      </div>
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
