// Validate environment configuration at startup — fail fast on anything that
// would silently break the app, and log which optional integrations are on.
const isProd = process.env.NODE_ENV === "production";

function validateEnv() {
  const problems = [];
  const warnings = [];

  // Critical: without a database the app cannot serve anything.
  if (!process.env.MONGODB_URI) problems.push("MONGODB_URI is required (MongoDB connection string).");

  // The JWT signing secret should be a strong random value — with the dev
  // default, auth cookies could be forged. We warn loudly (even in production)
  // rather than refuse to boot, so a running deployment is never taken down by
  // this check; the operator should set JWT_SECRET in the environment.
  if (!process.env.JWT_SECRET) {
    warnings.push(
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
