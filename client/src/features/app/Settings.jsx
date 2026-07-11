import { useState, useEffect, useMemo } from "react";
import { Icon } from "../../components/Icon";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { PasswordInput } from "../../components/PasswordInput";
import { toast } from "../../components/Toast";

// Settings is a two-pane console: a discoverable category rail on the left and
// grouped cards on the right. Categories are role- and business-type aware, so
// a staff member sees only Profile + Security, and an auto shop never sees the
// "bookable staff" card. Each category holds one or more self-contained cards.
export function SettingsView({ user, onUserChange, onSignOut }) {
  const isOwner = user.role === "owner";

  // Load shop + billing meta once so category visibility never flashes.
  const [meta, setMeta] = useState({ loaded: !isOwner, businessType: null, freeForLife: false });
  useEffect(() => {
    if (!isOwner) return;
    let done = 0;
    const acc = { businessType: null, freeForLife: false };
    const finish = () => { if (++done === 2) setMeta({ loaded: true, ...acc }); };
    fetch("/api/shop-config").then(r => r.json()).then(d => { acc.businessType = d?.shop?.businessType || null; }).catch(() => {}).finally(finish);
    fetch("/api/billing").then(r => r.json()).then(d => { acc.freeForLife = !!d?.freeForLife; }).catch(() => {}).finally(finish);
  }, [isOwner]);

  const isAuto = meta.businessType === "auto";

  const categories = useMemo(() => {
    const list = [
      { id: "profile", label: "Profile", icon: "user", desc: "Name & login" },
      { id: "security", label: "Security", icon: "lock", desc: "Password" },
    ];
    if (isOwner) {
      list.push({ id: "website", label: "Website", icon: "globe", desc: "Storefront banner" });
      list.push({ id: "booking", label: "Booking", icon: "link", desc: "Links & profile" });
      if (!meta.freeForLife) list.push({ id: "billing", label: "Billing", icon: "card", desc: "Plan & payment" });
    }
    return list;
  }, [isOwner, meta.freeForLife]);

  const [active, setActive] = useState("profile");
  useEffect(() => {
    if (!categories.some((c) => c.id === active)) setActive(categories[0].id);
  }, [categories, active]);

  return (
    <div className="pageview">
      <div className="pageview__head"><h1 className="pageview__title">Settings</h1></div>
      <div className="pageview__body settings">
        <nav className="settings__rail" aria-label="Settings sections">
          <div className="settings__railgroup">
            {categories.map((c) => (
              <button
                key={c.id}
                className={"settings__navitem" + (active === c.id ? " is-active" : "")}
                onClick={() => setActive(c.id)}
                aria-current={active === c.id ? "true" : undefined}
              >
                <span className="settings__navicon"><Icon name={c.icon} /></span>
                <span className="settings__navtext">
                  <span className="settings__navlabel">{c.label}</span>
                  <span className="settings__navdesc">{c.desc}</span>
                </span>
              </button>
            ))}
          </div>
          <button className="settings__navitem settings__navitem--danger" onClick={onSignOut}>
            <span className="settings__navicon"><Icon name="signout" /></span>
            <span className="settings__navtext"><span className="settings__navlabel">Sign out</span></span>
          </button>
        </nav>

        <div className="settings__content">
          {!meta.loaded ? (
            <LoadingSpinner />
          ) : (
            <>
              {active === "profile" && <ProfilePanel user={user} onUserChange={onUserChange} />}
              {active === "security" && <SecurityPanel />}
              {isOwner && active === "website" && <WebsitePanel />}
              {isOwner && active === "booking" && <BookingPanel isAuto={isAuto} />}
              {isOwner && active === "billing" && <BillingPanel />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Shared presentation ──────────────────────────────────────────────────────

function CategoryHead({ title, desc }) {
  return (
    <header className="settings__cathead">
      <h2 className="settings__cattitle">{title}</h2>
      {desc && <p className="settings__catdesc">{desc}</p>}
    </header>
  );
}

function SettingsCard({ title, desc, children }) {
  return (
    <section className="settings__card">
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

// ── Profile ──────────────────────────────────────────────────────────────────

function ProfilePanel({ user, onUserChange }) {
  const [name, setName] = useState(user.name || "");
  const [savedName, setSavedName] = useState(user.name || "");
  const [msg, setMsg] = useState("");

  async function saveName() {
    const res = await fetch("/api/auth/profile", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }),
    });
    const d = await res.json().catch(() => ({}));
    if (res.ok && d.user) { setSavedName(d.user.name); onUserChange?.(d.user); setMsg("Saved"); setTimeout(() => setMsg(""), 2000); }
  }

  return (
    <>
      <CategoryHead title="Profile" desc="Your name and the email you sign in with." />
      <SettingsCard title="Your details">
        <div className="set__grid">
          <label className="field">
            <span className="field__label">Name</span>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="field">
            <span className="field__label">Email</span>
            <input type="email" value={user.email} readOnly disabled />
          </label>
        </div>
        <div className="schedule__save">
          <button className="btn" onClick={saveName} disabled={name.trim() === savedName.trim() || !name.trim()}>Save</button>
          {msg && <span className="schedule__msg">{msg}</span>}
        </div>
      </SettingsCard>
    </>
  );
}

// ── Security ─────────────────────────────────────────────────────────────────

function SecurityPanel() {
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  async function submit(e) {
    e.preventDefault(); setErr(""); setMsg("");
    const res = await fetch("/api/auth/change-password", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword: cur, newPassword: next }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) { setErr(d.error || "Could not update"); return; }
    setCur(""); setNext(""); setMsg("Password updated"); setTimeout(() => setMsg(""), 2500);
  }

  return (
    <>
      <CategoryHead title="Security" desc="Keep your account safe. Choose a strong password you don't use elsewhere." />
      <SettingsCard title="Password" desc="You'll stay signed in on this device after changing it.">
        <form className="set__grid" onSubmit={submit}>
          <label className="field">
            <span className="field__label">Current password</span>
            <PasswordInput value={cur} onChange={(e) => setCur(e.target.value)} autoComplete="current-password" required />
          </label>
          <label className="field">
            <span className="field__label">New password</span>
            <PasswordInput value={next} onChange={(e) => setNext(e.target.value)} placeholder="At least 8 characters" autoComplete="new-password" required />
          </label>
          <div className="schedule__save set__span">
            <button className="btn" type="submit">Update password</button>
            {msg && <span className="schedule__msg">{msg}</span>}
            {err && <span className="form__error" style={{ margin: 0 }}>{err}</span>}
          </div>
        </form>
      </SettingsCard>
    </>
  );
}

// ── Website ──────────────────────────────────────────────────────────────────

function WebsitePanel() {
  const [msg, setMsg] = useState("");
  const [until, setUntil] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  // Compare against saved values so the Save button only enables on real edits.
  const [savedMsg, setSavedMsg] = useState("");
  const [savedUntil, setSavedUntil] = useState("");

  useEffect(() => {
    fetch("/api/shop-config").then(r => r.json())
      .then(d => {
        setMsg(d.announcement || ""); setSavedMsg(d.announcement || "");
        setUntil(d.announcementUntil || ""); setSavedUntil(d.announcementUntil || "");
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  async function persist(nextMsg, nextUntil) {
    setSaving(true);
    const res = await fetch("/api/shop-config", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ announcement: nextMsg, announcementUntil: nextUntil }),
    });
    const d = await res.json().catch(() => ({}));
    setSaving(false);
    if (res.ok) {
      setSavedMsg(d.announcement ?? nextMsg);
      setSavedUntil(d.announcementUntil ?? "");
      setUntil(d.announcementUntil ?? "");
      return true;
    }
    return false;
  }

  async function save() {
    if (await persist(msg.trim(), until)) toast(msg.trim() ? "Banner saved" : "Banner cleared");
  }
  async function clearBanner() {
    setMsg(""); setUntil("");
    if (await persist("", "")) toast("Banner cleared");
  }

  const todayStr = new Date().toISOString().slice(0, 10);
  const hasSaved = !!savedMsg;
  const dirty = msg.trim() !== savedMsg || until !== savedUntil;
  const isLive = hasSaved && (!savedUntil || todayStr < savedUntil);

  return (
    <>
      <CategoryHead title="Website" desc="Control what visitors see on your storefront." />
      <SettingsCard
        title="Announcement banner"
        desc="Show a message across the top of your website — e.g. holiday hours or “We’re on vacation until Aug 5.”"
      >
        <label className="field">
          <span className="field__label">Message</span>
          <textarea rows={2} maxLength={250} value={msg} onChange={(e) => setMsg(e.target.value)}
            placeholder="We’re closed for vacation July 20–28 — book us for after. Thanks!" />
          <span className="banner__count">{msg.length}/250</span>
        </label>

        <label className="field banner__when">
          <span className="field__label">Automatically hide on <span className="field__opt">— optional</span></span>
          <input type="date" min={todayStr} value={until} onChange={(e) => setUntil(e.target.value)} disabled={!msg.trim()} />
          <span className="banner__hint">
            {until ? `The banner disappears on ${until}.` : "Leave empty to keep it up until you remove it."}
          </span>
        </label>

        {hasSaved && (
          <p className={"banner__status" + (isLive ? " banner__status--live" : "")}>
            {isLive
              ? <>● Live on your website{savedUntil ? ` — hides on ${savedUntil}` : ""}.</>
              : <>This banner has expired and is no longer showing.</>}
          </p>
        )}

        <div className="banner__actions">
          <button className="btn" onClick={save} disabled={saving || !loaded || !dirty}>
            {saving ? "Saving…" : "Save banner"}
          </button>
          <button className="action action--danger" onClick={clearBanner} disabled={saving || !loaded || (!hasSaved && !msg && !until)}>
            Clear banner
          </button>
        </div>
      </SettingsCard>
    </>
  );
}

// ── Booking ──────────────────────────────────────────────────────────────────

function BookingPanel({ isAuto }) {
  return (
    <>
      <CategoryHead title="Booking" desc="How clients reach your booking page and who they can book." />
      <BookingLinkCard />
      {/* Auto shops don't do per-staff booking, so there's no "list yourself" card. */}
      {!isAuto && <BookableSelfCard />}
    </>
  );
}

function BookingLinkCard() {
  const [publicKey, setPublicKey] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch("/api/shop-config").then(r => r.json())
      .then(d => setPublicKey(d?.shop?.publicKey || null))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  const bioUrl = publicKey ? `${window.location.origin}/book?key=${publicKey}` : "";

  function copy() {
    if (navigator.clipboard) navigator.clipboard.writeText(bioUrl).catch(() => {});
    setCopied(true); setTimeout(() => setCopied(false), 1500);
  }

  return (
    <SettingsCard title="Link in bio" desc="Share this anywhere — Instagram, Google, a text. It opens your booking page directly, no website needed.">
      {!loaded ? <LoadingSpinner />
        : !publicKey ? <p className="panel__hint">No booking key yet for this store.</p>
        : (
          <>
            <div className="bl__row">
              <input className="bl__link" readOnly value={bioUrl} onFocus={(e) => e.target.select()} />
              <a className="btn" href={bioUrl} target="_blank" rel="noreferrer">Open</a>
            </div>
            <button className="btn" onClick={copy}>{copied ? "Copied!" : "Copy link"}</button>
          </>
        )}
    </SettingsCard>
  );
}

function BookableSelfCard() {
  const [listed, setListed] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { fetch("/api/providers/self").then(r => r.json()).then(d => setListed(!!d.listed)).catch(() => setListed(false)); }, []);

  async function toggle() {
    const next = !listed;
    setBusy(true);
    const res = await fetch("/api/providers/self", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ listed: next }),
    });
    setBusy(false);
    if (res.ok) setListed(next);
  }

  return (
    <SettingsCard title="My booking profile" desc="Take appointments yourself? List your own profile so clients can book with you.">
      <label className="switch switch--field">
        <input type="checkbox" checked={!!listed} onChange={toggle} disabled={listed === null || busy} />
        <span>Show me as bookable staff</span>
      </label>
      {listed && <p className="panel__hint">You now appear in the <b>Staff</b> tab — open your card there to add a photo, choose your services, and set your hours (needed before clients can book you).</p>}
    </SettingsCard>
  );
}

