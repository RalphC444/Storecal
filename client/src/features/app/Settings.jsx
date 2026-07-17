import { useState, useEffect, useMemo, useCallback } from "react";
import { Icon } from "../../components/Icon";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { PasswordInput } from "../../components/PasswordInput";
import { toast } from "../../components/Toast";
import { resizeImageDataUrl } from "../../lib/images";

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
      list.push({ id: "website", label: "Website", icon: "globe", desc: "Booking page, links & branding" });
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
              {active === "profile" && <ProfilePanel user={user} onUserChange={onUserChange} isOwner={isOwner} isAuto={isAuto} />}
              {active === "security" && <SecurityPanel />}
              {isOwner && active === "website" && <WebsitePanel />}
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

function ProfilePanel({ user, onUserChange, isOwner, isAuto }) {
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
      {/* Owners at staff-based shops can list themselves as bookable. */}
      {isOwner && !isAuto && <BookableSelfCard />}
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
      <CategoryHead title="Website" desc="Your booking page, share link, external links, and branding." />
      <BookingLinkCard />
      <WebsiteUrlCard />
      <SettingsCard
        title="Announcement banner"
        desc="Show a message on your booking page and across the top of your website — e.g. holiday hours or “We’re on vacation until Aug 5.”"
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

      <ExternalLinksCard />
      <BrandingCard />
    </>
  );
}

