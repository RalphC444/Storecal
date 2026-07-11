// Validate environment configuration at startup — fail fast on anything that
// would silently break the app, and log which optional integrations are on.
const isProd = process.env.NODE_ENV === "production";

function validateEnv() {
  const problems = [];
  const warnings = [];

  // Critical: without a database the app cannot serve anything.
  if (!process.env.MONGODB_URI) problems.push("MONGODB_URI is required (MongoDB connection string).");

  // Critical in production: the JWT signing secret must not be the dev default,
  // or every auth cookie could be forged.
  if (!process.env.JWT_SECRET) {
    (isProd ? problems : warnings).push(
      "JWT_SECRET is not set — using an insecure dev default. Set a strong random value in production."
    );
  }

  // Optional integrations degrade gracefully; just note their status.
  const optional = {
    Stripe: !!process.env.STRIPE_SECRET_KEY,
    "Email (Resend)": !!process.env.RESEND_API_KEY,
    "Apply form (EmailJS)": !!process.env.EMAILJS_SERVICE_ID,
  };

  if (problems.length) {
    console.error("✗ Startup configuration errors:\n  - " + problems.join("\n  - "));
    throw new Error("Invalid environment configuration");
  }
  if (warnings.length) console.warn("⚠ " + warnings.join("\n⚠ "));
  console.log(
    "Integrations: " +
      Object.entries(optional)
        .map(([k, on]) => `${k}=${on ? "on" : "off"}`)
        .join(", ")
  );
}

module.exports = { validateEnv, isProd };