// ── Billing ──────────────────────────────────────────────────────────────────

function BillingPanel() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { fetch("/api/billing").then(r => r.json()).then(setData).catch(() => {}); }, []);

  async function go(path) {
    setErr(""); setBusy(true);
    const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok && d.url) window.location.href = d.url;
    else setErr(d.error || "Something went wrong");
  }

  return (
    <>
      <CategoryHead title="Billing" desc="Your subscription and payment method. Only the store owner manages this." />
      <SettingsCard title="Subscription">
        <div className="billing__now">
          <div>
            <span className="billing__label">Status</span>
            <span className="billing__plan">{data ? (data.subscribed ? "Active" : "Not subscribed") : "…"}</span>
          </div>
          {data && (data.subscribed
            ? <button className="btn" onClick={() => go("/api/billing/portal")} disabled={busy}>{busy ? "Opening…" : "Manage payment & plan"}</button>
            : <button className="btn" onClick={() => go("/api/billing/checkout")} disabled={busy || !data.stripeConfigured}>
                {busy ? "Opening…" : (data.assignedPlan ? `Subscribe — ${data.assignedPlan.name} ${data.assignedPlan.price}` : "Subscribe")}
              </button>)}
        </div>
        {data && !data.subscribed && data.assignedPlan && (
          <p className="panel__hint">Your plan: <b>{data.assignedPlan.name}</b> — {data.assignedPlan.price}. {data.assignedPlan.blurb}</p>
        )}
        {err && <p className="form__error">{err}</p>}
        {data && !data.stripeConfigured && (
          <p className="panel__hint">Payments aren’t connected yet — add <code>STRIPE_SECRET_KEY</code> on the server to enable subscriptions.</p>
        )}
      </SettingsCard>
    </>
  );
}
