import { API_BASE_URL } from '../config';
import { calculateCarpoolCost, calculateRouteCO2, calculateMotorcycleCost } from '../utils/sustainabilityCalculations';

const apiKey = import.meta.env.VITE_ORS_API_KEY || '';

// Map user-friendly profile tokens to ORS endpoint profiles
const PROFILE_MAP = {
  DRIVING: 'driving-car',
  MOTORCYCLE: 'driving-car',
  WALKING: 'foot-walking',
  CYCLING: 'cycling-regular'
};

// Free, keyless routing engine (OSRM public demo server) used as a fallback so real
// road-network routes remain available with zero paid/keyed dependencies.
// Can be overridden via VITE_OSRM_BASE_URL to point at a self-hosted OSRM instance.
const OSRM_BASE_URL = (import.meta.env.VITE_OSRM_BASE_URL || 'https://router.project-osrm.org').replace(/\/$/, '');

// Map user-friendly profile tokens to OSRM routing profiles
const OSRM_PROFILE_MAP = {
  DRIVING: 'driving',
  MOTORCYCLE: 'driving',
  WALKING: 'foot',
  CYCLING: 'bike'
};

function formatDurationLabel(durationSeconds) {
  const totalMins = Math.round(durationSeconds / 60);
  if (totalMins >= 60) {
    const hours = Math.floor(totalMins / 60);
    const mins = totalMins % 60;
    return mins > 0 ? `${hours} hr ${mins} min` : `${hours} hr`;
  }
  return `${totalMins} min`;
}

/**
 * Fetches a real road-network route from the free, keyless OSRM routing engine.
 * Used as a fallback when neither the backend traffic proxy nor a paid ORS key
 * are available, so users always see an actual road route rather than a straight line.
 * @returns {Promise<Object|null>} Normalized route data, or null if unavailable.
 */
async function getOsrmRoute(origin, destination, profile, signal) {
  const osrmProfile = OSRM_PROFILE_MAP[profile] || 'driving';
  const url = `${OSRM_BASE_URL}/route/v1/${osrmProfile}/${origin.lng},${origin.lat};${destination.lng},${destination.lat}?overview=full&geometries=geojson`;

  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(`OSRM routing request failed with status ${response.status}`);
  }

  const data = await response.json();
  if (data.code !== 'Ok' || !Array.isArray(data.routes) || data.routes.length === 0) {
    throw new Error(data.message || 'OSRM returned no route for the given locations.');
  }

  const routeData = data.routes[0];
  const distanceMeters = routeData.distance;
  const durationSeconds = routeData.duration;
  const distanceKmNum = distanceMeters / 1000;

  return {
    id: 'primary',
    mode: profile,
    provider: 'OSRM',
    geometry: routeData.geometry,
    distanceMeters: distanceMeters,
    durationSeconds: durationSeconds,
    staticDurationSeconds: durationSeconds,
    trafficDurationSeconds: durationSeconds,
    trafficDelaySeconds: 0,
    trafficAvailable: false,
    trafficStatus: 'Traffic data unavailable',
    distanceKmNum: distanceKmNum,
    distanceKm: `${distanceKmNum.toFixed(1)} km`,
    durationMinutes: formatDurationLabel(durationSeconds)
  };
}

/**
 * Calculates a route between two points using OpenRouteService.
 * @param {Object} origin Coordinates of origin { lat, lng }
 * @param {Object} destination Coordinates of destination { lat, lng }
 * @param {string} profile The routing profile (DRIVING, WALKING, CYCLING)
 * @param {AbortSignal} signal Abort signal to cancel stale requests
 * @returns {Promise<Object>} Normalized route data
 */
