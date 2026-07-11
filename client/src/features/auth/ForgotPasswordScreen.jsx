import { useState } from "react";
import { AuthShell } from "./AuthShell";

export function ForgotPasswordScreen({ onBack }) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  async function submit(e) {
    e.preventDefault();
    await fetch("/api/auth/forgot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    }).catch(() => {});
    setSent(true);
  }
  return (
    <AuthShell
      title="Reset password"
      subtitle="Enter your email and we’ll send reset instructions."
      footer={
        <button className="linkbtn" onClick={onBack}>
          ← Back to sign in
        </button>
      }
    >
      {sent ? (
        <p className="authnote">
          If an account exists for <b>{email}</b>, you’ll receive a reset link shortly. If you’re
          staff and don’t get one, ask your store owner to resend your invite link.
        </p>
      ) : (
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
          <button type="submit" className="btn authbtn">
            Send reset link
          </button>
        </form>
      )}
    </AuthShell>
  );
}
