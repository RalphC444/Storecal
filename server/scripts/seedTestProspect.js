// Add a single test prospect (email capriglioner@gmail.com) to the CRM so the
// superadmin can fire a real outreach email from prod to that inbox in one click.
//   node scripts/seedTestProspect.js         → add/ensure it
//   node scripts/seedTestProspect.js --undo   → remove it
require("dotenv").config({ path: require("path").resolve(__dirname, "../../.env") });
const { getDb } = require("../lib/db");

const EMAIL = "capriglioner@gmail.com";
const NAME = "Bloom Beauty Bar (TEST)";
const CITY = "Mount Vernon";

async function main() {
  const db = await getDb();
  const col = db.collection("crm_prospects");
  if (process.argv.includes("--undo")) {
    const r = await col.deleteMany({ email: EMAIL, source: "test" });
    console.log(`Removed ${r.deletedCount} test prospect(s).`);
    return;
  }
  const existing = await col.findOne({ businessName: NAME, city: CITY });
  if (existing) { console.log("Test prospect already exists:", existing._id.toString()); return; }
  const r = await col.insertOne({
    businessName: NAME, vertical: "beauty", contactName: "", email: EMAIL, phone: "",
    website: "", address: "", city: CITY, state: "NY", source: "test",
    status: "new", sequenceStep: 0, nextActionAt: null, notes: "Test prospect for previewing outreach email.",
    createdAt: new Date(), updatedAt: new Date(),
  });
  console.log(`Added test prospect ${NAME} <${EMAIL}> → ${r.insertedId.toString()}`);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
