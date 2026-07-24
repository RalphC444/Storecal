// Stripe webhook — keeps each shop's record in sync with subscription reality
// (subscribe, trial-ending, payment failure, cancellation) and fires the
// matching funnel events, so the platform is no longer blind to real-time
// billing state (previously everything was lazy-polled and churn left no trace).
//
// Mounted in index.js with a RAW body (before express.json) so the Stripe
// signature can be verified. No-ops safely (503) unless STRIPE_WEBHOOK_SECRET is
// set — prod behaves identically until you add the secret + register the endpoint.
const { getDb } = require("../lib/db");
const { capture } = require("../lib/analytics");

function stripeClient() {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  try { return require("stripe")(process.env.STRIPE_SECRET_KEY); } catch { return null; }
}

module.exports = async function billingWebhook(req, res) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const stripe = stripeClient();
  if (!secret || !stripe) return res.status(503).json({ error: "Webhook not configured" });

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers["stripe-signature"], secret);
  } catch (err) {
    return res.status(400).send(`Webhook signature verification failed: ${err.message}`);
  }

  try {
    const db = await getDb();
    const shops = db.collection("shops");
    const shopByCustomer = (customerId) =>
      customerId ? shops.findOne({ stripeCustomerId: customerId }) : null;

    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const sub = event.data.object;
        const shop = await shopByCustomer(sub.customer);
        if (shop) {
          const active = ["active", "trialing", "past_due"].includes(sub.status);
          const set = { subscribed: active, subscriptionStatus: sub.status, subscriptionUpdatedAt: new Date() };
          const unset = {};
          const firstTime = active && !shop.subscribedAt;
          if (firstTime) set.subscribedAt = new Date();
          if (sub.status === "past_due") set.pastDueAt = new Date(); else unset.pastDueAt = "";
          const ops = { $set: set };
          if (Object.keys(unset).length) ops.$unset = unset;
          await shops.updateOne({ _id: shop._id }, ops);
          if (firstTime) capture(shop._id.toString(), "subscribed", { status: sub.status }); // funnel: paid conversion
        }
        break;
      }
      case "customer.subscription.trial_will_end": {
        const sub = event.data.object;
        const shop = await shopByCustomer(sub.customer);
        if (shop) {
          await shops.updateOne({ _id: shop._id }, { $set: { trialEndsAt: sub.trial_end ? new Date(sub.trial_end * 1000) : null } });
          capture(shop._id.toString(), "trial_will_end");
          // TODO(Phase 2): send the "your free month ends in 3 days" email here.
        }
        break;
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object;
        const shop = await shopByCustomer(sub.customer);
        if (shop) {
          await shops.updateOne({ _id: shop._id }, { $set: { subscribed: false, subscriptionStatus: "canceled", canceledAt: new Date() } });
          capture(shop._id.toString(), "canceled");
          // TODO(Phase 2): trigger a win-back email here.
        }
        break;
      }
      case "invoice.payment_failed": {
        const inv = event.data.object;
        const shop = await shopByCustomer(inv.customer);
        if (shop) {
          await shops.updateOne({ _id: shop._id }, { $set: { pastDueAt: new Date() } });
          capture(shop._id.toString(), "payment_failed", { amountDue: inv.amount_due });
          // TODO(Phase 2): dunning email.
        }
        break;
      }
      default:
        break;
    }
    res.json({ received: true });
  } catch (err) {
    // 200 so Stripe doesn't retry-storm on our internal errors; the state is
    // still recoverable from admin's live Stripe polling.
    console.error("[webhook] handler error:", err.message);
    res.status(200).json({ received: true, error: err.message });
  }
};
