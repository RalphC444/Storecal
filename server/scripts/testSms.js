// Verify Twilio SMS is wired: sends one text via the app's own sms.js.
//   node scripts/testSms.js [+1toNumber] ["message"]
require("dotenv").config({ path: require("path").resolve(__dirname, "../../.env") });
const { sendSms, smsEnabled, toE164 } = require("../lib/sms");

const to = process.argv[2] || "+19143964586";
const body = process.argv[3] || "StoreCal ✂️ — SMS is live. Booking confirmations & reminders will now text your clients.";

(async () => {
  console.log("smsEnabled:", smsEnabled(), "| from:", process.env.TWILIO_FROM, "| to:", toE164(to));
  if (!smsEnabled()) { console.error("Twilio not configured (check TWILIO_* env vars)."); process.exit(1); }
  const ok = await sendSms(to, body);
  console.log(ok ? `SENT ✓ → ${to}` : "FAILED (see error above)");
  process.exit(ok ? 0 : 1);
})();
