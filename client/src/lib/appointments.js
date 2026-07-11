// Appointment status vocabulary and the rule for an appointment's effective status.
import { todayKey, toMin } from "./datetime";

export const STATUSES = ["pending", "confirmed", "completed", "cancelled"];

// Statuses an owner can set by hand — "completed" is automatic (see effStatus).
export const MANUAL_STATUSES = ["pending", "confirmed", "cancelled"];

export const STATUS_LABEL = {
  pending: "Pending",
  confirmed: "Confirmed",
  completed: "Completed",
  cancelled: "Cancelled",
};

// Effective status: an appointment auto-completes once its end time has passed
// (a past day, or today with end ≤ now). Cancelled is left as-is, and a future
// appointment is never "completed" even if an old record carries that status.
export function effStatus(a, durationOf) {
  if (a.status === "cancelled") return "cancelled";
  const today = todayKey();
  const now = new Date();
  const endMin = toMin(a.timeValue) + (durationOf ? durationOf(a.service) : 45);
  const past =
    a.dateKey < today || (a.dateKey === today && endMin <= now.getHours() * 60 + now.getMinutes());
  if (past) return "completed";
  return a.status === "completed" ? "confirmed" : a.status;
}
