// Public "get your free booking page" lead capture. Drops inbound requests
// straight into the Outreach CRM (crm_prospects) so they show up in the pipeline.
const { Router } = require("express");
const { getDb } = require("../lib/db");

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
    // Don't create duplicates if they submit twice.
    const existing = await db.collection("crm_prospects").findOne({ businessName, city });
    if (!existing) {
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
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
