// Real-time push over Socket.IO. Two kinds of client connect to the same server:
//
//   • Admin app  — authenticates with the httpOnly JWT cookie and joins a private
//                  room (admin:<shopId>). Receives full "appointment:changed"
//                  events (ids, status) to live-update the calendar.
//   • Embed widget — connects cross-origin & unauthenticated, identifying its shop
//                  by the PUBLIC store key (same key used for REST reads). Joins a
//                  public room (pub:<shopId>) and receives only "availability:changed"
//                  — a shopId/day/provider ping with NO client PII — so open booking
//                  widgets refetch open days/timeslots the moment one is taken.
//
// Route handlers call notifyAppointmentChange() after a mutation; it fans out the
// right event to each room.

const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const { getDb } = require("./db");

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me-in-prod";
const COOKIE = "hs_token";

let io = null;

// Parse a raw Cookie header into { name: value } without pulling in a dependency.
function parseCookies(header) {
  const out = {};
  (header || "").split(";").forEach((part) => {
    const i = part.indexOf("=");
    if (i < 0) return;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  });
  return out;
}

const adminRoom = (shopId) => `admin:${shopId}`;
const pubRoom = (shopId) => `pub:${shopId}`;

// Resolve a socket to a shop. An admin cookie wins (private room); otherwise a
// public store key (handshake.auth.key) grants the public room only. Either way
// we end up with a shopId + role; no match → the connection is refused.
async function authenticate(socket) {
  const cookies = parseCookies(socket.handshake.headers.cookie);
  const token = cookies[COOKIE];
  if (token) {
    try {
      const auth = jwt.verify(token, JWT_SECRET);
      if (auth.shopId) return { role: "admin", shopId: String(auth.shopId) };
    } catch { /* fall through to the public key path */ }
  }
  const key = socket.handshake.auth?.key || socket.handshake.query?.key;
  if (key) {
    const db = await getDb();
    const shop = await db.collection("shops").findOne(
      { publicKey: key },
      { projection: { _id: 1 } }
    );
    if (shop) return { role: "public", shopId: shop._id.toString() };
  }
  return null;
}

function init(httpServer) {
  io = new Server(httpServer, {
    // origin:true reflects the caller — the admin app is same-origin and every
    // customer site embeds the widget cross-origin. credentials:true lets the
    // admin auth cookie ride the handshake; public sockets send no cookie.
    cors: { origin: true, credentials: true },
  });

  io.use((socket, next) => {
    authenticate(socket)
      .then((ident) => {
        if (!ident) return next(new Error("unauthorized"));
        socket.data.role = ident.role;
        socket.data.shopId = ident.shopId;
        next();
      })
      .catch(() => next(new Error("unauthorized")));
  });

  io.on("connection", (socket) => {
    const { role, shopId } = socket.data;
    socket.join(role === "admin" ? adminRoom(shopId) : pubRoom(shopId));
  });

  return io;
}

// Fan out an appointment mutation. Admins get the detailed event; embeds get a
// PII-free availability ping for the affected day/provider so they refetch slots.
function notifyAppointmentChange(shopId, payload) {
  if (!io || !shopId) return;
  const id = String(shopId);
  io.to(adminRoom(id)).emit("appointment:changed", payload);
  io.to(pubRoom(id)).emit("availability:changed", {
    kind: "appointment",
    action: payload.action,
    dateKey: payload.dateKey || null,
    providerId: payload.providerId || null,
  });
}

// Fan out a schedule change (weekly hours / a day override) so open booking
// widgets refetch the whole schedule and re-gray days live — no PII involved.
function notifyAvailabilityChange(shopId, payload = {}) {
  if (!io || !shopId) return;
  io.to(pubRoom(String(shopId))).emit("availability:changed", {
    kind: "schedule",
    providerId: payload.providerId || null,
    dateKey: payload.dateKey || null,
  });
}

module.exports = { init, notifyAppointmentChange, notifyAvailabilityChange };
