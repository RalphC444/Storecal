// Seed "The Nail Bar" (the live demo account) with staff + hours, customers, and
// a week of appointments so the calendar and booking page look alive. Every
// inserted doc is tagged { demoSeed: "nailbar" } so it can be fully removed
// later without touching the owner's real data (services, hours, account).
//
//   node server/scripts/seed-nailbar-demo.js          seed (re-runs cleanly)
//   node server/scripts/seed-nailbar-demo.js --undo    remove ALL seeded data
//
// Safety: only ever targets a shop whose name contains "nail".

require("dotenv").config({ path: require("path").resolve(__dirname, "../../.env") });
const { MongoClient, ObjectId } = require("mongodb");

const TAG = "nailbar";
const DEMO_NOTIFY_EMAIL = "capriglioner@gmail.com"; // owner/staff notices route here for the demo
const SLUG = "the-nail-bar-nyc";
const COLLECTIONS = ["providers", "workingHours", "scheduleMeta", "appointments", "clients"];

const ymdLocal = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const dayKey = (off) => { const d = new Date(); d.setDate(d.getDate() + off); return ymdLocal(d); };
const sundayKeyLocal = () => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - d.getDay()); return ymdLocal(d); };

async function resolveShop(db) {
  let shop = await db.collection("shops").findOne({ slug: SLUG });
  if (!shop) shop = await db.collection("shops").findOne({ name: /nail bar/i });
  if (!shop) throw new Error(`No shop found (slug "${SLUG}" or name ~ "nail bar").`);
  if (!/nail/i.test(shop.name || "")) throw new Error(`Refusing: resolved shop "${shop.name}" doesn't look like The Nail Bar.`);
  return shop;
}

async function undo(db, shopId) {
  let total = 0;
  for (const c of COLLECTIONS) {
    const r = await db.collection(c).deleteMany({ shopId, demoSeed: TAG });
    if (r.deletedCount) console.log(`  removed ${r.deletedCount} from ${c}`);
    total += r.deletedCount;
  }
  // Restore REAL docs we only modified (not tagged for deletion):
  // gallery photos reassigned to staff, and the renamed owner provider.
  const reassigned = await db.collection("gallery").find({ shopId, demoReassigned: true }).toArray();
  for (const g of reassigned) {
    await db.collection("gallery").updateOne({ _id: g._id },
      { $set: { providerId: g.demoOrigProviderId ?? null }, $unset: { demoReassigned: "", demoOrigProviderId: "" } });
  }
  if (reassigned.length) console.log(`  restored ${reassigned.length} gallery photo(s) to shop-level`);
  const renamed = await db.collection("providers").find({ shopId, demoRenamed: true }).toArray();
  for (const p of renamed) {
    await db.collection("providers").updateOne({ _id: p._id },
      { $set: { name: p.demoOrigName }, $unset: { demoRenamed: "", demoOrigName: "" } });
  }
  if (renamed.length) console.log(`  restored ${renamed.length} provider name(s)`);
  // Remove the demo owner/staff notification override.
  const nr = await db.collection("shops").updateOne(
    { _id: new ObjectId(shopId), demoOwnerNotify: true },
    { $unset: { ownerNotifyEmail: "", demoOwnerNotify: "" } }
  );
  if (nr.modifiedCount) console.log("  cleared owner-notify override");
  return total;
}

