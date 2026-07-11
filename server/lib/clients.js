// Client-profile helpers. A "client" is a person who books — deduped across
// appointments by phone (preferred) or email, scoped to a shop. Both the admin
// create-path and the public booking wizard can call upsertClient so a profile
// is built automatically the moment a booking is made — no change to the
// customer's booking UX.

const { ObjectId } = require("mongodb");

function normPhone(phone) {
  let d = (phone || "").replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("1")) d = d.slice(1); // US "1" country code → same profile
  return d;
}
function normEmail(email) {
  return (email || "").trim().toLowerCase();
}

// Find-or-create a client for this shop from a { name, phone, email } blob.
// Returns the client's _id as a string, or null if there's nothing to key on.
async function upsertClient(db, shopId, person) {
  const name = (person?.name || "").trim();
  const phone = (person?.phone || "").trim();
  const email = (person?.email || "").trim();
  const phoneKey = normPhone(phone);
  const emailKey = normEmail(email);

  // Nothing to identify a person by — don't create an anonymous profile.
  if (!phoneKey && !emailKey) return null;

  const or = [];
  if (phoneKey) or.push({ phoneKey });
  if (emailKey) or.push({ emailKey });

  const clients = db.collection("clients");
  const existing = await clients.findOne({ shopId, $or: or });

  if (existing) {
    // Backfill any newly-supplied fields without clobbering existing data.
    const set = { updatedAt: new Date() };
    if (name && !existing.name) set.name = name;
    if (phone && !existing.phone) { set.phone = phone; set.phoneKey = phoneKey; }
    if (email && !existing.email) { set.email = email; set.emailKey = emailKey; }
    await clients.updateOne({ _id: existing._id }, { $set: set });
    return existing._id.toString();
  }

  const doc = {
    shopId,
    name,
    phone,
    email,
    phoneKey,
    emailKey,
    notes: "",
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const result = await clients.insertOne(doc);
  return result.insertedId.toString();
}

module.exports = { upsertClient, normPhone, normEmail, ObjectId };
