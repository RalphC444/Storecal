import { useState, useEffect } from "react";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { PasswordInput } from "../../components/PasswordInput";

export function SettingsView({ user, onUserChange, onSignOut }) {
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
    <div className="pageview">
      <div className="pv__head"><h1 className="pv__title">Settings</h1></div>
      <div className="pv__body">
        <section className="sp__block">
          <h3 className="sched__label">Account</h3>
          <div className="set__grid">
            <label className="field">
              <span className="field__label">Name</span>
              <input type="text" value={name} onChange={e => setName(e.target.value)} />
            </label>
            <label className="field">
              <span className="field__label">Email</span>
              <input type="email" value={user.email} readOnly disabled />
            </label>
          </div>
          <div className="sched__save">
            <button className="btn" onClick={saveName} disabled={name.trim() === savedName.trim() || !name.trim()}>Save</button>
            {msg && <span className="sched__msg">{msg}</span>}
          </div>
        </section>

        <section className="sp__block set__pwblock">
          <h3 className="sched__label">Password</h3>
          <ChangePasswordInline />
        </section>

        {user.role === "owner" && <BookableSelfSection />}
        {user.role === "owner" && <BookingLinksSection />}
        {user.role === "owner" && <BillingSection />}

        <section className="sp__block">
          <button className="action action--danger" onClick={onSignOut}>Sign out</button>
        </section>
      </div>
    </div>
  );
}

export function ChangePasswordInline() {
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
    <form className="set__grid" onSubmit={submit}>
      <label className="field">
        <span className="field__label">Current password</span>
        <PasswordInput value={cur} onChange={e => setCur(e.target.value)} autoComplete="current-password" required />
      </label>
      <label className="field">
        <span className="field__label">New password</span>
        <PasswordInput value={next} onChange={e => setNext(e.target.value)} placeholder="At least 8 characters" autoComplete="new-password" required />
      </label>
      <div className="sched__save set__span">
        <button className="btn" type="submit">Update password</button>
        {msg && <span className="sched__msg">{msg}</span>}
        {err && <span className="form__error" style={{ margin: 0 }}>{err}</span>}
      </div>
    </form>
  );
}

// Owner: the two ways to put booking online — embed on their website, or a
// shareable "link in bio" that opens a hosted booking page.
export function BookingLinksSection() {
  const [publicKey, setPublicKey] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [copied, setCopied] = useState("");

  useEffect(() => {
    fetch("/api/shop-config")
      .then(r => r.json())
      .then(d => setPublicKey(d?.shop?.publicKey || null))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  const origin = window.location.origin;
  const bioUrl = publicKey ? `${origin}/book?key=${publicKey}` : "";

  function copy(text, which) {
    if (navigator.clipboard) navigator.clipboard.writeText(text).catch(() => {});
    setCopied(which); setTimeout(() => setCopied(""), 1500);
  }

  return (
    <section className="sp__block">
      <h3 className="sched__label">Booking links</h3>
      <p className="sp__hint">Share your booking page anywhere — no website needed.</p>

      {!loaded ? <LoadingSpinner />
        : !publicKey ? <p className="sp__hint">No booking key yet for this store.</p>
        : (
          <div className="bl">
            <div className="bl__title">Link in bio</div>
            <p className="bl__sub">Share this anywhere — Instagram, Google, a text message. It opens your booking page directly (no website needed).</p>
            <div className="bl__row">
              <input className="bl__link" readOnly value={bioUrl} onFocus={e => e.target.select()} />
              <a className="btn" href={bioUrl} target="_blank" rel="noreferrer">Open</a>
            </div>
            <button className="btn" onClick={() => copy(bioUrl, "bio")}>{copied === "bio" ? "Copied!" : "Copy link"}</button>
          </div>
        )}
    </section>
  );
}

// Owner opt-in to being a bookable provider themselves (toggleable).
export function BookableSelfSection() {
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
    <section className="sp__block">
      <h3 className="sched__label">My booking profile</h3>
      <p className="sp__hint">Take appointments yourself? List your own profile so clients can book with you.</p>
      <label className="switch switch--field">
        <input type="checkbox" checked={!!listed} onChange={toggle} disabled={listed === null || busy} />
        <span>Show me as bookable staff</span>
      </label>
      {listed && <p className="sp__hint">You now appear in the <b>Staff</b> tab — open your card there to add a photo, choose your services, and set your hours (needed before clients can book you).</p>}
    </section>
  );
}

export function BillingSection() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { fetch("/api/billing").then(r => r.json()).then(setData).catch(() => {}); }, []);

  // Both actions hand off straight to Stripe (Checkout to subscribe, Portal to
  // manage) — no in-app plan chooser.
  async function go(path) {
    setErr(""); setBusy(true);
    const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok && d.url) window.location.href = d.url;
    else setErr(d.error || "Something went wrong");
  }

  return (
    <section className="sp__block">
      <h3 className="sched__label">Subscription &amp; billing</h3>
      <p className="sp__hint">Only the store owner manages the subscription and payment method.</p>

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
        <p className="sp__hint">Your plan: <b>{data.assignedPlan.name}</b> — {data.assignedPlan.price}. {data.assignedPlan.blurb}</p>
      )}

      {err && <p className="form__error">{err}</p>}
      {data && !data.stripeConfigured && (
        <p className="sp__hint">Payments aren’t connected yet — add <code>STRIPE_SECRET_KEY</code> on the server to enable subscriptions.</p>
      )}
    </section>
  );
}

// Final onboarding step — set hours (skippable; a banner nags until done).
