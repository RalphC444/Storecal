import { useState } from "react";
import { AuthShell } from "./AuthShell";
import { PasswordInput } from "../../components/PasswordInput";

export function LoginScreen({ onAuthed, onForgot, onBack }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Could not sign in");
      onAuthed(d.user);
    } catch (e2) {
      setErr(e2.message);
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title="Sign in"
      subtitle="Manage your bookings, team, and hours."
      onBack={onBack}
      footer={
        <p className="authnote">
          <b>Are you staff?</b> You don’t sign up here — ask your store owner for your invite link.
          Opening it signs you in and lets you set a password.
        </p>
      }
    >
      <form className="authform" onSubmit={submit}>
        <label className="field">
          <span className="field__label">Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            required
          />
        </label>
        <label className="field">
          <span className="field__label">Password</span>
          <PasswordInput
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>
        {err && <p className="form__error">{err}</p>}
        <button type="submit" className="btn authbtn" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
        <button type="button" className="linkbtn authforgot" onClick={onForgot}>
          Forgot password?
        </button>
      </form>
    </AuthShell>
  );
}
