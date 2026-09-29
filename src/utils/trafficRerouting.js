import { getEffectiveRouteDuration } from './sustainabilityCalculations.js';

export const TRAFFIC_CONFIG = {
  RECHECK_INTERVAL_MS: 60000, // 60 seconds
  REROUTE_THRESHOLD_SEC: 180, // 3 minutes improvement required to trigger reroute recommendation
  COOLDOWN_SEC: 120          // 2 minutes cooldown between reroute notifications
};

/**
 * Determines whether a newly fetched set of route alternatives contains a materially better candidate
 * than the current active route, preventing route flapping.
 *
 * @param {Object} currentRoute Currently selected active route
 * @param {Array<Object>} freshAlternatives Newly fetched traffic-aware route candidates
 * @param {number} thresholdSec Minimum time savings required in seconds (default 180s)
 * @param {number} lastRerouteTime Timestamp of last accepted reroute (ms)
 * @returns {Object} { rerouteRecommended: boolean, bestAlternative: Object|null, timeSavedMinutes: number }
 */
export function evaluateTrafficReroute(
  currentRoute,
  freshAlternatives = [],
  thresholdSec = TRAFFIC_CONFIG.REROUTE_THRESHOLD_SEC,
  lastRerouteTime = 0
) {
  if (!currentRoute || !freshAlternatives || freshAlternatives.length === 0) {
    return { rerouteRecommended: false, bestAlternative: null, timeSavedMinutes: 0 };
  }

  // Cooldown check to prevent route flapping
  const now = Date.now();
  if (lastRerouteTime > 0 && (now - lastRerouteTime) < (TRAFFIC_CONFIG.COOLDOWN_SEC * 1000)) {
    return { rerouteRecommended: false, bestAlternative: null, timeSavedMinutes: 0 };
  }

  const currentDuration = getEffectiveRouteDuration(currentRoute);

  // Find candidate with lowest effective duration among fresh alternatives
  let bestAlternative = null;
  let minDuration = currentDuration;

  freshAlternatives.forEach(alt => {
    // Only compare alternatives with different geometries or IDs
    const altDuration = getEffectiveRouteDuration(alt);
    if (altDuration < minDuration) {
      minDuration = altDuration;
      bestAlternative = alt;
    }
  });

  const timeSavedSec = currentDuration - minDuration;

  if (bestAlternative && timeSavedSec >= thresholdSec) {
    const timeSavedMinutes = Math.round(timeSavedSec / 60);
    return {
      rerouteRecommended: true,
      bestAlternative: bestAlternative,
      timeSavedMinutes: timeSavedMinutes
    };
  }

  return { rerouteRecommended: false, bestAlternative: null, timeSavedMinutes: 0 };
}

/**
 * Formats a timestamp into a user-friendly "Last checked: HH:MM AM/PM" string.
 * @param {number} timestamp Date.now() timestamp
 * @returns {string} Formatted timestamp string
 */
export function formatLastChecked(timestamp) {
  if (!timestamp) return 'Not checked yet';
  const date = new Date(timestamp);
  return `Last checked: ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
}
