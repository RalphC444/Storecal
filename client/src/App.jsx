import { useState, useEffect } from "react";
import { LoadingSpinner } from "./components/LoadingSpinner";
import { LandingPage } from "./features/marketing/LandingPage";
import { PolicyPages } from "./features/marketing/PolicyPages";
import { LoginScreen } from "./features/auth/LoginScreen";
import { ForgotPasswordScreen } from "./features/auth/ForgotPasswordScreen";
import { ResetPasswordScreen } from "./features/auth/ResetPasswordScreen";
import { ChangePasswordScreen } from "./features/auth/ChangePasswordScreen";
import { AdminConsole } from "./features/admin/AdminConsole";
import { StoreApp, OnboardingHours } from "./features/app/StoreApp";

// ── Auth gate ────────────────────────────────────────────────────────────────
// Decides which top-level screen to show based on the auth/session state.

export default function App() {
  const [phase, setPhase] = useState("loading"); // loading | login | register | onboard | app
  const [user, setUser] = useState(null);
  const [fresh, setFresh] = useState(false); // just registered / first-login → run onboarding

  const [resetToken, setResetToken] = useState(null);
  const [legalSection, setLegalSection] = useState(null);
  const openLegal = (sec) => { setLegalSection(sec); setPhase("legal"); };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    const reset = params.get("reset");
    // Direct links to the public policy pages (Stripe reviewers, footer links).
    const hash = (window.location.hash || "").replace("#", "");
    if (["terms", "privacy", "refunds"].includes(hash)) {
      setLegalSection(hash); setPhase("legal"); return;
    }
    if (reset) {
      window.history.replaceState({}, "", window.location.pathname);
      setResetToken(reset); setPhase("reset"); return;
    }
    if (token) {
      fetch("/api/auth/accept-invite", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }),
      })
        .then(r => r.json().then(d => ({ ok: r.ok, d })))
        .then(({ ok, d }) => {
          window.history.replaceState({}, "", window.location.pathname); // strip token
          if (ok && d.user) { setUser(d.user); setPhase(d.user.mustChangePassword ? "changepw" : "app"); }
          else setPhase("login");
        })
        .catch(() => setPhase("login"));
      return;
    }
    fetch("/api/auth/me")
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (d?.user) { setUser(d.user); setPhase(d.user.mustChangePassword ? "changepw" : "app"); }
        else setPhase("landing");
      })
      .catch(() => setPhase("landing"));
  }, []);

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    setUser(null); setPhase("landing");
  }

  // "Try the live demo" — sign into the shared demo store as its owner so
  // visitors can explore the full owner experience.
  async function demoLogin() {
    setPhase("loading");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "demo@storecal.com", password: "demo1234" }),
      });
      const d = await res.json();
      if (res.ok && d.user) { setUser(d.user); setPhase(d.user.mustChangePassword ? "changepw" : "app"); }
      else setPhase("login");
    } catch { setPhase("login"); }
  }

  if (phase === "loading") return <div className="authwrap"><LoadingSpinner /></div>;

  if (phase === "landing")
    return <LandingPage onSignIn={() => setPhase("login")} onDemo={demoLogin} onLegal={openLegal} />;

  if (phase === "legal")
    return <PolicyPages section={legalSection} onBack={() => setPhase("landing")} />;

  if (phase === "login")
    return <LoginScreen onAuthed={u => { setUser(u); setPhase(u.mustChangePassword ? "changepw" : "app"); }} onForgot={() => setPhase("forgot")} onBack={() => setPhase("landing")} />;

  if (phase === "forgot")
    return <ForgotPasswordScreen onBack={() => setPhase("login")} />;

  if (phase === "reset")
    return <ResetPasswordScreen token={resetToken} onAuthed={u => { setUser(u); setPhase(u.mustChangePassword ? "changepw" : "app"); }} onBack={() => setPhase("login")} />;

  if (phase === "changepw")
    return <ChangePasswordScreen forced onDone={() => {
      // Owners run first-time shop onboarding (set opening hours); invited staff
      // skip it and land in the app — they manage their own hours from their
      // profile, and "shop hours" isn't theirs to set.
      if (user?.role === "owner") { setFresh(true); setPhase("onboard"); }
      else setPhase("app");
    }} />;

  if (phase === "onboard")
    return <OnboardingHours user={user} onDone={() => setPhase("app")} />;

  // Platform operator gets the client-management console instead of a store view.
  if (user?.role === "superadmin") return <AdminConsole user={user} onSignOut={signOut} />;

  return <StoreApp user={user} onSignOut={signOut} onUserChange={setUser} />;
}
