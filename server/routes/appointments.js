const { Router } = require("express");
const { getDb } = require("../lib/db");
const { upsertClient } = require("../lib/clients");
const { checkWithinHours } = require("../lib/availabilityCheck");
const { resolveShopId } = require("../lib/shopScope");
const { notifyAppointmentChange } = require("../lib/realtime");
const { sendBookingConfirmation, sendBookingCancellation } = require("../lib/mailer");
const { ObjectId } = require("mongodb");

// Shared email fields (shop name + phone, formatted date/time, details) for a
// booking doc — used by both the confirmation and cancellation notices.
async function bookingFields(db, shopId, doc, origin) {
  const shop = await db.collection("shops").findOne(
    { _id: new ObjectId(shopId) },
    { projection: { name: 1, phone: 1, website: 1, businessType: 1, publicKey: 1 } }
  );
  const [h, m] = String(doc.timeValue || "").split(":").map(Number);
  const timeLabel = Number.isFinite(h) ? `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}` : "";
  const dateLabel = doc.dateKey
    ? new Date(`${doc.dateKey}T00:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })
    : "";
  return {
    to: doc.client?.email || "",
    clientName: doc.client?.name || "",
    shopName: shop?.name || "the shop",
    shopPhone: shop?.phone || "",
    service: doc.service || "your appointment",
    dateLabel,
    timeLabel,
    providerName: doc.providerName || "",
    addons: doc.addons || [],
    // Deep-link back to the shop's website with the same service + groomer
    // preselected, so the cancellation email can offer one-tap rebooking.
    rebookUrl: buildRebookUrl(shop, doc, origin),
  };
}

// A rebook link that preselects the same service + staff member (the embed
// reads sc_service/sc_provider and auto-opens the widget). Grooming only for
// now. Targets the shop's own website when set (the embed lives there); else
// falls back to the StoreCal-hosted /book page so the link always works.
function buildRebookUrl(shop, doc, origin) {
  if (!shop || shop.businessType !== "grooming" || !doc.service) return "";
  let base = "";
  if (shop.website) {
    // The embed lives on the shop's own site — send them straight there.
    base = /^https?:\/\//i.test(shop.website) ? shop.website : `https://${shop.website}`;
  } else if (shop.publicKey) {
    // No own website → the StoreCal-hosted /book page. Prefer an explicit
    // PUBLIC_URL, else the app origin the request came from (same-origin in prod).
    const host = (process.env.PUBLIC_URL || origin || "").replace(/\/$/, "");
    if (host) base = `${host}/book?key=${encodeURIComponent(shop.publicKey)}`;
  }
  if (!base) return "";
  try {
    const u = new URL(base);
    u.searchParams.set("sc_service", doc.service);
    if (doc.providerId) u.searchParams.set("sc_provider", String(doc.providerId));
    return u.toString();
  } catch {
    return "";
  }
}

// Fire-and-forget branded emails to the customer. Never block or fail the
// booking/cancellation — email is best-effort.
function emailBookingConfirmation(db, shopId, doc) {
  if (!doc.client?.email) return;
  (async () => {
    try { await sendBookingConfirmation(await bookingFields(db, shopId, doc)); }
    catch (e) { console.error("Booking confirmation email failed:", e.message); }
  })();
}

function emailBookingCancellation(db, shopId, doc, message, origin) {
  if (!doc.client?.email) return;
  (async () => {
    try { await sendBookingCancellation({ ...(await bookingFields(db, shopId, doc, origin)), message: message || "" }); }
    catch (e) { console.error("Booking cancellation email failed:", e.message); }
  })();
}

const router = Router();