export async function getRoute(origin, destination, profile = 'DRIVING', avoidTolls = false, signal) {
  if (!origin || typeof origin.lng !== 'number' || typeof origin.lat !== 'number' ||
      !destination || typeof destination.lng !== 'number' || typeof destination.lat !== 'number') {
    throw new Error("Invalid origin or destination coordinates.");
  }

  // Step 1: Attempt Backend Traffic Proxy Call (Google Routes API via Spring Boot Proxy)
  if (['DRIVING', 'MOTORCYCLE', 'CYCLING', 'WALKING'].includes(profile)) {
    try {
      const backendUrl = `${API_BASE_URL}/routing/directions`;
      const backendResponse = await fetch(backendUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          origin: { lat: origin.lat, lng: origin.lng },
          destination: { lat: destination.lat, lng: destination.lng },
          profile: profile,
          avoidTolls: avoidTolls
        }),
        signal: signal
      });

      if (backendResponse.ok) {
        const backendData = await backendResponse.json();
        if (backendData && backendData.success && backendData.primaryRoute) {
          const mainRoute = backendData.primaryRoute;
          mainRoute.allAlternatives = backendData.allAlternatives || [mainRoute];
          console.log(`[routingService] Real Google Route Received via Backend Proxy (${profile}):`, mainRoute);
          return mainRoute;
        }
      }
    } catch (err) {
      console.info(`[routingService] Backend traffic proxy unavailable for ${profile}:`, err.message);
    }
  }

  // Step 2: Fallback to OpenRouteService (ORS) Directions API or Geodesic Calculation
  if (apiKey) {
    try {
      const orsProfile = PROFILE_MAP[profile] || 'driving-car';
      const url = `https://api.openrouteservice.org/v2/directions/${orsProfile}/geojson`;

      const body = {
        coordinates: [
          [origin.lng, origin.lat],
          [destination.lng, destination.lat]
        ]
      };

      if (avoidTolls && profile === 'DRIVING') {
        body.options = { avoid_features: ['tollways'] };
      }

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Authorization": apiKey,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body),
        signal: signal
      });

      if (response.ok) {
        const data = await response.json();
        if (data.features && data.features.length > 0) {
          const feature = data.features[0];
          const summary = feature.properties.summary;
          const distanceMeters = summary.distance;
          const durationSeconds = summary.duration;

          const distanceKmNum = distanceMeters / 1000;
          const distanceKm = `${distanceKmNum.toFixed(1)} km`;

          const durationMinsTotal = Math.round(durationSeconds / 60);
          let durationMinutes = '';
          if (durationMinsTotal >= 60) {
            const hours = Math.floor(durationMinsTotal / 60);
            const mins = durationMinsTotal % 60;
            durationMinutes = mins > 0 ? `${hours} hr ${mins} min` : `${hours} hr`;
          } else {
            durationMinutes = `${durationMinsTotal} min`;
          }

          return {
            id: "primary",
            mode: profile,
            geometry: feature.geometry,
            distanceMeters: distanceMeters,
            durationSeconds: durationSeconds,
            staticDurationSeconds: durationSeconds,
            trafficDurationSeconds: durationSeconds,
            trafficDelaySeconds: 0,
            trafficAvailable: false,
            trafficStatus: 'Traffic data unavailable',
            distanceKmNum: distanceKmNum,
            distanceKm: distanceKm,
            durationMinutes: durationMinutes
          };
        }
      }
    } catch (orsErr) {
      console.warn(`[routingService] ORS fallback unavailable for ${profile}:`, orsErr.message);
    }
  }

  // Step 3: Free/Keyless OSRM Fallback (OpenStreetMap road network, no API key required)
  // Guarantees an actual road-network route is shown even when no paid/keyed routing
  // provider is configured, instead of degrading straight to a straight-line estimate.
  try {
    const osrmRoute = await getOsrmRoute(origin, destination, profile, signal);
    if (osrmRoute) {
      console.log(`[routingService] Real OSRM road route received (${profile}):`, osrmRoute);
      return osrmRoute;
    }
  } catch (osrmErr) {
    if (osrmErr.name === 'AbortError') throw osrmErr;
    console.warn(`[routingService] OSRM fallback unavailable for ${profile}:`, osrmErr.message);
  }

  // Step 4: Geodesic Distance Fallback (Prevents 404 / Unhandled Exception Crashes)
  const R = 6371; // Earth radius in km
  const dLat = (destination.lat - origin.lat) * Math.PI / 180;
  const dLng = (destination.lng - origin.lng) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(origin.lat * Math.PI / 180) * Math.cos(destination.lat * Math.PI / 180) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distanceKmNum = R * c * 1.25; // 1.25 winding factor for road network
  const distanceMeters = distanceKmNum * 1000;
  const distanceKm = `${distanceKmNum.toFixed(1)} km`;

  const speedKmh = profile === 'WALKING' ? 5 : profile === 'CYCLING' ? 15 : profile === 'MOTORCYCLE' ? 40 : 45;
  const durationSeconds = (distanceKmNum / speedKmh) * 3600;
  const durationMinsTotal = Math.round(durationSeconds / 60);
  let durationMinutes = '';
  if (durationMinsTotal >= 60) {
    const hours = Math.floor(durationMinsTotal / 60);
    const mins = durationMinsTotal % 60;
    durationMinutes = mins > 0 ? `${hours} hr ${mins} min` : `${hours} hr`;
  } else {
    durationMinutes = `${durationMinsTotal} min`;
  }

  return {
    id: "primary",
    mode: profile,
    geometry: {
      type: "LineString",
      coordinates: [
        [origin.lng, origin.lat],
        [destination.lng, destination.lat]
      ]
    },
    distanceMeters: distanceMeters,
    durationSeconds: durationSeconds,
    staticDurationSeconds: durationSeconds,
    trafficDurationSeconds: durationSeconds,
    trafficDelaySeconds: 0,
    trafficAvailable: false,
    trafficStatus: 'Traffic data unavailable',
    distanceKmNum: distanceKmNum,
    distanceKm: distanceKm,
    durationMinutes: durationMinutes
  };
}

