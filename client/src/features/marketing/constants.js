// Content and contact details for the public marketing site + policy pages.

// Where "Get a website" points.
export const CONTACT_HREF = "mailto:storecal.support@gmail.com?subject=I'd%20like%20a%20website";

// Support / business contact shown on the site and policy pages (Stripe requires
// reachable customer-service contact details).
export const SUPPORT_EMAIL = "storecal.support@gmail.com";

export const MARKETING_FEATURES = [
  {
    icon: "calendar",
    t: "Online booking",
    d: "A clean booking widget clients use to book themselves — embed it on any website in one line.",
  },
  {
    icon: "scissors",
    t: "Staff & schedules",
    d: "Each team member gets their own calendar, hours, services, and login.",
  },
  {
    icon: "clock",
    t: "Store hours & closures",
    d: "Set weekly hours, close early for a day, or block time off — bookings respect all of it.",
  },
  {
    icon: "clients",
    t: "Client list",
    d: "Every booking builds a client record with visit history and contact details.",
  },
];

// Public pricing (mirrors the billing plans in server/routes/billing.js).
export const MARKETING_PLANS = [
  {
    name: "Booking access",
    price: "$35",
    per: "/month",
    blurb: "The online booking widget for your existing website.",
    points: [
      "Embeddable booking widget",
      "Staff calendars & schedules",
      "Store hours & closures",
      "Client list & visit history",
    ],
    note: "First month free · no credit card to start",
  },
  {
    name: "Website + Booking",
    price: "$99",
    per: "/month",
    featured: true,
    blurb: "A custom website for your business with booking built in.",
    points: [
      "Everything in Booking access",
      "Custom-designed website",
      "Live services & staff synced from StoreCal",
      "Ongoing updates & support",
    ],
    note: "Apply and we build it with you",
  },
];

// Pricing FAQ — answers the questions that stall a signup (card, billing timing,
// cancellation) and surfaces the branding add-on that's otherwise hidden.
export const PRICING_FAQ = [
  {
    q: "Do I need a credit card to start?",
    a: "No. Create your account and your booking page works right away. You only add a card when you decide to subscribe — and your first month is free.",
  },
  {
    q: "When am I charged?",
    a: "Never today. When you subscribe, the first 30 days are free; your first $35 payment lands 30 days later. Cancel before then and you won’t be charged.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes — cancel in a couple of clicks from your dashboard. No contracts, no cancellation fees.",
  },
  {
    q: "Which plan is right for me?",
    a: "Already have a website? Booking access ($35/mo) adds online booking to it. No website yet? Website + Booking ($99/mo) is a custom site we build for you with booking built in.",
  },
  {
    q: "Can I use my own logo and colors?",
    a: "Yes — a $5/mo branding add-on puts your logo and brand color on your booking page. Turn it on anytime from Settings.",
  },
];
