const { Router } = require("express");
const { getDb } = require("../db");
const { ObjectId } = require("mongodb");
const { upsertClient } = require("../clients");
const { resolveShopId } = require("../shopScope");

const router = Router();

// GET /api/clients — directory with per-client visit stats.
// Optional ?q= filters by name / phone / email.
router.get("/", async (req, res) => {
  try {
    const db = await getDb();
    const shopId = await resolveShopId(req, db);
    if (!shopId) return res.status(404).json({ error: "Shop not found" });

    const clients = await db.collection("clients").find({ shopId }).toArray();

    // Roll up appointment stats per client in one pass.
    const appts = await db.collection("appointments")
      .find({ shopId, clientId: { $ne: null } })
      .project({ clientId: 1, dateKey: 1, status: 1, providerName: 1 })
      .toArray();

    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

    const stats = {};
    for (const a of appts) {
      const s = (stats[a.clientId] = stats[a.clientId] || { visits: 0, upcoming: 0, lastVisit: null, nextVisit: null, byStylist: {} });
      const done = a.status === "completed" || (["pending", "confirmed"].includes(a.status) && a.dateKey < today);
      const upcoming = ["pending", "confirmed"].includes(a.status) && a.dateKey >= today;
      if (done) {
        s.visits += 1;
        if (!s.lastVisit || a.dateKey > s.lastVisit) s.lastVisit = a.dateKey;
        if (a.providerName) s.byStylist[a.providerName] = (s.byStylist[a.providerName] || 0) + 1;
      }
      if (upcoming) {
        s.upcoming += 1;
        if (!s.nextVisit || a.dateKey < s.nextVisit) s.nextVisit = a.dateKey;
      }
    }
    const preferredOf = (s) => {
      const e = Object.entries(s?.byStylist || {}).sort((a, b) => b[1] - a[1])[0];
      return e ? e[0] : null;
    };

    const q = (req.query.q || "").trim().toLowerCase();
    let out = clients.map((c) => {
      const s = stats[c._id.toString()];
      return {
        _id: c._id.toString(),
        name: c.name || "",
        phone: c.phone || "",
        email: c.email || "",
        notes: c.notes || "",
        visits: s?.visits || 0,
        upcoming: s?.upcoming || 0,
        lastVisit: s?.lastVisit || null,
        nextVisit: s?.nextVisit || null,
        preferredStylist: preferredOf(s),
      };
    });

    if (q) {
      out = out.filter((c) =>
        c.name.toLowerCase().includes(q) ||
        c.phone.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q)
      );
    }

    out.sort((a, b) => a.name.localeCompare(b.name));
    res.json(out);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/clients — add a client directly (dedupes by phone/email when given).
router.post("/", async (req, res) => {
  try {
    const { name, phone, email, notes } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: "Name is required" });

    const db = await getDb();
    const shopId = await resolveShopId(req, db);
    if (!shopId) return res.status(404).json({ error: "Shop not found" });

    let id;
    if ((phone && phone.trim()) || (email && email.trim())) {
      id = await upsertClient(db, shopId, { name, phone, email });
    } else {
      const r = await db.collection("clients").insertOne({
        shopId, name: name.trim(), phone: "", email: "", phoneKey: "", emailKey: "",
        notes: "", createdAt: new Date(), updatedAt: new Date(),
      });
      id = r.insertedId.toString();
    }
    if (notes && notes.trim() && id) {
      await db.collection("clients").updateOne({ _id: new ObjectId(id) }, { $set: { notes: notes.trim() } });
    }
    res.status(201).json({ success: true, _id: id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/clients/:id — profile + full visit history (newest first).
router.get("/:id", async (req, res) => {
  try {
    const db = await getDb();
    const shopId = await resolveShopId(req, db);
    if (!shopId) return res.status(404).json({ error: "Shop not found" });

    const client = await db.collection("clients").findOne({ _id: new ObjectId(req.params.id), shopId });
    if (!client) return res.status(404).json({ error: "Client not found" });

    const history = await db.collection("appointments")
      .find({ shopId, clientId: req.params.id })
      .sort({ dateKey: -1, timeValue: -1 })
      .toArray();

    res.json({
      _id: client._id.toString(),
      name: client.name || "",
      phone: client.phone || "",
      email: client.email || "",
      notes: client.notes || "",
      createdAt: client.createdAt,
      history: history.map((a) => ({
        _id: a._id.toString(),
        dateKey: a.dateKey,
        timeValue: a.timeValue,
        service: a.service || "",
        providerId: a.providerId || null,
        providerName: a.providerName || "",
        issueDescription: a.issueDescription || "",
        client: a.client || {},
        status: a.status || "pending",
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/clients/:id — update the free-text notes on a profile.
router.patch("/:id", async (req, res) => {
  try {
    const db = await getDb();
    const shopId = await resolveShopId(req, db);
    if (!shopId) return res.status(404).json({ error: "Shop not found" });

    const set = { updatedAt: new Date() };
    if (typeof req.body.notes === "string") set.notes = req.body.notes;

    const result = await db.collection("clients").updateOne(
      { _id: new ObjectId(req.params.id), shopId },
      { $set: set }
    );
    if (result.matchedCount === 0) return res.status(404).json({ error: "Client not found" });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/clients/:id — remove a client. Blocked if they have upcoming
// appointments (cancel those first) so bookings aren't silently orphaned.
router.delete("/:id", async (req, res) => {
  try {
    const db = await getDb();
    const shopId = await resolveShopId(req, db);
    if (!shopId) return res.status(404).json({ error: "Shop not found" });

    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const upcoming = await db.collection("appointments").countDocuments({
      shopId, clientId: req.params.id, status: { $in: ["pending", "confirmed"] }, dateKey: { $gte: today },
    });
    if (upcoming > 0) {
      return res.status(409).json({ error: `This client has ${upcoming} upcoming appointment(s). Cancel them before deleting.` });
    }

    const result = await db.collection("clients").deleteOne({ _id: new ObjectId(req.params.id), shopId });
    if (result.deletedCount === 0) return res.status(404).json({ error: "Client not found" });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
