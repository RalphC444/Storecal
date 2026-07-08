// Website application form → sends via EmailJS server-side (avoids the browser
// CORS/preflight issues with EmailJS's API). Public, unauthenticated.
const { Router } = require("express");

const router = Router();

// EmailJS credentials (public key is not secret — safe here). Overridable via env.
const EMAILJS = {
  serviceId: process.env.EMAILJS_SERVICE_ID || "service_yyoxg3s",
  templateId: process.env.EMAILJS_TEMPLATE_ID || "template_nnjeipk",
  publicKey: process.env.EMAILJS_PUBLIC_KEY || "bwsFY86eNZ5xIqx8M",
};

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

    // EmailJS treats a request with a browser Origin as an allowed browser call;
    // sending it from here sidesteps the browser preflight that was failing.
    const origin = req.headers.origin || "https://www.storecal.com";
    const resp = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: origin },
      body: JSON.stringify({
        service_id: EMAILJS.serviceId,
        template_id: EMAILJS.templateId,
        user_id: EMAILJS.publicKey,
        template_params,
      }),
    });

    if (!resp.ok) {
      const detail = await resp.text().catch(() => "");
      return res.status(502).json({ error: "Couldn’t send the application.", detail: detail.slice(0, 200) });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
