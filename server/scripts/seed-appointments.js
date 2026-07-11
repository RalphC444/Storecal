// Seed demo appointments. Business-type aware: pulls the shop's real services,
// assigns each booking to a real provider, and only attaches vehicle data when
// the shop's businessType is "auto".
//
//   node seed-appointments.js

require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const { MongoClient } = require("mongodb");

const CLIENTS = [
  { name: "James Rivera",   email: "james.rivera@email.com",   phone: "914-555-0101" },
  { name: "Maria Santos",   email: "m.santos@gmail.com",       phone: "914-555-0182" },
  { name: "Derek Thompson", email: "dthompson@outlook.com",    phone: "914-555-0247" },
  { name: "Keisha Brown",   email: "keisha.b@yahoo.com",       phone: "914-555-0319" },
  { name: "Tom Nguyen",     email: "tnguyen88@gmail.com",      phone: "914-555-0453" },
  { name: "Lisa Park",      email: "lisapark@hotmail.com",     phone: "914-555-0567" },
  { name: "Carlos Medina",  email: "cmedina@icloud.com",       phone: "914-555-0634" },
  { name: "Amy Wallace",    email: "amy.wallace@email.com",    phone: "914-555-0721" },
];

const NOTES_BY_TYPE = {
  salon: [
    "First time here — excited!",
    "Please use fragrance-free products if possible.",
    "Bringing a reference photo.",
    "Running a few minutes late is fine, right?",
    "Prefer a quieter chair if available.",
    "",
    "",
  ],
  auto: [
    "Car has been making a grinding noise when braking.",
    "Check engine light came on yesterday.",
    "Due for routine maintenance.",
    "",
  ],
  generic: ["", "See you then.", "Thanks!"],
};

const VEHICLES = [
  { year: "2019", make: "Toyota",  model: "Camry",   trim: "LE" },
  { year: "2021", make: "Honda",   model: "Accord",  trim: "Sport" },
  { year: "2018", make: "Ford",    model: "F-150",   trim: "XLT" },
  { year: "2020", make: "Chevy",   model: "Malibu",  trim: "LT" },
];

const STATUSES = ["pending", "pending", "confirmed", "confirmed", "completed", "cancelled"];
const TIMES = ["09:00", "09:30", "10:00", "10:30", "11:00", "11:30", "13:00", "13:30", "14:00", "14:30", "15:00", "15:30", "16:00"];

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function dateKey(offsetDays) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

async function seed() {
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const db = client.db();

  const shop = await db.collection("shops").findOne({ slug: process.env.SHOP_SLUG || "default" });
  if (!shop) { console.error("Shop not found — run main seed first"); process.exit(1); }
  const shopId = shop._id.toString();
  const businessType = shop.businessType || "generic";

  const providers = await db.collection("providers").find({ shopId }).toArray();
  const services = await db.collection("services").find({ shopId }).toArray();
  if (providers.length === 0 || services.length === 0) {
    console.error("Need providers and services seeded first"); process.exit(1);
  }

  await db.collection("appointments").deleteMany({ shopId });

  const notes = NOTES_BY_TYPE[businessType] || NOTES_BY_TYPE.generic;
  const offsets = [-7, -5, -4, -3, -2, -1, 0, 0, 1, 1, 2, 3, 4, 5, 6, 8, 10, 12];

  const docs = offsets.map((offset, i) => {
    const person = CLIENTS[i % CLIENTS.length];
    const provider = providers[i % providers.length];
    const service = pick(services);
    const timeValue = pick(TIMES);
    const dk = dateKey(offset);
    const status = offset < 0 ? pick(["completed", "cancelled", "completed"]) : pick(STATUSES);

    const doc = {
      shopId,
      providerId: provider._id.toString(),
      providerName: provider.name,
      dateKey: dk,
      timeValue,
      start: new Date(`${dk}T${timeValue}:00`),
      client: person,
      service: service.name,
      issueDescription: pick(notes),
      status,
      createdAt: new Date(Date.now() - Math.random() * 7 * 86400000),
    };

    if (businessType === "auto") doc.vehicle = pick(VEHICLES);
    return doc;
  });

  const result = await db.collection("appointments").insertMany(docs);
  console.log(`Inserted ${result.insertedCount} ${businessType} appointments`);
  await client.close();
}

seed().catch((e) => { console.error(e); process.exit(1); });
