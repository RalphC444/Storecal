// Seed the admin CRM with the 76 starter Westchester prospects (from the
// standalone tool's data/prospects.csv). Idempotent (dedupe by name+city) and
// reversible.
//
//   node scripts/seedProspects.js            → inspect (count only)
//   node scripts/seedProspects.js --seed     → insert (skips existing)
//   node scripts/seedProspects.js --undo     → remove the seeded batch
require("dotenv").config({ path: require("path").resolve(__dirname, "../../.env") });
const { getDb } = require("../lib/db");

const BATCH = "westchester-starter";

// [businessName, vertical, phone, email, city]  (state = NY)
const ROWS = [
  ["Virginia's Beauty Salon", "beauty", "", "", "Yonkers"],
  ["Unique Hair Studios", "beauty", "(914) 423-6116", "", "Yonkers"],
  ["La-Moda Hair Salon", "beauty", "(914) 423-1626", "", "Yonkers"],
  ["Shelly Unisex", "beauty", "(914) 423-5943", "", "Yonkers"],
  ["J's Personal Touch Hair Salon", "beauty", "(914) 965-3639", "", "Yonkers"],
  ["Pure Hair Design", "beauty", "(914) 237-7729", "", "Yonkers"],
  ["Hair Dimension", "beauty", "(914) 779-5919", "", "Yonkers"],
  ["Contempo Hair Designs", "beauty", "(914) 771-5300", "", "Yonkers"],
  ["Frances' Hair Studio", "beauty", "(914) 954-8403", "", "Yonkers"],
  ["Sanela's Beauty Salon", "beauty", "(914) 751-7500", "", "Yonkers"],
  ["Divas Salon Spa", "beauty", "", "", "Mount Vernon"],
  ["Sara Blessing Salon", "beauty", "(929) 246-7891", "", "Mount Vernon"],
  ["Salon Sensational", "beauty", "", "", "Mount Vernon"],
  ["Artistic Touch Hair Salon", "beauty", "(914) 663-6205", "", "Mount Vernon"],
  ["Hair Fashion", "beauty", "(914) 668-8230", "", "Mount Vernon"],
  ["Clara's Unisex Hair Salon", "beauty", "(914) 699-6600", "", "Mount Vernon"],
  ["Talk Of Town Hair Salon", "beauty", "(914) 562-9840", "", "Mount Vernon"],
  ["Elizabeth's Beauty Salon", "beauty", "(914) 633-0084", "", "New Rochelle"],
  ["Lowell Shelton Salon & Beauty Bar", "beauty", "(347) 854-7426", "", "New Rochelle"],
  ["Arteaseta Salon", "beauty", "(914) 355-5503", "", "New Rochelle"],
  ["Yudi's Beauty Salon", "beauty", "(914) 633-7600", "", "New Rochelle"],
  ["235 Hair Salon", "beauty", "(914) 961-6404", "", "Eastchester"],
  ["MAK Salon", "beauty", "(914) 337-7200", "", "Eastchester"],
  ["Panache Hair Salon", "beauty", "", "", "Bronxville"],
  ["Hastings Beauty Salon", "beauty", "(914) 846-1091", "info@hastingsbeautysalon.com", "Hastings-on-Hudson"],
  ["Salon Topaz Inc", "beauty", "(914) 231-6212", "", "Dobbs Ferry"],
  ["NN Nail Salon", "nails", "(914) 233-0300", "", "Yonkers"],
  ["Fancy Nail Salon", "nails", "(914) 237-0859", "", "Yonkers"],
  ["Visual Nails", "nails", "(914) 779-0120", "", "Yonkers"],
  ["Yonkers Nails", "nails", "(914) 965-3116", "", "Yonkers"],
  ["The Company Nail Salon", "nails", "(914) 779-6245", "", "Yonkers"],
  ["Angel N Nails", "nails", "(914) 337-3204", "", "Yonkers"],
  ["Joyners Nail", "nails", "(914) 476-6778", "", "Yonkers"],
  ["Naomi Nail", "nails", "(914) 776-0500", "", "Yonkers"],
  ["Perfect Nails", "nails", "(914) 776-5023", "", "Yonkers"],
  ["Mai Nails Lounge", "nails", "(914) 222-9007", "mainailslounge@gmail.com", "Yonkers"],
  ["Oriental Pearl Nail Spa", "nails", "(914) 632-2150", "", "New Rochelle"],
  ["J Crystal Nail Salon", "nails", "(914) 654-0333", "", "New Rochelle"],
  ["Sun Nail & Spa", "nails", "(914) 336-2778", "", "New Rochelle"],
  ["2 Sisters Nails & Spa", "nails", "(914) 636-6245", "2sistersnails88@gmail.com", "New Rochelle"],
  ["TK Nails & Spa", "nails", "(914) 997-2953", "", "White Plains"],
  ["Noblesse Nail Spa", "nails", "(914) 488-6960", "", "White Plains"],
  ["Stylish Nail & Spa", "nails", "(914) 686-6366", "", "White Plains"],
  ["Blooming Nail & Spa", "nails", "(914) 615-9898", "", "White Plains"],
  ["Fashion Diva Nails Spa", "nails", "(914) 288-0008", "", "White Plains"],
  ["Cleo IV Nails", "nails", "(914) 285-0600", "", "White Plains"],
  ["Well Being Nails", "nails", "(914) 682-5210", "", "White Plains"],
  ["Bronxville Nails", "nails", "(914) 395-3888", "", "Bronxville"],
  ["Sage Nail & Spa", "nails", "(914) 346-8120", "", "Bronxville"],
  ["Blue Nails", "nails", "(914) 793-3248", "", "Tuckahoe"],
  ["Ace & Nail", "nails", "(914) 793-8220", "", "Eastchester"],
  ["Kelly's Nail Salon", "nails", "(914) 961-6852", "", "Eastchester"],
  ["Sanson Auto Repair", "auto", "(914) 963-2585", "", "Yonkers"],
  ["J B Auto Center", "auto", "(914) 237-0090", "", "Yonkers"],
  ["McLean Auto Service and Repair", "auto", "(914) 237-8574", "", "Yonkers"],
  ["Master Mechanix", "auto", "(914) 963-4774", "", "Yonkers"],
  ["No Limit Yonkers Auto Body", "auto", "(914) 969-0504", "shop@nolimityonkers.com", "Yonkers"],
  ["R&R Auto Repair", "auto", "(914) 667-8282", "", "Mount Vernon"],
  ["Newroc Auto Service", "auto", "", "", "New Rochelle"],
  ["Rudys Autobody", "auto", "(914) 576-5263", "", "New Rochelle"],
  ["Crown Auto Body", "auto", "(914) 632-0493", "", "New Rochelle"],
  ["New Rochelle Auto Body", "auto", "(914) 235-6110", "", "New Rochelle"],
  ["Tommy's North Avenue Auto Body", "auto", "(914) 633-3307", "", "New Rochelle"],
  ["Rob's Auto Body", "auto", "(914) 632-5835", "", "New Rochelle"],
  ["Bob's Collision & Repair", "auto", "(914) 632-4761", "", "New Rochelle"],
  ["Tedesco Auto Body", "auto", "(914) 636-3000", "", "New Rochelle"],
  ["Laser Frame & Body Repair", "auto", "(914) 632-8100", "", "New Rochelle"],
  ["J & S Auto Service", "auto", "(914) 946-3104", "", "White Plains"],
  ["White Plains Auto", "auto", "(914) 358-9766", "", "White Plains"],
  ["SLR Auto Repair", "auto", "(914) 519-6121", "", "White Plains"],
  ["D & C Auto Repair", "auto", "(914) 684-2167", "", "White Plains"],
  ["Splendid Auto Repair", "auto", "(914) 428-9101", "", "White Plains"],
  ["JC Automotive", "auto", "(914) 831-9900", "", "White Plains"],
  ["Brody's Auto Repair", "auto", "(914) 328-0400", "", "White Plains"],
  ["USA Service Pro", "auto", "(914) 948-8725", "", "White Plains"],
  ["Atlantic Auto Mechanic", "auto", "(914) 761-0979", "", "White Plains"],
];

async function main() {
  const mode = process.argv.includes("--seed") ? "seed" : process.argv.includes("--undo") ? "undo" : "inspect";
  const db = await getDb();
  const col = db.collection("crm_prospects");
  const have = await col.countDocuments();
  const seeded = await col.countDocuments({ importBatch: BATCH });
  console.log(`crm_prospects: ${have} total (${seeded} from this batch).`);

  if (mode === "inspect") { console.log("Inspect only. Re-run with --seed or --undo."); return; }
  if (mode === "undo") {
    const r = await col.deleteMany({ importBatch: BATCH });
    console.log(`Removed ${r.deletedCount} seeded prospects.`);
    return;
  }

  let added = 0, skipped = 0;
  for (const [businessName, vertical, phone, email, city] of ROWS) {
    if (await col.findOne({ businessName, city })) { skipped++; continue; }
    await col.insertOne({
      businessName, vertical, contactName: "", email: (email || "").toLowerCase(),
      phone: phone || "", website: "", address: "", city, state: "NY",
      source: "westchester-starter", importBatch: BATCH,
      status: "new", notes: "", createdAt: new Date(), updatedAt: new Date(),
    });
    added++;
  }
  console.log(`Seeded ${added} prospects (${skipped} already existed).`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
