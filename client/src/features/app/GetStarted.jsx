import { useState } from "react";

// A lightweight setup "quest" shown to owners until their booking page is ready:
// a progress bar, checklist steps with one-tap actions, and a share row for the
// hosted booking link. Encourages filling in the blanks (services, hours, etc.).
export function GetStartedQuest({ shopName, steps, bookingUrl, onDismiss }) {
  const [copied, setCopied] = useState(false);
  const done = steps.filter((s) => s.done).length;
  const total = steps.length;
  const pct = total ? Math.round((done / total) * 100) : 0;

  function copyLink() {
    if (navigator.clipboard && bookingUrl) navigator.clipboard.writeText(bookingUrl).catch(() => {});
    setCopied(true); setTimeout(() => setCopied(false), 1500);
  }

  return (
    <section className="quest" aria-label="Get started">
      <div className="quest__head">
        <div>
          <h2 className="quest__title">Get {shopName || "your shop"} ready to book</h2>
          <p className="quest__sub">{done} of {total} done — finish these and customers can book you.</p>
        </div>
        <button className="quest__dismiss" onClick={onDismiss} aria-label="Hide for now">✕</button>
      </div>

      <div className="quest__bar"><div className="quest__bar-fill" style={{ width: pct + "%" }} /></div>

      <ol className="quest__steps">
        {steps.map((s) => (
          <li key={s.label} className={"quest__step" + (s.done ? " is-done" : "")}>
            <span className="quest__check" aria-hidden="true">{s.done ? "✓" : ""}</span>
            <span className="quest__step-txt">
              <span className="quest__step-label">{s.label}</span>
              {s.desc && <span className="quest__step-desc">{s.desc}</span>}
            </span>
            {!s.done && s.actionLabel && (
              <button className="btn btn--sm" onClick={s.onAction}>{s.actionLabel}</button>
            )}
          </li>
        ))}
      </ol>

      {bookingUrl && (
        <div className="quest__share">
          <span className="quest__share-l">Your booking page — share it anywhere</span>
          <div className="invite__row">
            <input className="invite__link" readOnly value={bookingUrl} onFocus={(e) => e.target.select()} />
            <a className="action" href={bookingUrl} target="_blank" rel="noreferrer">Preview</a>
            <button className="btn" onClick={copyLink}>{copied ? "Copied!" : "Copy"}</button>
          </div>
        </div>
      )}
    </section>
  );
}
