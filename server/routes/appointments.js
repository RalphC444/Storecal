const { Router } = require("express");
const { getDb } = require("../db");
const { upsertClient } = require("../clients");
const { checkWithinHours } = require("../availabilityCheck");
const { resolveShopId } = require("../shopScope");

const router = Router();

// GET /api/appointments
// Query params: from, to (YYYY-MM-DD), providerId, status
router.get("/", async (req, res) => {
  try {
    const db = await getDb();
    const shopId = await resolveShopId(req, db);
    if (!shopId) return res.status(404).json({ error: "Shop not found" });

    // A provider can only ever see their own appointments.
    const scopedProviderId = req.auth?.role === "provider" ? req.auth.providerId : null;
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
        issueDescription: a.issueDescription || "",
        vehicle: a.vehicle || {},
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
    client, issueDescription, vehicle, status, durationMin,
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
  if (dateKey && timeValue) doc.start = new Date(`${dateKey}T${timeValue}:00`);
  if (vehicle && Object.keys(vehicle).length) doc.vehicle = vehicle;
  return doc;
}

function validate(body) {
  if (!body.dateKey) return "A date is required";
  if (!body.timeValue) return "A time is required";
  if (!body.client?.name?.trim()) return "Client name is required";
  if (body.status && !["pending", "confirmed", "cancelled", "completed"].includes(body.status)) {
    return "Invalid status value";
  }
  return null;
}

// POST /api/appointments — create an appointment (phone / walk-in booking)
router.post("/", async (req, res) => {
  try {
    const err = validate(req.body);
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
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/appointments/:id — update status
router.patch("/:id", async (req, res) => {
  try {
    const { ObjectId } = require("mongodb");
    const { status } = req.body;

    if (!["pending", "confirmed", "cancelled", "completed"].includes(status)) {
      return res.status(400).json({ error: "Invalid status value" });
    }

    const db = await getDb();
    const shopId = await resolveShopId(req, db);
    const result = await db.collection("appointments").updateOne(
      { _id: new ObjectId(req.params.id), shopId },
      { $set: { status, updatedAt: new Date() } }
    );

    if (result.matchedCount === 0) return res.status(404).json({ error: "Appointment not found" });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
