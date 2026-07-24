// Seed Fleetwood Barber Shop with an extensive barber menu + add-ons.
//
//   node scripts/seedFleetwood.js            → inspect only (read-only, no writes)
//   node scripts/seedFleetwood.js --seed     → insert services + add-ons (idempotent)
//   node scripts/seedFleetwood.js --undo     → remove everything this script seeded
//
// Reversible + idempotent: seeded services carry `seededBy: "fleetwood-seed"`, so
// re-seeding replaces cleanly and --undo removes exactly what was added.
require("dotenv").config({ path: require("path").resolve(__dirname, "../../.env") });
const { getDb } = require("../lib/db");

const PUBLIC_KEY = "sc_52c08a4dcc45771f0c"; // Fleetwood Barber Shop
const MARKER = "fleetwood-seed";

// name · minutes · price
const SERVICES = [
  { name: "Classic Haircut", durationMin: 45, price: "$35", description: "Scissor or clipper cut tailored to you, finished with a style." },
  { name: "Skin Fade", durationMin: 45, price: "$40", description: "Sharp fade blended down to the skin." },
  { name: "Haircut & Beard Combo", durationMin: 60, price: "$50", description: "Full cut plus a shaped, lined-up beard." },
  { name: "Beard Trim & Line-Up", durationMin: 20, price: "$20", description: "Shape, trim, and a crisp line-up." },
  { name: "Hot Towel Straight-Razor Shave", durationMin: 30, price: "$35", description: "Traditional hot-towel shave with a straight razor." },
  { name: "Head Shave", durationMin: 30, price: "$30", description: "Smooth bald shave, hot towel and aftercare." },
  { name: "Kids Cut (12 & under)", durationMin: 30, price: "$25", description: "Cut for the little ones." },
  { name: "Senior Cut (65+)", durationMin: 30, price: "$25", description: "Classic cut at a senior rate." },
  { name: "Buzz Cut", durationMin: 20, price: "$20", description: "One-length clipper cut." },
  { name: "Line-Up / Edge-Up", durationMin: 15, price: "$15", description: "Clean up the hairline and edges." },
  { name: "Gray Blending", durationMin: 30, price: "$30", description: "Soften gray for a natural, blended look." },
  { name: "Wash & Style", durationMin: 20, price: "$20", description: "Shampoo, condition, and style." },
];

const ADDONS = [
  { name: "Hot Towel Treatment", price: "$8" },
  { name: "Beard Oil Finish", price: "$6" },
  { name: "Hair Design / Part", price: "$10" },
  { name: "Eyebrow Cleanup", price: "$7" },
  { name: "Nose & Ear Wax", price: "$10" },
  { name: "Scalp Massage", price: "$8" },
];

async function main() {
  const mode = process.argv.includes("--seed") ? "seed" : process.argv.includes("--undo") ? "undo" : "inspect";
  const db = await getDb();
  const shop = await db.collection("shops").findOne({ publicKey: PUBLIC_KEY })
    || await db.collection("shops").findOne({ name: /fleetwood/i });
  if (!shop) { console.error("Fleetwood shop not found (publicKey", PUBLIC_KEY, ")"); process.exit(1); }
  const shopId = shop._id.toString();

  // Diagnostics — these flags drive whether the subscribe CTA shows.
  const providers = await db.collection("providers").find({ shopId }).toArray();
  const svcCount = await db.collection("services").countDocuments({ shopId });
  console.log("── Fleetwood Barber Shop ──────────────────────────────");
  console.log("shopId        :", shopId);
  console.log("slug          :", shop.slug);
  console.log("businessType  :", shop.businessType);
  console.log("services (now):", svcCount, "| providers:", providers.length);
  console.log("addons (now)  :", (shop.addons || []).length);
  console.log("── subscribe-CTA gating flags ──");
  console.log("demo          :", shop.demo, "  (undefined counts as demo in admin; blocks the CTA in billing)");
  console.log("bookingActive :", shop.bookingActive);
  console.log("promptBilling :", shop.promptBilling);
  console.log("freeForLife   :", shop.freeForLife);
  console.log("subscribed    :", shop.subscribed);
  console.log("planId        :", shop.planId);
  console.log("→ /api/billing promptBilling =",
    shop.promptBilling === true && shop.freeForLife !== true && shop.demo !== true,
    "(CTA shows only when true)");
  console.log("───────────────────────────────────────────────────────");

  if (mode === "inspect") { console.log("Inspect only — no changes. Re-run with --seed or --undo."); return; }

  // Always start by removing any prior seed (keeps re-runs + undo clean).
  const prior = await db.collection("services").find({ shopId, seededBy: MARKER }).toArray();
  const priorIds = prior.map((s) => s._id.toString());
  if (priorIds.length) {
    await db.collection("services").deleteMany({ shopId, seededBy: MARKER });
    await db.collection("providers").updateMany({ shopId }, { $pull: { serviceIds: { $in: priorIds } } });
  }

  if (mode === "undo") {
    await db.collection("shops").updateOne({ _id: shop._id }, { $set: { addons: [] } });
    console.log(`Undone: removed ${priorIds.length} seeded services and cleared add-ons.`);
    return;
  }

  // Seed services.
  const docs = SERVICES.map((s, i) => ({
    shopId, name: s.name, description: s.description || "",
    durationMin: s.durationMin, price: s.price, sortOrder: i,
    seededBy: MARKER, createdAt: new Date(),
  }));
  const res = await db.collection("services").insertMany(docs);
  const newIds = Object.values(res.insertedIds).map((id) => id.toString());

  // Offer every service on every staff member (matches the app's default).
  await db.collection("providers").updateMany({ shopId }, { $addToSet: { serviceIds: { $each: newIds } } });

  // Add-ons live on the shop doc.
  await db.collection("shops").updateOne({ _id: shop._id }, { $set: { addons: ADDONS } });

  console.log(`Seeded ${docs.length} services + ${ADDONS.length} add-ons for ${shop.name}.`);
  console.log("Undo anytime with:  node scripts/seedFleetwood.js --undo");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
