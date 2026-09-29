import { API_BASE_URL } from '../config';
import { getToken } from './authService';

/**
 * REST client for the "Vehicle Pool" feature backed by the Spring Boot
 * /api/v1/pools endpoints. Every mutating call requires the authenticated
 * user's JWT (see authService.getToken).
 */

function authHeaders() {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function parseResponse(res) {
  let body = null;
  try {
    body = await res.json();
  } catch {
    // no JSON body (e.g. plain 403 from Spring Security)
  }
  if (!res.ok) {
    const message = body?.message || 'Something went wrong. Please try again.';
    const error = new Error(message);
    error.status = res.status;
    throw error;
  }
  return body;
}

/**
 * Fetch every vehicle pool, ordered by departure time. Includes per-pool
 * `full`, `past`, `own`, and `joined` flags computed for the current user
 * (when authenticated).
 */
export async function getPools() {
  const res = await fetch(`${API_BASE_URL}/pools`, {
    headers: { ...authHeaders() }
  });
  return parseResponse(res);
}

/**
 * Spatial candidate search (Phase 3). Sends origin and destination names
 * along with optional coordinates. When coordinates are present the backend
 * performs a PostGIS ST_DWithin candidate search; when absent it falls back
 * to the legacy text-match search.
 *
 * @param {string} origin                     - Origin place name (required for legacy fallback)
 * @param {string} destination                - Destination place name (required for legacy fallback)
 * @param {number|null} [originLatitude]      - Passenger pickup latitude
 * @param {number|null} [originLongitude]     - Passenger pickup longitude
 * @param {number|null} [destinationLatitude] - Passenger dropoff latitude
 * @param {number|null} [destinationLongitude]- Passenger dropoff longitude
 */
export async function searchPools(
  origin,
  destination,
  originLatitude = null,
  originLongitude = null,
  destinationLatitude = null,
  destinationLongitude = null
) {
  const params = new URLSearchParams();
  if (origin) params.set('origin', origin);
  if (destination) params.set('destination', destination);
  if (originLatitude != null) params.set('originLatitude', originLatitude);
  if (originLongitude != null) params.set('originLongitude', originLongitude);
  if (destinationLatitude != null) params.set('destinationLatitude', destinationLatitude);
  if (destinationLongitude != null) params.set('destinationLongitude', destinationLongitude);

  const res = await fetch(`${API_BASE_URL}/pools/search?${params.toString()}`, {
    headers: { ...authHeaders() }
  });
  return parseResponse(res);
}

/**
 * Create a new vehicle pool. Requires authentication.
 * @param {{startLocation: string, startLatitude: number, startLongitude: number, destination: string, destinationLatitude: number, destinationLongitude: number, departureTime: string, totalSeats: number, costPerPassenger: number}} data
 */
export async function createPool(data) {
  const res = await fetch(`${API_BASE_URL}/pools`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(data)
  });
  return parseResponse(res);
}

/**
 * Reserve a seat on a pool. Requires authentication.
 *
 * Phase 2 - Passenger Join flow: `details` carries what was collected in the join
 * confirmation modal -- pickup location (GPS or map selection) and phone number --
 * plus the destination the passenger already searched/matched (reused, not re-asked).
 * `clientCalculatedFare` is sent for display/debugging parity only: the backend always
 * recalculates the authoritative fare itself and never trusts this value.
 *
 * @param {string} poolId
 * @param {{
 *   pickupLocation?: string,
 *   pickupLatitude?: number,
 *   pickupLongitude?: number,
 *   dropoffLocation?: string,
 *   dropoffLatitude?: number,
 *   dropoffLongitude?: number,
 *   phoneNumber?: string,
 *   clientCalculatedFare?: number
 * }} [details]
 */
export async function joinPool(poolId, details) {
  const res = await fetch(`${API_BASE_URL}/pools/${encodeURIComponent(poolId)}/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: details ? JSON.stringify(details) : undefined
  });
  return parseResponse(res);
}

/**
 * Release a previously reserved seat on a pool. Requires authentication.
 */
export async function leavePool(poolId) {
  const res = await fetch(`${API_BASE_URL}/pools/${encodeURIComponent(poolId)}/leave`, {
    method: 'POST',
    headers: { ...authHeaders() }
  });
  return parseResponse(res);
}

/**
 * Fetch pools created by the current user, including each pool's passenger list.
 * Requires authentication.
 */
export async function getMyPools() {
  const res = await fetch(`${API_BASE_URL}/pools/mine`, {
    headers: { ...authHeaders() }
  });
  return parseResponse(res);
}

/**
 * Fetch the current user's Pool / Trip History: every pool they created or joined
 * that has since been ended (completed or terminated), including each pool's
 * passenger list. Requires authentication.
 */
export async function getPoolHistory() {
  const res = await fetch(`${API_BASE_URL}/pools/history`, {
    headers: { ...authHeaders() }
  });
  return parseResponse(res);
}

/**
 * Phase 3/4 - Driver-only Active Pool Details: full operational view of one of the
 * caller's own pools (stored route geometry/distance/duration, every joined
 * passenger's pickup/dropoff coordinates & names, fare, phone number, and an
 * APPROXIMATE pickup time). Powers the "My Pools -> Active Pool -> Details" map.
 * Requires authentication; fails with 403 if the caller isn't the pool's creator.
 */
export async function getActivePoolDetails(poolId) {
  const res = await fetch(`${API_BASE_URL}/pools/${encodeURIComponent(poolId)}/active-details`, {
    headers: { ...authHeaders() }
  });
  return parseResponse(res);
}

/**
 * Creator-only: mark a pool as completed (e.g. the trip/destination was reached).
 * Requires authentication; fails if the caller isn't the pool's creator.
 */
export async function completePool(poolId) {
  const res = await fetch(`${API_BASE_URL}/pools/${encodeURIComponent(poolId)}/complete`, {
    method: 'POST',
    headers: { ...authHeaders() }
  });
  return parseResponse(res);
}

/**
 * Creator-only: terminate a pool early (e.g. it's full, or the trip is called off).
 * Requires authentication; fails if the caller isn't the pool's creator.
 */
export async function terminatePool(poolId) {
  const res = await fetch(`${API_BASE_URL}/pools/${encodeURIComponent(poolId)}/terminate`, {
    method: 'POST',
    headers: { ...authHeaders() }
  });
  return parseResponse(res);
}

/**
 * Creator-only: remove a passenger from a pool.
 * Requires authentication; fails with 403 if the caller isn't the pool's creator.
 */
export async function removePassenger(poolId, passengerUserId) {
  const res = await fetch(`${API_BASE_URL}/pools/${encodeURIComponent(poolId)}/passengers/${encodeURIComponent(passengerUserId)}`, {
    method: 'DELETE',
    headers: { ...authHeaders() }
  });
  return parseResponse(res);
}
