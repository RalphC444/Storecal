import { useState, useEffect, useCallback, useRef } from "react";
import { Avatar } from "../../components/Avatar";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { DAYS_FULL, todayKey } from "../../lib/datetime";
import { resizeToDataUrl } from "../../lib/images";
import { openRangesFor } from "./availability";
import { ScheduleEditor, fmtMin } from "./Scheduling";
import { StaffGallery } from "./Gallery";

export function ProvidersView({ onChange, teamLabel, addReq, user, onHoursSaved, isAuto }) {
  const [list, setList] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [editing, setEditing] = useState(null); // null | {} | {…provider}
  const [invite, setInvite] = useState(null);   // { name, url } after adding w/ email
  const [confirmRemove, setConfirmRemove] = useState(null); // provider pending removal
  const [selfHoursOpen, setSelfHoursOpen] = useState(false); // owner editing own hours
  const [err, setErr] = useState("");

  // Open the add-stylist modal when the top-nav action fires (ignore mount).
  const addSeen = useRef(addReq);
  useEffect(() => { if (addReq !== addSeen.current) { addSeen.current = addReq; setSelectedId(null); setEditing({}); } }, [addReq]);

  const load = useCallback(() => {
    fetch("/api/providers?all=1").then(r => r.json()).then(d => Array.isArray(d) && setList(d));
  }, []);
  useEffect(() => { load(); }, [load]);

  async function save(p) {
    setErr("");
    const res = await fetch(p._id ? `/api/providers/${p._id}` : "/api/providers", {
      method: p._id ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(p),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { const msg = data.error || "Could not save"; setErr(msg); return msg; }
    setEditing(null); load(); onChange?.();
    // New stylist → we emailed their sign-up link; also surface the one-time
    // link so the owner can copy it (in case the email doesn't arrive).
    if (!p._id && data.inviteToken) {
      setInvite({ name: p.name, url: `${window.location.origin}/invite?token=${data.inviteToken}`, emailed: data.emailed });
    }
    return null;
  }
  async function toggleActive(p) {
    await fetch(`/api/providers/${p._id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !p.active }),
    });
    load(); onChange?.();
  }
  async function remove(p) {
    setErr("");
    const res = await fetch(`/api/providers/${p._id}`, { method: "DELETE" });
    if (!res.ok) { const { error } = await res.json().catch(() => ({})); setErr(error || "Could not delete"); return; }
    setSelectedId(null); load(); onChange?.();
  }

  const selected = list?.find(p => p._id === selectedId);
  // Auto shops: "staff" are administrators (manage the calendar, not bookable),
  // but we keep the "Staff" wording the owner sees everywhere else.
  const label = teamLabel || "Staff";
  const single = label.replace(/s$/, "").toLowerCase();
  // The owner's own provider record is a hidden system "rep" used to land shop
  // bookings on the calendar — it isn't a team member, so hide it for auto.
  const visible = isAuto ? (list || []).filter(p => !p.ownerUserId) : list;
  const isOwnCard = selected && user && !isAuto && selected.ownerUserId === user._id;

  return (
    <>
      {selected && isOwnCard ? (
        <ProviderSelfView
          provider={selected}
          onChange={() => { load(); onChange?.(); }}
          onEditHours={() => setSelfHoursOpen(true)}
          onBack={() => setSelectedId(null)}
          backLabel={`← All ${label.toLowerCase()}`}
        />
      ) : selected ? (
        <StylistProfile
          provider={selected}
          err={err}
          isAuto={isAuto}
          backLabel={`← All ${label.toLowerCase()}`}
          onBack={() => { setErr(""); setSelectedId(null); }}
          onEdit={() => setEditing(selected)}
          onToggleActive={() => toggleActive(selected)}
          onDelete={() => setConfirmRemove(selected)}
          onSaved={() => { load(); onChange?.(); }}
        />
      ) : (
        <div className="pageview">
          <div className="pageview__head">
            <h1 className="pageview__title">{label}</h1>
            <button className="btn btn--new" onClick={() => setEditing({})}>+ Add {single}</button>
          </div>
          <div className="pageview__body">
            {isAuto && (
              <p className="panel__hint" style={{ marginTop: 0 }}>
                Administrators help manage the store’s appointments and calendar. They don’t appear as bookable staff on your website.
              </p>
            )}
            {err && <p className="form__error">{err}</p>}
            {!visible ? <LoadingSpinner />
              : visible.length === 0 ? <p className="empty">No {label.toLowerCase()} yet.</p>
              : (
                <div className="pgrid">
                  {visible.map(p => (
                    <StylistCard key={p._id} provider={p} isAuto={isAuto} onOpen={() => setSelectedId(p._id)} />
                  ))}
                </div>
              )
            }
          </div>
        </div>
      )}

      {editing && <ProviderForm provider={editing} isAuto={isAuto} onClose={() => setEditing(null)} onSave={save} />}
      {invite && <InviteModal invite={invite} onClose={() => setInvite(null)} />}
      {confirmRemove && (
        <RemoveStaffModal
          provider={confirmRemove}
          onCancel={() => setConfirmRemove(null)}
          onConfirm={async () => { await remove(confirmRemove); setConfirmRemove(null); }}
        />
      )}
      {selfHoursOpen && selected && (
        <ProviderHoursModal provider={selected} onSaved={onHoursSaved} onClose={() => setSelfHoursOpen(false)} />
      )}
    </>
  );
}

// Shows the one-time invite link for the owner to copy + share.
export function InviteModal({ invite, onClose }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard?.writeText(invite.url).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  }
  return (
    <div className="modal" onMouseDown={onClose}>
      <div className="modal__panel" onMouseDown={e => e.stopPropagation()}>
        <div className="modal__head">
          <h2 className="modal__title">Invite {invite.name}</h2>
          <button className="modal__x" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="form">
          <p className="panel__hint">
            {invite.emailed
              ? <>We emailed {invite.name} their sign-up link. They’ll set a password and be connected to your store. You can also copy the link below to send it yourself.</>
              : <>Send {invite.name} this link. When they open it they’ll set a password and be connected to your store. The link works once and expires in 14 days.</>}
          </p>
          <div className="invite__row">
            <input className="invite__link" readOnly value={invite.url} onFocus={e => e.target.select()} />
            <button className="btn" onClick={copy}>{copied ? "Copied!" : "Copy"}</button>
          </div>
          <div className="form__actions">
            <button className="btn" onClick={onClose}>Done</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Heavy confirmation for removing a staff member — a destructive, hard-to-undo
// action, so it requires typing the person's name to enable the button.
export function RemoveStaffModal({ provider, onCancel, onConfirm }) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const match = typed.trim().toLowerCase() === (provider.name || "").trim().toLowerCase();
  async function confirm() { setBusy(true); try { await onConfirm(); } finally { setBusy(false); } }
  return (
    <div className="modal" onMouseDown={onCancel}>
      <div className="modal__panel" onMouseDown={e => e.stopPropagation()}>
        <div className="modal__head">
          <h2 className="modal__title">Remove {provider.name} from the team?</h2>
          <button className="modal__x" onClick={onCancel} aria-label="Close">✕</button>
        </div>
        <div className="form">
          <div className="danger-note">
            <p><b>This can’t be undone.</b> Removing {provider.name} will:</p>
            <ul className="danger-list">
              <li>Immediately <b>block their sign-in</b> — they’ll be told they’re no longer part of the store.</li>
              <li>Remove them from your team, calendar filters, and the booking widget.</li>
              <li>Keep past appointments for your records.</li>
            </ul>
          </div>
          <label className="field">
            <span className="field__label">Type <b>{provider.name}</b> to confirm</span>
            <input type="text" value={typed} onChange={e => setTyped(e.target.value)} placeholder={provider.name} autoFocus />
          </label>
          <div className="form__actions">
            <button type="button" className="action" onClick={onCancel}>Cancel</button>
            <button type="button" className="btn btn--danger" disabled={!match || busy} onClick={confirm}>
              {busy ? "Removing…" : "Remove from team"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Today's working status for a stylist, derived from their availability.
export function useTodayStatus(provider) {
  const [status, setStatus] = useState(null);
  useEffect(() => {
    if (!provider.active) { setStatus({ kind: "hidden", label: "Not bookable" }); return; }
    let alive = true;
    Promise.all([
      fetch(`/api/availability/${provider._id}`).then(r => r.json()).catch(() => null),
      fetch(`/api/timeoff/${provider._id}`).then(r => r.json()).catch(() => []),
    ]).then(([av, timeoff]) => {
      if (!alive) return;
      const open = openRangesFor(todayKey(), av, Array.isArray(timeoff) ? timeoff : []);
      if (!open || open.length === 0) { setStatus({ kind: "off", label: "Off today" }); return; }
      const now = new Date();
      const nowMin = now.getHours() * 60 + now.getMinutes();
      const start = Math.min(...open.map(r => r.startMin));
      const end = Math.max(...open.map(r => r.endMin));
      if (nowMin < start) setStatus({ kind: "soon", label: `Comes in ${fmtMin(start)}` });
      else if (nowMin <= end) setStatus({ kind: "working", label: "Working today" });
      else setStatus({ kind: "off", label: "Done for the day" });
    });
    return () => { alive = false; };
  }, [provider._id, provider.active]);
  return status;
}

export function StylistCard({ provider: p, onOpen, isAuto }) {
  // Auto admins aren't bookable, so "working today / off today" is meaningless.
  const status = useTodayStatus(isAuto ? { active: false } : p);
  const acctLabel = p.accountStatus === "active" ? "Active" : p.accountStatus === "invited" ? "Invited" : "No sign-in yet";
  return (
    <button className={`providercard${!isAuto && !p.active ? " providercard--off" : ""}`} onClick={onOpen}>
      <div className="providercard__top">
        <Avatar name={p.name} photo={p.photo} />
        <div className="providercard__id">
          <span className="providercard__name">{p.name}</span>
          {isAuto
            ? <span className="workstatus workstatus--soon"><i className="weekdot" />Administrator · {acctLabel}</span>
            : status && (
              <span className={`workstatus workstatus--${status.kind}`}>
                <i className="weekdot" />{status.label}
              </span>
            )}
        </div>
      </div>
      {!isAuto && <p className="providercard__bio">{p.bio || <em>No bio yet</em>}</p>}
      <span className="providercard__go">View {isAuto ? "details" : "profile"} →</span>
    </button>
  );
}

// Owner-facing: fetch + copy a provider's one-time sign-up link (until active).
export function InviteLinkButton({ providerId, hasEmail }) {
  const [url, setUrl] = useState("");
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState(false);
  async function gen() {
    setErr("");
    const res = await fetch(`/api/providers/${providerId}/invite`, { method: "POST" });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) { setErr(d.error || "Could not create link"); return; }
    const link = `${window.location.origin}/invite?token=${d.inviteToken}`;
    setUrl(link);
    navigator.clipboard?.writeText(link).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }).catch(() => {});
  }
  if (!hasEmail) return <p className="panel__hint">Add an email for this staff member first to create a sign-up link.</p>;
  return (
    <div>
      {url ? (
        <div className="invite__row">
          <input className="invite__link" readOnly value={url} onFocus={e => e.target.select()} />
          <button className="btn" onClick={gen}>{copied ? "Copied!" : "Copy again"}</button>
        </div>
      ) : (
        <button className="btn" onClick={gen}>Get sign-up link</button>
      )}
      {err && <p className="form__error">{err}</p>}
    </div>
  );
}

// Read-only for the owner — providers manage their own profile, services & hours.
// Round avatar: shows the staff photo if set, else their initial. Reuses .avatarpic
// sizing (pass avatarpic--lg / avatarpic--sm via className).
// Read a chosen image file, center-crop to a square, and return a compact JPEG
// data URL (stored on the provider so no external file hosting is needed).

export function StylistProfile({ provider: p, err, onBack, onDelete, isAuto, backLabel }) {
  const [services, setServices] = useState([]);
  useEffect(() => { if (!isAuto) fetch("/api/services").then(r => r.json()).then(d => Array.isArray(d) && setServices(d)); }, [isAuto]);
  const offered = services.filter(s => (p.serviceIds || []).includes(s._id));

  return (
    <div className="pageview">
      <div className="pageview__head pageview__head--bar">
        <button className="backlink" onClick={onBack}>{backLabel || "← All staff"}</button>
        <button className="linkbtn linkbtn--danger" onClick={onDelete}>Remove from team</button>
      </div>
      <div className="pageview__body">
        {err && <p className="form__error">{err}</p>}

        <div className="panel__hero">
          <Avatar name={p.name} photo={p.photo} className="avatarpic--lg" />
          <div className="panel__hero-main">
            <h1 className="panel__name">{p.name}</h1>
            {isAuto
              ? <span className="pageview__badge pageview__badge--on">Administrator</span>
              : <span className={`pageview__badge${p.active ? " pageview__badge--on" : ""}`}>{p.active ? "Active — bookable" : "Hidden — not bookable"}</span>}
          </div>
        </div>

        <p className="panel__readonly">
          {isAuto
            ? <>{p.name} is an administrator — they help manage the store’s appointments and calendar. They aren’t shown as bookable staff on your website.</>
            : <>Read-only — {p.name} manages their own profile, services and hours.</>}
        </p>

        {p.accountStatus !== "active" && !p.ownerUserId && (
          <section className="panel__block">
            <h3 className="schedule__label">{isAuto ? "Administrator sign-in" : "Staff sign-in"}</h3>
            <p className="panel__hint">{p.name} hasn’t set up their login yet. Share this one-time link so they can set a password{isAuto ? " and manage the store calendar" : " and manage their own profile, services & hours"}.</p>
            <InviteLinkButton providerId={p._id} hasEmail={!!p.email} />
          </section>
        )}

        <section className="panel__block">
          <h3 className="schedule__label">Contact</h3>
          <dl className="panel__dl panel__dl--grid">
            <div><dt>Email</dt><dd>{p.email ? <a href={`mailto:${p.email}`}>{p.email}</a> : "—"}</dd></div>
            <div><dt>Phone</dt><dd>{p.phone ? <a href={`tel:${p.phone}`}>{p.phone}</a> : "—"}</dd></div>
            {!isAuto && <div className="panel__dl-wide"><dt>Specialties &amp; bio</dt><dd>{p.bio || "—"}</dd></div>}
          </dl>
        </section>

        {!isAuto && (
          <section className="panel__block">
            <h3 className="schedule__label">Services offered</h3>
            <div className="serviceproviders__chips">
              {offered.length > 0
                ? offered.map(s => <span key={s._id} className="chip chip--on chip--static">{s.name}</span>)
                : <span className="clienttable__dim">No services set.</span>}
            </div>
          </section>
        )}

        {!isAuto && (
          <section className="panel__block">
            <h3 className="schedule__label">Hours</h3>
            <HoursReview providerId={p._id} />
          </section>
        )}
      </div>
    </div>
  );
}

// A provider's own profile — edit bio, choose which services they offer, and
// manage their hours. This is the provider-role counterpart to the owner's
// read-only StylistProfile.
export function ProviderSelfView({ provider, onChange, onEditHours, onBack, backLabel }) {
  const [services, setServices] = useState([]);
  const [name, setName] = useState(provider?.name || "");
  const [bio, setBio] = useState(provider?.bio || "");
  const [phone, setPhone] = useState(provider?.phone || "");
  const [photo, setPhoto] = useState(provider?.photo || "");
  const [ids, setIds] = useState(provider?.serviceIds || []);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => { fetch("/api/services").then(r => r.json()).then(d => Array.isArray(d) && setServices(d)); }, []);
  useEffect(() => {
    if (provider) { setName(provider.name || ""); setBio(provider.bio || ""); setPhone(provider.phone || ""); setPhoto(provider.photo || ""); setIds(provider.serviceIds || []); }
  }, [provider?._id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function pickPhoto(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setSaved(false); setErr("");
    try { setPhoto(await resizeToDataUrl(file)); }
    catch { setErr("Couldn't read that image."); }
  }

  if (!provider) return <div className="pageview"><div className="pageview__body"><LoadingSpinner /></div></div>;

  const toggle = (sid) => { setSaved(false); setIds(prev => prev.includes(sid) ? prev.filter(x => x !== sid) : [...prev, sid]); };

  async function save() {
    setErr(""); setSaved(false);
    if (!name.trim()) { setErr("Please enter your display name."); return; }
    setSaving(true);
    const res = await fetch(`/api/providers/${provider._id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, bio, phone, photo, serviceIds: ids }),
    });
    setSaving(false);
    if (!res.ok) { const { error } = await res.json().catch(() => ({})); setErr(error || "Could not save"); return; }
    setSaved(true); onChange?.();
  }

  return (
    <div className="pageview">
      {onBack && (
        <div className="pageview__head pageview__head--bar">
          <button className="backlink" onClick={onBack}>{backLabel || "← Back"}</button>
        </div>
      )}
      <div className="pageview__head">
        <h1 className="pageview__title">My profile</h1>
        <button className="btn btn--new" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save changes"}</button>
      </div>
      <div className="pageview__body">
        {err && <p className="form__error">{err}</p>}

        <div className="panel__hero">
          <Avatar name={provider.name} photo={photo} className="avatarpic--lg" />
          <div className="panel__hero-main">
            <h1 className="panel__name">{provider.name}</h1>
            <span className={`pageview__badge${provider.active ? " pageview__badge--on" : ""}`}>{provider.active ? "Active — bookable" : "Hidden — not bookable"}</span>
            <div className="photo-actions">
              <label className="linkbtn photo-upload">
                {photo ? "Change photo" : "Add photo"}
                <input type="file" accept="image/*" onChange={pickPhoto} hidden />
              </label>
              {photo && <button type="button" className="linkbtn linkbtn--danger" onClick={() => { setSaved(false); setPhoto(""); }}>Remove</button>}
            </div>
            <p className="panel__hint" style={{ margin: "4px 0 0" }}>Shown to clients when booking. Remember to Save changes.</p>
          </div>
        </div>

        <section className="panel__block">
          <h3 className="schedule__label">Details</h3>
          <label className="field" style={{ marginBottom: 12 }}>
            <span className="field__label">Display name <span className="field__hint">— how clients see you when booking</span></span>
            <input type="text" value={name} onChange={e => { setSaved(false); setName(e.target.value); }} placeholder="e.g. Maria L." />
          </label>
          <div className="set__grid">
            <label className="field">
              <span className="field__label">Email</span>
              <input type="email" value={provider.email || ""} readOnly disabled />
            </label>
            <label className="field">
              <span className="field__label">Phone</span>
              <input type="tel" value={phone} onChange={e => { setSaved(false); setPhone(e.target.value); }} placeholder="(555) 123-4567" />
            </label>
          </div>
        </section>

        <section className="panel__block">
          <h3 className="schedule__label">Specialties &amp; bio</h3>
          <p className="panel__hint">Shown to clients when they book with you.</p>
          <textarea className="selfbio" rows={3} value={bio} onChange={e => { setSaved(false); setBio(e.target.value); }} placeholder="Your specialties, experience…" />
        </section>

        <section className="panel__block">
          <h3 className="schedule__label">Services I offer</h3>
          <p className="panel__hint">Pick the services clients can book with you. The menu &amp; prices are set by your manager.</p>
          <div className="serviceproviders__chips">
            {services.length === 0 ? <span className="clienttable__dim">No services in the menu yet.</span>
              : services.map(s => (
                <button key={s._id} type="button" className={`chip chip--btn${ids.includes(s._id) ? " chip--on" : ""}`} onClick={() => toggle(s._id)}>
                  {s.name}
                </button>
              ))}
          </div>
        </section>

        <section className="panel__block">
          <div className="panel__block-head">
            <h3 className="schedule__label">My hours</h3>
            <button className="btn" onClick={onEditHours}>Edit hours</button>
          </div>
          <HoursReview providerId={provider._id} />
        </section>

        {saved && <p className="panel__saved">✓ Changes saved.</p>}
      </div>
    </div>
  );
}

