const { Router } = require("express");
const { getDb } = require("../lib/db");
const { ObjectId } = require("mongodb");
const {
  hashPassword, comparePassword, signToken,
  setAuthCookie, clearAuthCookie, requireAuth, verifyInvite, signReset, verifyReset,
} = require("../lib/auth");
const { sendReset } = require("../lib/mailer");
const { generatePublicKey } = require("../lib/shopScope");

const router = Router();

// The shared public demo account. The client treats this account as a throwaway
// sandbox: no settings, an obvious way out, and no auto-resume on return.
const DEMO_EMAIL = "demo@storecal.com";

function publicUser(u) {
  return {
    _id: u._id.toString(),
    email: u.email,
    name: u.name || "",
    role: u.role,
    shopId: u.shopId,
    providerId: u.providerId || null,
    mustChangePassword: !!u.mustChangePassword,
    demo: u.email === DEMO_EMAIL,
  };
}

// Booking-form presets per vertical (kept in sync with admin.js / set-business-type.js).
const BOOKING_PRESETS = {
  salon: { vehicle: false, pet: false, providerPicker: true, providerLabel: "Choose your stylist", serviceLabel: "Select a service", notesLabel: "Anything we should know? (optional)", notesPlaceholder: "Allergies, preferences, inspiration photos, or anything else…" },
  grooming: { vehicle: false, pet: true, providerPicker: true, providerLabel: "Choose your groomer", serviceLabel: "Select a service", notesLabel: "Anything we should know? (optional)", notesPlaceholder: "Temperament, matting, sensitivities, or special requests…" },
  auto: { vehicle: true, pet: false, providerPicker: false, providerLabel: "", serviceLabel: "Select a service", notesLabel: "Describe the issue (optional)", notesPlaceholder: "What symptoms, noises, or concerns should we know about?" },
  generic: { vehicle: false, pet: false, providerPicker: false, providerLabel: "", serviceLabel: "Select a service", notesLabel: "Notes (optional)", notesPlaceholder: "Anything we should know before your appointment?" },
};

