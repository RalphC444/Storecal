// Admin CRM + cold-outreach (superadmin only) — a Mongo-backed port of the
// standalone Python tool. First pass: prospects, pipeline, notes, CSV import,
// and one-off preview/send (DRY RUN by default) via Resend. The automated
// multi-step sequence engine is a later pass.
//
// Collections: crm_prospects, crm_activities, crm_emails, crm_suppression.
const { Router } = require("express");
const { getDb } = require("../lib/db");
const { ObjectId } = require("mongodb");
const { renderOutreach, VERTICALS, MAX_STEP, DELAY_BEFORE_STEP, SEQUENCE, OFFERS, DEFAULT_OFFER } = require("../lib/crmTemplates");

// Coerce a request's offer to a known key (falls back to the default).
const pickOffer = (v) => (v && OFFERS[v] ? v : DEFAULT_OFFER);
const { sendOutreachEmail } = require("../lib/mailer");

const router = Router();

const CONTACTABLE = ["new", "contacted"];
const STOP_STATES = ["replied", "interested", "not_interested", "bounced", "unsubscribed", "customer", "paused"];
const ALL_STATES = [...CONTACTABLE, ...STOP_STATES];

const nowIso = () => new Date().toISOString().slice(0, 19).replace("T", " ");
const clean = (v) => String(v == null ? "" : v).trim();

async function logActivity(db, prospectId, type, detail = "") {
  await db.collection("crm_activities").insertOne({ prospectId: String(prospectId), type, detail, createdAt: new Date() });
}
async function isSuppressed(db, email) {
  if (!email) return false;
  return !!(await db.collection("crm_suppression").findOne({ email: email.toLowerCase() }));
}
function pub(p) {
  return {
    _id: p._id.toString(),
    businessName: p.businessName, vertical: p.vertical || "", contactName: p.contactName || "",
    email: p.email || "", phone: p.phone || "", website: p.website || "",
    address: p.address || "", city: p.city || "", state: p.state || "", source: p.source || "",
    status: p.status || "new", notes: p.notes || "",
    sequenceStep: p.sequenceStep || 0, nextActionAt: p.nextActionAt || null,
    lastContactedAt: p.lastContactedAt || null, createdAt: p.createdAt || null,
  };
}

// A prospect is "due" for a touch when: still contactable, has an email, hasn't
// finished the sequence, and its scheduled follow-up time has arrived (or none
// is set yet). Suppressed prospects are already moved to 'unsubscribed', so the
// status filter excludes them.
function dueQuery() {
  return {
    status: { $in: CONTACTABLE },
    email: { $nin: ["", null] },
    $and: [
      { $or: [{ sequenceStep: { $lt: MAX_STEP } }, { sequenceStep: { $exists: false } }] },
      { $or: [{ nextActionAt: null }, { nextActionAt: { $exists: false } }, { nextActionAt: { $lte: new Date() } }] },
    ],
  };
}
// When to schedule the NEXT touch after sending `step` (null once the sequence ends).
function nextActionAfter(step) {
  if (step >= MAX_STEP) return null;
  const days = DELAY_BEFORE_STEP[step + 1] || 4;
  const d = new Date(); d.setDate(d.getDate() + days); return d;
}

