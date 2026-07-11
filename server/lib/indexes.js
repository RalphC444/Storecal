// Ensure MongoDB indexes for the hot query paths. Without these, every lookup
// is a full collection scan — fine at a handful of shops, a real problem as the
// tenant count and appointment history grow.
//
// All indexes are non-unique (safe to create over existing data) and creation
// is idempotent, so this runs harmlessly on every boot.
const INDEXES = {
  // Public reads resolve a shop by its immutable key or slug on every request.
  shops: [{ publicKey: 1 }, { slug: 1 }],
  // Login and owner lookups.
  users: [{ email: 1 }, { shopId: 1 }],
  // Everything below is queried per shop (multi-tenant scoping).
  providers: [{ shopId: 1 }],
  services: [{ shopId: 1 }],
  gallery: [{ shopId: 1, providerId: 1 }],
  // Calendar reads by shop+day and by provider; dedupe by provider+start.
  appointments: [{ shopId: 1, dateKey: 1 }, { providerId: 1, dateKey: 1 }, { providerId: 1, start: 1 }],
  // Client dedupe/lookup within a shop.
  clients: [{ shopId: 1 }, { shopId: 1, phoneKey: 1 }, { shopId: 1, emailKey: 1 }],
  // Availability: weekly hours, biweekly meta, per-day overrides, time off.
  workingHours: [{ providerId: 1, shopId: 1 }],
  scheduleMeta: [{ providerId: 1, shopId: 1 }],
  scheduleOverrides: [{ providerId: 1, shopId: 1 }],
  timeOff: [{ providerId: 1 }],
};

async function ensureIndexes(db) {
  let created = 0;
  for (const [coll, specs] of Object.entries(INDEXES)) {
    for (const spec of specs) {
      try {
        await db.collection(coll).createIndex(spec);
        created++;
      } catch (e) {
        console.warn(`Index on ${coll} ${JSON.stringify(spec)} skipped:`, e.message);
      }
    }
  }
  console.log(`Indexes ensured (${created} across ${Object.keys(INDEXES).length} collections).`);
}

module.exports = { ensureIndexes };
