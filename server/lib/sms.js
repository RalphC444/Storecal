// Transactional SMS via Twilio's REST API — called with plain fetch so there's
// no extra dependency. Like the mailer, every sender is a no-op (returns false)
// until Twilio is configured, so the app runs fine without SMS: the email link
// stays as the fallback for reaching the customer.
//
// Always set:
//   TWILIO_ACCOUNT_SID   ACxxxxxxxx...   (your Account SID — used in the URL)
//   TWILIO_FROM          +1XXXXXXXXXX    (an SMS-capable Twilio number you own)
// Plus ONE of these credential pairs:
//   TWILIO_AUTH_TOKEN                     (the Account's Auth Token), OR
//   TWILIO_API_KEY + TWILIO_API_SECRET    (a Standard API Key: SKxxxx + secret)

// Which basic-auth pair to use: an API Key (SK…) wins if provided, else the
// Account SID + Auth Token. Twilio accepts either; the URL always uses the SID.
function credentials() {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  if (!sid) return null;
  if (process.env.TWILIO_API_KEY && process.env.TWILIO_API_SECRET) {
    return { user: process.env.TWILIO_API_KEY, pass: process.env.TWILIO_API_SECRET };
  }
  if (process.env.TWILIO_AUTH_TOKEN) return { user: sid, pass: process.env.TWILIO_AUTH_TOKEN };
  return null;
}

function smsEnabled() {
  return !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_FROM && credentials());
}

// Best-effort E.164 formatting for US-style numbers. Returns "" if it can't make
// a plausible number, so we simply skip sending rather than error.
function toE164(raw) {
  const s = String(raw || "").trim();
  if (/^\+[1-9]\d{7,14}$/.test(s)) return s;          // already E.164
  const digits = s.replace(/\D/g, "");
  if (digits.length === 10) return "+1" + digits;      // US 10-digit
  if (digits.length === 11 && digits.startsWith("1")) return "+" + digits;
  return "";
}

// Send one SMS. Never throws — returns true only when Twilio accepted it.
async function sendSms(to, body) {
  if (!smsEnabled()) return false;
  const dest = toE164(to);
  if (!dest || !body) return false;
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const creds = credentials();
  if (!creds) return false;
  const auth = Buffer.from(`${creds.user}:${creds.pass}`).toString("base64");
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ To: dest, From: process.env.TWILIO_FROM, Body: String(body).slice(0, 480) }),
    });
    if (!res.ok) { console.error("SMS send failed:", res.status, await res.text().catch(() => "")); return false; }
    return true;
  } catch (e) {
    console.error("SMS send error:", e.message);
    return false;
  }
}

module.exports = { sendSms, smsEnabled, toE164 };