// Hosted booking-page branding: logo, accent color, and a tagline. Saved to the
// shop and read by /book/<slug> (and the booking widget) via /api/shop-config.
const DEFAULT_ACCENT = "#2563eb";
const fmtMoney = (cents) => `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`;
function BrandingCard() {
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [accent, setAccent] = useState("");
  const [logo, setLogo] = useState("");
  const [tagline, setTagline] = useState("");
  const [saved, setSaved] = useState({ accent: "", logo: "", tagline: "" });
  // Add-on gate state (from /api/billing).
  const [bill, setBill] = useState(null);
  const [unlockBusy, setUnlockBusy] = useState(false);

  const loadAll = useCallback(() => {
    Promise.all([
      fetch("/api/shop-config").then(r => r.json()).catch(() => ({})),
      fetch("/api/billing").then(r => r.json()).catch(() => ({})),
    ]).then(([cfg, b]) => {
      const s = cfg?.shop || {};
      setAccent(s.accent || ""); setLogo(s.logo || ""); setTagline(s.tagline || "");
      setSaved({ accent: s.accent || "", logo: s.logo || "", tagline: s.tagline || "" });
      setBill(b || {});
    }).finally(() => setLoaded(true));
  }, []);
  useEffect(() => { loadAll(); }, [loadAll]);

  const unlocked = !!bill?.brandingUnlocked;
  const comped = !!bill?.brandingComped;
  const priceCents = bill?.brandingPrice || 500;
  const planCents = bill?.assignedPlan?.amount || 0;

  async function setAddon(on) {
    setUnlockBusy(true);
    const res = await fetch("/api/billing/branding", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ on }),
    });
    const d = await res.json().catch(() => ({}));
    setUnlockBusy(false);
    if (res.ok) { toast(on ? "Custom branding unlocked" : "Custom branding removed"); loadAll(); }
    else toast(d.error || "Couldn’t update the add-on");
  }

  // Logo auto-saves on upload/remove; accent + tagline use the Save button.
  const dirty = accent !== saved.accent || tagline.trim() !== saved.tagline;
  const [logoBusy, setLogoBusy] = useState(false);
  const [logoErr, setLogoErr] = useState("");

  // PATCH a partial set of branding fields and sync saved state from the reply.
  async function patchBranding(partial) {
    const res = await fetch("/api/shop-config", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(partial),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d.error || "Save failed");
    setSaved(prev => ({
      accent: d.accent ?? prev.accent, logo: d.logo ?? prev.logo, tagline: d.tagline ?? prev.tagline,
    }));
    return d;
  }

  async function onLogoFile(e) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file) return;
    setLogoErr(""); setLogoBusy(true);
    try {
      const dataUrl = await resizeImageDataUrl(file, 400, 0.85);
      const d = await patchBranding({ logo: dataUrl }); // save immediately — no separate step
      setLogo(d.logo || "");
      if (!d.logo) setLogoErr("That image was too large to save. Try a smaller one.");
      else toast("Logo saved");
    } catch {
      setLogoErr("Couldn’t use that image. Please upload a JPG or PNG (not HEIC).");
    } finally { setLogoBusy(false); }
  }

  async function removeLogo() {
    setLogoErr(""); setLogoBusy(true);
    try { await patchBranding({ logo: "" }); setLogo(""); toast("Logo removed"); }
    catch { setLogoErr("Couldn’t remove the logo — try again."); }
    finally { setLogoBusy(false); }
  }

  async function save() {
    setSaving(true);
    try {
      const d = await patchBranding({ accent, tagline: tagline.trim() });
      setAccent(d.accent || ""); setTagline(d.tagline || "");
      toast("Branding saved");
    } catch (e) { toast(e.message || "Couldn’t save branding"); }
    finally { setSaving(false); }
  }

  // Locked state: explain the add-on and show the exact new total before unlocking.
  if (loaded && !unlocked) {
    return (
      <SettingsCard title="Booking page branding" desc="Add your logo and brand color to your hosted booking page.">
        <div className="addon-lock">
          <p className="addon-lock__body">Custom branding is an add-on. Turn it on to upload a <b>logo</b> and set your <b>brand color</b> on your booking page.</p>
          <div className="addon-lock__price">
            <span className="addon-lock__amt">+{fmtMoney(priceCents)}/mo</span>
            {planCents > 0 && <span className="addon-lock__total">Your plan becomes <b>{fmtMoney(planCents + priceCents)}/mo</b> ({fmtMoney(planCents)} + {fmtMoney(priceCents)})</span>}
          </div>
          <button className="btn" disabled={unlockBusy} onClick={() => setAddon(true)}>
            {unlockBusy ? "Unlocking…" : `Unlock custom branding — +${fmtMoney(priceCents)}/mo`}
          </button>
          <p className="addon-lock__fine">Added to your next invoice and every month after. Remove it anytime.</p>
        </div>
      </SettingsCard>
    );
  }

  return (
    <SettingsCard title="Booking page branding" desc="Personalize your hosted booking page — the link you share in your bio. Your logo saves as soon as you upload it.">
      {!loaded ? <LoadingSpinner /> : (
        <>
          {comped
            ? <div className="addon-status addon-status--comp">✓ Custom branding is included on your account.</div>
            : <div className="addon-status">Custom branding add-on active — <b>{fmtMoney(priceCents)}/mo</b>.
                <button className="linklike" disabled={unlockBusy} onClick={() => setAddon(false)} style={{ marginLeft: 8 }}>{unlockBusy ? "Removing…" : "Remove"}</button>
              </div>}
          <div className="field">
            <span className="field__label">Logo <span className="field__opt">— optional</span></span>
            <div className="brand__logo">
              {logo ? <img className="brand__logo-img" src={logo} alt="Logo preview" /> : <div className="brand__logo-ph">No logo</div>}
              <div className="brand__logo-actions">
                <label className={"btn btn--file" + (logoBusy ? " is-busy" : "")}>
                  {logoBusy ? "Saving…" : logo ? "Replace" : "Upload logo"}
                  <input type="file" accept="image/*" hidden disabled={logoBusy} onChange={onLogoFile} />
                </label>
                {logo && !logoBusy && <button type="button" className="action action--danger" onClick={removeLogo}>Remove</button>}
              </div>
            </div>
            {logoErr && <p className="form__error" style={{ marginTop: 8 }}>{logoErr}</p>}
          </div>

          <div className="field">
            <span className="field__label">Accent color</span>
            <div className="brand__color">
              <input type="color" value={accent || DEFAULT_ACCENT} onChange={e => setAccent(e.target.value)} aria-label="Accent color" />
              <input type="text" className="brand__hex" value={accent} placeholder={DEFAULT_ACCENT} maxLength={7} onChange={e => setAccent(e.target.value)} />
              {accent && <button type="button" className="linklike" onClick={() => setAccent("")}>Reset</button>}
            </div>
            <span className="banner__hint">Colors your Book buttons and the booking widget. Defaults to StoreCal blue.</span>
          </div>

          <label className="field">
            <span className="field__label">Tagline <span className="field__opt">— optional</span></span>
            <input type="text" value={tagline} maxLength={120} placeholder="e.g. Modern cuts & color in downtown Austin" onChange={e => setTagline(e.target.value)} />
          </label>

          <div className="banner__actions">
            <button className="btn" onClick={save} disabled={saving || !dirty}>{saving ? "Saving…" : "Save branding"}</button>
          </div>
        </>
      )}
    </SettingsCard>
  );
}

