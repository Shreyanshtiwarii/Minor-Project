/**
 * GreenMove Phase 2, Phase 3, Phase 5 & Phase 7 — Dynamic Sustainability, Cost & Optimization Calculations
 */

// Vehicle & Emission Constants
export const CARPOOL_COST_RATE_PER_KM = 4.25; // ₹ per km for carpool
export const CARPOOL_CO2_FACTOR_PER_KM = 0.05; // kg CO2 per km for carpool vehicle
export const SOLO_COST_RATE_PER_KM = 13.41; // ₹ per km for solo drive
export const SOLO_CO2_FACTOR_PER_KM = 0.201; // kg CO2 per km for solo drive
export const MOTORCYCLE_COST_RATE_PER_KM = 2.22; // ₹ per km for petrol motorcycle (₹100/L ÷ 45 km/L)
export const MOTORCYCLE_CO2_FACTOR_PER_KM = 0.052; // kg CO2 per km for petrol motorcycle (2.31 kg CO2/L ÷ 45 km/L)

/**
 * Helper utility to clamp a value between min and max.
 */
export function clamp(value, min = 0, max = 1) {
  return Math.min(Math.max(value, min), max);
}

/**
 * Centralized mode-aware CO2 emission calculator.
 * @param {number} distanceKm Distance in kilometers
 * @param {string} mode Travel mode ('DRIVING', 'MOTORCYCLE', 'WALKING', 'CYCLING', 'TRANSIT')
 * @param {number|string} passengerCount Number of passengers (for driving/carpool)
 * @returns {number} Numeric CO2 emissions in kg
 */
export function calculateRouteCO2(distanceKm, mode = 'DRIVING', passengerCount = 1) {
  if (!distanceKm || distanceKm <= 0) return 0;
  const upperMode = (mode || 'DRIVING').toUpperCase();

  if (upperMode === 'WALKING' || upperMode === 'CYCLING') {
    return 0; // Active zero-emission travel
  }

  if (upperMode === 'MOTORCYCLE' || upperMode === 'BIKE') {
    return distanceKm * MOTORCYCLE_CO2_FACTOR_PER_KM; // Petrol motorcycle emission factor
  }

  if (upperMode === 'TRANSIT') {
    return distanceKm * 0.03; // Standard public transit factor (0.03 kg CO2/km)
  }

  // Default DRIVING / Carpool vehicle mode
  const passengers = Math.max(parseInt(passengerCount, 10) || 1, 1);
  return (distanceKm * CARPOOL_CO2_FACTOR_PER_KM) / passengers;
}

/**
 * Calculates dynamic fuel cost for Petrol Motorcycle travel.
 * @param {number} distanceKm Distance in km
 * @returns {number} Fuel cost in ₹
 */
export function calculateMotorcycleCost(distanceKm) {
  if (!distanceKm || distanceKm <= 0) return 15;
  return Math.round(distanceKm * MOTORCYCLE_COST_RATE_PER_KM);
}

/**
 * Calculates dynamic cost per person for carpool travel.
 * @param {number} distanceKm Distance of the route in kilometers
 * @param {number|string} passengerCount Number of passengers (minimum 1)
 * @returns {number} Cost per person rounded to integer currency (₹)
 */
export function calculateCarpoolCost(distanceKm, passengerCount = 1) {
  if (!distanceKm || distanceKm <= 0) return 35;
  const passengers = Math.max(parseInt(passengerCount, 10) || 1, 1);
  const totalTripCost = distanceKm * CARPOOL_COST_RATE_PER_KM;
  return Math.round(totalTripCost / passengers);
}

/**
 * Calculates dynamic CO2 emissions per person for carpool travel.
 * @param {number} distanceKm Distance of the route in kilometers
 * @param {number|string} passengerCount Number of passengers (minimum 1)
 * @returns {string} Formatted CO2 per person in kg formatted to 2 decimal places (e.g. "0.41")
 */
export function calculateCarpoolCO2(distanceKm, passengerCount = 1) {
  if (!distanceKm || distanceKm <= 0) return "0.41";
  return calculateRouteCO2(distanceKm, 'DRIVING', passengerCount).toFixed(2);
}

/**
 * Calculates dynamic Solo Drive cost baseline.
 * @param {number} distanceKm Distance in km
 * @returns {number} Solo drive cost in ₹
 */
export function calculateSoloCost(distanceKm) {
  if (!distanceKm || distanceKm <= 0) return 110;
  return distanceKm * SOLO_COST_RATE_PER_KM;
}

/**
 * Calculates dynamic Solo Drive CO2 baseline.
 * @param {number} distanceKm Distance in km
 * @returns {number} Solo drive CO2 in kg
 */
export function calculateSoloCO2(distanceKm) {
  if (!distanceKm || distanceKm <= 0) return 1.65;
  return distanceKm * SOLO_CO2_FACTOR_PER_KM;
}

