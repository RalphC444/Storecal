// Shared add-on config + operator state control for the paid add-ons
// (custom branding, AI chatbot). An add-on is in one of three states per shop:
//   off      → not available to the owner
//   free     → available, comped (no charge)         [compField = true]
//   charged  → available, billed as a Stripe line item on top of the plan
// Stripe line items are tagged metadata.addon=<key> so we can find/remove them.
// Prices/products match server/routes/billing.js exactly, so no duplicate prices
// are created in Stripe.
const ADDONS = {
  branding: { key: "branding", productId: "storecal-branding", name: "StoreCal Custom Branding", defaultCents: 500, priceField: "brandingAddonPrice", compField: "brandingAddonComp", flagField: "brandingAddon" },
  aichat:   { key: "aichat",   productId: "storecal-aichat",   name: "StoreCal AI Chatbot",       defaultCents: 799, priceField: "aiChatAddonPrice",   compField: "aiChatAddonComp",   flagField: "aiChatAddon" },
};

const priceOf = (shop, addon) => {
  const c = ADDONS[addon];
  return Number.isInteger(shop?.[c.priceField]) ? shop[c.priceField] : c.defaultCents;
};
const itemOf = (sub, addon) => (sub?.items?.data || []).find((i) => i && i.metadata && i.metadata.addon === addon) || null;

async function ensurePrice(stripe, addon, cents) {
  const c = ADDONS[addon];
  try { await stripe.products.retrieve(c.productId); }
  catch (e) {
    if (e && e.code === "resource_missing") await stripe.products.create({ id: c.productId, name: c.name });
    else throw e;
  }
  const key = `${c.productId}-${cents}`;
  const found = await stripe.prices.list({ lookup_keys: [key], limit: 1 });
  if (found.data[0]) return found.data[0].id;
  const price = await stripe.prices.create({ product: c.productId, unit_amount: cents, currency: "usd", recurring: { interval: "month" }, lookup_key: key });
  return price.id;
}

// Derive the current state from stored comp + live Stripe "active" (paid item present).
function stateOf(shop, addon, active) {
  const c = ADDONS[addon];
  if (active) return "charged";
  if (shop?.[c.compField] === true) return "free";
  return "off";
}

// Set an add-on to off / free / charged for a shop, reconciling the Stripe line
// item. Throws (caught by the caller → 400) if "charged" is asked for without an
// active subscription to attach the charge to.
async function applyAddonState(stripe, db, shop, addon, state) {
  const c = ADDONS[addon];
  if (!c) throw new Error("Unknown add-on");
  if (!["off", "free", "charged"].includes(state)) throw new Error("State must be off, free, or charged");

  if (stripe && shop.stripeCustomerId) {
    const subs = await stripe.subscriptions.list({ customer: shop.stripeCustomerId, status: "all", limit: 5 });
    const active = subs.data.find((s) => ["active", "trialing", "past_due"].includes(s.status));
    if (active) {
      const existing = itemOf(active, addon);
      if (state === "charged") {
        if (!existing) {
          const price = await ensurePrice(stripe, addon, priceOf(shop, addon));
          await stripe.subscriptionItems.create({ subscription: active.id, price, quantity: 1, metadata: { addon } });
        }
      } else if (existing) {
        await stripe.subscriptionItems.del(existing.id); // proration credited automatically
      }
    } else if (state === "charged") {
      throw new Error("This client has no active subscription, so the add-on can't be charged. Comp it (free), or start their subscription first.");
    }
  } else if (state === "charged") {
    throw new Error("Billing isn't connected, so the add-on can't be charged. Comp it (free) instead.");
  }

  await db.collection("shops").updateOne(
    { _id: shop._id },
    { $set: { [c.compField]: state === "free", [c.flagField]: state !== "off" } }
  );
  return { state };
}

module.exports = { ADDONS, priceOf, itemOf, ensurePrice, stateOf, applyAddonState };
