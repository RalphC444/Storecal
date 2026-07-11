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
      <div style="background:${NAVY};padding:20px 28px">
        <span style="color:#fff;font-size:19px;font-weight:800;letter-spacing:-.02em">Store<span style="color:${PERIWINKLE}">Cal</span></span>
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
      `<p style="color:#333;font-size:15px;line-height:1.6;margin:0 0 6px">We got a request to reset your StoreCal password. Click below to choose a new one — this link expires in 1 hour.</p>
       ${button(url, "Reset my password")}
       <p style="color:#9aa0a8;font-size:12px;margin:0 0 4px">Or paste this link into your browser:<br>${url}</p>
       <p style="color:#9aa0a8;font-size:12px;margin:10px 0 0">If you didn't request this, you can safely ignore this email — your password won't change.</p>`),
  });
  return true;
}

module.exports = { sendInvite, sendReset, emailEnabled: () => !!process.env.RESEND_API_KEY };
