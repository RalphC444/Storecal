// Clone "The Nail Bar" (a real shop) INTO the isolated public demo shop, so the
// marketing "See it live" widget feels 100% real (real branding, services, staff,
// gallery) while every visitor test-booking stays sandboxed in the demo project —
// never touching the real Nail Bar's calendar.
//
//   node server/scripts/cloneNailbarToDemo.js
//
// Safe & re-runnable: wipes ONLY the demo shop's cloned data, then re-copies from
// the Nail Bar. The demo shop keeps its own identity (slug "demo", publicKey,
// isDemo, owner login). Emails are hard-off on the demo (bookingEmailsOff).
//
// Hard safety: the destination is only ever the shop whose slug === "demo".

require("dotenv").config({ path: require("path").resolve(__dirname, "../../.env") });
const { MongoClient } = require("mongodb");

const SRC_SLUG = "the-nail-bar-nyc";
const DEST_SLUG = "demo";
const DISPLAY_NAME = "Demo Nail Salon"; // generic — never expose the real client's brand publicly
const COLLECTIONS = ["services", "providers", "workingHours", "scheduleMeta", "clients", "appointments", "gallery"];

const strip = (doc, ...extra) => {
  const out = { ...doc };
  for (const k of ["_id", ...extra]) delete out[k];
  return out;
};

async function run() {
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const db = client.db();

  const src = await db.collection("shops").findOne({ slug: SRC_SLUG });
  const dest = await db.collection("shops").findOne({ slug: DEST_SLUG });
  if (!src) throw new Error(`Source shop "${SRC_SLUG}" not found.`);
  if (!dest) throw new Error(`Demo shop "${DEST_SLUG}" not found.`);
  if (dest.slug !== "demo") throw new Error("Refusing — destination is not the demo shop.");

  const srcId = src._id.toString();
  const destId = dest._id.toString();
  console.log(`CLONE "${src.name}" (${srcId}) → demo "${dest.name}" (${destId})`);

  // 1. Wipe the demo shop's cloned collections (scoped to demo only).
  for (const c of COLLECTIONS) {
    const r = await db.collection(c).deleteMany({ shopId: destId });
    if (r.deletedCount) console.log(`  cleared ${r.deletedCount} from ${c}`);
  }

  // 2. Copy branding/content onto the demo shop — leave its identity intact.
  await db.collection("shops").updateOne({ _id: dest._id }, {
    $set: {
      name: DISPLAY_NAME,
      businessType: src.businessType || "salon",
      booking: src.booking || {},
      showStaff: src.showStaff !== false,
      phone: src.phone || "",
      accent: src.accent || "#ed5ce9",
      logo: "",              // drop the real logo — the demo must not show the client's brand
      tagline: src.tagline || "",
      brandingAddon: true,   // so the hosted page applies logo/accent/tagline
      brandingAddonComp: true,
      bookingEmailsOff: true, // isolated demo never emails anyone
      updatedAt: new Date(),
    },
  });
  console.log(`  branding copied (name "${DISPLAY_NAME}", accent ${src.accent}, logo dropped, tagline "${src.tagline}")`);

  // Owner provider gets linked to the demo owner so the owner-view demo works.
  const destOwner = await db.collection("users").findOne({ shopId: destId, role: "owner" })
    || await db.collection("users").findOne({ shopId: destId });
  const destOwnerUserId = destOwner ? destOwner._id.toString() : null;

  // 3. Services (build old→new id map for providers.serviceIds).
  const svcMap = {};
  const svcs = await db.collection("services").find({ shopId: srcId }).sort({ sortOrder: 1 }).toArray();
  for (const s of svcs) {
    const r = await db.collection("services").insertOne({ ...strip(s), shopId: destId, createdAt: s.createdAt || new Date(), updatedAt: new Date() });
    svcMap[s._id.toString()] = r.insertedId.toString();
  }
  console.log(`  copied ${svcs.length} services`);

  // 4. Providers (remap serviceIds; link the owner provider to the demo owner).
  const provMap = {};
  const provs = await db.collection("providers").find({ shopId: srcId }).sort({ sortOrder: 1 }).toArray();
  for (const p of provs) {
    const doc = strip(p, "ownerUserId", "demoOrigName", "demoRenamed");
    doc.shopId = destId;
    doc.serviceIds = Array.isArray(p.serviceIds) ? p.serviceIds.map(id => svcMap[id] || id) : [];
    doc.createdAt = p.createdAt || new Date();
    if (p.ownerUserId && destOwnerUserId) doc.ownerUserId = destOwnerUserId;
    const r = await db.collection("providers").insertOne(doc);
    provMap[p._id.toString()] = r.insertedId.toString();
  }
  console.log(`  copied ${provs.length} staff`);

  const mapProv = (pid) => (pid == null ? pid : pid === "shop" ? "shop" : (provMap[pid] || pid));

  // 5. Working hours + 6. schedule meta (both keyed by providerId, incl. "shop").
  const wh = await db.collection("workingHours").find({ shopId: srcId }).toArray();
  for (const w of wh) await db.collection("workingHours").insertOne({ ...strip(w), shopId: destId, providerId: mapProv(w.providerId) });
  const sm = await db.collection("scheduleMeta").find({ shopId: srcId }).toArray();
  for (const m of sm) await db.collection("scheduleMeta").insertOne({ ...strip(m), shopId: destId, providerId: mapProv(m.providerId), updatedAt: new Date() });
  console.log(`  copied ${wh.length} working-hours + ${sm.length} schedule-meta rows`);

  // 7. Clients.
  const cls = await db.collection("clients").find({ shopId: srcId }).toArray();
  for (const cl of cls) await db.collection("clients").insertOne({ ...strip(cl), shopId: destId, createdAt: cl.createdAt || new Date() });
  console.log(`  copied ${cls.length} clients`);

  // 8. Appointments (remap providerId; the {providerId,start} unique index is safe
  //    since providerIds are freshly minted for the demo).
  const appts = await db.collection("appointments").find({ shopId: srcId }).toArray();
  let ins = 0;
  for (const a of appts) {
    try {
      await db.collection("appointments").insertOne({ ...strip(a), shopId: destId, providerId: mapProv(a.providerId), createdAt: a.createdAt || new Date() });
      ins++;
    } catch (e) { if (!e || e.code !== 11000) throw e; }
  }
  console.log(`  copied ${ins}/${appts.length} appointments`);

  // 9. Gallery (shop-level + any per-staff photos).
  const gal = await db.collection("gallery").find({ shopId: srcId }).sort({ sortOrder: 1 }).toArray();
  for (const g of gal) await db.collection("gallery").insertOne({ ...strip(g), shopId: destId, providerId: mapProv(g.providerId ?? null), createdAt: g.createdAt || new Date() });
  console.log(`  copied ${gal.length} gallery photos`);

  console.log(`\nDone. Demo shop (publicKey ${dest.publicKey}) now mirrors The Nail Bar — bookings stay isolated.`);
  await client.close();
}

run().catch((e) => { console.error("ERROR:", e.message); process.exit(1); });