async function seed(db, shop) {
  const shopId = shop._id.toString();

  // Clean any prior seed so re-running never duplicates.
  await undo(db, shopId);

  // Use the shop's real services if present; otherwise seed a few (tagged).
  let services = await db.collection("services").find({ shopId }).sort({ sortOrder: 1 }).toArray();
  if (!services.length) {
    const defs = [
      { name: "Basic Manicure", durationMin: 30, price: "$25" },
      { name: "Gel Manicure", durationMin: 75, price: "$55" },
      { name: "Classic Pedicure", durationMin: 45, price: "$40" },
      { name: "Deluxe Spa Pedicure", durationMin: 60, price: "$60" },
    ];
    const r = await db.collection("services").insertMany(defs.map((s, i) => ({ ...s, shopId, sortOrder: i, demoSeed: TAG, createdAt: new Date() })));
    services = defs.map((s, i) => ({ ...s, _id: Object.values(r.insertedIds)[i] }));
    console.log(`  seeded ${services.length} services`);
  }
  const svcIds = services.map((s) => s._id.toString());

  // Staff (nail techs) + weekly hours (Mon–Sat 10–7) + schedule meta.
  const staffDefs = [
    { name: "Jasmine Lee", bio: "Nail art & gel specialist" },
    { name: "Priya Shah", bio: "Manicures, pedicures & spa treatments" },
    { name: "Carla Mendes", bio: "Acrylics, extensions & designs" },
  ];
  const provIds = [], provName = {};
  for (let i = 0; i < staffDefs.length; i++) {
    const s = staffDefs[i];
    const r = await db.collection("providers").insertOne({
      shopId, name: s.name, bio: s.bio, email: "", photo: "", active: true, sortOrder: i,
      serviceIds: svcIds, demoSeed: TAG, createdAt: new Date(),
    });
    const pid = r.insertedId.toString();
    provIds.push(pid); provName[pid] = s.name;
    await db.collection("workingHours").insertMany(
      [1, 2, 3, 4, 5, 6].map((weekday) => ({ providerId: pid, shopId, weekday, ranges: [{ startMin: 600, endMin: 1140 }], breaks: [], demoSeed: TAG }))
    );
    await db.collection("scheduleMeta").insertOne({ providerId: pid, shopId, biweekly: false, anchorDate: sundayKeyLocal(), demoSeed: TAG, updatedAt: new Date() });
  }
  console.log(`  seeded ${provIds.length} staff (+ hours)`);

  // Attribute some existing shop gallery photos to the seeded staff (per-staff
  // galleries), keeping the cover + a few as shop-level "our work". Recorded so
  // undo puts them back to shop-level.
  const gallery = await db.collection("gallery")
    .find({ shopId, providerId: null, cover: { $ne: true } }).sort({ sortOrder: 1, _id: 1 }).toArray();
  const KEEP_SHOP = 3;
  let gi = 0;
  for (let i = KEEP_SHOP; i < gallery.length; i++) {
    const pid = provIds[gi % provIds.length]; gi++;
    await db.collection("gallery").updateOne({ _id: gallery[i]._id },
      { $set: { providerId: pid, demoReassigned: true, demoOrigProviderId: gallery[i].providerId ?? null } });
  }
  if (gi) console.log(`  attributed ${gi} gallery photo(s) to staff`);

  // Give the owner's provider a human name so it reads like a real team member
  // (recorded so undo restores the original). Skip if already renamed.
  const HUMAN = "Ava Rivera";
  const owner = await db.collection("providers").findOne({ shopId, ownerUserId: { $exists: true }, demoSeed: { $ne: TAG } });
  if (owner && !owner.demoRenamed && owner.name !== HUMAN) {
    await db.collection("providers").updateOne({ _id: owner._id },
      { $set: { name: HUMAN, demoRenamed: true, demoOrigName: owner.name } });
    console.log(`  renamed owner provider "${owner.name}" → "${HUMAN}"`);
  }

  // Demo: route owner/staff booking notices to the operator's inbox so they're
  // visible during demos (customer emails are unaffected).
  await db.collection("shops").updateOne({ _id: shop._id }, { $set: { ownerNotifyEmail: DEMO_NOTIFY_EMAIL, demoOwnerNotify: true } });
  console.log(`  owner/staff notices → ${DEMO_NOTIFY_EMAIL}`);

  // Customers.
  const clientDefs = [
    { name: "Sofia Martinez", phone: "555-0142" }, { name: "Emma Johnson", phone: "555-0177" },
    { name: "Olivia Brown", phone: "555-0155" }, { name: "Mia Rodriguez", phone: "555-0133" },
    { name: "Ava Thompson", phone: "555-0188" }, { name: "Isabella Garcia", phone: "555-0111" },
    { name: "Chloe Wilson", phone: "555-0122" }, { name: "Grace Kim", phone: "555-0166" },
    { name: "Lily Nguyen", phone: "555-0144" }, { name: "Zoe Davis", phone: "555-0199" },
  ];
  const clientIds = [];
  for (const c of clientDefs) {
    const r = await db.collection("clients").insertOne({ shopId, name: c.name, phone: c.phone, email: "", demoSeed: TAG, createdAt: new Date() });
    clientIds.push({ id: r.insertedId.toString(), ...c });
  }
  console.log(`  seeded ${clientIds.length} customers`);

  // A week+ of appointments so the calendar looks alive.
  const times = ["10:00", "11:30", "13:00", "14:30", "16:00", "17:30"];
  let ci = 0, appts = 0;
  for (let off = 0; off <= 9; off++) {
    const dateKey = dayKey(off);
    if (new Date(dateKey + "T00:00:00").getDay() === 0) continue; // closed Sunday
    const count = 2 + (off % 3); // 2–4 per day
    const used = new Set();
    for (let k = 0; k < count; k++) {
      const providerId = provIds[(off + k) % provIds.length];
      const svc = services[(off + k) % services.length];
      const cust = clientIds[ci % clientIds.length]; ci++;
      let ti = (off + k) % times.length;
      while (used.has(providerId + times[ti])) ti = (ti + 1) % times.length; // no same-provider clash
      used.add(providerId + times[ti]);
      const timeValue = times[ti];
      const doc = {
        shopId, dateKey, timeValue, providerId, providerName: provName[providerId],
        client: { name: cust.name, phone: cust.phone, email: "" },
        service: svc.name, durationMin: svc.durationMin || 45,
        status: off < 2 ? "confirmed" : "pending",
        start: new Date(`${dateKey}T${timeValue}:00`), clientId: cust.id,
        demoSeed: TAG, createdAt: new Date(),
      };
      try { await db.collection("appointments").insertOne(doc); appts++; }
      catch (e) { if (!e || e.code !== 11000) throw e; } // skip any rare slot clash
    }
  }
  console.log(`  seeded ${appts} appointments`);
  return { shopId };
}

(async () => {
  const undoMode = process.argv.includes("--undo");
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const db = client.db();
  const shop = await resolveShop(db);
  console.log(`${undoMode ? "UNDO" : "SEED"} → "${shop.name}" (slug=${shop.slug})`);
  if (undoMode) {
    const n = await undo(db, shop._id.toString());
    console.log(`Done. Removed ${n} seeded docs.`);
  } else {
    await seed(db, shop);
    console.log("Done. Re-run with --undo to remove all of it.");
  }
  await client.close();
})().catch((e) => { console.error("ERROR:", e.message); process.exit(1); });
