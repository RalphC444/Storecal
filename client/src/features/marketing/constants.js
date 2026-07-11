// Content and contact details for the public marketing site + policy pages.

// Where "Get a website" points.
export const CONTACT_HREF = "mailto:capriglioner@gmail.com?subject=I'd%20like%20a%20website";

// Support / business contact shown on the site and policy pages (Stripe requires
// reachable customer-service contact details).
export const SUPPORT_EMAIL = "capriglioner@gmail.com";

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
  },
];