/**
 * Backward-compatible driving route fetch wrapper.
 */
export async function getDrivingRoute(origin, destination, signal) {
  return getRoute(origin, destination, 'DRIVING', signal);
}

/**
 * Generates and normalizes multimodal route candidates across DRIVING, CYCLING, WALKING, and TRANSIT.
 * Candidate requests across modes execute in parallel.
 * @param {Object} origin Coordinates of origin { lat, lng }
 * @param {Object} destination Coordinates of destination { lat, lng }
 * @param {boolean} avoidTolls Avoid tolls constraint flag for DRIVING
 * @param {number|string} passengers Passenger count
 * @param {AbortSignal} signal Abort signal to cancel stale requests
 * @returns {Promise<Array<Object>>} Array of normalized multimodal candidate objects
 */
export async function getMultimodalCandidates(origin, destination, avoidTolls = false, passengers = 1, signal) {
  const modes = ['DRIVING', 'MOTORCYCLE', 'CYCLING', 'WALKING'];

  const results = await Promise.allSettled(
    modes.map(mode => getRoute(origin, destination, mode, mode === 'DRIVING' || mode === 'MOTORCYCLE' ? avoidTolls : false, signal))
  );

  const candidates = [];

  results.forEach((res, idx) => {
    const mode = modes[idx];
    if (res.status === 'fulfilled' && res.value) {
      const r = res.value;
      const distKm = r.distanceKmNum || (r.distanceMeters / 1000);
      const co2 = calculateRouteCO2(distKm, mode, passengers);
      let cost = 0;
      if (mode === 'DRIVING') {
        cost = calculateCarpoolCost(distKm, passengers);
      } else if (mode === 'MOTORCYCLE') {
        cost = calculateMotorcycleCost(distKm);
      }

      candidates.push({
        ...r,
        mode: mode,
        provider: r.provider || (((mode === 'DRIVING' || mode === 'MOTORCYCLE') && r.trafficAvailable) ? 'GOOGLE_ROUTES' : 'OPENROUTESERVICE'),
        cost: cost,
        co2Kg: co2,
        available: true,
        reason: null
      });
    } else {
      console.warn(`[routingService] ${mode} candidate routing unavailable:`, res.reason?.message);
      candidates.push({
        mode: mode,
        provider: 'OPENROUTESERVICE',
        available: false,
        reason: res.reason?.message || `No ${mode.toLowerCase()} route available`
      });
    }
  });

  // Transit Candidate (Truthful, non-fabricated)
  candidates.push({
    mode: 'TRANSIT',
    provider: 'GTFS_OTP',
    available: false,
    reason: 'REAL_TRANSIT_DATA_NOT_CONFIGURED'
  });

  return candidates;
}
