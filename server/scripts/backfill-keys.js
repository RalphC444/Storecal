// One-off: give every existing shop a stable publicKey (for embed snippets).
// Run once after deploying the embed feature:  node server/backfill-keys.js
require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const { getDb } = require("../lib/db");
const { generatePublicKey } = require("../lib/shopScope");

(async () => {
  const db = await getDb();
  const shops = await db.collection("shops").find({ publicKey: { $exists: false } }).toArray();
  if (shops.length === 0) { console.log("All shops already have a publicKey."); process.exit(0); }
  for (const shop of shops) {
    const publicKey = generatePublicKey();
    await db.collection("shops").updateOne({ _id: shop._id }, { $set: { publicKey } });
    console.log(`${shop.name} (${shop.slug}) → ${publicKey}`);
  }
  console.log(`\nBackfilled ${shops.length} shop(s).`);
  process.exit(0);
})();
