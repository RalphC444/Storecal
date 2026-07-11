import { useState } from "react";
import { AuthShell } from "./AuthShell";
import { PasswordInput } from "../../components/PasswordInput";

export function ResetPasswordScreen({ token, onAuthed, onBack }) {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword: pw }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Could not reset password");
      onAuthed(d.user);
    } catch (e2) {
      setErr(e2.message);
      setBusy(false);
    }
  }
  return (
    <AuthShell
      title="Choose a new password"
      footer={
        <button className="linkbtn" onClick={onBack}>
          ← Back to sign in
        </button>
      }
    >
      <form className="authform" onSubmit={submit}>
        <label className="field">
          <span className="field__label">New password</span>
          <PasswordInput
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            placeholder="At least 8 characters"
            autoComplete="new-password"
            required
          />
        </label>
        {err && <p className="form__error">{err}</p>}
        <button type="submit" className="btn authbtn" disabled={busy}>
          {busy ? "Saving…" : "Set password"}
        </button>
      </form>
    </AuthShell>
  );
}
