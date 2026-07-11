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

function publicUser(u) {
  return {
    _id: u._id.toString(),
    email: u.email,
    name: u.name || "",
    role: u.role,
    shopId: u.shopId,
    providerId: u.providerId || null,
    mustChangePassword: !!u.mustChangePassword,
  };
}

// POST /api/auth/register — owner onboarding: creates a shop + owner account.
router.post("/register", async (req, res) => {
  try {
    const { businessName, email, password, slug } = req.body;
    if (!businessName?.trim()) return res.status(400).json({ error: "Business name is required" });
    if (!email?.trim()) return res.status(400).json({ error: "Email is required" });
    if (!password || password.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters" });

    const db = await getDb();
    const em = email.trim().toLowerCase();
    if (await db.collection("users").findOne({ email: em })) {
      return res.status(409).json({ error: "An account with that email already exists" });
    }

    const shopSlug = (slug || businessName).trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const shopRes = await db.collection("shops").insertOne({
      slug: shopSlug, name: businessName.trim(), businessType: "salon",
      publicKey: generatePublicKey(), // stable public id baked into the embed
      promptBilling: true,            // new accounts see the "subscribe to enable booking" banner
      createdAt: new Date(),
    });
    const shopId = shopRes.insertedId.toString();

    const userRes = await db.collection("users").insertOne({
      email: em, passwordHash: await hashPassword(password), name: businessName.trim(),
      role: "owner", shopId, mustChangePassword: false, createdAt: new Date(),
    });
    const user = await db.collection("users").findOne({ _id: userRes.insertedId });

    // Owner is a bookable provider by default (they can turn this off in Settings).
    await db.collection("providers").insertOne({
      shopId, name: businessName.trim(), email: em, bio: "", photo: "",
      active: true, ownerUserId: userRes.insertedId.toString(), serviceIds: [], sortOrder: 0, createdAt: new Date(),
    });

    setAuthCookie(res, signToken(user));
    res.status(201).json({ user: publicUser(user) });
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
