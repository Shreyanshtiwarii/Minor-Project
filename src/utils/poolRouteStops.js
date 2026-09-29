/**
 * Phase 4 - Active Pool Details map.
 *
 * Turns an /api/v1/pools/{id}/active-details response into an ordered list of map
 * "stops" (one per passenger pickup + one per passenger dropoff), sorted by where
 * each point actually falls along the driver's stored route_geom -- NOT by database
 * insertion order. Pure/no side effects so it's trivially unit-testable and reusable
 * from any component that needs to render this map.
 *
 * No network/routing calls are made here: ordering is derived entirely from the
 * route geometry and coordinates already present on the response.
 */

/**
 * Projects a point onto a polyline (array of [lng, lat] pairs) and returns the
 * fraction (0..1) of the polyline's total length at the closest point. Mirrors the
 * approach the backend uses (JTS LengthIndexedLine) closely enough for stable,
 * deterministic ordering: for each segment, find the closest point on that segment,
 * keep whichever segment produces the smallest perpendicular distance, and report
 * that segment's cumulative-length fraction.
 *
 * Returns null when the polyline doesn't have at least two points (degenerate/
 * missing geometry) -- callers should fall back to a stable non-geometric order.
 */
export function projectPointToRouteFraction(lng, lat, coordinates) {
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null;
  if (typeof lng !== 'number' || typeof lat !== 'number' || Number.isNaN(lng) || Number.isNaN(lat)) return null;

  const cumulative = [0];
  for (let i = 1; i < coordinates.length; i++) {
    const [x1, y1] = coordinates[i - 1];
    const [x2, y2] = coordinates[i];
    cumulative.push(cumulative[i - 1] + Math.hypot(x2 - x1, y2 - y1));
  }
  const totalLength = cumulative[cumulative.length - 1];
  if (!(totalLength > 0)) return 0;

  let bestFraction = 0;
  let bestDistSq = Infinity;

  for (let i = 1; i < coordinates.length; i++) {
    const [x1, y1] = coordinates[i - 1];
    const [x2, y2] = coordinates[i];
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    let t = lenSq > 0 ? ((lng - x1) * dx + (lat - y1) * dy) / lenSq : 0;
    t = Math.max(0, Math.min(1, t));
    const projX = x1 + t * dx;
    const projY = y1 + t * dy;
    const distSq = (lng - projX) ** 2 + (lat - projY) ** 2;
    if (distSq < bestDistSq) {
      bestDistSq = distSq;
      const distAlong = cumulative[i - 1] + t * (cumulative[i] - cumulative[i - 1]);
      bestFraction = totalLength > 0 ? distAlong / totalLength : 0;
    }
  }

  return bestFraction;
}

function hasCoords(lat, lng) {
  return typeof lat === 'number' && typeof lng === 'number' && !Number.isNaN(lat) && !Number.isNaN(lng);
}

/**
 * Builds the ordered list of pickup/dropoff stops for the Active Pool Details map.
 *
 * @param {object} details - ActivePoolDetailsResponse-shaped object:
 *   { routeGeometry: {type:'LineString', coordinates:[[lng,lat],...]} | null,
 *     passengers: Array<{ userName, pickupLocation, pickupLatitude, pickupLongitude,
 *       dropoffLocation, dropoffLatitude, dropoffLongitude, phoneNumber, fare,
 *       approxPickupTime, pickupTimeApproximate }> }
 * @returns {Array<{id, kind: 'pickup'|'dropoff', order, lat, lng, routeFraction,
 *   passengerName, locationLabel, fare, approxPickupTime, pickupTimeApproximate,
 *   phoneNumber}>}
 */
export function buildPoolRouteStops(details) {
  if (!details || !Array.isArray(details.passengers) || details.passengers.length === 0) {
    return [];
  }

  const coordinates = details.routeGeometry && Array.isArray(details.routeGeometry.coordinates)
    ? details.routeGeometry.coordinates
    : null;
  const hasGeometry = Array.isArray(coordinates) && coordinates.length >= 2;

  const rawStops = [];
  details.passengers.forEach((passenger, passengerIndex) => {
    if (hasCoords(passenger.pickupLatitude, passenger.pickupLongitude)) {
      rawStops.push({
        id: `pickup-${passengerIndex}`,
        kind: 'pickup',
        lat: passenger.pickupLatitude,
        lng: passenger.pickupLongitude,
        passengerName: passenger.userName,
        userId: passenger.userId,
        locationLabel: passenger.pickupLocation,
        fare: passenger.fare,
        approxPickupTime: passenger.approxPickupTime,
        pickupTimeApproximate: !!passenger.pickupTimeApproximate,
        phoneNumber: passenger.phoneNumber,
        // Stable fallback order when there's no usable route geometry: pickup comes
        // right before its own dropoff, passengers kept in their original (API) order.
        fallbackIndex: passengerIndex * 2
      });
    }
    if (hasCoords(passenger.dropoffLatitude, passenger.dropoffLongitude)) {
      rawStops.push({
        id: `dropoff-${passengerIndex}`,
        kind: 'dropoff',
        lat: passenger.dropoffLatitude,
        lng: passenger.dropoffLongitude,
        passengerName: passenger.userName,
        userId: passenger.userId,
        locationLabel: passenger.dropoffLocation,
        fare: passenger.fare,
        approxPickupTime: passenger.approxPickupTime,
        pickupTimeApproximate: !!passenger.pickupTimeApproximate,
        phoneNumber: passenger.phoneNumber,
        fallbackIndex: passengerIndex * 2 + 1
      });
    }
  });

  const withPosition = rawStops.map((stop) => {
    const routeFraction = hasGeometry ? projectPointToRouteFraction(stop.lng, stop.lat, coordinates) : null;
    return { ...stop, routeFraction };
  });

  withPosition.sort((a, b) => {
    const posA = a.routeFraction !== null && a.routeFraction !== undefined ? a.routeFraction : a.fallbackIndex;
    const posB = b.routeFraction !== null && b.routeFraction !== undefined ? b.routeFraction : b.fallbackIndex;
    if (posA === posB) return a.fallbackIndex - b.fallbackIndex;
    return posA - posB;
  });

  return withPosition.map((stop, idx) => ({
    ...stop,
    order: idx + 1
  }));
}
