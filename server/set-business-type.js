// Set a shop's businessType and resolve its booking-form config.
//
//   node set-business-type.js <salon|auto|generic> [slug]
//
// The `booking` block is stored ON the shop doc so both the admin API and the
// Netlify function can serve it verbatim — no preset logic at request time, and
// each shop can be customised independently later (e.g. from an admin screen).

require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const { MongoClient } = require("mongodb");

// Shared presets. The resolved object is what the widget consumes.
const BOOKING_PRESETS = {
  salon: {
    vehicle: false,
    pet: false,
    providerPicker: true,
    providerLabel: "Choose your stylist",
    serviceLabel: "Select a service",
    notesLabel: "Anything we should know? (optional)",
    notesPlaceholder: "Allergies, preferences, inspiration photos, or anything else…",
  },
  auto: {
    vehicle: true,
    pet: false,
    providerPicker: false,
    providerLabel: "",
    serviceLabel: "Select a service",
    notesLabel: "Describe the issue (optional)",
    notesPlaceholder: "What symptoms, noises, or concerns should we know about?",
  },
  grooming: {
    vehicle: false,
    pet: true, // collect pet name / breed / weight in the booking widget
    providerPicker: true,
    providerLabel: "Choose your groomer",
    serviceLabel: "Select a service",
    notesLabel: "Anything we should know? (optional)",
    notesPlaceholder: "Temperament, matting, sensitivities, or special requests…",
  },
  generic: {
    vehicle: false,
    pet: false,
    providerPicker: false,
    providerLabel: "",
    serviceLabel: "Select a service",
    notesLabel: "Notes (optional)",
    notesPlaceholder: "Anything we should know before your appointment?",
  },
};

async function run() {
  const businessType = process.argv[2];
  const slug = process.argv[3] || process.env.SHOP_SLUG || "default";

  if (!BOOKING_PRESETS[businessType]) {
    console.error(`Usage: node set-business-type.js <${Object.keys(BOOKING_PRESETS).join("|")}> [slug]`);
    process.exit(1);
  }

  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const db = client.db();

  const result = await db.collection("shops").updateOne(
    { slug },
    { $set: { businessType, booking: BOOKING_PRESETS[businessType] } }
  );

  if (result.matchedCount === 0) {
    console.error(`No shop found with slug "${slug}"`);
    process.exit(1);
  }

  console.log(`Shop "${slug}" → businessType="${businessType}"`);
  console.log(JSON.stringify(BOOKING_PRESETS[businessType], null, 2));
  await client.close();
}

run().catch((e) => { console.error(e); process.exit(1); });
