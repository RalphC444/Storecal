// Seed the admin CRM with "greenfield" prospects found via web research:
// independent local shops (Westchester + Bronx) that appear PHONE-ONLY — no own
// website and no online-booking platform (Booksy/Fresha/Vagaro/Squire/GlossGenius).
// These are the strongest StoreCal fit (nothing to displace). Phone-first: no
// emails (these shops don't publish them) — reach them by phone, log with notes.
//
//   node scripts/seedGreenfield.js          → inspect (count only)
//   node scripts/seedGreenfield.js --seed    → insert (dedupe by name+city)
//   node scripts/seedGreenfield.js --undo    → remove this batch
//
// NOTE: "no website/booking" is a best-effort read of public listings, not a
// per-shop guarantee — verify before a shop goes to paid outreach.
require("dotenv").config({ path: require("path").resolve(__dirname, "../../.env") });
const { getDb } = require("../lib/db");

const BATCH = "greenfield-scrape-2026-07";

// [businessName, vertical, phone, city]  (state = NY; barbers → beauty)
const ROWS = [
  // ── Bronx · nails ──
  ["Saigon Nail", "nails", "(718) 893-5569", "Bronx"],
  ["Nail Island", "nails", "(718) 885-2950", "Bronx"],
  ["Nailology New York", "nails", "(845) 310-4587", "Bronx"],
  ["D'Nails Bronx Lounge & Spa", "nails", "(347) 597-9707", "Bronx"],
  // ── Bronx · hair ──
  ["Angie Hair Salon", "beauty", "(718) 828-3470", "Bronx"],
  ["Roots Hair & Spa Salon", "beauty", "(718) 652-6200", "Bronx"],
  ["Stage Hair Salon", "beauty", "(718) 684-3200", "Bronx"],
  ["New Look Salon", "beauty", "(718) 918-0414", "Bronx"],
  ["Express Yourself Salon", "beauty", "(718) 597-6432", "Bronx"],
  ["Hair By Grace", "beauty", "(646) 234-7417", "Bronx"],
  ["Kristana's Hair Place", "beauty", "(718) 365-2940", "Bronx"],
  // ── Bronx · auto ──
  ["Bronx Auto Repair", "auto", "(718) 294-0020", "Bronx"],
  ["Bronx City Services Auto Repair", "auto", "(718) 466-9634", "Bronx"],
  ["Next Level Auto Repair", "auto", "(718) 994-9414", "Bronx"],
  ["24 Hour Car Repair Center", "auto", "(718) 792-4200", "Bronx"],
  ["American A-1 Auto Center", "auto", "(718) 792-9230", "Bronx"],
  ["Personal Touch Auto Body", "auto", "(718) 652-3383", "Bronx"],
  // ── Mount Vernon / Yonkers · barbers (beauty) ──
  ["Kingston Barbershop & Lounge", "beauty", "(347) 751-9024", "Mount Vernon"],
  ["The Haircut Pro", "beauty", "(914) 668-4288", "Mount Vernon"],
  ["Untouchables Barbershop", "beauty", "(914) 819-0464", "Yonkers"],
  ["MC Professional", "beauty", "(917) 513-1607", "Yonkers"],
  // ── Yonkers · nails ──
  ["Tai Nail Salon & Spa", "nails", "(914) 920-5459", "Yonkers"],
  ["Fashion Nail Spa", "nails", "(914) 881-0888", "Yonkers"],
  // ── New Rochelle · auto ──
  ["Lopez's Auto Repair", "auto", "(914) 235-2760", "New Rochelle"],
  ["Noto's Auto Repair & Service", "auto", "(914) 235-1700", "New Rochelle"],
  ["C & C Repair", "auto", "(914) 235-4200", "New Rochelle"],
];

async function main() {
  const mode = process.argv.includes("--seed") ? "seed" : process.argv.includes("--undo") ? "undo" : "inspect";
  const db = await getDb();
  const col = db.collection("crm_prospects");
  console.log(`crm_prospects: ${await col.countDocuments()} total (${await col.countDocuments({ importBatch: BATCH })} from this batch).`);

  if (mode === "inspect") { console.log("Inspect only. Re-run with --seed or --undo."); return; }
  if (mode === "undo") {
    const r = await col.deleteMany({ importBatch: BATCH });
    console.log(`Removed ${r.deletedCount} greenfield prospects.`);
    return;
  }

  let added = 0, skipped = 0;
  for (const [businessName, vertical, phone, city] of ROWS) {
    if (await col.findOne({ businessName, city })) { skipped++; continue; }
    await col.insertOne({
      businessName, vertical, contactName: "", email: "", phone, website: "",
      address: "", city, state: "NY", source: "web-research (phone-only)", importBatch: BATCH,
      status: "new", notes: "Greenfield: no website/online booking found. Phone-first.",
      createdAt: new Date(), updatedAt: new Date(),
    });
    added++;
  }
  console.log(`Seeded ${added} greenfield prospects (${skipped} already existed).`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
