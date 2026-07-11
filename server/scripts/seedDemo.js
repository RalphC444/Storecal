// Seed / reset the public demo store. This is a SEPARATE shop (slug "demo")
// with its own owner login, fully isolated from any real store — so visitors
// playing in the demo can never touch or lock out a real account. Safe to run
// repeatedly: it wipes only the demo shop's data (scoped by shopId) and reseeds
// fresh, restoring the demo owner's password each time.

const { getDb } = require("../lib/db");
const { hashPassword } = require("../lib/auth");
const { generatePublicKey } = require("../lib/shopScope");
const { upsertClient } = require("../lib/clients");

const DEMO_SLUG = "demo";
const DEMO_OWNER_EMAIL = "demo@storecal.com";
const DEMO_OWNER_PASSWORD = "demo1234";

const ymdLocal = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
function dayKey(offset) { const d = new Date(); d.setDate(d.getDate() + offset); return ymdLocal(d); }
function sundayKeyLocal() { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - d.getDay()); return ymdLocal(d); }

async function seedDemo() {
  const db = await getDb();

  // 1. The demo shop — created once; keep the doc (so its publicKey is stable).
  let shop = await db.collection("shops").findOne({ slug: DEMO_SLUG });
  if (!shop) {
    const r = await db.collection("shops").insertOne({
      slug: DEMO_SLUG, name: "Demo Beauty Studio", businessType: "salon",
      publicKey: generatePublicKey(), isDemo: true, createdAt: new Date(),
    });
    shop = await db.collection("shops").findOne({ _id: r.insertedId });
  }
  const shopId = shop._id.toString();
  // Hard safety: never let this run against anything but the demo shop.
  if (shop.slug !== DEMO_SLUG) throw new Error("seedDemo refused — resolved shop is not the demo shop");

  // 2. Wipe demo-scoped data only (never touches other shops).
  for (const c of ["providers", "services", "workingHours", "scheduleMeta", "scheduleOverrides", "appointments", "clients"]) {
    await db.collection(c).deleteMany({ shopId });
  }
  await db.collection("users").deleteMany({ shopId, role: "provider" });

  // 3. Demo owner — upsert and RESET the password every run (undoes any change
  //    a visitor made; can never affect a real account).
  await db.collection("users").updateOne(
    { email: DEMO_OWNER_EMAIL },
    {
      $set: { email: DEMO_OWNER_EMAIL, passwordHash: await hashPassword(DEMO_OWNER_PASSWORD), name: "Demo Owner", role: "owner", shopId, mustChangePassword: false, updatedAt: new Date() },
      $setOnInsert: { createdAt: new Date() },
    },
    { upsert: true }
  );

  // 4. Services.
  const serviceDefs = [
    { name: "Women's Haircut", durationMin: 45, price: "$65" },
    { name: "Men's Haircut", durationMin: 30, price: "$35" },
    { name: "Color & Highlights", durationMin: 120, price: "$140" },
    { name: "Blowout & Style", durationMin: 45, price: "$50" },
  ];
  const svcRes = await db.collection("services").insertMany(
    serviceDefs.map((s, i) => ({ ...s, shopId, sortOrder: i, createdAt: new Date() }))
  );
  const svcIds = Object.values(svcRes.insertedIds).map((id) => id.toString());

  // 5. Staff + their weekly hours (Mon–Sat 9–6) + services offered.
  const staffDefs = [
    { name: "Maria Lopez", bio: "Color & balayage specialist" },
    { name: "James Carter", bio: "Cuts, fades & beard work" },
    { name: "Ava Chen", bio: "Cuts and styling" },
  ];
  const provIds = [];
  const provName = {};
  for (let i = 0; i < staffDefs.length; i++) {
    const s = staffDefs[i];
    const r = await db.collection("providers").insertOne({
      shopId, name: s.name, bio: s.bio, email: "", active: true, sortOrder: i,
      serviceIds: svcIds, createdAt: new Date(), // all services by default
    });
    const pid = r.insertedId.toString();
    provIds.push(pid); provName[pid] = s.name;
    await db.collection("workingHours").insertMany(
      [1, 2, 3, 4, 5, 6].map((weekday) => ({ providerId: pid, shopId, weekday, ranges: [{ startMin: 540, endMin: 1080 }], breaks: [] }))
    );
    await db.collection("scheduleMeta").insertOne({ providerId: pid, shopId, biweekly: false, anchorDate: sundayKeyLocal(), updatedAt: new Date() });
  }

  // 5b. Store hours: Mon–Sat 9–7, Sunday closed.
  await db.collection("workingHours").insertMany(
    [1, 2, 3, 4, 5, 6].map((weekday) => ({ providerId: "shop", shopId, weekday, ranges: [{ startMin: 540, endMin: 1140 }], breaks: [] }))
  );
  await db.collection("scheduleMeta").insertOne({ providerId: "shop", shopId, biweekly: false, anchorDate: sundayKeyLocal(), updatedAt: new Date() });
  await db.collection("timeOff").deleteMany({ providerId: { $in: [...provIds, "shop"] } });

  // 6. A week of appointments (relative to today) so the calendar looks alive.
  const clients = [
    { name: "Sofia Martinez", phone: "555-0142" }, { name: "Liam Nguyen", phone: "555-0198" },
    { name: "Emma Johnson", phone: "555-0177" }, { name: "Noah Patel", phone: "555-0110" },
    { name: "Olivia Brown", phone: "555-0155" }, { name: "Ethan Wright", phone: "555-0121" },
    { name: "Mia Rodriguez", phone: "555-0133" }, { name: "Lucas Kim", phone: "555-0166" },
  ];
  const times = ["09:30", "11:00", "13:00", "14:30", "16:00"];
  let ci = 0;
  for (let off = 0; off <= 6; off++) {
    const dateKey = dayKey(off);
    if (new Date(dateKey + "T00:00:00").getDay() === 0) continue; // store closed Sunday
    const count = 2 + (off % 2); // 2–3 per day
    for (let k = 0; k < count; k++) {
      const providerId = provIds[(off + k) % provIds.length];
      const svcIdx = (off + k) % serviceDefs.length;
      const svc = serviceDefs[svcIdx];
      const client = { ...clients[ci % clients.length], email: "" }; ci++;
      const timeValue = times[k % times.length];
      const doc = {
        shopId, dateKey, timeValue, providerId, providerName: provName[providerId],
        client, service: svc.name, durationMin: svc.durationMin, status: "confirmed",
        start: new Date(`${dateKey}T${timeValue}:00`), createdAt: new Date(),
      };
      doc.clientId = await upsertClient(db, shopId, doc.client);
      await db.collection("appointments").insertOne(doc);
    }
  }

  return { shopId, publicKey: shop.publicKey };
}

module.exports = { seedDemo, DEMO_OWNER_EMAIL, DEMO_OWNER_PASSWORD, DEMO_SLUG };
