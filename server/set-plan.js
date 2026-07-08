// Assign a subscription plan to a shop. The owner's "Subscribe" button then
// charges this plan at Stripe Checkout.
//
//   node set-plan.js <booking|website> [slug]
//
// Plan ids must match server/routes/billing.js PLANS.

require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const { MongoClient } = require("mongodb");

const PLANS = {
  booking: "$35/mo — Booking access",
  website: "$99/mo — Website + Booking",
};

async function run() {
  const planId = process.argv[2];
  const slug = process.argv[3] || process.env.SHOP_SLUG || "default";

  if (!PLANS[planId]) {
    console.error(`Usage: node set-plan.js <${Object.keys(PLANS).join("|")}> [slug]`);
    process.exit(1);
  }

  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const db = client.db();

  const result = await db.collection("shops").updateOne(
    { slug },
    { $set: { planId } }
  );

  if (result.matchedCount === 0) {
    console.error(`No shop found with slug "${slug}"`);
    process.exit(1);
  }

  console.log(`Shop "${slug}" → plan="${planId}" (${PLANS[planId]})`);
  await client.close();
}

run().catch((e) => { console.error(e); process.exit(1); });
