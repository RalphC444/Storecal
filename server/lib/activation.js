// Activation tracking (funnel metric). A shop is "activated" once it can
// actually take a booking — i.e. it has at least one service AND shop-level
// working hours. We stamp `activatedAt` the first time both are true so the
// admin console can show setup progress and time-to-activate. Best-effort:
// never throws into a request path.
const { ObjectId } = require("mongodb");

async function markActivatedIfReady(db, shopId) {
  try {
    if (!shopId) return;
    let _id;
    try { _id = new ObjectId(shopId); } catch { return; }
    const [services, shopHours] = await Promise.all([
      db.collection("services").countDocuments({ shopId }, { limit: 1 }),
      db.collection("workingHours").countDocuments({ shopId, providerId: "shop" }, { limit: 1 }),
    ]);
    if (services > 0 && shopHours > 0) {
      // Guard on absence so it only ever stamps once (and is race-safe).
      const r = await db.collection("shops").updateOne(
        { _id, activatedAt: { $exists: false } },
        { $set: { activatedAt: new Date() } }
      );
      if (r.modifiedCount > 0) require("./analytics").capture(shopId, "activated"); // funnel: first-time activation
    }
  } catch { /* metrics are best-effort — never break the request */ }
}

module.exports = { markActivatedIfReady };