// Read-only weekly-hours + time-off summary for the manager to review.
export function HoursReview({ providerId }) {
  const [av, setAv] = useState(null);
  const [timeoff, setTimeoff] = useState([]);

  useEffect(() => {
    fetch(`/api/availability/${providerId}`).then(r => r.json()).then(setAv).catch(() => {});
    fetch(`/api/timeoff/${providerId}`).then(r => r.json()).then(d => Array.isArray(d) && setTimeoff(d)).catch(() => {});
  }, [providerId]);

  if (!av) return <LoadingSpinner />;

  const fmtRanges = (day) => {
    if (!day.enabled) return <span className="hr__closed">Closed</span>;
    const hrs = day.ranges.map(r => `${fmtMin(r.startMin)} – ${fmtMin(r.endMin)}`).join(", ");
    const brk = (day.breaks || []).length
      ? ` · break ${day.breaks.map(b => `${fmtMin(b.startMin)}–${fmtMin(b.endMin)}`).join(", ")}` : "";
    return <span>{hrs}{brk}</span>;
  };

  const weekTable = (week, title) => (
    <div className="hr__week">
      {title && <div className="hr__wk">{title}</div>}
      {week.map(day => (
        <div key={day.weekday} className={`hr__row${!day.enabled ? " hr__row--off" : ""}`}>
          <span className="hr__day">{DAYS_FULL[day.weekday]}</span>
          {fmtRanges(day)}
        </div>
      ))}
    </div>
  );

  return (
    <div className="hr">
      {av.meta?.biweekly ? (
        <div className="hr__weeks">
          {weekTable(av.weekA, "Week A")}
          {weekTable(av.weekB, "Week B")}
        </div>
      ) : weekTable(av.weekA)}

      {(av.overrides?.length > 0) && (
        <div className="hr__extra">
          <div className="hr__xlabel">Single-day changes</div>
          {av.overrides.map(o => (
            <div key={o._id} className="hr__xrow">
              <span>{o.date}</span>
              <span>{o.closed ? "Closed" : o.ranges.map(r => `${fmtMin(r.startMin)}–${fmtMin(r.endMin)}`).join(", ")}</span>
            </div>
          ))}
        </div>
      )}

      {timeoff.length > 0 && (
        <div className="hr__extra">
          <div className="hr__xlabel">Time off</div>
          {timeoff.map(t => (
            <div key={t._id} className="hr__xrow">
              <span>{t.startDate === t.endDate ? t.startDate : `${t.startDate} – ${t.endDate}`}</span>
              <span>{t.reason || "—"}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function ProviderForm({ provider, onClose, onSave, isAuto }) {
  const isEdit = !!provider._id;
  const noun = "staff";
  const [form, setForm] = useState({
    name: provider.name || "",
    bio: provider.bio || "",
    email: provider.email || "",
    active: provider.active !== false,
  });
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState("");
  const set = (f, v) => setForm(s => ({ ...s, [f]: v }));

  async function submit(e) {
    e.preventDefault();
    setFormErr("");
    setSaving(true);
    // Auto administrators aren't bookable — always create them active (so their
    // login works) but they never surface on the website (server-enforced).
    const payload = isAuto ? { ...provider, ...form, active: true, bio: "" } : { ...provider, ...form };
    const error = await onSave(payload);
    setSaving(false);
    if (error) setFormErr(error);
  }

  return (
    <div className="modal" onMouseDown={onClose}>
      <div className="modal__panel" onMouseDown={e => e.stopPropagation()}>
        <div className="modal__head">
          <h2 className="modal__title">{isEdit ? `Edit ${noun}` : `Add ${noun}`}</h2>
          <button className="modal__x" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <form className="form" onSubmit={submit}>
          {isAuto && (
            <p className="panel__hint" style={{ marginTop: 0 }}>
              Administrators can view and manage the store’s calendar and appointments. They aren’t shown as bookable staff on your website.
            </p>
          )}
          <label className="field">
            <span className="field__label">Name</span>
            <input type="text" value={form.name} onChange={e => set("name", e.target.value)} placeholder="Full name" required />
          </label>
          <label className="field">
            <span className="field__label">Email <span className="field__hint">— we email them a sign-up link to set their password</span></span>
            <input type="email" value={form.email} onChange={e => set("email", e.target.value)} placeholder="name@email.com" required disabled={isEdit} />
          </label>
          {!isAuto && (
            <>
              <label className="field">
                <span className="field__label">Bio</span>
                <textarea rows={2} value={form.bio} onChange={e => set("bio", e.target.value)} placeholder="Specialties, experience…" />
              </label>
              <label className="switch switch--field">
                <input type="checkbox" checked={form.active} onChange={e => set("active", e.target.checked)} />
                <span>Bookable (shown to clients &amp; on the calendar)</span>
              </label>
            </>
          )}
          {formErr && <p className="form__error">{formErr}</p>}
          <div className="form__actions">
            <button type="button" className="action" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn" disabled={saving}>{saving ? "Saving…" : isEdit ? "Save" : `Add ${noun}`}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Services ─────────────────────────────────────────────────────────────────


export function ProviderHoursModal({ provider, onClose, onSaved }) {
  return (
    <div className="modal" onMouseDown={onClose}>
      <div className="modal__panel modal__panel--wide" onMouseDown={e => e.stopPropagation()}>
        <div className="modal__head">
          <h2 className="modal__title">{provider.name}’s hours</h2>
          <button className="modal__x" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="modal__scroll modal__scroll--docked">
          <ScheduleEditor provider={provider} mode="owner" docked onSaved={onSaved} />
        </div>
      </div>
    </div>
  );
}

// ── Clients ─────────────────────────────────────────────────────────────────

