// Build client profiles from existing appointments and link each appointment
// to its client. Safe to re-run — upsertClient dedupes by phone/email and
// appointments already linked are skipped.
//
//   node backfill-clients.js

require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const { MongoClient } = require("mongodb");
const { upsertClient } = require("../lib/clients");

async function run() {
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const db = client.db();

  const shop = await db.collection("shops").findOne({ slug: process.env.SHOP_SLUG || "default" });
  if (!shop) { console.error("Shop not found — run the main seed first"); process.exit(1); }
  const shopId = shop._id.toString();

  const appts = await db.collection("appointments")
    .find({ shopId })
    .sort({ createdAt: 1 })
    .toArray();

  let created = 0, linked = 0, skipped = 0;
  const before = await db.collection("clients").countDocuments({ shopId });

  for (const a of appts) {
    if (a.clientId) { skipped += 1; continue; }
    const clientId = await upsertClient(db, shopId, a.client || {});
    if (!clientId) { skipped += 1; continue; }
    await db.collection("appointments").updateOne({ _id: a._id }, { $set: { clientId } });
    linked += 1;
  }

  const after = await db.collection("clients").countDocuments({ shopId });
  created = after - before;

  console.log(`Profiles: ${after} total (+${created} new)`);
  console.log(`Appointments linked: ${linked}, already-linked/skipped: ${skipped}`);
  await client.close();
}

run().catch((e) => { console.error(e); process.exit(1); });
