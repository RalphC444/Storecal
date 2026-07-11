// Transactional email via Resend. All senders are no-ops (return false) until
// RESEND_API_KEY is set, so the app runs fine without email configured — the
// copy-able invite link and manual reset flows stay as the fallback.

const FROM = process.env.EMAIL_FROM || "StoreCal <onboarding@resend.dev>";

function client() {
  if (!process.env.RESEND_API_KEY) return null;
  const { Resend } = require("resend");
  return new Resend(process.env.RESEND_API_KEY);
}

// Brand palette (matches the app logo: navy + periwinkle).
const NAVY = "#000D6E";
const PERIWINKLE = "#7B79FF";

// A branded, email-client-safe HTML shell (inline styles, no external assets).
function shell(title, body) {
  return `<!doctype html><html><body style="margin:0;background:#f4f5f8">
  <div style="background:#f4f5f8;padding:32px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
    <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e6e8ec">
      <div style="padding:22px 28px 18px;border-bottom:1px solid #eef0f3">
        <img src="https://www.storecal.com/email-logo.png" alt="StoreCal" height="30" style="display:block;border:0;outline:none;text-decoration:none" />
      </div>
      <div style="padding:28px 28px 8px">
        <h1 style="font-size:20px;font-weight:700;color:#111;margin:0 0 14px">${title}</h1>
        ${body}
      </div>
      <div style="padding:18px 28px 24px;color:#9aa0a8;font-size:12px;line-height:1.6">
        StoreCal — booking &amp; scheduling for local businesses.<br>
        <a href="https://www.storecal.com" style="color:${PERIWINKLE};text-decoration:none">www.storecal.com</a>
      </div>
    </div>
  </div></body></html>`;
}

// Big brand-colored call-to-action button.
function button(url, label) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 14px"><tr><td>
    <a href="${url}" style="display:inline-block;background:${NAVY};color:#fff;text-decoration:none;padding:13px 26px;border-radius:10px;font-size:15px;font-weight:600">${label}</a>
  </td></tr></table>`;
}

async function sendInvite(to, name, url) {
  const resend = client();
  if (!resend || !to) return false;
  await resend.emails.send({
    from: FROM,
    to,
    subject: "You've been added to the team on StoreCal",
    html: shell(`Welcome${name ? `, ${name}` : ""}!`,
      `<p style="color:#333;font-size:15px;line-height:1.6;margin:0 0 6px">Your manager set up your staff account. Click below to choose a password and get started.</p>
       ${button(url, "Set up my account")}
       <p style="color:#9aa0a8;font-size:12px;margin:0">Or paste this link into your browser:<br>${url}</p>`),
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
      `<p style="color:#333;font-size:15px;line-height:1.6;margin:0 0 6px">We got a request to reset your StoreCal password. Click below to choose a new one — this link expires in 24 hours.</p>
       ${button(url, "Reset my password")}
       <p style="color:#9aa0a8;font-size:12px;margin:0 0 4px">Or paste this link into your browser:<br>${url}</p>
       <p style="color:#9aa0a8;font-size:12px;margin:10px 0 0">If you didn't request this, you can safely ignore this email — your password won't change.</p>`),
  });
  return true;
}

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

// Branded confirmation sent to the customer right after they book from the widget.
// `d` = { to, clientName, shopName, service, dateLabel, timeLabel, providerName, addons }
async function sendBookingConfirmation(d) {
  const resend = client();
  if (!resend || !d.to) return false;
  const first = (d.clientName || "").trim().split(/\s+/)[0];
  const rows = [
    ["Service", d.service],
    ["When", `${d.dateLabel} at ${d.timeLabel}`],
    d.providerName ? ["With", d.providerName] : null,
    d.addons && d.addons.length ? ["Add-ons", d.addons.map((a) => a.name).join(", ")] : null,
  ].filter(Boolean);
  const table = rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:7px 0;color:#9aa0a8;font-size:13px;width:88px;vertical-align:top">${k}</td><td style="padding:7px 0;color:#111;font-size:14px;font-weight:600">${esc(v)}</td></tr>`
    )
    .join("");
  await resend.emails.send({
    from: FROM,
    to: d.to,
    subject: `Your booking at ${d.shopName} is confirmed`,
    html: shell(`You're booked${first ? `, ${esc(first)}` : ""}!`,
      `<p style="color:#333;font-size:15px;line-height:1.6;margin:0 0 14px">Thanks for booking with <b>${esc(d.shopName)}</b>. Here are your details:</p>
       <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-top:1px solid #eef0f3;border-bottom:1px solid #eef0f3;margin:0 0 16px">${table}</table>
       <p style="color:#9aa0a8;font-size:13px;line-height:1.6;margin:0">Need to change or cancel? Just call the shop and they'll take care of it.</p>`),
  });
  return true;
}

module.exports = {
  sendInvite,
  sendReset,
  sendBookingConfirmation,
  emailEnabled: () => !!process.env.RESEND_API_KEY,
};