// Owner's existing website URL (optional) — used for the embed + rebooking links.
function WebsiteUrlCard() {
  const [website, setWebsite] = useState(null);
  const [saved, setSaved] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    fetch("/api/shop-config").then(r => r.json())
      .then(d => { const w = d?.shop?.website || ""; setWebsite(w); setSaved(w); })
      .catch(() => setWebsite(""));
  }, []);
  async function save() {
    setSaving(true);
    const res = await fetch("/api/shop-config", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ website: (website || "").trim() }),
    });
    const d = await res.json().catch(() => ({}));
    setSaving(false);
    if (res.ok) { setSaved(d.website || ""); setWebsite(d.website || ""); toast("Website saved"); }
    else toast(d.error || "Couldn’t save");
  }
  if (website === null) return null;
  return (
    <SettingsCard title="Your website" desc="Already have a site? Add it here — it’s where your embedded booking widget lives. Optional.">
      <label className="field"><span className="field__label">Website URL</span>
        <input type="url" value={website} placeholder="https://yoursite.com" onChange={(e) => setWebsite(e.target.value)} /></label>
      <div className="banner__actions">
        <button className="btn" onClick={save} disabled={saving || (website || "").trim() === saved}>{saving ? "Saving…" : "Save"}</button>
      </div>
    </SettingsCard>
  );
}

// ── Website: external links (link-in-bio / linktree) ─────────────────────────

// Owner-managed list of external links shown as buttons on the hosted booking
// page — Instagram, Google reviews, a menu PDF, etc. Stored on the shop.
function ExternalLinksCard() {
  const [links, setLinks] = useState(null); // [{ label, url }]
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/shop-config").then(r => r.json())
      .then(d => setLinks(Array.isArray(d?.shop?.links) ? d.shop.links : []))
      .catch(() => setLinks([]));
  }, []);

  function set(i, k, v) { setLinks(ls => ls.map((l, idx) => idx === i ? { ...l, [k]: v } : l)); }
  function add() { setLinks(ls => [...ls, { label: "", url: "" }]); }
  function remove(i) { setLinks(ls => ls.filter((_, idx) => idx !== i)); }
  function move(i, dir) {
    setLinks(ls => {
      const j = i + dir; if (j < 0 || j >= ls.length) return ls;
      const copy = ls.slice(); const [it] = copy.splice(i, 1); copy.splice(j, 0, it); return copy;
    });
  }

  async function save() {
    setSaving(true);
    // Drop empties and normalise before saving.
    const clean = (links || [])
      .map(l => ({ label: (l.label || "").trim(), url: (l.url || "").trim() }))
      .filter(l => l.url);
    const res = await fetch("/api/shop-config", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ links: clean }),
    });
    const d = await res.json().catch(() => ({}));
    setSaving(false);
    if (res.ok) { setLinks(Array.isArray(d.links) ? d.links : clean); toast("Links saved"); }
    else toast(d.error || "Couldn’t save links");
  }

  return (
    <SettingsCard title="Links" desc="Extra buttons shown on your booking page — Instagram, Google reviews, a menu, your other site. Works like a link-in-bio.">
      {links === null ? <LoadingSpinner /> : (
        <>
          {links.length === 0 && <p className="panel__hint" style={{ marginTop: -4 }}>No links yet. Add your first below.</p>}
          <div className="linkrows">
            {links.map((l, i) => (
              <div className="linkrow" key={i}>
                <input className="linkrow__label" type="text" value={l.label} placeholder="Label (e.g. Instagram)" onChange={e => set(i, "label", e.target.value)} />
                <input className="linkrow__url" type="url" value={l.url} placeholder="https://…" onChange={e => set(i, "url", e.target.value)} />
                <div className="linkrow__ctl">
                  <button type="button" className="linkrow__btn" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">↑</button>
                  <button type="button" className="linkrow__btn" onClick={() => move(i, 1)} disabled={i === links.length - 1} aria-label="Move down">↓</button>
                  <button type="button" className="linkrow__btn linkrow__btn--del" onClick={() => remove(i)} aria-label="Remove">✕</button>
                </div>
              </div>
            ))}
          </div>
          <div className="banner__actions">
            <button className="action" type="button" onClick={add}>+ Add link</button>
            <button className="btn" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save links"}</button>
          </div>
        </>
      )}
    </SettingsCard>
  );
}

