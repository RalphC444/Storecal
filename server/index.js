require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const path = require("path");
const fs = require("fs");

const authRouter = require("./routes/auth");
const providersRouter = require("./routes/providers");
const availabilityRouter = require("./routes/availability");
const timeoffRouter = require("./routes/timeoff");
const appointmentsRouter = require("./routes/appointments");
const shopConfigRouter = require("./routes/shopConfig");
const clientsRouter = require("./routes/clients");
const servicesRouter = require("./routes/services");
const billingRouter = require("./routes/billing");
const { attachAuth } = require("./auth");

const app = express();

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

// Public assets served at the root — notably /embed.js, the booking widget that
// customer sites load with <script src="…/embed.js" data-store="KEY">.
app.use(express.static(path.resolve(__dirname, "public"), { extensions: ["html"] }));

app.use("/api/auth", authRouter);
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

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
  console.log(`StoreCal → http://localhost:${PORT}`);
});

// Public demo store: bootstrap on boot, then reset every few hours so visitors
// always get a clean, isolated sandbox (never a real account). Set DEMO=off to disable.
if (process.env.DEMO !== "off") {
  const { seedDemo } = require("./seedDemo");
  const run = (why) => seedDemo()
    .then((r) => console.log(`Demo store ${why} (${r.publicKey})`))
    .catch((e) => console.error("Demo seed failed:", e.message));
  run("bootstrapped");
  setInterval(() => run("reset"), 3 * 60 * 60 * 1000); // every 3 hours
}
