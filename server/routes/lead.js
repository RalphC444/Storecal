// Public "get your free booking page" lead capture. Two channels, so a lead is
// never missed: (1) drops the shop into the Outreach CRM (crm_prospects) so it
// shows in the admin pipeline, and (2) emails the operator right away via EmailJS.
const { Router } = require("express");
const { getDb } = require("../lib/db");
const { sendViaEmailJs } = require("../lib/emailjs");

const router = Router();
const clean = (v) => String(v == null ? "" : v).trim();

// POST /api/lead  { businessName, contact, city? }
router.post("/", async (req, res) => {
  try {
    const businessName = clean(req.body.businessName).slice(0, 120);
    const contact = clean(req.body.contact).slice(0, 200);
    if (!businessName || !contact) return res.status(400).json({ error: "Add your shop name and a way to reach you." });

    const db = await getDb();
    const city = clean(req.body.city).slice(0, 80);
    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact);

    // 1. CRM — don't create duplicates if they submit twice.
    const existing = await db.collection("crm_prospects").findOne({ businessName, city });
    const isNew = !existing;
    if (isNew) {
      await db.collection("crm_prospects").insertOne({
        businessName, vertical: "beauty", contactName: "",
        email: isEmail ? contact.toLowerCase() : "",
        phone: isEmail ? "" : contact,
        website: "", address: "", city, state: "",
        source: "website — free page request", status: "new",
        notes: `Inbound lead from the site. Reach them at: ${contact}`,
        createdAt: new Date(), updatedAt: new Date(),
      });
    }

    // 2. Email notification (best-effort — never blocks the response). Reuses the
    //    existing EmailJS template; the message makes clear it's a free-page lead.
    if (isNew) {
      const emailRes = await sendViaEmailJs({
        from_name: businessName,
        from_email: isEmail ? contact.toLowerCase() : "no-reply@storecal.com",
        phone: isEmail ? "" : contact,
        business: businessName,
        business_type: "salon",
        plan: "Free booking page (barbershop/salon)",
        message: `NEW "free booking page" request from the website.\n\nShop: ${businessName}\nReach them at: ${contact}\nTown: ${city || "—"}`,
      }, { origin: req.headers.origin });
      if (!emailRes.ok) console.error("[lead] EmailJS notify failed:", emailRes.detail);
    }

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