function BookingLinkCard() {
  const [shop, setShop] = useState(null); // { slug, publicKey }
  const [loaded, setLoaded] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch("/api/shop-config").then(r => r.json())
      .then(d => setShop(d?.shop || null))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  // A clean, shareable link built from the store's name (slug). Needs a public
  // key behind the scenes for the page to load the booking widget.
  const ready = shop?.slug && shop?.publicKey;
  const bioUrl = ready ? `${window.location.origin}/book/${shop.slug}` : "";

  function copy() {
    if (navigator.clipboard) navigator.clipboard.writeText(bioUrl).catch(() => {});
    setCopied(true); setTimeout(() => setCopied(false), 1500);
  }

  return (
    <SettingsCard title="Link in bio" desc="Share this anywhere — Instagram, Google, a text. It opens your booking page directly, no website needed.">
      {!loaded ? <LoadingSpinner />
        : !ready ? <p className="panel__hint">No booking link yet for this store.</p>
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

  const fmtDate = (ms) => ms ? new Date(ms).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" }) : null;

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

        {/* Good-news banner: a comped month, or a free trial in progress. */}
        {data && data.subscribed && data.freeMonthActive && (
          <div className="billing__gift">🎉 {data.freeMonths > 1 ? `Your next ${data.freeMonths} months are on us` : "Your next month is on us"} — no charge{fmtDate(data.renewsAt) ? ` on ${fmtDate(data.renewsAt)}` : " next cycle"}.{fmtDate(data.freeResumesAt) ? ` Billing resumes ${fmtDate(data.freeResumesAt)}.` : ""}</div>
        )}
        {data && data.subscribed && !data.freeMonthActive && data.trialing && fmtDate(data.renewsAt) && (
          <div className="billing__gift">🎁 You’re in your free month — your first payment is on {fmtDate(data.renewsAt)}.</div>
        )}
        {/* Plain next-payment line when nothing special is going on. */}
        {data && data.subscribed && !data.freeMonthActive && !data.trialing && fmtDate(data.renewsAt) && (
          <p className="panel__hint">Next payment: <b>{fmtDate(data.renewsAt)}</b>.</p>
        )}

        {data && !data.subscribed && data.assignedPlan && (
          <p className="panel__hint">Your plan: <b>{data.assignedPlan.name}</b> — {data.assignedPlan.price}. {data.assignedPlan.blurb}{data.firstMonthFree ? " Your first month is free — we’ll save your card and start billing after 30 days." : ""}</p>
        )}
        {err && <p className="form__error">{err}</p>}
        {data && !data.stripeConfigured && (
          <p className="panel__hint">Payments aren’t connected yet — add <code>STRIPE_SECRET_KEY</code> on the server to enable subscriptions.</p>
        )}
      </SettingsCard>
    </>
  );
}
