import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import GreenMoveMap from '../components/map/GreenMoveMap';
import { getJourneys } from '../services/historyService';
import { getRoute } from '../services/routingService';
import { searchLocations, reverseGeocode } from '../services/geocodingService';
import { getEVStationsAlongRoute, getEVStationsNearLocation } from '../services/evChargingService';

// Safety reserve kept in the battery below what the raw distance math requires, so the
// vehicle never arrives on a razor-thin margin. Matches the existing 15km threshold this
// page already used for its simple feasibility check.
const SAFETY_MARGIN_KM = 15;

// Open Charge Map does not provide live tariff data, so charging cost is shown as a
// clearly-labelled estimate using a representative average public DC-fast rate (INR/kWh).
const AVERAGE_RATE_INR_PER_KWH = 16;

/**
 * Renders the short, network-suffix-free form of a station/location name for display (many
 * Open Charge Map entries include the network name after an em dash, e.g.
 * "Station Name — NetworkName"). Falls back gracefully when a name is missing/blank, since
 * real third-party station data is not guaranteed to include one — this is what was crashing
 * the page with "Cannot read properties of undefined (reading 'split')".
 */
function shortLabel(name) {
  if (!name || typeof name !== 'string') return 'Unnamed location';
  const trimmed = name.split('—')[0].trim();
  return trimmed || 'Unnamed location';
}

/**
 * Guarantees every station object has a non-empty, safely-splittable `name` before it enters
 * component state, so nothing downstream (route titles, stop badges, safety-panel labels) has
 * to guard against missing metadata from the live Open Charge Map API individually.
 */
function withSafeStationNames(stations) {
  return (stations || []).map((st) => ({
    ...st,
    name: (st.name && String(st.name).trim()) || 'Unnamed Charging Station'
  }));
}

/**
 * Calculates geodesic distance between two lat/lng coordinates in kilometers using Haversine formula.
 */
function haversineKm(lat1, lon1, lat2, lon2) {
  if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return 4.5;
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Number((R * c).toFixed(1));
}

/**
 * Builds cumulative distance (km) from the route origin to every coordinate in a GeoJSON
 * LineString coordinate array ([lng, lat] pairs). Used to project charging stations onto a
 * position "along the route" rather than only a straight-line distance from the origin.
 */
function buildCumulativeDistanceKm(coordinates) {
  const cum = [0];
  for (let i = 1; i < coordinates.length; i++) {
    const [lng1, lat1] = coordinates[i - 1];
    const [lng2, lat2] = coordinates[i];
    cum.push(cum[i - 1] + haversineKm(lat1, lng1, lat2, lng2));
  }
  return cum;
}

/**
 * Annotates each charging station with its approximate position along the route (distance
 * in km from the route origin to the nearest route point), so stations can be ordered and
 * evaluated sequentially for multi-stop range planning.
 */
function annotateStationsWithRoutePosition(stations, coordinates, cumDistKm) {
  return stations.map((st) => {
    const stLat = st.latitude ?? st.lat;
    const stLng = st.longitude ?? st.lng;
    let bestIdx = 0;
    let bestDistKm = Infinity;

    for (let i = 0; i < coordinates.length; i++) {
      const [lng, lat] = coordinates[i];
      const d = haversineKm(stLat, stLng, lat, lng);
      if (d < bestDistKm) {
        bestDistKm = d;
        bestIdx = i;
      }
    }

    return {
      ...st,
      distanceAlongRouteKm: Number(cumDistKm[bestIdx].toFixed(1)),
      perpendicularDistanceKm: st.distanceFromRouteKm != null ? st.distanceFromRouteKm : Number(bestDistKm.toFixed(1))
    };
  });
}

/**
 * Formats a human-readable connector/power description from an EVStationDTO's connectors.
 */
function describeStationPower(station) {
  if (station.connectors && station.connectors.length > 0) {
    return station.connectors
      .map((c) => `${c.powerKw || 22}kW${c.connectorType ? ` ${c.connectorType}` : ''}`)
      .join(', ');
  }
  return 'Fast Charger';
}

/**
 * Formats a human-readable connector-count/status description from an EVStationDTO.
 */
function describeStationAvailability(station) {
  const totalConnectors = (station.connectors || []).reduce((sum, c) => sum + (c.quantity || 1), 0);
  const status = station.status || 'Status unverified';
  return totalConnectors > 0 ? `${totalConnectors} connector${totalConnectors > 1 ? 's' : ''} • ${status}` : status;
}

/**
 * Core EV multi-stop range-planning algorithm.
 *
 * Given the total trip distance, an ascending-by-route-position list of charging stations,
 * and the vehicle's available range, determines whether the destination is reachable and,
 * if not, builds the minimal practical sequence of charging stops required to get there —
 * always choosing the farthest reachable station at each point to maximize progress and
 * minimize the number of stops (classic greedy "minimum refueling stops" strategy, assuming
 * a full recharge at each stop).
 *
 * Also returns an explicit Phase 3 safety explanation (🔴 Not Safe / 🟢 Safe) and, when the
 * trip is not feasible, the exact unsafe segment (start position + reason) so it can be
 * highlighted on the map.
 */
