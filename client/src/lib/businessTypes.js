// Per-vertical constants keyed off shop.businessType.

// Team wording per vertical (hair / nail / barber), driven by shop.businessType.
export const TEAM_LABEL = {
  salon: "Staff",
  hair: "Staff",
  barber: "Staff",
  nail: "Staff",
  generic: "Staff",
};

// Pet weight bands — must match the grooming booking widget's dropdown (embed.js).
export const PET_WEIGHTS = ["1–40 lbs", "40–65 lbs", "65–100 lbs", "100+ lbs"];

// Business types that get a photo Gallery tab (visual work worth showing off).
export const GALLERY_TYPES = ["salon", "grooming", "hair", "barber", "nail"];
