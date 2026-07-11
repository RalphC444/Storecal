require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const path = require("path");
const fs = require("fs");
const { validateEnv } = require("./lib/config");

// Fail fast on missing/insecure configuration before we start listening.
validateEnv();

const authRouter = require("./routes/auth");
const providersRouter = require("./routes/providers");
const availabilityRouter = require("./routes/availability");
const timeoffRouter = require("./routes/timeoff");
const appointmentsRouter = require("./routes/appointments");
const shopConfigRouter = require("./routes/shopConfig");
const clientsRouter = require("./routes/clients");
const servicesRouter = require("./routes/services");
const billingRouter = require("./routes/billing");
const { attachAuth } = require("./lib/auth");

const app = express();

// Behind Render's proxy — trust it so rate limiting sees the real client IP.
app.set("trust proxy", 1);

// Security headers. CSP is left off (the SPA uses inline styles and the booking
// widget is loaded cross-origin by client sites); CORP is set to cross-origin so
// embed.js / storecal-data.js can be <script src>'d from any customer domain.
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
    crossOriginEmbedderPolicy: false,
  })
);

// Rate limiting (per client IP). Generous global cap protects the DB from abuse
// without affecting real booking traffic; auth is tighter to slow credential
// stuffing. Both return JSON so the client can surface a friendly message.
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests — please slow down and try again shortly." },
});
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts — please wait a few minutes and try again." },
});

// Allow any localhost origin in dev (Vite picks whatever port is free).
// credentials:true so the auth cookie flows cross-origin (client :5177 → api :5001).
// In production, replace with the salon's real site origin(s).
// Reflect any origin. The admin app is served same-origin (see static block
// below) so it never needs CORS; opening it lets the public booking widget call
// the API from any customer's website. Public endpoints are non-credentialed and
// the admin cookie is sameSite:lax, so cross-site credentialed calls can't leak.
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "2mb" })); // headroom for small base64 profile photos
app.use(cookieParser());
// Optional auth: attaches req.auth (shopId/role/providerId) when a valid cookie
// is present so routes can scope to the signed-in user's shop; public/booking
// reads with no cookie fall through to the env shop.
app.use(attachAuth);

// Lightweight request logging — one line per API call with status + duration.
// Skips the health check to avoid noise from uptime monitors.
app.use((req, res, next) => {
  if (!req.path.startsWith("/api/") || req.path === "/api/health") return next();
  const started = Date.now();
  res.on("finish", () => {
    console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - started}ms`);
  });
  next();
});

// Public assets served at the root — notably /embed.js, the booking widget that
// customer sites load with <script src="…/embed.js" data-store="KEY">.
app.use(express.static(path.resolve(__dirname, "public"), { extensions: ["html"] }));

// Health check for uptime monitors / load balancers.
app.get("/api/health", (_req, res) => res.json({ ok: true, uptime: process.uptime() }));

app.use("/api", apiLimiter); // global cap on all API routes
app.use("/api/auth", authLimiter, authRouter); // stricter on sign-in/reset
app.use("/api/providers", providersRouter);
app.use("/api/availability", availabilityRouter);
app.use("/api/timeoff", timeoffRouter);
app.use("/api/appointments", appointmentsRouter);
app.use("/api/shop-config", shopConfigRouter);
app.use("/api/clients", clientsRouter);
app.use("/api/services", servicesRouter);
app.use("/api/billing", billingRouter);
app.use("/api/public", require("./routes/public")); // website: services + staff
app.use("/api/addons", require("./routes/addons"));
app.use("/api/admin", require("./routes/admin")); // platform operator: manage clients
app.use("/api/apply", require("./routes/apply")); // marketing: "apply for a website" form
app.use("/api/gallery", require("./routes/gallery")); // shop photo gallery (public read)

// Any unmatched /api/* route is a JSON 404 (not the SPA fallback below).
app.use("/api", (_req, res) => res.status(404).json({ error: "Not found" }));

// In production, serve the built React app from the same origin as the API, so
// the client's relative /api calls and the sameSite auth cookie just work with
// no cross-origin setup. `npm run build` (client) produces client/dist.
const clientDist = path.resolve(__dirname, "../client/dist");
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  // SPA fallback: any non-API GET returns index.html for client-side routing.
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api/")) return next();
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

// Central error handler — last-resort safety net for anything a route throws
// without catching. Logs server-side; returns a generic message so internal
// details never leak to clients.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  console.error(`[error] ${req.method} ${req.originalUrl}:`, err.stack || err.message);
  if (res.headersSent) return;
  res.status(err.status || 500).json({ error: "Something went wrong. Please try again." });
});

const PORT = process.env.PORT || 5001;
// Wrap Express in an explicit HTTP server so Socket.IO can share the same port.
// Real-time push: admin calendars subscribe per-shop and update live on booking.
const http = require("http");
const { init: initRealtime } = require("./lib/realtime");
const server = http.createServer(app);
initRealtime(server);
server.listen(PORT, () => {
  console.log(`StoreCal → http://localhost:${PORT}`);
});

// Ensure DB indexes for the hot query paths (idempotent; safe on every boot).
const { getDb } = require("./lib/db");
const { ensureIndexes } = require("./lib/indexes");
getDb()
  .then(ensureIndexes)
  .catch((e) => console.error("Index setup failed:", e.message));

// Public demo store: bootstrap on boot, then reset every few hours so visitors
// always get a clean, isolated sandbox (never a real account). Set DEMO=off to disable.
if (process.env.DEMO !== "off") {
  const { seedDemo } = require("./scripts/seedDemo");
  const run = (why) => seedDemo()
    .then((r) => console.log(`Demo store ${why} (${r.publicKey})`))
    .catch((e) => console.error("Demo seed failed:", e.message));
  run("bootstrapped");
  setInterval(() => run("reset"), 3 * 60 * 60 * 1000); // every 3 hours
}
