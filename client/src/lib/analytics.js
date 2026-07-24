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

// ── Product analytics (PostHog) — funnel events ────────────────────────────
// Loads ONLY when VITE_POSTHOG_KEY is set, and (like Contentsquare) only if the
// visitor hasn't declined cookies. Without a key, track() is a silent no-op, so
// the app runs identically until you plug in a project key.
const PH_KEY = import.meta.env.VITE_POSTHOG_KEY;
const PH_HOST = import.meta.env.VITE_POSTHOG_HOST || "https://us.i.posthog.com";
let phStarted = false;

function loadPosthog() {
  if (!PH_KEY || phStarted) return;
  phStarted = true;
  // Official PostHog array-stub loader — queues capture() calls until array.js loads.
  !function (t, e) { var o, n, p, r; e.__SV || (window.posthog = e, e._i = [], e.init = function (i, s, a) { function g(t, e) { var o = e.split("."); 2 == o.length && (t = t[o[0]], e = o[1]), t[e] = function () { t.push([e].concat(Array.prototype.slice.call(arguments, 0))); }; } (p = t.createElement("script")).type = "text/javascript", p.async = !0, p.src = s.api_host + "/static/array.js", (r = t.getElementsByTagName("script")[0]).parentNode.insertBefore(p, r); var u = e; for (void 0 !== a ? u = e[a] = [] : a = "posthog", u.people = u.people || [], u.toString = function (t) { var e = "posthog"; return "posthog" !== a && (e += "." + a), t || (e += " (stub)"), e; }, u.people.toString = function () { return u.toString(1) + ".people (stub)"; }, o = "init capture identify alias people.set people.set_once set_config register register_once unregister opt_out_capturing has_opted_out_capturing opt_in_capturing reset group".split(" "), n = 0; n < o.length; n++) g(u, o[n]); e._i.push([i, s, a]); }, e.__SV = 1); }(document, window.posthog || []);
  window.posthog.init(PH_KEY, { api_host: PH_HOST, capture_pageview: false, persistence: "localStorage+cookie" });
}

// Fire a funnel event. No-ops until PostHog is loaded (or forever, without a key).
export function track(event, props) {
  try { if (window.posthog && window.posthog.capture) window.posthog.capture(event, props || {}); } catch { /* best-effort */ }
}

// Called once at startup: load unless the visitor has explicitly declined.
export function initAnalytics(consent) {
  if (consent !== "declined") { loadAnalytics(); loadPosthog(); }
}
