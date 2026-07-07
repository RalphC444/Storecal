// Create (or reset) an owner account for the configured shop (SHOP_SLUG).
//   node create-owner.js <email> <password>
// Handy for the existing seeded shop, since register() makes a brand-new shop.

require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const { MongoClient } = require("mongodb");
const { hashPassword } = require("./auth");

async function run() {
  const [, , email, password] = process.argv;
  if (!email || !password) {
    console.error("Usage: node create-owner.js <email> <password>");
    process.exit(1);
  }
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const db = client.db();
  const shop = await db.collection("shops").findOne({ slug: process.env.SHOP_SLUG || "default" });
  if (!shop) { console.error("Shop not found — run the seed first"); process.exit(1); }

  const em = email.trim().toLowerCase();
  const passwordHash = await hashPassword(password);
  await db.collection("users").updateOne(
    { email: em },
    { $set: { email: em, passwordHash, name: shop.name, role: "owner", shopId: shop._id.toString(), mustChangePassword: false, updatedAt: new Date() },
      $setOnInsert: { createdAt: new Date() } },
    { upsert: true }
  );
  console.log(`Owner ready: ${em} → shop "${shop.name}"`);
  await client.close();
}
run().catch((e) => { console.error(e); process.exit(1); });
