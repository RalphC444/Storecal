// Create (or reset) the platform super-admin login that manages all clients.
//
//   node make-superadmin.js [email] [password]
//
// Defaults to capriglioner@gmail.com. Change the password after first login.
require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const { MongoClient } = require("mongodb");
const bcrypt = require("bcryptjs");

async function run() {
  const email = (process.argv[2] || "capriglioner@gmail.com").trim().toLowerCase();
  const password = process.argv[3] || "admin123";

  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const db = client.db();

  const passwordHash = await bcrypt.hash(password, 10);
  await db.collection("users").updateOne(
    { email },
    {
      $set: { email, passwordHash, name: "StoreCal Admin", role: "superadmin", shopId: null, mustChangePassword: false },
      $setOnInsert: { createdAt: new Date() },
    },
    { upsert: true }
  );

  console.log(`Super-admin ready: ${email} (role=superadmin). Change the password after first login.`);
  await client.close();
}

run().catch((e) => { console.error(e); process.exit(1); });