// POST /api/auth/register — SELF-SERVE owner signup: creates a shop + owner
// account, logs them in, and sets them up to start a first-month-free
// subscription. Booking works immediately (demo mode) so the hosted page and
// embed are usable out of the gate.
router.post("/register", async (req, res) => {
  try {
    const { businessName, email, password } = req.body;
    if (!businessName?.trim()) return res.status(400).json({ error: "Business name is required" });
    if (!email?.trim()) return res.status(400).json({ error: "Email is required" });
    if (!password || password.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters" });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return res.status(400).json({ error: "Enter a valid email address" });

    const businessType = BOOKING_PRESETS[req.body.businessType] ? req.body.businessType : "salon";
    const phone = String(req.body.phone || "").trim();
    const website = String(req.body.website || "").trim();

    const db = await getDb();
    const em = email.trim().toLowerCase();
    if (await db.collection("users").findOne({ email: em })) {
      return res.status(409).json({ error: "An account with that email already exists" });
    }

    let shopSlug = (req.body.slug || businessName).trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "shop";
    if (await db.collection("shops").findOne({ slug: shopSlug })) shopSlug += "-" + Math.random().toString(36).slice(2, 6);

    const shopRes = await db.collection("shops").insertOne({
      slug: shopSlug, name: businessName.trim(), businessType, booking: BOOKING_PRESETS[businessType],
      publicKey: generatePublicKey(), // stable public id baked into the embed
      phone, website,
      bookingActive: true,    // booking on out of the gate (not demo mode, so the
                              // subscribe nudge still shows to convert them)
      promptBilling: true,    // show the "subscribe to enable booking" nudge
      firstMonthFree: true,   // self-serve signups get a 30-day free trial at checkout
      createdAt: new Date(),
    });
    const shopId = shopRes.insertedId.toString();
    const shop = await db.collection("shops").findOne({ _id: shopRes.insertedId });

    const userRes = await db.collection("users").insertOne({
      email: em, passwordHash: await hashPassword(password), name: businessName.trim(),
      role: "owner", shopId, mustChangePassword: false, createdAt: new Date(),
    });
    const user = await db.collection("users").findOne({ _id: userRes.insertedId });

    // Owner is a bookable provider by default (they can turn this off in Settings).
    // Auto shops don't do per-staff booking, so the owner rep stays inactive.
    await db.collection("providers").insertOne({
      shopId, name: businessName.trim(), email: em, bio: "", photo: "",
      active: businessType !== "auto", ownerUserId: userRes.insertedId.toString(), serviceIds: [], sortOrder: 0, createdAt: new Date(),
    });

    setAuthCookie(res, signToken(user));
    const origin = req.headers.origin || "";
    res.status(201).json({
      user: publicUser(user),
      slug: shopSlug,
      publicKey: shop.publicKey,
      bookingUrl: origin ? `${origin}/book/${shopSlug}` : `/book/${shopSlug}`,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Email and password are required" });

    const db = await getDb();
    const user = await db.collection("users").findOne({ email: email.trim().toLowerCase() });
    if (!user || !(await comparePassword(password, user.passwordHash))) {
      return res.status(401).json({ error: "Incorrect email or password" });
    }
    if (user.disabled) {
      const shop = await db.collection("shops").findOne({ _id: new ObjectId(user.shopId) }).catch(() => null);
      return res.status(403).json({ error: `You're no longer part of ${shop?.name || "this store"}. Contact the store owner if this is a mistake.` });
    }
    setAuthCookie(res, signToken(user));
    res.json({ user: publicUser(user) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/accept-invite — provider clicks their invite link.
// One-time: logs them in; they still must set a password (mustChangePassword).
router.post("/accept-invite", async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: "Missing invite" });
    let uid;
    try { ({ uid } = verifyInvite(token)); }
    catch { return res.status(400).json({ error: "This invite link has expired or is invalid." }); }

    const db = await getDb();
    const user = await db.collection("users").findOne({ _id: new ObjectId(uid) });
    if (!user || user.inviteToken !== token) {
      return res.status(400).json({ error: "This invite link is invalid or has already been used." });
    }
    await db.collection("users").updateOne({ _id: user._id }, { $unset: { inviteToken: "" } });
    setAuthCookie(res, signToken(user));
    res.json({ user: publicUser(user) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/auth/me
router.get("/me", requireAuth, async (req, res) => {
  try {
    const db = await getDb();
    const user = await db.collection("users").findOne({ _id: new ObjectId(req.auth.uid) });
    if (!user) return res.status(401).json({ error: "Account not found" });
    if (user.disabled) return res.status(401).json({ error: "Access removed" }); // kicks an open session
    res.json({ user: publicUser(user) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/change-password
// Forced change (mustChangePassword) doesn't require the current password;
// otherwise the current password must match.
router.post("/change-password", requireAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!newPassword || newPassword.length < 8) return res.status(400).json({ error: "New password must be at least 8 characters" });

    const db = await getDb();
    const user = await db.collection("users").findOne({ _id: new ObjectId(req.auth.uid) });
    if (!user) return res.status(401).json({ error: "Account not found" });

    if (!user.mustChangePassword) {
      if (!(await comparePassword(currentPassword || "", user.passwordHash))) {
        return res.status(400).json({ error: "Current password is incorrect" });
      }
    }
    await db.collection("users").updateOne(
      { _id: user._id },
      { $set: { passwordHash: await hashPassword(newPassword), mustChangePassword: false, updatedAt: new Date() } }
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/forgot — always 200 (no account enumeration). When an email
// provider is configured it emails a reset link; until then it's a safe no-op.
router.post("/forgot", async (req, res) => {
  try {
    const { email } = req.body;
    if (email) {
      const db = await getDb();
      const user = await db.collection("users").findOne({ email: email.trim().toLowerCase() });
      if (user && process.env.RESEND_API_KEY) {
        const origin = req.headers.origin || "http://localhost:5173";
        await sendReset(user.email, `${origin}/?reset=${signReset(user._id.toString())}`);
      }
    }
  } catch { /* swallow — never reveal whether the account exists */ }
  res.json({ ok: true });
});

// POST /api/auth/reset-password — set a new password from a reset link token.
router.post("/reset-password", async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    if (!newPassword || newPassword.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters" });
    let uid;
    try { ({ uid } = verifyReset(token)); }
    catch { return res.status(400).json({ error: "This reset link has expired or is invalid." }); }

    const db = await getDb();
    await db.collection("users").updateOne(
      { _id: new ObjectId(uid) },
      { $set: { passwordHash: await hashPassword(newPassword), mustChangePassword: false, updatedAt: new Date() } }
    );
    const user = await db.collection("users").findOne({ _id: new ObjectId(uid) });
    if (!user) return res.status(400).json({ error: "Account not found" });
    setAuthCookie(res, signToken(user));
    res.json({ user: publicUser(user) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/auth/profile — update the signed-in user's display name.
router.patch("/profile", requireAuth, async (req, res) => {
  try {
    const { name } = req.body;
    const db = await getDb();
    const set = { updatedAt: new Date() };
    if (typeof name === "string" && name.trim()) set.name = name.trim();
    await db.collection("users").updateOne({ _id: new ObjectId(req.auth.uid) }, { $set: set });
    const user = await db.collection("users").findOne({ _id: new ObjectId(req.auth.uid) });
    res.json({ user: publicUser(user) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/logout
router.post("/logout", (req, res) => {
  clearAuthCookie(res);
  res.json({ success: true });
});

module.exports = router;
