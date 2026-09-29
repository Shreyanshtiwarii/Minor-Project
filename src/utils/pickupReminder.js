/**
 * Phase 5 - Carpool operational integration.
 *
 * Pure helper for scheduling an in-app "pickup coming up" reminder roughly one
 * minute before a passenger's APPROXIMATE pickup time (backend-computed, see
 * PoolResponse.approxPickupTime / PassengerDetailResponse.approxPickupTime).
 *
 * Deliberately has no timers/DOM/side effects of its own so it's trivially
 * unit-testable; callers own the actual setTimeout/cleanup lifecycle (see
 * VehiclePool.jsx's submitJoin success handler).
 */

/** Default lead time before the estimated pickup time: ~1 minute. */
export const DEFAULT_REMINDER_LEAD_MS = 60 * 1000;

/**
 * Reminders further out than this are not scheduled at all, so a join far in the
 * future doesn't park a day(s)-long JS timer in the tab.
 */
export const MAX_REMINDER_HORIZON_MS = 24 * 60 * 60 * 1000;

/**
 * @param {string|Date|null|undefined} approxPickupTime - ISO string or Date of the
 *   APPROXIMATE pickup time returned by the backend.
 * @param {number} [leadMs] - how long before pickup the reminder should fire.
 * @param {number} [nowMs] - "current" time in epoch ms (injectable for tests).
 * @returns {number|null} milliseconds to wait before firing the reminder, or null
 *   when it can't/shouldn't be scheduled: missing/invalid time, the reminder point
 *   has already passed, or it's further out than MAX_REMINDER_HORIZON_MS.
 */
export function msUntilPickupReminder(approxPickupTime, leadMs = DEFAULT_REMINDER_LEAD_MS, nowMs = Date.now()) {
  if (!approxPickupTime) return null;

  const pickupMs = approxPickupTime instanceof Date
    ? approxPickupTime.getTime()
    : new Date(approxPickupTime).getTime();
  if (Number.isNaN(pickupMs)) return null;

  const delay = (pickupMs - leadMs) - nowMs;

  if (delay <= 0) return null; // already past the reminder point (or pickup itself)
  if (delay > MAX_REMINDER_HORIZON_MS) return null; // too far out to usefully schedule now

  return delay;
}