function planEVChargingRoute(totalDistanceKm, stationsSortedByRoutePos, availableRangeKm, fullRangeKm) {
  // The first leg is limited by whatever charge the vehicle actually has right now
  // (availableRangeKm, which may be a partial battery %). Every leg AFTER a charging stop is
  // limited by the vehicle's full-charge range instead (fullRangeKm) — a charging stop is a
  // full recharge, not a top-up back to the original starting percentage. Falls back to
  // availableRangeKm if the full-charge range wasn't supplied, so existing call sites that
  // pass a single range still behave exactly as before.
  const usableInitialRangeKm = Math.max(availableRangeKm - SAFETY_MARGIN_KM, 0);
  const usableFullRangeKm = Math.max((fullRangeKm ?? availableRangeKm) - SAFETY_MARGIN_KM, 0);

  // Finds the nearest station beyond a given route position, reachable or not, purely to
  // explain *why* a segment is unsafe (e.g. "the next available charger is 200 km away").
  const findNextStationLabel = (fromKm, candidates) => {
    const ahead = candidates.filter((s) => s.distanceAlongRouteKm > fromKm);
    if (ahead.length === 0) return null;
    ahead.sort((a, b) => a.distanceAlongRouteKm - b.distanceAlongRouteKm);
    return ahead[0];
  };

  // Case 1: Destination is directly reachable on the current charge — no stop required.
  if (totalDistanceKm <= usableInitialRangeKm) {
    return {
      feasible: true,
      needsCharging: false,
      stops: [],
      usableRangeKm: Math.round(usableInitialRangeKm),
      summary: `Destination is within your available range (${Math.round(usableInitialRangeKm)} km usable after a ${SAFETY_MARGIN_KM} km safety reserve). No charging stop required.`,
      safetyStatus: 'safe',
      safetyExplanation: `🟢 Safe: Your destination (${Math.round(totalDistanceKm)} km away) is within your estimated available range (~${Math.round(usableInitialRangeKm)} km). No charging stop is required.`
    };
  }

  // Case 2: One or more charging stops are required.
  let currentPosKm = 0;
  let candidates = stationsSortedByRoutePos;
  const stops = [];
  let guard = 0;

  while (true) {
    // Before any stop, the leg is limited by the current (possibly partial) charge; after a
    // stop, a full recharge is assumed, so the leg is limited by the full-charge range instead.
    const usableRangeKm = stops.length === 0 ? usableInitialRangeKm : usableFullRangeKm;

    if (totalDistanceKm - currentPosKm <= usableRangeKm) break;

    guard += 1;
    if (guard > 12) {
      return {
        feasible: false,
        needsCharging: true,
        stops,
        usableRangeKm: Math.round(usableRangeKm),
        summary: 'Route requires too many charging stops to plan reliably from current station data. Please review manually.',
        safetyStatus: 'unsafe',
        safetyExplanation: '🔴 Not Safe: This route requires too many charging stops to plan reliably from current station data. Please review manually.',
        unsafeSegmentStartKm: currentPosKm
      };
    }

    const reachable = candidates.filter(
      (s) => s.distanceAlongRouteKm > currentPosKm && (s.distanceAlongRouteKm - currentPosKm) <= usableRangeKm
    );

    if (reachable.length === 0) {
      const nextStation = findNextStationLabel(currentPosKm, candidates);
      const nextTargetLabel = nextStation ? nextStation.name : null;
      const nextTargetDistanceKm = nextStation
        ? Number((nextStation.distanceAlongRouteKm - currentPosKm).toFixed(1))
        : Number((totalDistanceKm - currentPosKm).toFixed(1));
      const remainingRangeKm = Math.round(usableRangeKm);

      return {
        feasible: false,
        needsCharging: true,
        stops,
        usableRangeKm: remainingRangeKm,
        summary: stops.length > 0
          ? `No further charging station is within reach after Stop ${stops.length}. Destination cannot currently be reached with available station data.`
          : 'No charging station is within reach of your available range. Destination cannot currently be reached with available station data.',
        safetyStatus: 'unsafe',
        safetyExplanation: `🔴 Not Safe: Your estimated remaining range at this point is ${remainingRangeKm} km, but the ${nextStation ? 'next available EV charging station' : 'destination'} (${nextTargetLabel || 'destination'}) is ${nextTargetDistanceKm} km away. You may run out of battery before reaching ${nextStation ? 'a charger' : 'your destination'}.`,
        unsafeSegmentStartKm: currentPosKm,
        unsafeNextTargetLabel: nextTargetLabel,
        unsafeNextTargetDistanceKm: nextTargetDistanceKm,
        unsafeRemainingRangeKm: remainingRangeKm
      };
    }

    // Choose the farthest reachable station to maximize onward progress (minimizes stop count).
    reachable.sort((a, b) => b.distanceAlongRouteKm - a.distanceAlongRouteKm);
    const chosen = reachable[0];
    const legDistanceKm = Number((chosen.distanceAlongRouteKm - currentPosKm).toFixed(1));
    const remainingToDestinationKm = Number((totalDistanceKm - chosen.distanceAlongRouteKm).toFixed(1));
    // Range remaining ON ARRIVAL (before charging here) is limited by THIS leg's usable range.
    const rangeOnArrivalKm = Math.max(Number((usableRangeKm - legDistanceKm).toFixed(1)), 0);
    // Range available AFTER charging here is always a full recharge, regardless of how much
    // charge the vehicle had for this leg.
    const reachableRangeFromStopKm = Math.round(usableFullRangeKm);

    stops.push({
      ...chosen,
      stopNumber: stops.length + 1,
      legDistanceFromPrevKm: legDistanceKm,
      rangeOnArrivalKm,
      reachableRangeFromStopKm,
      remainingToDestinationKm,
      reason: remainingToDestinationKm <= usableFullRangeKm
        ? `Charging here restores enough range (~${reachableRangeFromStopKm} km) to reach the destination directly.`
        : `Farthest available station reachable on the current charge; charging here restores ~${reachableRangeFromStopKm} km of range to continue toward the destination.`
    });

    currentPosKm = chosen.distanceAlongRouteKm;
    candidates = candidates.filter((s) => s.distanceAlongRouteKm > currentPosKm);
  }

  // Post-process: attach "distance to next charging station" (or Destination, for the last
  // stop) to every recommended stop, matching the Phase 3 per-stop reporting requirement.
  stops.forEach((stop, idx) => {
    const next = stops[idx + 1];
    stop.nextTargetLabel = next ? next.name : 'Destination';
    stop.nextTargetDistanceKm = next
      ? Number((next.distanceAlongRouteKm - stop.distanceAlongRouteKm).toFixed(1))
      : stop.remainingToDestinationKm;
  });

  return {
    feasible: true,
    needsCharging: true,
    stops,
    usableRangeKm: Math.round(usableFullRangeKm),
    summary: `Destination is reachable after ${stops.length} charging stop${stops.length > 1 ? 's' : ''}.`,
    safetyStatus: 'safe',
    safetyExplanation: `🟢 Safe: The recommended charging sequence keeps every leg within your estimated available range (~${Math.round(usableFullRangeKm)} km after a recharge), reaching your destination after ${stops.length} charging stop${stops.length > 1 ? 's' : ''}.`
  };
}

