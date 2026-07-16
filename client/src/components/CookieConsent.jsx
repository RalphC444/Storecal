import { useState, useEffect, useCallback, useRef } from "react";

const STORAGE_KEY = "storecal:cookie-consent";

// Read a previously stored choice ("accepted" | "declined"), or null if the
// visitor hasn't chosen yet. Exported so any future analytics/tracking can be
// gated on an explicit accept rather than loaded unconditionally.
export function getCookieConsent() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

// A slim, brand-styled cookie notice for the public site. It appears once — a
// beat after the page settles — and stays until the visitor accepts or
// declines, then remembers the choice locally and keeps out of the way.
// `onLegal` opens an in-app policy page when provided; without it we fall back
// to the #privacy deep-link the router already understands.
export function CookieConsent({ onLegal }) {
  const [render, setRender] = useState(false); // mounted in the DOM
  const [entered, setEntered] = useState(false); // slid into view
  const closingRef = useRef(false);
  const leaveTimer = useRef(null);

  // Only surface the notice to visitors who haven't chosen yet. The short delay
  // lets the hero's own entrance play first, so this reads as considered.
  useEffect(() => {
    if (getCookieConsent()) return;
    const t = setTimeout(() => setRender(true), 450);
    return () => clearTimeout(t);
  }, []);

  // Flip to the settled state on the next frame so the entrance actually
  // transitions from the hidden start-state instead of snapping into place.
  useEffect(() => {
    if (!render) return;
    const r = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(r);
  }, [render]);

  useEffect(() => () => clearTimeout(leaveTimer.current), []);

  const choose = useCallback((choice) => {
    if (closingRef.current) return;
    closingRef.current = true;
    try {
      localStorage.setItem(STORAGE_KEY, choice);
    } catch {
      /* private mode — honor the click anyway, just don't persist it */
    }
    setEntered(false); // slide back out, then unmount once it's gone
    leaveTimer.current = setTimeout(() => setRender(false), 480);
  }, []);

  // Escape declines — the privacy-safe reading of a dismiss gesture.
  useEffect(() => {
    if (!entered) return;
    const onKey = (e) => {
      if (e.key === "Escape") choose("declined");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [entered, choose]);

  if (!render) return null;

  const openPrivacy = () => {
    if (onLegal) onLegal("privacy");
    else window.location.hash = "privacy";
  };

  return (
    <div
      className={"cookie-consent" + (entered ? " is-in" : "")}
      role="dialog"
      aria-live="polite"
      aria-label="Cookie notice"
    >
      <div className="cookie-consent__card">
        <span className="cookie-consent__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M12 2.6a9.4 9.4 0 1 0 9.4 9.4 3.1 3.1 0 0 1-3.6-3.6A3.1 3.1 0 0 1 14.2 4 2.9 2.9 0 0 1 12 2.6Z"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
            <circle cx="9" cy="10" r="1" fill="currentColor" />
            <circle cx="13.6" cy="14.2" r="1" fill="currentColor" />
            <circle cx="9.4" cy="15" r="0.9" fill="currentColor" />
            <circle cx="14.2" cy="9.2" r="0.9" fill="currentColor" />
          </svg>
        </span>
        <div className="cookie-consent__body">
          <h2 className="cookie-consent__title">We value your privacy</h2>
          <p className="cookie-consent__text">
            We use cookies to keep StoreCal running smoothly and to improve your experience.
            You&rsquo;re in control of what you allow.{" "}
            <button className="cookie-consent__link" onClick={openPrivacy}>
              Privacy Policy
            </button>
          </p>
          <div className="cookie-consent__actions">
            <button
              className="cookie-consent__btn cookie-consent__btn--ghost"
              onClick={() => choose("declined")}
            >
              Decline
            </button>
            <button
              className="cookie-consent__btn cookie-consent__btn--accept"
              onClick={() => choose("accepted")}
            >
              Accept
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
