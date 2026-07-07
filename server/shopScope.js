// Resolve which shop a request is for — the single source of truth for
// multi-tenant scoping. Precedence:
//   1. Signed-in admin  → their own shop (req.auth.shopId from the JWT)
//   2. Public embed      → explicit store key (?key= / body.key) matched to publicKey
//   3. Public by slug    → ?slug= (legacy booking widget)
//   4. Dev fallback      → the SHOP_SLUG env shop (single-store dev/demo)
//
// The publicKey is a stable, immutable, PUBLIC identifier baked into a store's
// embed snippet. It only grants read of the public menu/staff/availability and
// creation of a booking for that one store — never admin access.

const { ObjectId } = require("mongodb");
const crypto = require("crypto");

function generatePublicKey() {
  return "sc_" + crypto.randomBytes(9).toString("hex"); // e.g. sc_9f3a2c7b41e84d6a12
}

async function resolveShop(req, db) {
  if (req.auth?.shopId) {
    try { return await db.collection("shops").findOne({ _id: new ObjectId(req.auth.shopId) }); }
    catch { return null; }
  }
  const key = req.query?.key || req.body?.key;
  if (key) return db.collection("shops").findOne({ publicKey: key });

  const slug = req.query?.slug;
  if (slug) return db.collection("shops").findOne({ slug });

  return db.collection("shops").findOne({ slug: process.env.SHOP_SLUG || "default" });
}

async function resolveShopId(req, db) {
  const shop = await resolveShop(req, db);
  return shop ? shop._id.toString() : null;
}

module.exports = { resolveShop, resolveShopId, generatePublicKey };
