// Turn on the AI chatbot add-on for Ralph & Son (comp — unlocked at no charge).
//   node scripts/enableAiChatRalph.js           → enable (comp)
//   node scripts/enableAiChatRalph.js --undo     → remove the comp/access
require("dotenv").config({ path: require("path").resolve(__dirname, "../../.env") });
const { getDb } = require("../lib/db");

async function main() {
  const undo = process.argv.includes("--undo");
  const db = await getDb();
  const shop = await db.collection("shops").findOne({ name: /ralph/i });
  if (!shop) { console.error("Ralph & Son shop not found."); process.exit(1); }
  await db.collection("shops").updateOne(
    { _id: shop._id },
    { $set: { aiChatAddonComp: !undo, aiChatAddon: !undo } }
  );
  console.log(`${undo ? "Disabled" : "Enabled (comped)"} AI chatbot add-on for "${shop.name}" (${shop._id}).`);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
