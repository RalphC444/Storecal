// Public, token-scoped self-service for a single appointment: the customer
// opens the "manage" link from their confirmation email/text and can reschedule
// (same service + staff, new time) or cancel — no login. The signed token names
// exactly one appointment; every action re-validates on the server and can only
// ever touch that appointment.
const { Router } = require("express");
const { getDb } = require("../lib/db");
const { ObjectId } = require("mongodb");
const { verifyManage, signManage } = require("../lib/auth");
const { checkWithinHours } = require("../lib/availabilityCheck");
const { notifyAppointmentChange } = require("../lib/realtime");
const {
  sendBookingConfirmation, sendBookingCancellation, sendOwnerChangeNotification,
} = require("../lib/mailer");
const { sendSms } = require("../lib/sms");

const router = Router();

// How close to the start we stop allowing customer changes (shop-side policy).
const CHANGE_CUTOFF_HOURS = 24;

const fmtTimeLabel = (timeValue) => {
  const [h, m] = String(timeValue || "").split(":").map(Number);
  return Number.isFinite(h) ? `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}` : "";
};
const fmtDateLabel = (dateKey) =>
  dateKey ? new Date(`${dateKey}T00:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }) : "";
const startOf = (dateKey, timeValue) => new Date(`${dateKey}T${timeValue}:00`);
const appBase = (req) => {
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL.replace(/\/$/, "");
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  if (req.headers.host) return `${req.protocol}://${req.headers.host}`;
  return "https://www.storecal.com";
};
const manageLink = (req, token) => `${appBase(req)}/manage/${token}`;
const appUrl = () => (process.env.APP_URL || process.env.PUBLIC_URL || "https://www.storecal.com").replace(/\/$/, "");

// Load the appointment named by the token + its shop, or null.
async function loadFromToken(db, token) {
  let aid;
  try { aid = verifyManage(token).aid; } catch { return null; }
  let _id;
  try { _id = new ObjectId(aid); } catch { return null; }
  const appt = await db.collection("appointments").findOne({ _id });
  if (!appt) return null;
  const shop = await db.collection("shops").findOne(
    { _id: new ObjectId(appt.shopId) },
    { projection: { name: 1, phone: 1, publicKey: 1, slug: 1, businessType: 1, accent: 1, logo: 1, tagline: 1, bookingEmailsOff: 1, ownerNotifyEmail: 1 } }
  );
  return { appt, shop };
}

const durationOf = (appt) => Number(appt.durationMin) || 30;
const isPast = (appt) => { const s = appt.start ? new Date(appt.start) : startOf(appt.dateKey, appt.timeValue); return !(s > new Date()); };
const withinCutoff = (appt) => {
  const s = appt.start ? new Date(appt.start) : startOf(appt.dateKey, appt.timeValue);
  return s.getTime() - Date.now() < CHANGE_CUTOFF_HOURS * 3600 * 1000;
};