// GET /api/appointments
// Query params: from, to (YYYY-MM-DD), providerId, status
router.get("/", async (req, res) => {
  try {
    const db = await getDb();
    const shopId = await resolveShopId(req, db);
    if (!shopId) return res.status(404).json({ error: "Shop not found" });

    // A provider can only ever see their own appointments — EXCEPT at auto shops,
    // where "staff" are administrators (not bookable service providers): they help
    // manage the store's whole calendar, so they see every appointment.
    let scopedProviderId = req.auth?.role === "provider" ? req.auth.providerId : null;
    if (scopedProviderId) {
      const shop = await db.collection("shops").findOne({ _id: new ObjectId(shopId) }).catch(() => null);
      if (shop?.businessType === "auto") scopedProviderId = null;
    }
    const { from, to, status, providerId } = req.query;

    const filter = { shopId };

    if (from || to) {
      filter.dateKey = {};
      if (from) filter.dateKey.$gte = from;
      if (to) filter.dateKey.$lte = to;
    }

    if (status && status !== "all") {
      filter.status = status;
    }

    if (scopedProviderId) {
      filter.providerId = scopedProviderId; // provider role: locked to self
    } else if (providerId && providerId !== "all") {
      filter.providerId = providerId;
    }

    const appointments = await db
      .collection("appointments")
      .find(filter)
      .sort({ dateKey: 1, timeValue: 1 })
      .toArray();

    res.json(
      appointments.map((a) => ({
        _id: a._id.toString(),
        dateKey: a.dateKey,
        timeValue: a.timeValue,
        providerId: a.providerId || null,
        providerName: a.providerName || "",
        client: a.client || {},
        service: a.service || "",
        addons: a.addons || [],
        issueDescription: a.issueDescription || "",
        vehicle: a.vehicle || {},
        pet: a.pet || {},
        status: a.status || "pending",
        durationMin: a.durationMin || null,
        createdAt: a.createdAt,
      }))
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Build the persisted appointment shape from a request body. Resolves the
// provider's display name from its id so the list can render without a join.
async function buildDoc(db, shopId, body) {
  const {
    dateKey, timeValue, providerId, service,
    client, issueDescription, vehicle, pet, status, durationMin, addons,
  } = body;

  let providerName = "";
  if (providerId) {
    const { ObjectId } = require("mongodb");
    let query;
    try { query = { _id: new ObjectId(providerId) }; }
    catch { query = { _id: providerId }; }
    const provider = await db.collection("providers").findOne(query);
    providerName = provider?.name || "";
  }

  const doc = {
    shopId,
    dateKey,
    timeValue,
    providerId: providerId || null,
    providerName,
    client: {
      name: client?.name?.trim() || "",
      phone: client?.phone?.trim() || "",
      email: client?.email?.trim() || "",
    },
    service: service || "",
    issueDescription: issueDescription || "",
    status: status || "pending",
  };
  if (durationMin) doc.durationMin = Number(durationMin);
  if (Array.isArray(addons) && addons.length) {
    doc.addons = addons.map((a) => ({ name: String(a.name || "").trim(), price: String(a.price || "").trim() })).filter((a) => a.name);
  }
  if (dateKey && timeValue) doc.start = new Date(`${dateKey}T${timeValue}:00`);
  if (vehicle && Object.keys(vehicle).length) doc.vehicle = vehicle;
  if (pet && (pet.name || pet.breed || pet.weight)) {
    doc.pet = {
      name: String(pet.name || "").trim(),
      breed: String(pet.breed || "").trim(),
      weight: String(pet.weight || "").trim(),
    };
  }
  return doc;
}

function validate(body, isPublic) {
  if (!body.dateKey) return "A date is required";
  if (!body.timeValue) return "A time is required";
  if (!body.client?.name?.trim()) return "Client name is required";
  if (body.status && !["pending", "confirmed", "cancelled", "completed"].includes(body.status)) {
    return "Invalid status value";
  }
  // Public (embed / hosted booking page) submissions must carry a usable phone
  // and email — it's how the customer gets their confirmation, and it mirrors
  // the embed's client-side checks so a bypassed form can't slip bad data in.
  // Owner-created walk-ins (authenticated, no store key) stay exempt.
  if (isPublic) {
    let phone = String(body.client?.phone || "").replace(/\D/g, "");
    if (phone.length === 11 && phone.startsWith("1")) phone = phone.slice(1); // US "1" country code
    if (phone.length !== 10) return "A valid 10-digit phone number is required";
    const email = String(body.client?.email || "").trim();
    if (!email) return "An email is required";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "A valid email address is required";
  }
  return null;
}

// POST /api/appointments — create an appointment (phone / walk-in booking)
router.post("/", async (req, res) => {
  try {
    const err = validate(req.body, !!req.body.key);
    if (err) return res.status(400).json({ error: err });

    const db = await getDb();
    const shopId = await resolveShopId(req, db);
    if (!shopId) return res.status(404).json({ error: "Shop not found" });

    const hoursErr = await checkWithinHours(
      db, shopId, req.body.providerId, req.body.dateKey, req.body.timeValue, req.body.durationMin
    );
    if (hoursErr) return res.status(409).json({ error: hoursErr });

    const doc = await buildDoc(db, shopId, req.body);
    doc.createdAt = new Date();
    doc.clientId = await upsertClient(db, shopId, doc.client);

    // A unique index blocks two bookings at the same provider+start. A CANCELLED
    // appointment still sits in that slot, so free it up before rebooking; an
    // active one means the time was genuinely just taken.
    if (doc.providerId && doc.start) {
      const clash = await db.collection("appointments").findOne({ providerId: doc.providerId, start: doc.start });
      if (clash) {
        if (clash.status === "cancelled") await db.collection("appointments").deleteOne({ _id: clash._id });
        else return res.status(409).json({ error: "Sorry, that time was just booked. Please pick another." });
      }
    }

    try {
      const result = await db.collection("appointments").insertOne(doc);
      notifyAppointmentChange(shopId, { action: "created", _id: result.insertedId.toString(), dateKey: doc.dateKey, providerId: doc.providerId });
      emailBookingConfirmation(db, shopId, doc); // branded confirmation to the customer (best-effort)
      res.status(201).json({ success: true, _id: result.insertedId.toString() });
    } catch (e) {
      if (e && e.code === 11000) return res.status(409).json({ error: "Sorry, that time was just booked. Please pick another." });
      throw e;
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/appointments/:id — full edit of an appointment
router.put("/:id", async (req, res) => {
  try {
    const err = validate(req.body);
    if (err) return res.status(400).json({ error: err });

    const { ObjectId } = require("mongodb");
    const db = await getDb();
    const shopId = await resolveShopId(req, db);
    if (!shopId) return res.status(404).json({ error: "Shop not found" });

    const hoursErr = await checkWithinHours(
      db, shopId, req.body.providerId, req.body.dateKey, req.body.timeValue, req.body.durationMin
    );
    if (hoursErr) return res.status(409).json({ error: hoursErr });

    const doc = await buildDoc(db, shopId, req.body);
    doc.updatedAt = new Date();
    doc.clientId = await upsertClient(db, shopId, doc.client);

    // Free a cancelled slot at the new time; reject if an active one holds it.
    if (doc.providerId && doc.start) {
      const clash = await db.collection("appointments").findOne({
        providerId: doc.providerId, start: doc.start, _id: { $ne: new ObjectId(req.params.id) },
      });
      if (clash) {
        if (clash.status === "cancelled") await db.collection("appointments").deleteOne({ _id: clash._id });
        else return res.status(409).json({ error: "That time is already booked for this staff member." });
      }
    }

    let result;
    try {
      result = await db.collection("appointments").updateOne(
        { _id: new ObjectId(req.params.id), shopId }, { $set: doc }
      );
    } catch (e) {
      if (e && e.code === 11000) return res.status(409).json({ error: "That time is already booked for this staff member." });
      throw e;
    }
    if (result.matchedCount === 0) return res.status(404).json({ error: "Appointment not found" });
    notifyAppointmentChange(shopId, { action: "updated", _id: req.params.id, dateKey: doc.dateKey, providerId: doc.providerId });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/appointments/:id — update status
router.patch("/:id", async (req, res) => {
  try {
    const { status, message } = req.body;

    if (!["pending", "confirmed", "cancelled", "completed"].includes(status)) {
      return res.status(400).json({ error: "Invalid status value" });
    }

    const db = await getDb();
    const shopId = await resolveShopId(req, db);
    // Load the appointment first — we need its details (customer email, service,
    // date/time) to email a cancellation notice.
    const appt = await db.collection("appointments").findOne({ _id: new ObjectId(req.params.id), shopId });
    if (!appt) return res.status(404).json({ error: "Appointment not found" });

    const set = { status, updatedAt: new Date() };
    if (status === "cancelled" && message) set.cancelMessage = String(message).trim();
    await db.collection("appointments").updateOne({ _id: new ObjectId(req.params.id), shopId }, { $set: set });

    notifyAppointmentChange(shopId, { action: "status", _id: req.params.id, status });
    // Email the customer a branded cancellation with the staff message + shop
    // phone, and a rebook link (grooming). origin backstops the hosted /book URL.
    if (status === "cancelled") emailBookingCancellation(db, shopId, appt, message, req.headers.origin);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
