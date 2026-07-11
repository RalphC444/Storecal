import { useState } from "react";
import { AuthShell } from "./AuthShell";
import { PasswordInput } from "../../components/PasswordInput";

// Full-page password change — used for forced first-login changes and resets.
export function ChangePasswordScreen({ forced, onDone }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Could not update password");
      onDone();
    } catch (e2) {
      setErr(e2.message);
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title="Set your password"
      subtitle={
        forced ? "Choose a password to finish setting up your account." : "Update your password."
      }
    >
      <form className="authform" onSubmit={submit}>
        {!forced && (
          <label className="field">
            <span className="field__label">Current password</span>
            <PasswordInput
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              required
            />
          </label>
        )}
        <label className="field">
          <span className="field__label">New password</span>
          <PasswordInput
            value={next}
            onChange={(e) => setNext(e.target.value)}
            placeholder="At least 8 characters"
            autoComplete="new-password"
            required
          />
        </label>
        {err && <p className="form__error">{err}</p>}
        <button type="submit" className="btn authbtn" disabled={busy}>
          {busy ? "Saving…" : "Save password"}
        </button>
      </form>
    </AuthShell>
  );
}