/**
 * Calculates percentage cheaper for carpool vs solo drive.
 * @param {number} distanceKm Route distance in km
 * @param {number|string} passengerCount Passenger count
 * @returns {number} Percentage cheaper (0-100)
 */
export function calculatePercentageCheaper(distanceKm, passengerCount = 1) {
  const solo = calculateSoloCost(distanceKm);
  const carpoolPerPerson = calculateCarpoolCost(distanceKm, passengerCount);
  if (solo <= 0) return 68;
  const ratio = (solo - carpoolPerPerson) / solo;
  return Math.round(clamp(ratio, 0, 1) * 100);
}

/**
 * Calculates percentage lower CO2 for carpool vs solo drive.
 * @param {number} distanceKm Route distance in km
 * @param {number|string} passengerCount Passenger count
 * @returns {number} Percentage lower CO2 (0-100)
 */
export function calculatePercentageLowerCO2(distanceKm, passengerCount = 1) {
  const solo = calculateSoloCO2(distanceKm);
  const carpoolPerPerson = parseFloat(calculateCarpoolCO2(distanceKm, passengerCount));
  if (solo <= 0) return 75;
  const ratio = (solo - carpoolPerPerson) / solo;
  return Math.round(clamp(ratio, 0, 1) * 100);
}

/**
 * Formats time difference comparison text dynamically.
 * @param {number} delayMinutes Time difference in minutes (+ = slower, - = faster, 0 = same)
 * @returns {string} Formatted label (e.g. "Only 1 min slower")
 */
export function calculateTimeComparison(delayMinutes = 1) {
  if (delayMinutes > 0) {
    return `Only ${delayMinutes} min slower`;
  } else if (delayMinutes < 0) {
    return `${Math.abs(delayMinutes)} min faster`;
  } else {
    return 'Same travel time';
  }
}

/**
 * Calculates dynamic Sustainability Score (0-100).
 * Weighted: CO2 Efficiency (50%), Cost Efficiency (30%), Occupancy Efficiency (20%).
 * @param {number} distanceKm Route distance in km
 * @param {number|string} passengerCount Passenger count
 * @returns {number} Sustainability Score between 0 and 100
 */
export function calculateSustainabilityScore(distanceKm, passengerCount = 1) {
  const passengers = Math.max(parseInt(passengerCount, 10) || 1, 1);
  const dist = distanceKm || 8.2;

  const soloCO2 = calculateSoloCO2(dist);
  const carpoolCO2 = parseFloat(calculateCarpoolCO2(dist, passengers));
  const co2Efficiency = clamp((soloCO2 - carpoolCO2) / soloCO2, 0, 1);

  const soloCost = calculateSoloCost(dist);
  const carpoolCost = calculateCarpoolCost(dist, passengers);
  const costEfficiency = clamp((soloCost - carpoolCost) / soloCost, 0, 1);

  const occupancyEfficiency = clamp(passengers / 4, 0, 1);

  const rawScore = (co2Efficiency * 0.50 + costEfficiency * 0.30 + occupancyEfficiency * 0.20) * 100;
  return Math.round(clamp(rawScore, 0, 100));
}

/**
 * Helper function to retrieve the effective duration of a route.
 * Returns traffic-aware duration when live traffic data is available,
 * otherwise falls back seamlessly to static duration.
 * @param {Object} route The route object
 * @returns {number} Effective duration in seconds
 */
export function getEffectiveRouteDuration(route) {
  if (!route) return 0;
  if (route.trafficAvailable && typeof route.trafficDurationSeconds === 'number') {
    return Math.max(0, route.trafficDurationSeconds);
  }
  return route.durationSeconds || route.staticDurationSeconds || 0;
}

/**
 * Selects the optimal Balanced route from alternatives using normalized weights:
 * Time: 40%, Cost: 30%, CO2: 30% (lower score = better choice).
 * @param {Array} routes Array of route objects
 * @param {number|string} passengerCount Passenger count
 * @returns {Object} Optimal balanced route
 */
