// Shared EmailJS relay — sends server-side so we dodge the browser CORS/preflight
// that blocks EmailJS's API from the page. The public key is not secret; all three
// values are overridable via env. Used by the website-apply form and the
// "get your free booking page" lead form.
const EMAILJS = {
  serviceId: process.env.EMAILJS_SERVICE_ID || "service_yyoxg3s",
  templateId: process.env.EMAILJS_TEMPLATE_ID || "template_nnjeipk",
  publicKey: process.env.EMAILJS_PUBLIC_KEY || "bwsFY86eNZ5xIqx8M",
};

// Send one templated email. Returns { ok } or { ok:false, detail }. Never throws.
async function sendViaEmailJs(templateParams, { origin } = {}) {
  try {
    const resp = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
      method: "POST",
      // EmailJS treats a request carrying a browser Origin as an allowed browser
      // call; supplying it here sidesteps the preflight that fails from the page.
      headers: { "Content-Type": "application/json", Origin: origin || "https://www.storecal.com" },
      body: JSON.stringify({
        service_id: EMAILJS.serviceId,
        template_id: EMAILJS.templateId,
        user_id: EMAILJS.publicKey,
        template_params: templateParams,
      }),
    });
    if (!resp.ok) {
      const detail = await resp.text().catch(() => "");
      return { ok: false, detail: detail.slice(0, 200) };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, detail: err.message };
  }
}

module.exports = { sendViaEmailJs, EMAILJS };
