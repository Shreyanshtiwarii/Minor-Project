import { API_BASE_URL } from '../config';

const BACKEND_API_BASE = `${API_BASE_URL}/ev-charging`;

/**
 * Fetches route-relevant EV charging stations along a calculated route geometry.
 *
 * @param {Array<{lat: number, lng: number}>} waypoints Route coordinates
 * @param {number} corridorKm Maximum distance from route corridor (default 5.0 km)
 * @returns {Promise<{success: boolean, stations: Array, message?: string}>}
 */
export async function getEVStationsAlongRoute(waypoints, corridorKm = 5.0) {
  if (!waypoints || waypoints.length === 0) {
    return { success: true, stations: [] };
  }

  try {
    const response = await fetch(`${BACKEND_API_BASE}/stations-along-route`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        waypoints,
        corridorKm
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} from EV Charging API`);
    }

    const stations = await response.json();
    return {
      success: true,
      stations: Array.isArray(stations) ? stations : []
    };
  } catch (err) {
    console.warn('EV Charging API temporarily unavailable:', err.message);
    return {
      success: false,
      stations: [],
      message: 'Charging station data is temporarily unavailable.'
    };
  }
}

/**
 * Fetches EV charging stations near a single location (e.g. the user's current location)
 * using the existing backend /stations-near-location endpoint. Used as a fallback data
 * source when no destination/route has been planned yet.
 *
 * @param {number} lat Latitude of the location
 * @param {number} lng Longitude of the location
 * @param {number} radiusKm Search radius in kilometers (default 10.0 km)
 * @returns {Promise<{success: boolean, stations: Array, message?: string}>}
 */
export async function getEVStationsNearLocation(lat, lng, radiusKm = 10.0) {
  if (typeof lat !== 'number' || typeof lng !== 'number') {
    return { success: true, stations: [] };
  }

  try {
    const url = `${BACKEND_API_BASE}/stations-near-location?lat=${lat}&lng=${lng}&radiusKm=${radiusKm}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} from EV Charging API`);
    }

    const stations = await response.json();
    return {
      success: true,
      stations: Array.isArray(stations) ? stations : []
    };
  } catch (err) {
    console.warn('EV Charging API (near-location) temporarily unavailable:', err.message);
    return {
      success: false,
      stations: [],
      message: 'Charging station data is temporarily unavailable.'
    };
  }
}