export function selectBalancedRoute(routes, passengerCount = 1) {
  if (!routes || routes.length === 0) return null;
  if (routes.length === 1) return routes[0];

  const passengers = Math.max(parseInt(passengerCount, 10) || 1, 1);

  const metrics = routes.map(r => {
    const distKm = r.distanceKmNum || (r.distanceMeters / 1000);
    const durationSec = getEffectiveRouteDuration(r);
    const cost = calculateCarpoolCost(distKm, passengers);
    const co2 = calculateRouteCO2(distKm, r.mode, passengers);
    return { route: r, durationSec, cost, co2 };
  });

  const minTime = Math.min(...metrics.map(m => m.durationSec));
  const maxTime = Math.max(...metrics.map(m => m.durationSec));
  const minCost = Math.min(...metrics.map(m => m.cost));
  const maxCost = Math.max(...metrics.map(m => m.cost));
  const minCO2 = Math.min(...metrics.map(m => m.co2));
  const maxCO2 = Math.max(...metrics.map(m => m.co2));

  let minScore = Infinity;
  let bestRoute = routes[0];

  metrics.forEach(m => {
    const normTime = maxTime > minTime ? (m.durationSec - minTime) / (maxTime - minTime) : 0;
    const normCost = maxCost > minCost ? (m.cost - minCost) / (maxCost - minCost) : 0;
    const normCO2 = maxCO2 > minCO2 ? (m.co2 - minCO2) / (maxCO2 - minCO2) : 0;

    const balancedScore = normTime * 0.40 + normCost * 0.30 + normCO2 * 0.30;
    if (balancedScore < minScore - 0.000001) {
      minScore = balancedScore;
      bestRoute = m.route;
    } else if (Math.abs(balancedScore - minScore) <= 0.000001) {
      // Deterministic tie-breaker: 1. duration, 2. CO2, 3. distance
      const bestDist = bestRoute.distanceKmNum || (bestRoute.distanceMeters / 1000);
      const mDist = m.route.distanceKmNum || (m.route.distanceMeters / 1000);
      if (m.durationSec < bestRoute.durationSeconds) {
        bestRoute = m.route;
      } else if (m.durationSec === bestRoute.durationSeconds) {
        if (m.co2 < calculateRouteCO2(bestDist, bestRoute.mode, passengers)) {
          bestRoute = m.route;
        } else if (m.co2 === calculateRouteCO2(bestDist, bestRoute.mode, passengers)) {
          if (mDist < bestDist) {
            bestRoute = m.route;
          }
        }
      }
    }
  });

  return bestRoute;
}

/**
 * Dynamic explanation generator for the Recommendation Card.
 * Uses real calculated metrics from allRoutes, selected route, mode, and passenger count.
 */
export function getRecommendationExplanation({ route, allRoutes = [], preference = 'Balanced', mode = 'DRIVING', passengers = 1, distanceKm = 8.2 }) {
  if (!route) {
    return [
      "Select origin and destination to view recommendations.",
      "Calculate routes to compare time, cost, and CO2 emissions.",
      "GreenMove will optimize your trip automatically."
    ];
  }

  if (!allRoutes || allRoutes.length <= 1) {
    return [
      "Only one route candidate is available for this trip.",
      `${calculatePercentageLowerCO2(distanceKm, passengers)}% lower CO2 emissions per person`,
      `Trip distance: ${route.distanceKm || `${distanceKm.toFixed(1)} km`}`
    ];
  }

  const selectedDuration = route.durationSeconds;
  const numPassengers = Math.max(parseInt(passengers, 10) || 1, 1);
  const upperMode = (mode || 'DRIVING').toUpperCase();

  // Find other alternatives for comparison
  const otherRoutes = allRoutes.filter(r => r.id !== route.id && r.geometry !== route.geometry);
  const maxOtherDuration = otherRoutes.length > 0 ? Math.max(...otherRoutes.map(r => r.durationSeconds)) : selectedDuration;

  const diffSec = maxOtherDuration - selectedDuration;
  const diffMins = Math.round(diffSec / 60);

  const cheaperPercent = calculatePercentageCheaper(distanceKm, numPassengers);
  const lowerCO2Percent = calculatePercentageLowerCO2(distanceKm, numPassengers);

  if (preference === 'Fastest') {
    const timeBullet = diffMins > 0 
      ? `${diffMins} min faster than other available routes`
      : `Fastest travel time among available candidates`;
    
    return [
      timeBullet,
      upperMode === 'DRIVING' && numPassengers > 1
        ? `${cheaperPercent}% cheaper than solo driving`
        : `${lowerCO2Percent}% lower CO2 emissions`,
      `Optimal route duration: ${route.durationMinutes}`
    ];
  } else if (preference === 'Eco') {
    return [
      upperMode === 'WALKING' || upperMode === 'CYCLING'
        ? `100% Zero CO2 emissions (Active Travel)`
        : `${lowerCO2Percent}% lower CO2 emissions per person`,
      diffMins > 0 ? `${diffMins} min faster than longer alternatives` : `Lowest emission candidate`,
      `Trip emissions: ${calculateCarpoolCO2(distanceKm, numPassengers)} kg CO2/person`
    ];
  } else {
    // Balanced
    const timeText = diffMins > 0 ? `Saves ${diffMins} min vs longer alternatives` : `Efficient travel duration (${route.durationMinutes})`;
    return [
      `Optimal balance of travel time, cost, and CO2`,
      numPassengers > 1 ? `${cheaperPercent}% cheaper than solo driving` : `${lowerCO2Percent}% lower CO2 emissions`,
      timeText
    ];
  }
}
