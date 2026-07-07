// Print a store's public key + paste-ready embed snippet (for when YOU set up a
// customer's site). Usage:
//   node server/store-embed.js                       list every store + its key
//   node server/store-embed.js <slug|owner-email>    one store's snippet
//   node server/store-embed.js <slug> https://book.storecal.com   set the base URL
//
// The base URL defaults to $PUBLIC_URL or a placeholder — pass your real domain.
require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const { getDb } = require("./db");

const arg = process.argv[2];
const base = (process.argv[3] || process.env.PUBLIC_URL || "https://YOUR-DOMAIN").replace(/\/$/, "");

function snippet(key) {
  return `<script src="${base}/embed.js" data-store="${key}"></script>`;
}

(async () => {
  const db = await getDb();

  if (!arg) {
    const shops = await db.collection("shops").find({}).toArray();
    console.log(`\n${shops.length} store(s):\n`);
    for (const s of shops) {
      console.log(`  ${s.name}  (slug: ${s.slug})`);
      console.log(`    publicKey: ${s.publicKey || "— none (run: node server/backfill-keys.js)"}`);
      if (s.publicKey) console.log(`    embed:     ${snippet(s.publicKey)}`);
      console.log("");
    }
    process.exit(0);
  }

  const q = arg.includes("@")
    ? { _id: (await db.collection("users").findOne({ email: arg.toLowerCase(), role: "owner" }))?.shopId }
    : { slug: arg };
  // If looked up by email, shopId is a string; match shops by _id via ObjectId.
  let shop;
  if (arg.includes("@")) {
    const { ObjectId } = require("mongodb");
    shop = q._id ? await db.collection("shops").findOne({ _id: new ObjectId(q._id) }) : null;
  } else {
    shop = await db.collection("shops").findOne(q);
  }
  if (!shop) { console.error(`No store found for "${arg}".`); process.exit(1); }
  if (!shop.publicKey) { console.error(`"${shop.name}" has no publicKey yet — run: node server/backfill-keys.js`); process.exit(1); }

  console.log(`\n${shop.name}  (slug: ${shop.slug})`);
  console.log(`publicKey: ${shop.publicKey}\n`);
  console.log("Paste this on the store's website where the booking form should appear:\n");
  console.log("  " + snippet(shop.publicKey) + "\n");
  if (base.includes("YOUR-DOMAIN")) {
    console.log("(Tip: pass your live domain, e.g.  node server/store-embed.js " + shop.slug + " https://book.storecal.com)\n");
  }
  process.exit(0);
})();
