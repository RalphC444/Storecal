// Transactional email via Resend. All senders are no-ops (return false) until
// RESEND_API_KEY is set, so the app runs fine without email configured — the
// copy-able invite link and manual reset flows stay as the fallback.

const FROM = process.env.EMAIL_FROM || "StoreCal <onboarding@resend.dev>";

function client() {
  if (!process.env.RESEND_API_KEY) return null;
  const { Resend } = require("resend");
  return new Resend(process.env.RESEND_API_KEY);
}

function shell(title, body) {
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#111">
    <h2 style="color:#2563eb;margin:0 0 12px">${title}</h2>${body}
    <p style="color:#888;font-size:12px;margin-top:24px">Sent by StoreCal scheduling.</p></div>`;
}

async function sendInvite(to, name, url) {
  const resend = client();
  if (!resend || !to) return false;
  await resend.emails.send({
    from: FROM,
    to,
    subject: "You've been added to the team on StoreCal",
    html: shell(`Welcome${name ? `, ${name}` : ""}!`,
      `<p>Your manager set up your staff account. Click below to choose a password and get started.</p>
       <p><a href="${url}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px">Set up my account</a></p>
       <p style="color:#888;font-size:12px">Or paste this link: ${url}</p>`),
  });
  return true;
}

async function sendReset(to, url) {
  const resend = client();
  if (!resend || !to) return false;
  await resend.emails.send({
    from: FROM,
    to,
    subject: "Reset your StoreCal password",
    html: shell("Reset your password",
      `<p>We got a request to reset your password. This link expires in 1 hour.</p>
       <p><a href="${url}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px">Reset password</a></p>
       <p style="color:#888;font-size:12px">If you didn't request this, you can ignore this email.</p>`),
  });
  return true;
}

module.exports = { sendInvite, sendReset, emailEnabled: () => !!process.env.RESEND_API_KEY };
