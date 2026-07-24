// Usage-based trial: "free until you get N bookings" (card required).
//
// Stripe trials are time-based, so we model this as a very long time-trial that
// we END programmatically once the shop has taken N real customer bookings —
// that's when the first charge lands. Operator-assigned per shop via
// shop.bookingTrial (see admin console). Best-effort: never breaks a booking.
//
// Shop fields:
//   bookingTrial        (bool)  operator turned it on
//   bookingTrialLimit   (int)   bookings before billing starts (default 3)
//   bookingTrialBaseline(int)   publicBookingCount at subscribe time (bookings
//                               before subscribing don't count toward the free run)
//   bookingTrialEndedAt (Date)  set once we've ended the trial (idempotency guard)
//   publicBookingCount  (int)   lifetime real customer (widget/hosted) bookings
const { ObjectId } = require("mongodb");

const DEFAULT_LIMIT = 3;

function stripeClient() {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  try { return require("stripe")(process.env.STRIPE_SECRET_KEY); } catch { return null; }
}

// How many real bookings a booking-trial shop has used toward its free run.
function trialUsed(shop) {
  const baseline = Number.isInteger(shop.bookingTrialBaseline) ? shop.bookingTrialBaseline : 0;
  return Math.max(0, (shop.publicBookingCount || 0) - baseline);
}
function trialLimit(shop) {
  return Number.isInteger(shop.bookingTrialLimit) && shop.bookingTrialLimit > 0 ? shop.bookingTrialLimit : DEFAULT_LIMIT;
}

// Called after each real customer booking. If the shop is on a booking-trial and
// has now reached its limit, end the Stripe trial so billing begins.
async function maybeEndBookingTrial(db, shopId) {
  try {
    const stripe = stripeClient();
    if (!stripe) return;
    let _id; try { _id = new ObjectId(shopId); } catch { return; }
    const shop = await db.collection("shops").findOne({ _id });
    if (!shop || shop.bookingTrial !== true || shop.bookingTrialEndedAt || !shop.stripeCustomerId) return;
    if (trialUsed(shop) < trialLimit(shop)) return; // not there yet

    const subs = await stripe.subscriptions.list({ customer: shop.stripeCustomerId, status: "trialing", limit: 3 });
    const trialing = subs.data[0];
    // Mark ended regardless so we never re-check (and never double-charge). If a
    // trialing sub exists, end it now → Stripe finalizes the first invoice.
    await db.collection("shops").updateOne({ _id }, { $set: { bookingTrialEndedAt: new Date() } });
    if (trialing) {
      await stripe.subscriptions.update(trialing.id, { trial_end: "now" });
      await db.collection("shops").updateOne({ _id }, { $set: { subscribed: true } });
    }
  } catch { /* best-effort — a metering hiccup must never block a booking */ }
}

module.exports = { maybeEndBookingTrial, trialUsed, trialLimit, DEFAULT_LIMIT };
