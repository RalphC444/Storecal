// Website application form → sends via EmailJS server-side (avoids the browser
// CORS/preflight issues with EmailJS's API). Public, unauthenticated.
const { Router } = require("express");
const { sendViaEmailJs } = require("../lib/emailjs");

const router = Router();

router.post("/", async (req, res) => {
  try {
    const b = req.body || {};
    const name = String(b.name || "").trim();
    const email = String(b.email || "").trim();
    const business = String(b.business || "").trim();
    if (!name || !email || !business) {
      return res.status(400).json({ error: "Name, email, and business name are required." });
    }
    const template_params = {
      from_name: name,
      from_email: email,
      phone: String(b.phone || "").trim(),
      business,
      business_type: String(b.businessType || "").trim(),
      plan: String(b.plan || "").trim(),
      message: String(b.message || "").trim().slice(0, 4000),
    };

    const sent = await sendViaEmailJs(template_params, { origin: req.headers.origin });
    if (!sent.ok) {
      return res.status(502).json({ error: "Couldn’t send the application.", detail: sent.detail });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
