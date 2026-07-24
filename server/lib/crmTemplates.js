// Cold-outreach email templates for the admin CRM, ported from the standalone
// Python tool. Plain-text (personal, inbox-friendly), CAN-SPAM compliant (real
// physical address + working opt-out in every footer).
//
// Sender/company/address are edited here (or via env) — they appear in every
// email, so fill in a REAL mailing address before sending for real.
const OUTREACH = {
  senderName: process.env.OUTREACH_SENDER_NAME || "Ralph",
  senderCompany: process.env.OUTREACH_SENDER_COMPANY || "StoreCal",
  senderPhone: process.env.OUTREACH_SENDER_PHONE || "(914) 555-0100",
  // The call-to-action link — your live demo or a booking/call link.
  ctaLink: process.env.OUTREACH_CTA_LINK || "https://www.storecal.com",
  // CAN-SPAM REQUIRES a real physical mailing address in every message. EDIT THIS.
  physicalAddress: process.env.OUTREACH_ADDRESS || "StoreCal, [your street address], Mount Vernon, NY 10550",
  // Opt-out address (per the request).
  unsubscribeEmail: "storecal.support@gmail.com",
};

const VERTICALS = ["beauty", "nails", "auto"];
const MAX_STEP = 3;
// Follow-up cadence + volume guardrails for the sequence engine.
const SEQUENCE = {
  step2DelayDays: Number(process.env.OUTREACH_STEP2_DAYS) || 4,
  step3DelayDays: Number(process.env.OUTREACH_STEP3_DAYS) || 5,
  dailyCap: Number(process.env.OUTREACH_DAILY_CAP) || 40,
};
// Days to wait BEFORE sending the given step (index by step number).
const DELAY_BEFORE_STEP = { 2: SEQUENCE.step2DelayDays, 3: SEQUENCE.step3DelayDays };

// step → { subject, body } per vertical. Tokens: {first_name} {business_name}
// {city} {sender_name} {sender_company} {sender_phone} {cta_link}.
// Only step 1 is written for now (the pipeline sends the intro); steps 2–3 are
// stubbed for the sequence-engine pass.
const TEMPLATES = {
  beauty: {
    1: {
      subject: "Online booking for {business_name}?",
      body: `Hi {first_name},

I'm {sender_name} with {sender_company} — I set up simple online booking for salons around {city}. Clients book themselves from your website or Instagram, and it syncs to one clean calendar for your team.

It's a friendlier, lower-cost alternative to Square, Booksy, or Phorest — most shops are taking bookings the same day, and the first month is free.

Worth a quick look? Just reply and I'll send over a booking page set up for {business_name} so you can try it.`,
    },
    2: {
      subject: "Quick follow-up — {business_name}",
      body: `Hi {first_name},

Circling back in case my note got buried. Short version: clients book {business_name} online in a few taps, everything lands on one clean calendar, and the first month is free — a simpler, cheaper alternative to Square, Booksy, or Phorest.

Want me to set up a booking page with your services so you can see it live?`,
    },
    3: {
      subject: "Should I close your file?",
      body: `Hi {first_name},

I don't want to keep cluttering your inbox, so this is my last note. If online booking for {business_name} is worth a quick look, just reply and I'll send one over — otherwise I'll leave you to it.

Either way, thanks for the time and best of luck this season.`,
    },
  },
  nails: {
    1: {
      subject: "Let clients book {business_name} online",
      body: `Hi {first_name},

I'm {sender_name} with {sender_company}. I help nail salons in {city} take appointments online — clients pick a service and time from your Instagram link or website, and it all lands on one shared calendar (no more DM back-and-forth).

Simpler and cheaper than Square or Booksy, first month free, and I can have your booking page live today.

Want me to set one up for {business_name} so you can try it? Just reply and I'll send it over.`,
    },
    2: {
      subject: "Following up — online booking for {business_name}",
      body: `Hi {first_name},

Just following up. Most nail shops around {city} are still taking appointments over DM and phone tag — with {business_name}'s own booking link, clients pick a service and time themselves and it all lands on one calendar.

First month's free and I can have it live today. Want me to send you one to try?`,
    },
    3: {
      subject: "Last note — {business_name}",
      body: `Hi {first_name},

I'll stop here so I'm not filling your inbox. If a simple online booking link for {business_name} is worth two minutes, just reply and I'll set one up — no pressure either way.

Thanks, {first_name}, and best of luck!`,
    },
  },
  auto: {
    1: {
      subject: "Online appointment booking for {business_name}",
      body: `Hi {first_name},

I'm {sender_name} with {sender_company}. I set up online appointment booking for auto shops around {city} — customers request a time from your website, and it drops onto one calendar so the phone stops ringing off the hook.

Quick to set up, first month free, and cheaper than the big scheduling tools.

Open to a quick look? Just reply and I'll get one set up for {business_name} to try.`,
    },
    2: {
      subject: "Following up — {business_name}",
      body: `Hi {first_name},

Circling back. The idea: customers request a time for {business_name} from your website, it drops onto one calendar, and the phone rings a lot less. Quick to set up, first month free, cheaper than the big scheduling tools.

Want a quick look? Just reply and I'll set one up for {business_name}.`,
    },
    3: {
      subject: "Last note — {business_name}",
      body: `Hi {first_name},

I'll leave it here so I'm not clogging your inbox. If online appointment booking for {business_name} is worth a couple minutes, just reply and I'll get one set up — otherwise no worries at all.

Appreciate the time, {first_name}.`,
    },
  },
};

function firstNameOf(contact) {
  const c = (contact || "").trim();
  return c ? c.split(/\s+/)[0] : "there";
}

function render(text, fields) {
  let out = text;
  for (const [k, v] of Object.entries(fields)) {
    out = out.split("{" + k + "}").join(v == null ? "" : String(v));
  }
  return out;
}

function footer() {
  const idLine = [OUTREACH.senderCompany, OUTREACH.physicalAddress].filter(Boolean).join(" · ");
  return `\n\n--\n${OUTREACH.senderName}${OUTREACH.senderPhone ? " · " + OUTREACH.senderPhone : ""}\n${idLine}\nNot interested? Reply STOP or email ${OUTREACH.unsubscribeEmail} and I'll remove you right away.`;
}

// Returns { subject, body } for a prospect + step, or throws if unavailable.
function renderOutreach(prospect, step = 1) {
  const vertical = (prospect.vertical || "").toLowerCase();
  if (!VERTICALS.includes(vertical)) {
    throw new Error(`Unknown vertical "${prospect.vertical}" (need one of ${VERTICALS.join(", ")})`);
  }
  const tpl = TEMPLATES[vertical] && TEMPLATES[vertical][step];
  if (!tpl) throw new Error(`No template for ${vertical} step ${step}`);
  const fields = {
    first_name: firstNameOf(prospect.contactName),
    business_name: prospect.businessName || "your shop",
    city: prospect.city || "your area",
    sender_name: OUTREACH.senderName,
    sender_company: OUTREACH.senderCompany,
    sender_phone: OUTREACH.senderPhone,
    cta_link: OUTREACH.ctaLink,
  };
  return {
    subject: render(tpl.subject, fields),
    body: render(tpl.body, fields) + footer(),
  };
}

module.exports = { renderOutreach, OUTREACH, VERTICALS, MAX_STEP, SEQUENCE, DELAY_BEFORE_STEP };
