// Contentsquare analytics, gated by the cookie-consent choice.
//
// Policy: tracking is ON by default and while the visitor hasn't chosen yet,
// STAYS ON when they Accept, and turns OFF only when they Decline. Since the tag
// can't be cleanly stopped once loaded, "off" is achieved by not loading it —
// the Decline handler reloads the page so this guard skips it.

const TAG_SRC = "https://t.contentsquare.net/uxa/6d54d380209c1.js";
let started = false;

// Inject the Contentsquare tag (idempotent).
export function loadAnalytics() {
  if (started || document.querySelector('script[src="' + TAG_SRC + '"]')) { started = true; return; }
  started = true;
  const s = document.createElement("script");
  s.src = TAG_SRC;
  s.defer = true;
  document.head.appendChild(s);
}

// Called once at startup: load unless the visitor has explicitly declined.
export function initAnalytics(consent) {
  if (consent !== "declined") loadAnalytics();
}
