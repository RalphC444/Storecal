// Server-side PostHog capture for the reliable funnel milestones (signup,
// activation, first booking, subscribe). Keyed by shopId so all of a shop's
// events group into one funnel — and immune to ad-blockers/consent that can
// drop client events. Dependency-free: posts to PostHog's HTTP capture API via
// the global fetch (Node 18+), so no npm package to install.
//
// No-ops entirely unless POSTHOG_KEY is set, so prod behaves identically until
// you add the key.
// DISABLED for now — commented out. `capture` is a no-op so its call sites
// (signup_completed, activated, first_booking) stay valid and the DB-based
// activation/funnel tracking is unaffected. To re-enable: uncomment the body
// and set POSTHOG_KEY.
/*
const HOST = process.env.POSTHOG_HOST || "https://us.i.posthog.com";
const KEY = process.env.POSTHOG_KEY || "";
*/

function capture(/* distinctId, event, properties */) {
  // PostHog disabled — no-op.
}

module.exports = { capture };
