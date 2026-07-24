// One-off: render a sample outreach email and attempt to send it, so you can
// see exactly what a prospect would receive.
//   node scripts/testOutreach.js [toEmail] [vertical] [step]
// Defaults: capriglioner@gmail.com, beauty, step 1.
require("dotenv").config({ path: require("path").resolve(__dirname, "../../.env") });
const { renderOutreach } = require("../lib/crmTemplates");
const { sendOutreachEmail } = require("../lib/mailer");

const to = process.argv[2] || "capriglioner@gmail.com";
const vertical = process.argv[3] || "beauty";
const step = Number(process.argv[4]) || 1;

// A representative prospect (mirrors a real greenfield row).
const sample = { businessName: "Angie Hair Salon", vertical, contactName: "", city: "Bronx" };

async function main() {
  const { subject, body } = renderOutreach(sample, step);
  console.log("── RENDERED EMAIL ─────────────────────────────────────");
  console.log("To:      ", to);
  console.log("From:    ", process.env.EMAIL_FROM || "StoreCal <onboarding@resend.dev> (SANDBOX)");
  console.log("Reply-To:", process.env.SUPPORT_EMAIL || "storecal.support@gmail.com");
  console.log("Subject: ", subject);
  console.log("───────────────────────────────────────────────────────");
  console.log(body);
  console.log("───────────────────────────────────────────────────────");
  console.log("Sending via Resend…");
  const r = await sendOutreachEmail(to, subject, body);
  console.log("Result:", JSON.stringify(r));
  if (!r.ok) {
    console.log("\nNot delivered. If this is the Resend sandbox, it only sends to your");
    console.log("Resend account's own address. Set EMAIL_FROM to your verified domain to");
    console.log("send anywhere (that's what prod/Render uses).");
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
