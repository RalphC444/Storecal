import { useState } from "react";

// "Apply for a website" application form — sends via POST /api/apply (which
// relays to EmailJS server-side, avoiding the browser CORS/preflight block).
export function ApplyForWebsiteModal({ plan, onClose }) {
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    business: "",
    businessType: "salon",
    plan: plan || "",
    message: "",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [sent, setSent] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e) {
    e.preventDefault();
    setErr("");
    if (!form.name.trim() || !form.email.trim() || !form.business.trim()) {
      setErr("Please add your name, email, and business name.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          email: form.email.trim(),
          phone: form.phone.trim(),
          business: form.business.trim(),
          businessType: form.businessType,
          plan: form.plan,
          message: form.message.trim(),
        }),
      });
      if (!res.ok) throw new Error();
      setSent(true);
    } catch {
      setErr("Couldn’t send just now — please try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal" onMouseDown={onClose}>
      <div className="modal__panel" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal__head">
          <h2 className="modal__title">{sent ? "Application sent" : "Apply for a website"}</h2>
          <button className="modal__x" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        {sent ? (
          <div className="form">
            <p className="sp__hint">
              Thanks{form.name ? `, ${form.name.split(" ")[0]}` : ""}! We got your details and will be
              in touch shortly at <b>{form.email}</b>.
            </p>
            <div className="form__actions">
              <button className="btn" onClick={onClose}>
                Done
              </button>
            </div>
          </div>
        ) : (
          <form className="form" onSubmit={submit}>
            <p className="sp__hint" style={{ marginTop: 0 }}>
              Tell us about you and your business and we’ll get you set up.
            </p>
            <div className="form__row form__row--2">
              <label className="field">
                <span className="field__label">Your name</span>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                  required
                />
              </label>
              <label className="field">
                <span className="field__label">Email</span>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => set("email", e.target.value)}
                  required
                />
              </label>
            </div>
            <div className="form__row form__row--2">
              <label className="field">
                <span className="field__label">Phone (optional)</span>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => set("phone", e.target.value)}
                  placeholder="(555) 000-0000"
                />
              </label>
              <label className="field">
                <span className="field__label">Business name</span>
                <input
                  type="text"
                  value={form.business}
                  onChange={(e) => set("business", e.target.value)}
                  required
                />
              </label>
            </div>
            <div className="form__row form__row--2">
              <label className="field">
                <span className="field__label">Business type</span>
                <select
                  value={form.businessType}
                  onChange={(e) => set("businessType", e.target.value)}
                >
                  <option value="salon">Salon / Barber / Nails</option>
                  <option value="grooming">Pet grooming</option>
                  <option value="auto">Auto</option>
                  <option value="generic">Other</option>
                </select>
              </label>
              <label className="field">
                <span className="field__label">Plan you’re interested in</span>
                <select value={form.plan} onChange={(e) => set("plan", e.target.value)}>
                  <option value="">Not sure yet</option>
                  <option value="Booking access">Booking access — $35/mo</option>
                  <option value="Website + Booking">Website + Booking — $99/mo</option>
                </select>
              </label>
            </div>
            <label className="field">
              <span className="field__label">Tell us about your business</span>
              <textarea
                rows={3}
                value={form.message}
                onChange={(e) => set("message", e.target.value)}
                placeholder="Services you offer, what you're looking for, current website (if any)…"
              />
            </label>
            {err && <p className="form__error">{err}</p>}
            <div className="form__actions">
              <button type="button" className="action" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="btn" disabled={busy}>
                {busy ? "Sending…" : "Send application"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