// Send (or dry-run preview) a prospect's NEXT sequence step, logging + advancing
// state on a live send. Shared by the single-send route and the batch runner.
async function sendOne(db, p, dryRun, offer) {
  const step = Math.min((p.sequenceStep || 0) + 1, MAX_STEP);
  let rendered;
  try { rendered = renderOutreach(pub(p), step, offer); }
  catch (e) { return { skipped: true, step, error: e.message }; }
  if (!p.email) return { skipped: true, step, error: "no email" };
  if (await isSuppressed(db, p.email)) return { skipped: true, step, error: "suppressed" };

  if (dryRun) return { dryRun: true, step, to: p.email, subject: rendered.subject, body: rendered.body };

  const result = await sendOutreachEmail(p.email, rendered.subject, rendered.body);
  await db.collection("crm_emails").insertOne({
    prospectId: p._id.toString(), step, subject: rendered.subject, body: rendered.body,
    status: result.ok ? "sent" : "failed", providerMsgId: result.id || null, error: result.error || null, createdAt: new Date(),
  });
  if (result.ok) {
    await db.collection("crm_prospects").updateOne({ _id: p._id }, { $set: {
      status: "contacted", sequenceStep: step, lastContactedAt: new Date(), nextActionAt: nextActionAfter(step), updatedAt: new Date(),
    } });
    await logActivity(db, p._id.toString(), "email_sent", `step ${step}: ${rendered.subject}`);
    return { ok: true, step, to: p.email, subject: rendered.subject };
  }
  await logActivity(db, p._id.toString(), "email_failed", result.error || "");
  return { ok: false, step, to: p.email, error: result.error };
}

