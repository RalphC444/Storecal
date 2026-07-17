// JWT auth helpers: password hashing, token sign/verify (httpOnly cookie),
// and route middleware for role-based access. Owner vs provider roles.

const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me-in-prod";
const COOKIE = "hs_token";
const MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days

async function hashPassword(pw) {
  return bcrypt.hash(pw, 10);
}
async function comparePassword(pw, hash) {
  return bcrypt.compare(pw, hash || "");
}

function signToken(user) {
  return jwt.sign(
    { uid: user._id.toString(), role: user.role, shopId: user.shopId, providerId: user.providerId || null },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

function setAuthCookie(res, token) {
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: MAX_AGE,
    path: "/",
  });
}
function clearAuthCookie(res) {
  res.clearCookie(COOKIE, { path: "/" });
}

// Populates req.auth = { uid, role, shopId, providerId } from the cookie.
function requireAuth(req, res, next) {
  const token = req.cookies?.[COOKIE];
  if (!token) return res.status(401).json({ error: "Not signed in" });
  try {
    req.auth = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: "Session expired" });
  }
}

function requireOwner(req, res, next) {
  if (req.auth?.role !== "owner") return res.status(403).json({ error: "Owner access required" });
  next();
}

// Platform operator — manages every shop's plan/booking access across the app.
function requireSuperAdmin(req, res, next) {
  if (req.auth?.role !== "superadmin") return res.status(403).json({ error: "Admin access required" });
  next();
}

// Non-blocking: attach req.auth if a valid cookie is present (public routes still
// work unauthenticated). Lets routes prefer the token's shopId over the env shop.
function attachAuth(req, _res, next) {
  const token = req.cookies?.[COOKIE];
  if (token) { try { req.auth = jwt.verify(token, JWT_SECRET); } catch { /* ignore */ } }
  next();
}

// One-time invite token (owner shares a link; provider clicks to activate).
function signInvite(uid) {
  return jwt.sign({ purpose: "invite", uid }, JWT_SECRET, { expiresIn: "14d" });
}
function verifyInvite(token) {
  const p = jwt.verify(token, JWT_SECRET);
  if (p.purpose !== "invite") throw new Error("Not an invite token");
  return p;
}

// Password-reset token (short-lived).
function signReset(uid) {
  // 24h window so a user who opens the email later still has a valid link.
  return jwt.sign({ purpose: "reset", uid }, JWT_SECRET, { expiresIn: "24h" });
}
function verifyReset(token) {
  const p = jwt.verify(token, JWT_SECRET);
  if (p.purpose !== "reset") throw new Error("Not a reset token");
  return p;
}

// Manage-appointment token: lets a customer reschedule or cancel their own
// booking from a link in the confirmation email/text — no login. Scoped to one
// appointment id; whoever holds the link (it was sent to them) can manage only
// that appointment. 120 days covers even far-out bookings.
function signManage(apptId) {
  return jwt.sign({ purpose: "manage", aid: String(apptId) }, JWT_SECRET, { expiresIn: "120d" });
}
function verifyManage(token) {
  const p = jwt.verify(token, JWT_SECRET);
  if (p.purpose !== "manage") throw new Error("Not a manage token");
  return p;
}

// A short, human-friendly temp password to hand off (no ambiguous chars).
function generateTempPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789abcdefghijkmnpqrstuvwxyz";
  let out = "";
  for (let i = 0; i < 8; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return `${out.slice(0, 4)}-${out.slice(4)}`;
}

module.exports = {
  COOKIE, hashPassword, comparePassword, signToken,
  setAuthCookie, clearAuthCookie, requireAuth, requireOwner, requireSuperAdmin, attachAuth, generateTempPassword,
  signInvite, verifyInvite, signReset, verifyReset, signManage, verifyManage,
};