// GET /api/appt/:token — details the manage page needs to render + a slot picker.
router.get("/:token", async (req, res) => {
  try {
    const db = await getDb();
    const loaded = await loadFromToken(db, req.params.token);
    if (!loaded) return res.status(404).json({ error: "This link is invalid or has expired." });
    const { appt, shop } = loaded;
    const active = !["cancelled", "completed"].includes(appt.status);
    res.json({
      shopName: shop?.name || "the shop",
      shopPhone: shop?.phone || "",
      accent: shop?.accent || "",
      logo: shop?.logo || "",
      businessType: shop?.businessType || "generic",
      publicKey: shop?.publicKey || null,   // lets the page reuse the public slots endpoint
      service: appt.service || "your appointment",
      providerId: appt.providerId || null,
      providerName: appt.providerName || "",
      dateKey: appt.dateKey,
      timeValue: appt.timeValue,
      durationMin: durationOf(appt),
      status: appt.status || "pending",
      cutoffHours: CHANGE_CUTOFF_HOURS,
      // Rescheduling needs a provider to query open slots against.
      canReschedule: active && !isPast(appt) && !withinCutoff(appt) && !!appt.providerId,
      canCancel: active && !isPast(appt),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Fire-and-forget notifications shared by reschedule + cancel.
function notifyShopAndCustomer(req, db, { appt, shop }, action, prevLabel) {
  const emailsOff = shop?.bookingEmailsOff === true;
  const token = signManage(appt._id);
  (async () => {
    try {
      const base = {
        shopName: shop?.name || "the shop", shopPhone: shop?.phone || "",
        clientName: appt.client?.name || "", service: appt.service || "your appointment",
        dateLabel: fmtDateLabel(appt.dateKey), timeLabel: fmtTimeLabel(appt.timeValue),
        providerName: appt.providerName || "",
      };
      // Owner + assigned staff get a heads-up (calendar already updated live).
      // A per-shop ownerNotifyEmail override (demo stores) wins.
      if (!emailsOff) {
        let recips;
        if (shop?.ownerNotifyEmail) {
          recips = [shop.ownerNotifyEmail];
        } else {
          const owner = await db.collection("users").findOne({ shopId: appt.shopId, role: "owner" }, { projection: { email: 1 } });
          const set = new Set();
          if (owner?.email) set.add(owner.email);
          if (appt.providerId) {
            const prov = await db.collection("providers").findOne({ _id: new ObjectId(appt.providerId) }, { projection: { email: 1 } }).catch(() => null);
            if (prov?.email) set.add(prov.email);
          }
          recips = [...set];
        }
        for (const to of recips) {
          await sendOwnerChangeNotification({ ...base, to, action, prevLabel, appUrl: appUrl() });
        }
      }
      // The customer gets the appropriate confirmation/notice + optional SMS.
      const to = appt.client?.email || "";
      const phone = appt.client?.phone || "";
      if (action === "rescheduled") {
        if (!emailsOff && to) await sendBookingConfirmation({ ...base, to, addons: appt.addons || [], manageUrl: manageLink(req, token) });
        if (phone) await sendSms(phone, `${base.shopName}: your appointment is moved to ${base.dateLabel} at ${base.timeLabel}. Manage it: ${manageLink(req, token)}`);
      } else {
        if (!emailsOff && to) await sendBookingCancellation({ ...base, message: "" });
        if (phone) await sendSms(phone, `${base.shopName}: your ${base.service} appointment has been cancelled. Call ${base.shopPhone || "the shop"} to rebook.`);
      }
    } catch (e) { console.error("Manage notification failed:", e.message); }
  })();
}

// POST /api/appt/:token/reschedule  { dateKey, timeValue } — same service+staff, new time.
router.post("/:token/reschedule", async (req, res) => {
  try {
    const db = await getDb();
    const loaded = await loadFromToken(db, req.params.token);
    if (!loaded) return res.status(404).json({ error: "This link is invalid or has expired." });
    const { appt, shop } = loaded;

    if (["cancelled", "completed"].includes(appt.status)) return res.status(409).json({ error: "This appointment can no longer be changed." });
    if (isPast(appt)) return res.status(409).json({ error: "This appointment has already passed." });
    if (withinCutoff(appt)) return res.status(409).json({ error: `Changes must be made at least ${CHANGE_CUTOFF_HOURS} hours ahead — please call ${shop?.phone || "the shop"}.` });

    const { dateKey, timeValue } = req.body || {};
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateKey || "")) || !/^\d{2}:\d{2}$/.test(String(timeValue || ""))) {
      return res.status(400).json({ error: "Please pick a valid new time." });
    }
    const newStart = startOf(dateKey, timeValue);
    if (!(newStart > new Date())) return res.status(400).json({ error: "Pick a time in the future." });
    if (dateKey === appt.dateKey && timeValue === appt.timeValue) return res.status(400).json({ error: "That's the same time as now — pick a different slot." });

    // Re-validate against live hours/time-off and existing bookings — never trust the client.
    const hoursErr = await checkWithinHours(db, appt.shopId, appt.providerId, dateKey, timeValue, durationOf(appt));
    if (hoursErr) return res.status(409).json({ error: hoursErr });

    // Respect the same-slot unique index: a cancelled booking in the new slot is
    // freed; an active one means the time was just taken.
    if (appt.providerId) {
      const clash = await db.collection("appointments").findOne({ providerId: appt.providerId, start: newStart, _id: { $ne: appt._id } });
      if (clash) {
        if (clash.status === "cancelled") await db.collection("appointments").deleteOne({ _id: clash._id });
        else return res.status(409).json({ error: "Sorry, that time was just taken. Please pick another." });
      }
    }

    const prevLabel = `${fmtDateLabel(appt.dateKey)} at ${fmtTimeLabel(appt.timeValue)}`;
    try {
      await db.collection("appointments").updateOne(
        { _id: appt._id },
        { $set: {
            dateKey, timeValue, start: newStart, updatedAt: new Date(),
            customerRescheduledAt: new Date(),
            rescheduledFrom: { dateKey: appt.dateKey, timeValue: appt.timeValue },
        } }
      );
    } catch (e) {
      if (e && e.code === 11000) return res.status(409).json({ error: "Sorry, that time was just taken. Please pick another." });
      throw e;
    }

    // Live-update owner/provider calendars + refresh open widgets. Only the
    // first ping carries by:"customer" so the owner sees a single toast; the
    // second just refreshes the freed day.
    notifyAppointmentChange(appt.shopId, { action: "rescheduled", by: "customer", _id: appt._id.toString(), dateKey, providerId: appt.providerId });
    if (appt.dateKey !== dateKey) notifyAppointmentChange(appt.shopId, { action: "rescheduled", _id: appt._id.toString(), dateKey: appt.dateKey, providerId: appt.providerId });

    notifyShopAndCustomer(req, db, { appt: { ...appt, dateKey, timeValue, start: newStart }, shop }, "rescheduled", prevLabel);
    res.json({ success: true, dateKey, timeValue });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/appt/:token/cancel — cancel the appointment.
router.post("/:token/cancel", async (req, res) => {
  try {
    const db = await getDb();
    const loaded = await loadFromToken(db, req.params.token);
    if (!loaded) return res.status(404).json({ error: "This link is invalid or has expired." });
    const { appt, shop } = loaded;

    if (appt.status === "cancelled") return res.json({ success: true, alreadyCancelled: true });
    if (appt.status === "completed" || isPast(appt)) return res.status(409).json({ error: "This appointment can no longer be cancelled online — please call the shop." });

    await db.collection("appointments").updateOne(
      { _id: appt._id },
      { $set: { status: "cancelled", updatedAt: new Date(), customerCancelledAt: new Date() } }
    );
    notifyAppointmentChange(appt.shopId, { action: "cancelled", by: "customer", _id: appt._id.toString(), status: "cancelled", dateKey: appt.dateKey, providerId: appt.providerId });
    notifyShopAndCustomer(req, db, { appt, shop }, "cancelled");
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
