import { useState, useEffect } from "react";
import { AuthShell } from "./AuthShell";
import { PasswordInput } from "../../components/PasswordInput";
import { track } from "../../lib/analytics";

// Self-serve store-owner signup. Step 1 collects business details and creates
// the account (auto sign-in). Step 2 confirms their booking page is live and
// offers to start the first-month-free subscription right away.
export function RegisterScreen({ onAuthed, onBack, onSignIn }) {
  const [step, setStep] = useState("form"); // "form" | "done"
  const [form, setForm] = useState({ businessName: "", email: "", password: "", businessType: "salon", phone: "", website: "" });
  const [result, setResult] = useState(null); // { user, slug, publicKey, bookingUrl }
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => { track("signup_started"); }, []); // funnel: reached the signup form

  async function submit(e) {
    e.preventDefault();
    setErr("");
    if (form.password.length < 8) { setErr("Password must be at least 8 characters"); return; }
    setBusy(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Could not create your account");
      setResult(d);
      setStep("done");
    } catch (e2) { setErr(e2.message); }
    finally { setBusy(false); }
  }

  function copyLink() {
    if (navigator.clipboard && result?.bookingUrl) navigator.clipboard.writeText(result.bookingUrl).catch(() => {});
    setCopied(true); setTimeout(() => setCopied(false), 1500);
  }

  if (step === "done" && result) {
    return (
      <AuthShell title="You’re all set! 🎉" subtitle={`${form.businessName} is ready to take bookings.`}>
        <div className="signup-done">
          <div className="signup-done__block">
            <span className="field__label">Your booking page</span>
            <div className="invite__row">
              <input className="invite__link" readOnly value={result.bookingUrl} onFocus={(e) => e.target.select()} />
              <a className="action" href={result.bookingUrl} target="_blank" rel="noreferrer">Open</a>
              <button className="btn" type="button" onClick={copyLink}>{copied ? "Copied!" : "Copy"}</button>
            </div>
            <p className="signup-done__hint">Two quick steps and customers can book: set your hours and add a service. Then share this link anywhere — Instagram bio, Google, a text. (You can embed it on an existing website too.)</p>
          </div>

          <div className="signup-done__cta">
            <button className="btn btn--lg" type="button" onClick={() => onAuthed(result.user)}>
              Set up my booking page →
            </button>
            <p className="signup-done__fine">Your first month is free — you’ll turn on billing from your dashboard whenever you’re ready. No charge today.</p>
          </div>

          {err && <p className="form__error">{err}</p>}
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Start your free month"
      subtitle="Create your account, get a ready-to-share booking page, and take appointments today."
      onBack={onBack}
      footer={<p className="authnote">Already have an account? <button className="linklike" onClick={onSignIn}>Sign in</button></p>}
    >
      <form className="authform" onSubmit={submit}>
        <label className="field">
          <span className="field__label">Business name</span>
          <input type="text" value={form.businessName} onChange={(e) => set("businessName", e.target.value)} placeholder="e.g. The Nail Bar" required />
        </label>
        <label className="field">
          <span className="field__label">Business type</span>
          <select value={form.businessType} onChange={(e) => set("businessType", e.target.value)}>
            <option value="salon">Salon / Barber / Nails</option>
            <option value="grooming">Pet grooming</option>
            <option value="auto">Auto shop</option>
            <option value="generic">Other</option>
          </select>
        </label>
        <label className="field">
          <span className="field__label">Email</span>
          <input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} autoComplete="username" placeholder="you@business.com" required />
        </label>
        <label className="field">
          <span className="field__label">Password</span>
          <PasswordInput value={form.password} onChange={(e) => set("password", e.target.value)} autoComplete="new-password" placeholder="At least 8 characters" required />
        </label>
        {err && <p className="form__error">{err}</p>}
        <button className="btn btn--lg authform__submit" type="submit" disabled={busy}>
          {busy ? "Creating…" : "Create my account"}
        </button>
        <p className="authnote authnote--center">Free for 30 days, then $35/month. Cancel anytime.</p>
      </form>
    </AuthShell>
  );
}