export default function EVIntelligence() {
  const navigate = useNavigate();
  const mapSectionRef = useRef(null);
  const recenterMapRef = useRef(null);

  const [journeys, setJourneys] = useState([]);
  // Fix 2 & Fix 3 (EV Intelligence Phase 1): no hardcoded battery %/range defaults. Both start
  // completely empty; the user must type their own values before anything is calculated.
  const [batteryPct, setBatteryPct] = useState(''); // Empty until the user enters their battery % (10–100)
  const [vehicleRangeKm, setVehicleRangeKm] = useState(''); // Empty until the user enters their full-charge range (km)

  // Tracks whether the user has actually provided their vehicle range / battery level this
  // session. Until both are explicitly set with real numeric values (alongside a real
  // Destination), no calculated range/route/feasibility data is shown.
  const [vehicleRangeTouched, setVehicleRangeTouched] = useState(false);
  const [batteryTouched, setBatteryTouched] = useState(false);

  // Same-page EV Route Planner States
  const [selectedStops, setSelectedStops] = useState([]); // Array of selected station objects
  const [evRoute, setEvRoute] = useState(null);
  const [loadingEvRoute, setLoadingEvRoute] = useState(false);
  const [evRouteError, setEvRouteError] = useState(null);

  // User Current Location State. No lat/lng are pre-filled — per Fix 1 (EV Intelligence Phase
  // 1), the app must never assume a fake/default location. Real coordinates are only ever set
  // once the user explicitly grants browser geolocation (via the location icon) or picks a
  // location from the search suggestions.
  const [currentLocation, setCurrentLocation] = useState({
    name: 'Current Location',
    lat: null,
    lng: null
  });

  // Destination State — user-provided trip destination (replaces reliance on the battery slider)
  const [destination, setDestination] = useState(null);

  // Origin / Destination text inputs + autocomplete UI state (mirrors PlanRoute's location input pattern)
  const [originInput, setOriginInput] = useState('Current Location');
  const [destinationInput, setDestinationInput] = useState('');
  const [originSuggestions, setOriginSuggestions] = useState([]);
  const [destinationSuggestions, setDestinationSuggestions] = useState([]);
  const [originSearching, setOriginSearching] = useState(false);
  const [destinationSearching, setDestinationSearching] = useState(false);
  const [originError, setOriginError] = useState(null);
  const [destinationError, setDestinationError] = useState(null);

  // Planned Origin -> Destination Route (drives the range feasibility calculation from user inputs)
  const [plannedRoute, setPlannedRoute] = useState(null);
  const [loadingPlannedRoute, setLoadingPlannedRoute] = useState(false);
  const [plannedRouteError, setPlannedRouteError] = useState(null);

  // Real Open Charge Map station data along the planned Origin -> Destination route
  // (used to power the EV Intelligence charging-plan calculation).
  const [routeStations, setRouteStations] = useState([]);
  const [loadingStations, setLoadingStations] = useState(false);
  const [stationsError, setStationsError] = useState(null);

  // Fallback real station data near the current location, shown when no destination has
  // been set yet so the "Optimal Charging Stops" panel still reflects real network data.
  const [nearbyStations, setNearbyStations] = useState([]);
  const [loadingNearby, setLoadingNearby] = useState(false);

  // Load journey history on mount. Per Fix 1 (EV Intelligence Phase 1), browser geolocation is
  // NEVER requested automatically here — it is only requested when the user explicitly clicks
  // the location icon (see handleUseCurrentLocation below).
  useEffect(() => {
    const records = getJourneys();
    setJourneys(records || []);
  }, []);

  // Debounced search for Origin suggestions (mirrors PlanRoute's location autocomplete pattern)
  useEffect(() => {
    if (originInput.trim().length < 2) {
      setOriginSuggestions([]);
      setOriginError(null);
      return;
    }
    if (currentLocation && originInput === currentLocation.name) {
      setOriginSuggestions([]);
      setOriginError(null);
      return;
    }

    setOriginSearching(true);
    setOriginError(null);

    const delayDebounceFn = setTimeout(async () => {
      try {
        const results = await searchLocations(originInput);
        setOriginSuggestions(results);
        if (results.length === 0) {
          setOriginError('No locations found');
        }
      } catch (err) {
        setOriginSuggestions([]);
        setOriginError('Unable to search locations');
      } finally {
        setOriginSearching(false);
      }
    }, 450);

    return () => clearTimeout(delayDebounceFn);
  }, [originInput, currentLocation]);

  // Debounced search for Destination suggestions
  useEffect(() => {
    if (destinationInput.trim().length < 2) {
      setDestinationSuggestions([]);
      setDestinationError(null);
      return;
    }
    if (destination && destinationInput === destination.name) {
      setDestinationSuggestions([]);
      setDestinationError(null);
      return;
    }

    setDestinationSearching(true);
    setDestinationError(null);

    const delayDebounceFn = setTimeout(async () => {
      try {
        const results = await searchLocations(destinationInput);
        setDestinationSuggestions(results);
        if (results.length === 0) {
          setDestinationError('No locations found');
        }
      } catch (err) {
        setDestinationSuggestions([]);
        setDestinationError('Unable to search locations');
      } finally {
        setDestinationSearching(false);
      }
    }, 450);

    return () => clearTimeout(delayDebounceFn);
  }, [destinationInput, destination]);

  const handleSelectOrigin = (loc) => {
    setCurrentLocation(loc);
    setOriginInput(loc.name);
    setOriginSuggestions([]);
    setOriginError(null);
  };

  const handleSelectDestination = (loc) => {
    setDestination(loc);
    setDestinationInput(loc.name);
    setDestinationSuggestions([]);
    setDestinationError(null);
  };

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      setOriginError('Geolocation is not supported by your browser. Please type your location manually.');
      return;
    }

    setOriginSearching(true);
    setOriginError(null);
    // This call is what triggers the browser's native geolocation permission prompt — it is
    // only ever invoked here, from an explicit user click, never automatically on page load.
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        try {
          const placeName = await reverseGeocode(longitude, latitude);
          const loc = { name: placeName || 'Current Location', lat: latitude, lng: longitude };
          setCurrentLocation(loc);
          setOriginInput(loc.name);
        } catch (err) {
          console.error('[EVIntelligence] Reverse geocoding failed:', err);
          const loc = { name: 'Current Location', lat: latitude, lng: longitude };
          setCurrentLocation(loc);
          setOriginInput(loc.name);
        } finally {
          setOriginSearching(false);
        }
      },
      (err) => {
        console.error('[EVIntelligence] Geolocation error:', err);
        // err.code === 1 is GeolocationPositionError.PERMISSION_DENIED - give a specific,
        // actionable message rather than a generic failure, and leave the field fully usable
        // (the user can still type a location manually; no fake/default location is set).
        const message = err && err.code === 1
          ? 'Location permission denied. Please allow location access, or type your location manually.'
          : 'Unable to fetch your current location. Please try again or type it manually.';
        setOriginError(message);
        setOriginSearching(false);
      },
      // Without enableHighAccuracy, the browser is free to resolve position from
      // coarse WiFi/IP-based signals instead of GPS, which is what was landing on
      // the nearest highway segment instead of the device's actual point. Forcing
      // high accuracy (with a bounded timeout and no cached fix) makes the browser
      // use the device's real GPS/location sensor for the exact coordinates.
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  // Calculate the user's requested Origin -> Destination trip route.
  // This replaces the battery-slider-only feasibility flow: the required range for the
  // "Battery Status & Range Feasibility" card now comes from the actual trip the user typed in,
  // via the existing getRoute() calculation engine (same one used by Plan Route / EV stop routing).
  useEffect(() => {
    if (!currentLocation || typeof currentLocation.lat !== 'number' || typeof currentLocation.lng !== 'number') return;
    if (!destination || typeof destination.lat !== 'number' || typeof destination.lng !== 'number') return;

    const controller = new AbortController();
    setLoadingPlannedRoute(true);
    setPlannedRouteError(null);

    getRoute(currentLocation, destination, 'DRIVING', false, controller.signal)
      .then((r) => {
        setPlannedRoute(r);
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;
        console.error('[EVIntelligence] Planned route calculation failed:', err);
        setPlannedRoute(null);
        setPlannedRouteError('Unable to calculate distance for this trip. Please try again.');
      })
      .finally(() => setLoadingPlannedRoute(false));

    return () => controller.abort();
  }, [currentLocation.lat, currentLocation.lng, destination]);

  // Fetch real charging stations along the planned Origin -> Destination route (Open Charge
  // Map via the existing backend corridor search), mirroring the same call Plan Route uses.
  useEffect(() => {
    if (!plannedRoute || !plannedRoute.geometry || !Array.isArray(plannedRoute.geometry.coordinates) || plannedRoute.geometry.coordinates.length === 0) {
      setRouteStations([]);
      setStationsError(null);
      return;
    }

    setLoadingStations(true);
    setStationsError(null);

    const waypoints = plannedRoute.geometry.coordinates.map((c) => ({ lat: c[1], lng: c[0] }));

    getEVStationsAlongRoute(waypoints, 5.0)
      .then((res) => {
        if (res.success) {
          setRouteStations(withSafeStationNames(res.stations));
          setStationsError(null);
        } else {
          setRouteStations([]);
          setStationsError(res.message || 'Charging station data is temporarily unavailable.');
        }
      })
      .catch((err) => {
        console.warn('[EVIntelligence] EV Charging station retrieval error:', err);
        setRouteStations([]);
        setStationsError('Charging station data is temporarily unavailable.');
      })
      .finally(() => setLoadingStations(false));
  }, [plannedRoute]);

  // Fallback: fetch real charging stations near the current location when no destination has
  // been chosen yet, so the station list always reflects real (non-fabricated) network data.
  useEffect(() => {
    if (destination || typeof currentLocation.lat !== 'number' || typeof currentLocation.lng !== 'number') {
      return;
    }

    setLoadingNearby(true);
    getEVStationsNearLocation(currentLocation.lat, currentLocation.lng, 10.0)
      .then((res) => {
        setNearbyStations(res.success ? withSafeStationNames(res.stations) : []);
      })
      .catch(() => setNearbyStations([]))
      .finally(() => setLoadingNearby(false));
  }, [destination, currentLocation.lat, currentLocation.lng]);

  // Most recent planned or completed route
  const latestJourney = journeys.length > 0 ? journeys[0] : null;

  // Calculate distance from route origin
  const routeOriginLat = currentLocation.lat;
  const routeOriginLng = currentLocation.lng;

  // Fix 4 (EV Intelligence Phase 1): Available Range = Full Charge Range × Battery % / 100,
  // and it is only ever calculated once BOTH values are real, valid numbers — never a partial
  // or fabricated result when either one is still missing/empty.
  const hasBatteryInputs = vehicleRangeKm !== '' && !Number.isNaN(Number(vehicleRangeKm)) &&
    batteryPct !== '' && !Number.isNaN(Number(batteryPct));
  const currentRangeKm = hasBatteryInputs ? Math.round((Number(batteryPct) / 100) * Number(vehicleRangeKm)) : null;
  const routeDistanceKm = evRoute
    ? evRoute.distanceKmNum
    : (plannedRoute
        ? plannedRoute.distanceKmNum
        : (latestJourney
            ? (latestJourney.distanceKmNum || (latestJourney.distanceMeters ? latestJourney.distanceMeters / 1000 : 20.0))
            : 20.0));

  const requiredRangeKm = Math.round(routeDistanceKm);
  const safetyMarginKm = hasBatteryInputs ? currentRangeKm - requiredRangeKm : null;
  const directFeasible = safetyMarginKm != null && safetyMarginKm >= SAFETY_MARGIN_KM;

  // Gate for every calculated EV Intelligence output. Nothing computed (range, route
  // distance, feasibility, charging plan) is shown until all four required inputs — Origin,
  // Destination, Vehicle Full-Charge Range, and Current Battery Level — have actually been
  // provided by the user this session, so a first-time/empty session never displays
  // pre-existing or default calculated results.
  const hasRequiredInputs = !!(
    currentLocation && typeof currentLocation.lat === 'number' && typeof currentLocation.lng === 'number' &&
    destination && typeof destination.lat === 'number' && typeof destination.lng === 'number' &&
    vehicleRangeTouched &&
    batteryTouched &&
    hasBatteryInputs
  );

  // Project real charging stations onto the planned route (distance-along-route) so they can
  // be sequenced for multi-stop range planning, using the actual route geometry from getRoute().
  const routeGeometry = useMemo(() => {
    if (!plannedRoute || !plannedRoute.geometry || !Array.isArray(plannedRoute.geometry.coordinates) || plannedRoute.geometry.coordinates.length < 2) {
      return { coords: [], cumDistKm: [], totalDistanceKm: 0 };
    }
    const coords = plannedRoute.geometry.coordinates;
    const cumDistKm = buildCumulativeDistanceKm(coords);
    const totalDistanceKm = plannedRoute.distanceKmNum ?? cumDistKm[cumDistKm.length - 1];
    return { coords, cumDistKm, totalDistanceKm };
  }, [plannedRoute]);

  const annotatedRouteStations = useMemo(() => {
    if (!routeGeometry.coords.length || !routeStations.length) return [];
    return annotateStationsWithRoutePosition(routeStations, routeGeometry.coords, routeGeometry.cumDistKm)
      .sort((a, b) => a.distanceAlongRouteKm - b.distanceAlongRouteKm);
  }, [routeGeometry, routeStations]);

  // Core EV Intelligence output: whether the destination can be reached on the available
  // range and, if not, the practical sequence of charging stops required to get there.
  const evPlan = useMemo(() => {
    if (!hasRequiredInputs || !destination || !routeGeometry.coords.length) return null;
    return planEVChargingRoute(routeGeometry.totalDistanceKm, annotatedRouteStations, currentRangeKm, vehicleRangeKm);
  }, [hasRequiredInputs, destination, routeGeometry, annotatedRouteStations, currentRangeKm, vehicleRangeKm]);

  // Per-station progressive range analysis: for every station along the route, calculates
  // (a) distance from the current position, (b) the estimated remaining range if the vehicle
  // arrives there without charging, (c) the distance onward to the next reachable charging
  // station (or the destination, if it is the last station), and (d) whether that next target
  // is actually reachable on a full recharge here. This powers the per-station "Reachable" /
  // "NOT SAFE" indicators shown in the Optimal Charging Stops list.
  const stationSafetyAnalysis = useMemo(() => {
    if (!hasRequiredInputs || !destination || !annotatedRouteStations.length) return {};

    // Mirrors planEVChargingRoute's own assumptions: before any recharge, range is limited by
    // the vehicle's current (possibly partial) charge; after passing a recommended charging
    // stop, a full recharge is assumed, so range is limited by the vehicle's full-charge range.
    const usableInitialRangeKm = Math.max(currentRangeKm - SAFETY_MARGIN_KM, 0);
    const usableFullRangeKm = Math.max(vehicleRangeKm - SAFETY_MARGIN_KM, 0);
    const planStops = evPlan ? evPlan.stops : [];
    const map = {};

    annotatedRouteStations.forEach((st, idx) => {
      // The most recent recommended charging stop at or before this station (if any), so a
      // station further down the route is evaluated from its actual last recharge point
      // instead of assuming the vehicle drove the whole way from the origin without stopping.
      const priorStop = [...planStops].reverse().find((s) => s.distanceAlongRouteKm <= st.distanceAlongRouteKm);
      const legStartKm = priorStop ? priorStop.distanceAlongRouteKm : 0;
      const usableRangeKm = priorStop ? usableFullRangeKm : usableInitialRangeKm;

      const distanceFromCurrentKm = st.distanceAlongRouteKm;
      const distanceFromLastChargeKm = Number((st.distanceAlongRouteKm - legStartKm).toFixed(1));
      const remainingRangeAtArrivalKm = Math.max(Number((usableRangeKm - distanceFromLastChargeKm).toFixed(1)), 0);

      const next = annotatedRouteStations[idx + 1];
      const nextTargetDistanceKm = next
        ? Number((next.distanceAlongRouteKm - st.distanceAlongRouteKm).toFixed(1))
        : Number((routeGeometry.totalDistanceKm - st.distanceAlongRouteKm).toFixed(1));
      const nextTargetLabel = next ? next.name : `${destination.name} (Destination)`;
      // Reaching the next target assumes a full recharge happens at THIS station.
      const nextTargetReachable = nextTargetDistanceKm <= usableFullRangeKm;

      map[st.id] = {
        distanceFromCurrentKm,
        remainingRangeAtArrivalKm,
        nextTargetDistanceKm,
        nextTargetLabel,
        nextTargetReachable
      };
    });

    return map;
  }, [hasRequiredInputs, destination, annotatedRouteStations, currentRangeKm, vehicleRangeKm, routeGeometry, evPlan]);

  // Overall feasibility now accounts for reachability via charging stops, not just direct
  // range — and, until the required inputs are all provided, there is no result to show at
  // all (no fallback to the default/direct-range guess).
  const isFeasible = (hasRequiredInputs && destination && evPlan) ? evPlan.feasible : false;

  // Phase 4: coordinates of the unsafe portion of the route (from the last reachable point
  // onward) so it can be drawn as a red overlay on the map when the trip is not feasible.
  const unsafeSegmentCoords = useMemo(() => {
    if (!evPlan || evPlan.feasible || typeof evPlan.unsafeSegmentStartKm !== 'number') return null;
    const { coords, cumDistKm } = routeGeometry;
    if (!coords.length) return null;

    let startIdx = coords.length - 1;
    for (let i = 0; i < cumDistKm.length; i++) {
      if (cumDistKm[i] >= evPlan.unsafeSegmentStartKm) {
        startIdx = i;
        break;
      }
    }
    const segment = coords.slice(startIdx);
    return segment.length >= 2 ? segment : null;
  }, [evPlan, routeGeometry]);

  const feasibilityLabel = !hasRequiredInputs
    ? 'Awaiting Route & Vehicle Details'
    : (destination && evPlan)
      ? (evPlan.feasible
          ? (evPlan.needsCharging ? `✓ Feasible via ${evPlan.stops.length} Charging Stop${evPlan.stops.length > 1 ? 's' : ''}` : '✓ Route Feasible')
          : '⚠️ Not Feasible — No Station In Range')
      : '⏳ Calculating…';

  // Station list shown in "Optimal Charging Stops": real along-route stations once a
  // destination is set, otherwise real stations near the current location.
  const displayStations = destination ? annotatedRouteStations : nearbyStations;
  const loadingStationList = destination ? loadingStations : loadingNearby;

  const chargingStations = displayStations.map((st) => {
    const lat = st.latitude ?? st.lat;
    const lng = st.longitude ?? st.lng;
    const distFromOrigin = haversineKm(routeOriginLat, routeOriginLng, lat, lng);
    const energyKwhNeeded = Math.max(2, (evRoute ? evRoute.distanceKmNum : requiredRangeKm) * 0.15);
    const estCostInr = Math.round(energyKwhNeeded * AVERAGE_RATE_INR_PER_KWH);
    const isRecommendedStop = !!(evPlan && evPlan.stops.some((s) => s.id === st.id));
    const recommendedStopDetail = evPlan ? evPlan.stops.find((s) => s.id === st.id) : null;
    const baseSafety = stationSafetyAnalysis[st.id];
    // For a station that IS the plan's recommended stop, defer to the plan's own numbers so
    // this list always agrees with the "Recommended Charging Plan" section above it, instead
    // of two independently-computed figures for the same real-world stop.
    const safety = baseSafety && recommendedStopDetail
      ? {
          ...baseSafety,
          remainingRangeAtArrivalKm: recommendedStopDetail.rangeOnArrivalKm,
          nextTargetDistanceKm: recommendedStopDetail.nextTargetDistanceKm,
          nextTargetLabel: recommendedStopDetail.nextTargetLabel
        }
      : baseSafety;

    return {
      id: st.id,
      name: st.name,
      address: st.address || st.city || 'Address unavailable',
      lat,
      lng,
      power: describeStationPower(st),
      available: describeStationAvailability(st),
      distance: st.distanceAlongRouteKm != null
        ? `${st.distanceAlongRouteKm} km along route (${distFromOrigin} km direct)`
        : `${distFromOrigin} km from Origin`,
      cost: `~₹${estCostInr} est.`,
      isRecommendedStop,
      safety
    };
  });

  // Combined marker set for the map: every discovered charging station along the route (or
  // near the current location when no destination is set) is plotted, not just the ones the
  // user has manually added as a stop. Selected/applied stops additionally get a sequence
  // badge (Stop 1, Stop 2, ...) so the map stays in sync with the Route Preview panel above.
  // Recommended-but-not-yet-applied stops get a ⭐ badge, and the station beyond which the
  // route becomes unsafe (when infeasible) is rendered in red — clicking any marker opens a
  // popup with that station's charging recommendation/safety detail (Phase 4).
  const mapEvStations = useMemo(() => {
    return chargingStations
      .filter((st) => typeof st.lat === 'number' && typeof st.lng === 'number')
      .map((st) => {
        const selectedIdx = selectedStops.findIndex((s) => s.id === st.id);
        const recommendedStopDetail = evPlan ? evPlan.stops.find((s) => s.id === st.id) : null;
        const isFirstUnsafeStation = !!(
          evPlan && !evPlan.feasible && evPlan.unsafeNextTargetLabel &&
          st.name === evPlan.unsafeNextTargetLabel
        );

        return {
          id: st.id,
          name: st.name,
          latitude: st.lat,
          longitude: st.lng,
          address: st.address,
          city: 'Indore',
          distanceFromRouteKm: 0.0,
          // Sequence number only for stations the user has selected/applied as an actual
          // charging stop, so the map badge (Stop 1, Stop 2, ...) matches the Route Preview.
          ...(selectedIdx !== -1 ? { stopNumber: selectedIdx + 1 } : {}),
          isRecommended: st.isRecommendedStop,
          unsafe: isFirstUnsafeStation,
          safetyStatus: st.safety ? (st.safety.nextTargetReachable ? 'safe' : 'unsafe') : undefined,
          rangeOnArrivalKm: recommendedStopDetail ? recommendedStopDetail.rangeOnArrivalKm : st.safety?.remainingRangeAtArrivalKm,
          nextStationDistanceKm: recommendedStopDetail ? recommendedStopDetail.nextTargetDistanceKm : st.safety?.nextTargetDistanceKm,
          nextStationLabel: recommendedStopDetail ? recommendedStopDetail.nextTargetLabel : st.safety?.nextTargetLabel,
          reason: recommendedStopDetail ? recommendedStopDetail.reason : undefined,
          attribution: 'Data provided by Open Charge Map'
        };
      });
  }, [chargingStations, selectedStops, evPlan]);

  // Toggle Charging Stop Selection (Add / Remove Stop)
  const handleToggleStop = (station) => {
    const exists = selectedStops.some(s => s.id === station.id);
    let updatedStops = [];

    if (exists) {
      updatedStops = selectedStops.filter(s => s.id !== station.id);
    } else {
      updatedStops = [...selectedStops, station];
    }

    setSelectedStops(updatedStops);

    if (updatedStops.length > 0) {
      calculateMultiStopEVRoute(currentLocation, updatedStops);
    } else {
      setEvRoute(null);
    }
  };

  // Remove single stop
  const handleRemoveStop = (stationId) => {
    const updatedStops = selectedStops.filter(s => s.id !== stationId);
    setSelectedStops(updatedStops);

    if (updatedStops.length > 0) {
      calculateMultiStopEVRoute(currentLocation, updatedStops);
    } else {
      setEvRoute(null);
    }
  };

  // Select New Route Handler: Resets stops without leaving the page
  const handleSelectNewRoute = () => {
    setSelectedStops([]);
    setEvRoute(null);
    setEvRouteError(null);
  };

  // Multi-Stop Real Routing Calculation Engine
  const calculateMultiStopEVRoute = async (originLoc, stops) => {
    if (!stops || stops.length === 0) {
      setEvRoute(null);
      return;
    }

    setLoadingEvRoute(true);
    setEvRouteError(null);

    try {
      // Build route waypoints sequence: Current Location -> Stop 1 -> Stop 2 -> ... ->
      // Destination. The final leg to the actual trip Destination (from the "destination"
      // state set above the map) is appended whenever one has been set, so the map always
      // reflects the complete Origin -> Required Charging Stop(s) -> Destination sequence
      // from the Phase 2 charging calculation — not just Origin -> last charging stop.
      const finalDestination = destination && typeof destination.lat === 'number' && typeof destination.lng === 'number'
        ? destination
        : null;

      const waypoints = [
        { name: originLoc.name, lat: originLoc.lat, lng: originLoc.lng },
        ...stops.map(s => ({ name: s.name, lat: s.lat, lng: s.lng })),
        ...(finalDestination ? [{ name: finalDestination.name, lat: finalDestination.lat, lng: finalDestination.lng }] : [])
      ];

      if (waypoints.length === 2) {
        // Single leg: Current Location -> Stop 1 (no destination set yet)
        const leg = await getRoute(waypoints[0], waypoints[1], 'DRIVING');
        setEvRoute({
          ...leg,
          stops: stops,
          title: `${shortLabel(originLoc.name)} → ${shortLabel(stops[0].name)}`
        });
      } else {
        // Multi leg: Current Location -> Stop 1 -> Stop 2 -> ... -> Destination
        let totalDistanceMeters = 0;
        let totalDurationSeconds = 0;
        let combinedCoords = [];

        for (let i = 0; i < waypoints.length - 1; i++) {
          const leg = await getRoute(waypoints[i], waypoints[i + 1], 'DRIVING');
          totalDistanceMeters += leg.distanceMeters || (leg.distanceKmNum * 1000);
          totalDurationSeconds += leg.durationSeconds || 600;

          if (leg.geometry && leg.geometry.coordinates) {
            if (combinedCoords.length > 0) {
              combinedCoords = combinedCoords.concat(leg.geometry.coordinates.slice(1));
            } else {
              combinedCoords = leg.geometry.coordinates;
            }
          }
        }

        const distanceKmNum = Number((totalDistanceMeters / 1000).toFixed(1));
        const durationMins = Math.round(totalDurationSeconds / 60);

        setEvRoute({
          id: `ev_multi_${Date.now()}`,
          mode: 'DRIVING',
          geometry: {
            type: 'LineString',
            coordinates: combinedCoords
          },
          distanceMeters: totalDistanceMeters,
          durationSeconds: totalDurationSeconds,
          distanceKmNum: distanceKmNum,
          distanceKm: `${distanceKmNum} km`,
          durationMinutes: `${durationMins} min`,
          stops: stops,
          title: [
            originLoc.name,
            ...stops.map(s => shortLabel(s.name)),
            ...(finalDestination ? [shortLabel(finalDestination.name)] : [])
          ].join(' → ')
        });
      }
    } catch (err) {
      console.error('[EVIntelligence] EV Route calculation failed:', err);
      setEvRouteError('Unable to calculate this EV route. Please try again.');
    } finally {
      setLoadingEvRoute(false);
    }
  };

  // Applies the auto-computed Recommended Charging Plan to the existing Route Preview /
  // map / selected-stops flow, reusing the same multi-stop routing engine used by manual
  // "Add Stop" selection so nothing about that existing flow needs to change.
  const handleApplyRecommendedPlan = () => {
    if (!evPlan || !evPlan.stops || evPlan.stops.length === 0) return;

    const stopsForRoute = evPlan.stops.map((s) => ({
      id: s.id,
      name: s.name,
      address: s.address || s.city || 'Address unavailable',
      lat: s.latitude ?? s.lat,
      lng: s.longitude ?? s.lng,
      power: describeStationPower(s),
      available: describeStationAvailability(s)
    }));

    setSelectedStops(stopsForRoute);
    calculateMultiStopEVRoute(currentLocation, stopsForRoute);
  };

  return (
    <main className="flex-1 w-full pt-[24px] px-4 md:px-lg pb-xl max-w-7xl mx-auto overflow-y-auto scrollbar-none">
      {/* Header */}
      <header className="mb-lg flex flex-col md:flex-row justify-between md:items-end gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="material-symbols-outlined text-primary text-2xl">ev_station</span>
            <h2 className="text-headline-lg font-headline-lg text-on-surface">EV Intelligence</h2>
          </div>
          <p className="text-body-md font-body-md text-on-surface-variant">
            Real-time route feasibility, battery range evaluation, and optimal charging recommendations.
          </p>
        </div>
        <button
          type="button"
          onClick={handleSelectNewRoute}
          className="bg-primary text-on-primary rounded-xl px-5 py-2.5 text-label-sm font-label-sm hover:bg-primary/90 transition-colors shadow-sm cursor-pointer flex items-center gap-2 self-start md:self-auto"
        >
          <span className="material-symbols-outlined text-sm">route</span>
          <span>Select New Route</span>
        </button>
      </header>

      {/* Main Two-Column Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column (lg:col-span-8): Battery Status & Optimal Charging Stops */}
        <div className="lg:col-span-8 space-y-6">
          {/* Battery Status Section */}
          <section className="bg-surface-container-lowest rounded-2xl p-6 border border-tertiary-fixed shadow-sm">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="text-headline-md font-headline-md text-on-surface flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary">battery_4_bar</span>
                  Battery Status & Range Feasibility
                </h3>
                {!hasRequiredInputs ? (
                  <p className="text-label-xs text-amber-700 mt-1">
                    Enter your route and vehicle details to evaluate EV feasibility.
                  </p>
                ) : evRoute ? (
                  <p className="text-label-xs text-on-surface-variant mt-1">
                    Evaluated for calculated EV route: <strong className="text-on-surface">{evRoute.title}</strong> ({requiredRangeKm} km)
                  </p>
                ) : plannedRoute && destination ? (
                  <p className="text-label-xs text-on-surface-variant mt-1">
                    Evaluated for route: <strong className="text-on-surface">{currentLocation.name} → {destination.name}</strong> ({requiredRangeKm} km)
                  </p>
                ) : (
                  <p className="text-label-xs text-on-surface-variant mt-1">
                    Calculating your route…
                  </p>
                )}
              </div>
              <div className={`px-3 py-1 rounded-full text-label-xs font-label-xs font-bold border ${
                isFeasible
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                  : 'bg-amber-50 text-amber-800 border-amber-300'
              }`}>
                {feasibilityLabel}
              </div>
            </div>

            {/* Trip & Battery Inputs (replaces the previous battery slider) */}
            <div className="mb-6 p-4 bg-surface-container-low rounded-xl border border-outline-variant/30 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Origin Input */}
                <div className="relative">
                  <label className="text-label-xs font-label-xs text-on-surface-variant mb-1 block">Current Location / Origin</label>
                  <div className="relative">
                    <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-primary text-sm">my_location</span>
                    <input
                      type="text"
                      value={originInput}
                      onChange={(e) => setOriginInput(e.target.value)}
                      placeholder="Enter your current location..."
                      className={`w-full bg-white rounded-lg border pl-9 pr-9 py-2 text-body-md font-body-md text-on-surface text-sm outline-none focus:border-primary ${
                        originError ? 'border-error' : 'border-tertiary-fixed'
                      }`}
                    />
                    <button
                      type="button"
                      onClick={handleUseCurrentLocation}
                      title="Use Current Location"
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-primary transition-colors p-1 cursor-pointer"
                    >
                      <span className={`material-symbols-outlined text-sm ${originSearching ? 'animate-spin text-primary' : ''}`}>
                        {originSearching ? 'sync' : 'near_me'}
                      </span>
                    </button>
                  </div>

                  {originSuggestions.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-lg border border-tertiary-fixed shadow-lg z-30 max-h-48 overflow-y-auto">
                      {originSuggestions.map((item, idx) => (
                        <div
                          key={idx}
                          onClick={() => handleSelectOrigin(item)}
                          className="p-2.5 hover:bg-surface-container-low cursor-pointer border-b border-outline-variant/20 last:border-0 text-body-md text-on-surface flex items-center gap-2"
                        >
                          <span className="material-symbols-outlined text-on-surface-variant text-sm">location_on</span>
                          <span className="truncate">{item.name}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {originError && <p className="text-error text-label-xs mt-1">{originError}</p>}
                </div>

                {/* Destination Input */}
                <div className="relative">
                  <label className="text-label-xs font-label-xs text-on-surface-variant mb-1 block">Destination</label>
                  <div className="relative">
                    <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-error text-sm">location_on</span>
                    <input
                      type="text"
                      value={destinationInput}
                      onChange={(e) => setDestinationInput(e.target.value)}
                      placeholder="Enter destination..."
                      className={`w-full bg-white rounded-lg border pl-9 pr-3 py-2 text-body-md font-body-md text-on-surface text-sm outline-none focus:border-primary ${
                        destinationError ? 'border-error' : 'border-tertiary-fixed'
                      }`}
                    />
                  </div>

                  {destinationSuggestions.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-lg border border-tertiary-fixed shadow-lg z-30 max-h-48 overflow-y-auto">
                      {destinationSuggestions.map((item, idx) => (
                        <div
                          key={idx}
                          onClick={() => handleSelectDestination(item)}
                          className="p-2.5 hover:bg-surface-container-low cursor-pointer border-b border-outline-variant/20 last:border-0 text-body-md text-on-surface flex items-center gap-2"
                        >
                          <span className="material-symbols-outlined text-on-surface-variant text-sm">location_on</span>
                          <span className="truncate">{item.name}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {destinationError && <p className="text-error text-label-xs mt-1">{destinationError}</p>}
                </div>
              </div>

              {loadingPlannedRoute && (
                <div className="flex items-center gap-2 text-primary text-label-xs font-label-xs animate-pulse">
                  <span className="material-symbols-outlined text-xs animate-spin">sync</span>
                  <span>Calculating trip distance...</span>
                </div>
              )}
              {plannedRouteError && <p className="text-error text-label-xs">{plannedRouteError}</p>}

              {/* Vehicle Range + Battery Inputs (replaces the previous slider control) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <div className="flex justify-between text-label-xs text-on-surface-variant mb-2">
                    <span>Vehicle Full-Charge Range</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      min="50"
                      max="1000"
                      step="5"
                      value={vehicleRangeKm}
                      placeholder="e.g. 400"
                      onChange={(e) => {
                        const raw = e.target.value;
                        setVehicleRangeTouched(true);
                        if (raw === '') {
                          setVehicleRangeKm('');
                          return;
                        }
                        const val = Number(raw);
                        if (Number.isNaN(val)) return;
                        setVehicleRangeKm(val);
                      }}
                      onBlur={(e) => {
                        const raw = e.target.value;
                        // Fix 2: an empty field stays empty on blur — it is never silently
                        // replaced with a default value.
                        if (raw === '') return;
                        const val = Number(raw);
                        if (Number.isNaN(val)) return;
                        const clamped = Math.min(1000, Math.max(50, val));
                        setVehicleRangeKm(clamped);
                      }}
                      className="w-24 bg-white rounded-lg border border-tertiary-fixed px-3 py-2 text-body-md font-body-md text-on-surface text-sm outline-none focus:border-primary"
                    />
                    <span className="text-label-sm font-label-sm text-on-surface-variant">km at 100% battery</span>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-label-xs text-on-surface-variant mb-2">
                    <span>Current Vehicle Battery Level</span>
                    <span className="font-bold text-primary">
                      {hasBatteryInputs ? `${currentRangeKm} km available range` : '— km available range'}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      min="10"
                      max="100"
                      step="1"
                      value={batteryPct}
                      placeholder="e.g. 60"
                      onChange={(e) => {
                        const raw = e.target.value;
                        setBatteryTouched(true);
                        if (raw === '') {
                          setBatteryPct('');
                          return;
                        }
                        const val = Number(raw);
                        if (Number.isNaN(val)) return;
                        setBatteryPct(val);
                      }}
                      onBlur={(e) => {
                        const raw = e.target.value;
                        // Fix 3: an empty field stays empty on blur — it is never silently
                        // replaced with a default value.
                        if (raw === '') return;
                        const val = Number(raw);
                        if (Number.isNaN(val)) return;
                        const clamped = Math.min(100, Math.max(10, val));
                        setBatteryPct(clamped);
                      }}
                      className="w-24 bg-white rounded-lg border border-tertiary-fixed px-3 py-2 text-body-md font-body-md text-on-surface text-sm outline-none focus:border-primary"
                    />
                    <span className="text-label-sm font-label-sm text-on-surface-variant">% battery (10–100)</span>
                  </div>
                </div>
              </div>
            </div>

            {hasRequiredInputs ? (
              <>
                {/* Range Metrics Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                  <div className="bg-surface-container-low p-4 rounded-xl border border-outline-variant/30">
                    <p className="text-label-xs text-on-surface-variant uppercase">Current Available Range</p>
                    <p className="text-headline-lg font-headline-lg text-primary font-bold">{currentRangeKm} km</p>
                  </div>

                  <div className="bg-surface-container-low p-4 rounded-xl border border-outline-variant/30">
                    <p className="text-label-xs text-on-surface-variant uppercase">Required for Route</p>
                    <p className="text-headline-lg font-headline-lg text-on-surface font-bold">{requiredRangeKm} km</p>
                  </div>

                  <div className="bg-surface-container-low p-4 rounded-xl border border-outline-variant/30">
                    <p className="text-label-xs text-on-surface-variant uppercase">Safety Reserve Margin</p>
                    <p className={`text-headline-lg font-headline-lg font-bold ${
                      safetyMarginKm >= 15 ? 'text-emerald-700' : 'text-amber-600'
                    }`}>
                      {safetyMarginKm} km
                    </p>
                  </div>
                </div>

                {/* Battery Visual Indicator */}
                <div className="relative w-full h-6 bg-surface-container-high rounded-full overflow-hidden border border-outline-variant/50">
                  <div
                    className={`h-full transition-all duration-500 rounded-r-full ${
                      batteryPct < 25 ? 'bg-error' : batteryPct < 50 ? 'bg-amber-500' : 'bg-primary'
                    }`}
                    style={{ width: `${batteryPct}%` }}
                  ></div>
                </div>
              </>
            ) : (
              /* Empty/input state: no calculated range, distance, or margin data is shown
                 until Origin, Destination, Vehicle Full-Charge Range, and Battery Level have
                 all been provided by the user this session. */
              <div className="bg-surface-container-low border border-outline-variant/30 rounded-xl p-6 text-center">
                <span className="material-symbols-outlined text-on-surface-variant text-3xl mb-2 block">ev_station</span>
                <p className="text-label-sm font-label-sm text-on-surface-variant">
                  Enter your route and vehicle details to evaluate EV feasibility.
                </p>
              </div>
            )}
          </section>

          {/* Recommended Charging Plan Section — computed from Origin, Destination, available
              battery range, and real Open Charge Map station data along the route. Gated on
              all required inputs (not just Destination) so no plan is shown until the user
              has actually provided their vehicle range and battery level too. */}
          {hasRequiredInputs && destination && (
            <section className="bg-surface-container-lowest rounded-2xl p-6 border border-tertiary-fixed shadow-sm">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-headline-sm font-headline-sm text-on-surface flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary">alt_route</span>
                  Recommended Charging Plan
                </h3>
                {loadingStations && (
                  <span className="text-label-xs text-on-surface-variant flex items-center gap-1">
                    <span className="material-symbols-outlined text-xs animate-spin">sync</span>
                    Analyzing route...
                  </span>
                )}
              </div>

              {stationsError && (
                <div className="bg-amber-50 text-amber-800 border border-amber-200 rounded-lg p-3 text-label-xs mb-3">
                  {stationsError}
                </div>
              )}

              {!evPlan ? (
                <p className="text-label-xs text-on-surface-variant">Calculating route feasibility…</p>
              ) : !evPlan.needsCharging ? (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-label-sm text-emerald-800">
                  <p className="font-semibold mb-1">{evPlan.safetyExplanation}</p>
                  <p className="text-label-xs">{evPlan.summary}</p>
                </div>
              ) : evPlan.feasible ? (
                <div className="space-y-3">
                  {/* Phase 3: explicit safety explanation for the overall recommended sequence */}
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-label-sm text-emerald-800 font-semibold">
                    {evPlan.safetyExplanation}
                  </div>
                  <div className="bg-primary/5 border border-primary/20 rounded-xl p-3 text-label-xs text-on-surface">
                    {evPlan.summary}
                  </div>

                  {/* Origin -> Stop 1 -> Stop 2 -> ... -> Destination sequence */}
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                    <span className="px-2 py-1 bg-primary/10 text-primary font-semibold rounded border border-primary/20">
                      Origin: {currentLocation.name}
                    </span>
                    {evPlan.stops.map((stop) => (
                      <React.Fragment key={stop.id}>
                        <span className="text-on-surface-variant text-[10px]">→</span>
                        <span className="px-2 py-1 bg-emerald-50 text-emerald-800 font-semibold rounded border border-emerald-200">
                          Stop {stop.stopNumber}: {shortLabel(stop.name)}
                        </span>
                      </React.Fragment>
                    ))}
                    <span className="text-on-surface-variant text-[10px]">→</span>
                    <span className="px-2 py-1 bg-error/10 text-error font-semibold rounded border border-error/20">
                      Destination: {destination.name}
                    </span>
                  </div>

                  {/* Per-stop reasoning and range breakdown (Phase 3: charging station, distance,
                      expected range on arrival, reason for recommendation, next station distance) */}
                  <div className="space-y-2">
                    {evPlan.stops.map((stop) => (
                      <div key={stop.id} className="p-3 rounded-lg border border-outline-variant/40 bg-surface-container-low text-label-xs">
                        <div className="flex justify-between items-start mb-1 gap-2">
                          <span className="font-semibold text-on-surface">Stop {stop.stopNumber}: {stop.name}</span>
                          <span className="text-primary font-semibold whitespace-nowrap">{stop.legDistanceFromPrevKm} km leg</span>
                        </div>
                        <p className="text-on-surface-variant mb-1">{stop.address}</p>
                        <p className="text-on-surface-variant"><strong className="text-on-surface">Expected range on arrival:</strong> ~{stop.rangeOnArrivalKm} km</p>
                        <p className="text-on-surface-variant"><strong className="text-on-surface">Reason for recommendation:</strong> {stop.reason}</p>
                        <p className="text-on-surface-variant"><strong className="text-on-surface">Range after charging here:</strong> ~{stop.reachableRangeFromStopKm} km</p>
                        <p className="text-on-surface-variant"><strong className="text-on-surface">Next charging station distance:</strong> {stop.nextTargetDistanceKm} km to {shortLabel(stop.nextTargetLabel)}</p>
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={handleApplyRecommendedPlan}
                    className="w-full bg-primary text-on-primary rounded-xl px-4 py-2.5 text-label-xs font-label-xs font-semibold hover:bg-primary/90 transition-colors shadow-sm cursor-pointer flex items-center justify-center gap-2"
                  >
                    <span className="material-symbols-outlined text-sm">bolt</span>
                    <span>Apply Recommended Stops to Route Preview</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Phase 3: explicit "why is this unsafe" explanation, in the required format */}
                  <div className="bg-error-container/10 border border-error/30 rounded-xl p-4 text-label-sm text-error">
                    <p className="font-semibold mb-1">{evPlan.safetyExplanation}</p>
                    <p className="text-label-xs">
                      {evPlan.stops.length > 0
                        ? `We recommend charging fully at the last reachable stop below (Stop ${evPlan.stops.length}) before continuing — the segment beyond it is highlighted on the map.`
                        : 'The nearest charging station is beyond your current range — the unsafe segment is highlighted on the map.'}
                    </p>
                  </div>

                  {/* Any reachable stops found before the unsafe segment are still shown so the
                      user has a partial, honest plan rather than nothing. */}
                  {evPlan.stops.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-label-xs font-semibold text-on-surface">Reachable stops before the unsafe segment:</p>
                      {evPlan.stops.map((stop) => (
                        <div key={stop.id} className="p-3 rounded-lg border border-outline-variant/40 bg-surface-container-low text-label-xs">
                          <div className="flex justify-between items-start mb-1 gap-2">
                            <span className="font-semibold text-on-surface">Stop {stop.stopNumber}: {stop.name}</span>
                            <span className="text-primary font-semibold whitespace-nowrap">{stop.legDistanceFromPrevKm} km leg</span>
                          </div>
                          <p className="text-on-surface-variant mb-1">{stop.address}</p>
                          <p className="text-on-surface-variant"><strong className="text-on-surface">Expected range on arrival:</strong> ~{stop.rangeOnArrivalKm} km</p>
                          <p className="text-on-surface-variant"><strong className="text-on-surface">Reason for recommendation:</strong> {stop.reason}</p>
                          <p className="text-on-surface-variant"><strong className="text-on-surface">Range after charging here:</strong> ~{stop.reachableRangeFromStopKm} km</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </section>
          )}

          {/* Optimal Charging Stops Section */}
          <section className="bg-surface-container-lowest rounded-2xl p-6 border border-tertiary-fixed shadow-sm">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-headline-sm font-headline-sm text-on-surface flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">ev_station</span>
                Optimal Charging Stops
              </h3>
              <span className="text-label-xs text-on-surface-variant">Verified Open Charge Map Network</span>
            </div>

            {loadingStationList && (
              <div className="flex items-center gap-2 bg-primary-container/20 text-primary border border-primary/30 rounded-lg p-2.5 text-label-xs font-label-xs animate-pulse mb-3">
                <span className="material-symbols-outlined text-xs animate-spin">sync</span>
                <span>Finding charging stations...</span>
              </div>
            )}

            {!loadingStationList && chargingStations.length === 0 && (
              <div className="bg-surface-container-low text-on-surface-variant border border-outline-variant/30 rounded-lg p-3 text-label-xs mb-3">
                {destination ? 'No charging stations found along this route.' : 'No charging stations found near your current location.'}
              </div>
            )}

            <div className="space-y-4">
              {chargingStations.map((station) => {
                const isAdded = selectedStops.some(s => s.id === station.id);

                return (
                  <div
                    key={station.id}
                    className={`p-4 rounded-xl border transition-all ${
                      isAdded
                        ? 'border-primary bg-primary/5 shadow-sm'
                        : 'border-outline-variant/40 bg-surface-container-low hover:border-primary/50'
                    }`}
                  >
                    <div className="flex flex-col md:flex-row justify-between md:items-center gap-3">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="material-symbols-outlined text-primary text-xl">ev_station</span>
                          <h4 className="text-label-sm font-label-sm text-on-surface font-semibold">{station.name}</h4>
                          <span className="bg-emerald-50 text-emerald-800 text-[10px] px-2 py-0.5 rounded font-semibold border border-emerald-200">
                            {station.available}
                          </span>
                          {station.isRecommendedStop && (
                            <span className="bg-primary/10 text-primary text-[10px] px-2 py-0.5 rounded font-semibold border border-primary/30">
                              ⚡ Recommended Stop
                            </span>
                          )}
                          {station.safety && !station.safety.nextTargetReachable && (
                            <span className="bg-error/10 text-error text-[10px] px-2 py-0.5 rounded font-semibold border border-error/30">
                              ⚠️ NOT SAFE beyond this stop
                            </span>
                          )}
                        </div>
                        <p className="text-label-xs text-on-surface-variant">{station.address} • {station.distance}</p>

                        {/* Progressive range intelligence: distance from current position, remaining
                            range on arrival (without charging), and reachability of the next stop. */}
                        {station.safety && (
                          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-on-surface-variant">
                            <span>From current: <strong className="text-on-surface">{station.safety.distanceFromCurrentKm} km</strong></span>
                            <span>Range on arrival: <strong className="text-on-surface">~{station.safety.remainingRangeAtArrivalKm} km</strong></span>
                            <span>To next ({shortLabel(station.safety.nextTargetLabel)}): <strong className="text-on-surface">{station.safety.nextTargetDistanceKm} km</strong></span>
                            <span>
                              Next reachable:{' '}
                              <strong className={station.safety.nextTargetReachable ? 'text-emerald-700' : 'text-error'}>
                                {station.safety.nextTargetReachable ? 'Yes' : 'No — NOT SAFE'}
                              </strong>
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p className="text-label-xs font-semibold text-primary">{station.power}</p>
                          <p className="text-label-xs text-on-surface-variant">{station.cost}</p>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleToggleStop(station)}
                          className={`px-4 py-2 rounded-xl text-label-xs font-label-xs font-semibold transition-colors cursor-pointer border ${
                            isAdded
                              ? 'bg-primary text-on-primary border-primary'
                              : 'bg-surface text-primary border-primary hover:bg-primary hover:text-on-primary'
                          }`}
                        >
                          {isAdded ? '✓ Added Stop' : 'Add Stop'}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        {/* Right Column (lg:col-span-4): Route Summary & Compact EV Route Preview Map Panel */}
        <div className="lg:col-span-4 space-y-6">
          {/* Top: Route & Battery Summary Card */}
          <div className="bg-surface-container-lowest rounded-2xl p-5 border border-tertiary-fixed shadow-sm space-y-4">
            <h3 className="text-headline-sm font-headline-sm text-on-surface border-b border-outline-variant pb-3">
              Route & Battery Summary
            </h3>

            <div className="space-y-3 text-body-md">
              <div className="flex justify-between py-1 border-b border-outline-variant/20">
                <span className="text-label-xs text-on-surface-variant">Active Origin</span>
                <span className="text-label-sm font-semibold text-on-surface">{currentLocation.name}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-outline-variant/20">
                <span className="text-label-xs text-on-surface-variant">Destination</span>
                <span className="text-label-sm font-semibold text-on-surface">{destination ? destination.name : '—'}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-outline-variant/20">
                <span className="text-label-xs text-on-surface-variant">Total Route Distance</span>
                <span className="text-label-sm font-semibold text-on-surface">{hasRequiredInputs ? `${requiredRangeKm} km` : '—'}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-outline-variant/20">
                <span className="text-label-xs text-on-surface-variant">Available EV Range</span>
                <span className="text-label-sm font-semibold text-primary">{hasRequiredInputs ? `${currentRangeKm} km (${batteryPct}%)` : '—'}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-outline-variant/20">
                <span className="text-label-xs text-on-surface-variant">Selected Charging Stops</span>
                <span className="text-label-sm font-semibold text-on-surface">{selectedStops.length} stops</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-label-xs text-on-surface-variant">Feasibility Status</span>
                <span className={`text-label-sm font-bold ${hasRequiredInputs ? (isFeasible ? 'text-emerald-700' : 'text-amber-600') : 'text-on-surface-variant'}`}>
                  {!hasRequiredInputs
                    ? 'Awaiting Input'
                    : (destination && evPlan)
                      ? (evPlan.feasible
                          ? (evPlan.needsCharging ? `Feasible (${evPlan.stops.length} stop${evPlan.stops.length > 1 ? 's' : ''})` : 'Safe EV Route')
                          : 'Not Feasible')
                      : '⏳ Calculating…'}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleSelectNewRoute}
              className="w-full bg-primary text-on-primary rounded-xl px-4 py-2.5 text-label-xs font-label-xs font-semibold hover:bg-primary/90 transition-colors shadow-sm cursor-pointer flex items-center justify-center gap-2 mt-2"
            >
              <span className="material-symbols-outlined text-sm">route</span>
              <span>Select New Route</span>
            </button>
          </div>

          {/* Bottom: Compact Right-Side EV Route Preview Map Panel */}
          <div ref={mapSectionRef} id="ev-route-planner-map-area" className="bg-surface-container-lowest rounded-2xl p-4 border border-tertiary-fixed shadow-sm space-y-3">
            <div className="flex justify-between items-center pb-2 border-b border-outline-variant/40">
              <h4 className="text-label-sm font-label-sm text-on-surface font-semibold flex items-center gap-1.5">
                <span className="material-symbols-outlined text-primary text-base">map</span>
                <span>EV Route Preview</span>
              </h4>
              {selectedStops.length > 0 && (
                <button
                  type="button"
                  onClick={handleSelectNewRoute}
                  className="text-[11px] text-on-surface-variant hover:text-primary transition-colors flex items-center gap-0.5 cursor-pointer font-label-xs"
                >
                  <span className="material-symbols-outlined text-xs">restart_alt</span>
                  <span>Reset</span>
                </button>
              )}
            </div>

            {/* Selected Charging Stops Pills */}
            {selectedStops.length > 0 ? (
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                  <span className="px-2 py-0.5 bg-primary/10 text-primary font-semibold rounded border border-primary/20">
                    {currentLocation.name}
                  </span>
                  {selectedStops.map((stop, idx) => (
                    <React.Fragment key={stop.id}>
                      <span className="text-on-surface-variant text-[10px]">→</span>
                      <span className="px-2 py-0.5 bg-emerald-50 text-emerald-800 font-semibold rounded border border-emerald-200 flex items-center gap-1">
                        <span>Stop {idx + 1}: {shortLabel(stop.name)}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveStop(stop.id)}
                          className="text-emerald-800 hover:text-error transition-colors ml-0.5 cursor-pointer"
                          title="Remove this stop"
                        >
                          <span className="material-symbols-outlined text-[10px]">close</span>
                        </button>
                      </span>
                    </React.Fragment>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-[11px] text-on-surface-variant bg-surface-container-low p-2 rounded-lg border border-outline-variant/20">
                Click "Add Stop" on any charging station card to preview route.
              </div>
            )}

            {/* Loading / Error States */}
            {loadingEvRoute && (
              <div className="flex items-center gap-2 bg-primary-container/20 text-primary border border-primary/30 rounded-lg p-2 text-label-xs font-label-xs animate-pulse">
                <span className="material-symbols-outlined text-xs animate-spin">sync</span>
                <span>Calculating EV route...</span>
              </div>
            )}

            {evRouteError && (
              <div className="bg-error-container/20 text-error border border-error/30 rounded-lg p-2 text-label-xs">
                {evRouteError}
              </div>
            )}

            {/* Route Summary Metrics */}
            {evRoute && (
              <div className="flex justify-between items-center bg-primary/5 p-2.5 rounded-lg border border-primary/20 text-label-xs">
                <div>
                  <span className="text-on-surface-variant text-[10px] block">Total Distance</span>
                  <span className="text-primary font-bold">{evRoute.distanceKm}</span>
                </div>
                <div>
                  <span className="text-on-surface-variant text-[10px] block">Est. Duration</span>
                  <span className="text-on-surface font-semibold">{evRoute.durationMinutes}</span>
                </div>
                <div>
                  <span className="text-on-surface-variant text-[10px] block">Stops</span>
                  <span className="text-emerald-700 font-semibold">{selectedStops.length} Included</span>
                </div>
              </div>
            )}

            {/* Compact Right-Side Map Container */}
            <div className="relative w-full h-[320px] bg-surface-container-low rounded-xl overflow-hidden border border-outline-variant/40">
              <GreenMoveMap
                origin={currentLocation}
                destination={
                  destination && typeof destination.lat === 'number' && typeof destination.lng === 'number'
                    // Real trip Destination once set, so the map always shows the actual
                    // Origin -> Stop(s) -> Destination sequence rather than stopping at the
                    // last charging stop.
                    ? { lat: destination.lat, lng: destination.lng, name: destination.name }
                    : (selectedStops.length > 0 ? { lat: selectedStops[selectedStops.length - 1].lat, lng: selectedStops[selectedStops.length - 1].lng } : null)
                }
                route={evRoute}
                evStations={mapEvStations}
                unsafeSegment={unsafeSegmentCoords}
                onRecenterRef={recenterMapRef}
              />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
