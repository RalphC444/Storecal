// Server-side PostHog capture for the reliable funnel milestones (signup,
// activation, first booking, subscribe). Keyed by shopId so all of a shop's
// events group into one funnel — and immune to ad-blockers/consent that can
// drop client events. Dependency-free: posts to PostHog's HTTP capture API via
// the global fetch (Node 18+), so no npm package to install.
//
// No-ops entirely unless POSTHOG_KEY is set, so prod behaves identically until
// you add the key.
const HOST = process.env.POSTHOG_HOST || "https://us.i.posthog.com";
const KEY = process.env.POSTHOG_KEY || "";

function capture(distinctId, event, properties = {}) {
  if (!KEY || !distinctId) return;
  try {
    fetch(`${HOST}/capture/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: KEY,
        event,
        distinct_id: String(distinctId),
        properties: { source: "server", ...properties },
      }),
    }).catch(() => {});
  } catch { /* best-effort — never break the request */ }
}

module.exports = { capture };
