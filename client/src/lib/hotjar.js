// Hotjar analytics, gated by the cookie-consent choice.
//
// Policy (per product decision): tracking is ON by default and while the visitor
// hasn't chosen yet, STAYS ON when they Accept, and turns OFF only when they
// Decline. Since Hotjar can't be cleanly stopped once loaded, "off" is achieved
// by not loading it — the Decline handler reloads the page so this guard skips it.

const HJID = 6749165;
const HJSV = 6;
let started = false;

// Inject the standard Hotjar snippet (idempotent).
export function loadHotjar() {
  if (started || window.hj) { started = true; return; }
  started = true;
  (function (h, o, t, j, a, r) {
    h.hj = h.hj || function () { (h.hj.q = h.hj.q || []).push(arguments); };
    h._hjSettings = { hjid: HJID, hjsv: HJSV };
    a = o.getElementsByTagName("head")[0];
    r = o.createElement("script"); r.async = 1;
    r.src = t + h._hjSettings.hjid + j + h._hjSettings.hjsv;
    a.appendChild(r);
  })(window, document, "https://static.hotjar.com/c/hotjar-", ".js?sv=");
}

// Called once at startup: load Hotjar unless the visitor has explicitly declined.
export function initHotjar(consent) {
  if (consent !== "declined") loadHotjar();
}