// Minimal RFC-4180-ish CSV parser (handles quoted fields + commas + "" escapes).
function parseCsv(text) {
  const rows = [];
  let row = [], field = "", inQ = false;
  const s = String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQ) {
      if (c === '"') { if (s[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

router.use(require("../lib/auth").requireAuth, require("../lib/auth").requireSuperAdmin);

// GET /api/admin/crm/prospects — filterable list.
router.get("/prospects", async (req, res) => {
  try {
    const db = await getDb();
    const q = req.query.due === "1" ? dueQuery() : {};
    if (!q.status && req.query.status && ALL_STATES.includes(req.query.status)) q.status = req.query.status;
    if (req.query.vertical && VERTICALS.includes(req.query.vertical)) q.vertical = req.query.vertical;
    if (req.query.q) {
      const rx = new RegExp(String(req.query.q).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      q.$or = [{ businessName: rx }, { email: rx }, { city: rx }, { phone: rx }];
    }
    const limit = Math.min(Number(req.query.limit) || 500, 2000);
    const rows = await db.collection("crm_prospects").find(q).sort({ _id: 1 }).limit(limit).toArray();
    res.json(rows.map(pub));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/admin/crm/stats — pipeline summary.
router.get("/stats", async (_req, res) => {
  try {
    const db = await getDb();
    const total = await db.collection("crm_prospects").countDocuments();
    const byStatus = {}, byVertical = {};
    for (const r of await db.collection("crm_prospects").aggregate([{ $group: { _id: "$status", c: { $sum: 1 } } }]).toArray()) byStatus[r._id || "new"] = r.c;
    for (const r of await db.collection("crm_prospects").aggregate([{ $group: { _id: "$vertical", c: { $sum: 1 } } }]).toArray()) byVertical[r._id || "(none)"] = r.c;
    const withEmail = await db.collection("crm_prospects").countDocuments({ email: { $nin: ["", null] } });
    const sent = await db.collection("crm_emails").countDocuments({ status: "sent" });
    const due = await db.collection("crm_prospects").countDocuments(dueQuery());
    res.json({ total, byStatus, byVertical, withEmail, sent, due });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/admin/crm/prospects — add one.
router.post("/prospects", async (req, res) => {
  try {
    const db = await getDb();
    const businessName = clean(req.body.businessName);
    if (!businessName) return res.status(400).json({ error: "Business name is required" });
    const city = clean(req.body.city);
    if (await db.collection("crm_prospects").findOne({ businessName, city })) {
      return res.status(409).json({ error: "A prospect with that name + city already exists" });
    }
    const doc = {
      businessName, vertical: clean(req.body.vertical).toLowerCase(), contactName: clean(req.body.contactName),
      email: clean(req.body.email).toLowerCase(), phone: clean(req.body.phone), website: clean(req.body.website),
      address: clean(req.body.address), city, state: clean(req.body.state), source: clean(req.body.source) || "manual",
      status: "new", notes: "", createdAt: new Date(), updatedAt: new Date(),
    };
    const r = await db.collection("crm_prospects").insertOne(doc);
    res.status(201).json({ _id: r.insertedId.toString() });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/admin/crm/import — import pasted CSV (fills blanks, never clobbers).
router.post("/import", async (req, res) => {
  try {
    const db = await getDb();
    const rows = parseCsv(req.body.csv);
    if (rows.length < 2) return res.status(400).json({ error: "CSV needs a header row + at least one row" });
    const header = rows[0].map((h) => h.trim().toLowerCase());
    const idx = (name) => header.indexOf(name);
    const cols = ["business_name", "vertical", "contact_name", "email", "phone", "website", "address", "city", "state", "source"];
    if (idx("business_name") === -1) return res.status(400).json({ error: "CSV must have a 'business_name' column" });
    let added = 0, updated = 0, skipped = 0;
    for (let i = 1; i < rows.length; i++) {
      const get = (c) => (idx(c) >= 0 ? clean(rows[i][idx(c)]) : "");
      const businessName = get("business_name");
      if (!businessName) { skipped++; continue; }
      const city = get("city");
      const email = get("email").toLowerCase();
      if (email && await isSuppressed(db, email)) { skipped++; continue; }
      const data = {
        businessName, vertical: get("vertical").toLowerCase(), contactName: get("contact_name"), email,
        phone: get("phone"), website: get("website"), address: get("address"), city, state: get("state"), source: get("source"),
      };
      const existing = await db.collection("crm_prospects").findOne({ businessName, city });
      if (existing) {
        const set = {};
        for (const [k, v] of Object.entries(data)) if (v && !clean(existing[k])) set[k] = v;
        if (Object.keys(set).length) { set.updatedAt = new Date(); await db.collection("crm_prospects").updateOne({ _id: existing._id }, { $set: set }); updated++; }
      } else {
        await db.collection("crm_prospects").insertOne({ ...data, status: "new", notes: "", createdAt: new Date(), updatedAt: new Date() });
        added++;
      }
    }
    res.json({ added, updated, skipped });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/admin/crm/prospects/:id — one + activities + emails.
router.get("/prospects/:id", async (req, res) => {
  try {
    const db = await getDb();
    let _id; try { _id = new ObjectId(req.params.id); } catch { return res.status(400).json({ error: "Bad id" }); }
    const p = await db.collection("crm_prospects").findOne({ _id });
    if (!p) return res.status(404).json({ error: "Prospect not found" });
    const activities = await db.collection("crm_activities").find({ prospectId: req.params.id }).sort({ _id: 1 }).toArray();
    const emails = await db.collection("crm_emails").find({ prospectId: req.params.id }).sort({ _id: 1 }).toArray();
    res.json({
      ...pub(p),
      activities: activities.map((a) => ({ type: a.type, detail: a.detail || "", createdAt: a.createdAt })),
      emails: emails.map((e) => ({ subject: e.subject, status: e.status, step: e.step, createdAt: e.createdAt, error: e.error || "" })),
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH /api/admin/crm/prospects/:id — status and/or notes.
router.patch("/prospects/:id", async (req, res) => {
  try {
    const db = await getDb();
    let _id; try { _id = new ObjectId(req.params.id); } catch { return res.status(400).json({ error: "Bad id" }); }
    const p = await db.collection("crm_prospects").findOne({ _id });
    if (!p) return res.status(404).json({ error: "Prospect not found" });
    const set = { updatedAt: new Date() };
    if (req.body.status !== undefined) {
      if (!ALL_STATES.includes(req.body.status)) return res.status(400).json({ error: `Status must be one of: ${ALL_STATES.join(", ")}` });
      set.status = req.body.status;
      // Moving to a terminal/paused state stops the sequence (e.g. they replied).
      if (STOP_STATES.includes(req.body.status)) set.nextActionAt = null;
      await logActivity(db, req.params.id, "status_change", `${p.status || "new"} → ${req.body.status}`);
    }
    if (req.body.notes !== undefined) set.notes = clean(req.body.notes);
    await db.collection("crm_prospects").updateOne({ _id }, { $set: set });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/admin/crm/prospects/:id/note — log an activity note.
router.post("/prospects/:id/note", async (req, res) => {
  try {
    const db = await getDb();
    const text = clean(req.body.text);
    if (!text) return res.status(400).json({ error: "Note text is required" });
    await logActivity(db, req.params.id, "note", text);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/admin/crm/suppress — never-contact an email (+ mark any matching prospect).
router.post("/suppress", async (req, res) => {
  try {
    const db = await getDb();
    const email = clean(req.body.email).toLowerCase();
    if (!email) return res.status(400).json({ error: "Email is required" });
    await db.collection("crm_suppression").updateOne({ email }, { $set: { email, reason: clean(req.body.reason) || "manual", createdAt: new Date() } }, { upsert: true });
    await db.collection("crm_prospects").updateMany({ email }, { $set: { status: "unsubscribed", updatedAt: new Date() } });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/admin/crm/prospects/:id/send — preview or send the outreach email.
// Body: { dryRun (default true), step (default 1) }. Live send requires dryRun:false.
router.post("/prospects/:id/send", async (req, res) => {
  try {
    const db = await getDb();
    let _id; try { _id = new ObjectId(req.params.id); } catch { return res.status(400).json({ error: "Bad id" }); }
    const p = await db.collection("crm_prospects").findOne({ _id });
    if (!p) return res.status(404).json({ error: "Prospect not found" });

    const dryRun = req.body.dryRun !== false; // default = dry run (safe)
    const offer = pickOffer(req.body.offer);
    const r = await sendOne(db, p, dryRun, offer);
    if (r.skipped) return res.status(400).json({ error: r.error || "Cannot send" });
    if (r.dryRun) return res.json({ dryRun: true, step: r.step, offer, to: r.to, subject: r.subject, body: r.body });
    if (r.ok) return res.json({ ok: true, step: r.step, to: r.to, subject: r.subject });
    res.status(502).json({ ok: false, error: r.error || "Send failed" });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/admin/crm/run — the sequence engine: send the next step to every DUE
// prospect. DRY RUN by default; a live run respects the daily cap. Body:
// { dryRun (default true), vertical?, limit? }.
router.post("/run", async (req, res) => {
  try {
    const db = await getDb();
    const dryRun = req.body.dryRun !== false;
    const offer = pickOffer(req.body.offer);
    const q = dueQuery();
    if (req.body.vertical && VERTICALS.includes(req.body.vertical)) q.vertical = req.body.vertical;

    const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
    const sentToday = await db.collection("crm_emails").countDocuments({ status: "sent", createdAt: { $gte: dayStart } });
    let remaining = Math.max(0, SEQUENCE.dailyCap - sentToday);

    const limit = Math.min(Number(req.body.limit) || 100, 500);
    const due = await db.collection("crm_prospects").find(q).sort({ sequenceStep: 1, _id: 1 }).limit(limit).toArray();

    const results = [];
    let okN = 0, failN = 0, skipN = 0;
    for (const p of due) {
      if (!dryRun && remaining <= 0) { results.push({ business: p.businessName, step: (p.sequenceStep || 0) + 1, status: "skipped", error: "daily cap reached" }); skipN++; continue; }
      const r = await sendOne(db, p, dryRun, offer);
      const status = r.skipped ? "skipped" : r.dryRun ? "would send" : r.ok ? "sent" : "failed";
      results.push({ id: p._id.toString(), business: p.businessName, step: r.step, to: r.to || p.email || null, status, error: r.error || null });
      if (r.skipped) skipN++; else if (r.dryRun) okN++; else if (r.ok) { okN++; remaining--; } else failN++;
    }
    res.json({ dryRun, offer, dueCount: due.length, sentToday, dailyCap: SEQUENCE.dailyCap, counts: { ok: okN, failed: failN, skipped: skipN }, results });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
