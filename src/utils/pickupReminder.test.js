import { describe, it, expect } from 'vitest';
import { msUntilPickupReminder, DEFAULT_REMINDER_LEAD_MS, MAX_REMINDER_HORIZON_MS } from './pickupReminder';

describe('msUntilPickupReminder', () => {
  const NOW = new Date('2026-08-22T09:00:00Z').getTime();

  it('returns the delay until 1 minute before the approx pickup time by default', () => {
    const pickup = new Date(NOW + 5 * 60 * 1000).toISOString(); // 5 minutes from now
    const delay = msUntilPickupReminder(pickup, DEFAULT_REMINDER_LEAD_MS, NOW);
    expect(delay).toBe(5 * 60 * 1000 - DEFAULT_REMINDER_LEAD_MS);
  });

  it('accepts a Date instance as well as an ISO string', () => {
    const pickup = new Date(NOW + 2 * 60 * 1000);
    const delay = msUntilPickupReminder(pickup, DEFAULT_REMINDER_LEAD_MS, NOW);
    expect(delay).toBe(2 * 60 * 1000 - DEFAULT_REMINDER_LEAD_MS);
  });

  it('returns null when there is no pickup time', () => {
    expect(msUntilPickupReminder(null, DEFAULT_REMINDER_LEAD_MS, NOW)).toBeNull();
    expect(msUntilPickupReminder(undefined, DEFAULT_REMINDER_LEAD_MS, NOW)).toBeNull();
    expect(msUntilPickupReminder('', DEFAULT_REMINDER_LEAD_MS, NOW)).toBeNull();
  });

  it('returns null for an unparseable date string', () => {
    expect(msUntilPickupReminder('not-a-date', DEFAULT_REMINDER_LEAD_MS, NOW)).toBeNull();
  });

  it('returns null when the reminder point has already passed (pickup is imminent or past)', () => {
    // Pickup is only 30 seconds away -- less than the 60s lead time, so the reminder
    // point itself is already in the past.
    const pickup = new Date(NOW + 30 * 1000).toISOString();
    expect(msUntilPickupReminder(pickup, DEFAULT_REMINDER_LEAD_MS, NOW)).toBeNull();
  });

  it('returns null when the pickup time is entirely in the past', () => {
    const pickup = new Date(NOW - 60 * 1000).toISOString();
    expect(msUntilPickupReminder(pickup, DEFAULT_REMINDER_LEAD_MS, NOW)).toBeNull();
  });

  it('returns null when the pickup is further out than the max horizon', () => {
    const pickup = new Date(NOW + MAX_REMINDER_HORIZON_MS + DEFAULT_REMINDER_LEAD_MS + 60 * 1000).toISOString();
    expect(msUntilPickupReminder(pickup, DEFAULT_REMINDER_LEAD_MS, NOW)).toBeNull();
  });

  it('respects a custom lead time', () => {
    const pickup = new Date(NOW + 10 * 60 * 1000).toISOString();
    const delay = msUntilPickupReminder(pickup, 2 * 60 * 1000, NOW);
    expect(delay).toBe(8 * 60 * 1000);
  });
});
