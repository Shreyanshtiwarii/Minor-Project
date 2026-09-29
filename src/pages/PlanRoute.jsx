import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import GreenMoveMap from '../components/map/GreenMoveMap';
import LocationAutocompleteInput from '../components/LocationAutocompleteInput';
import { searchLocations, reverseGeocode } from '../services/geocodingService';
import { saveJourney } from '../services/historyService';
import { getRoute, getMultimodalCandidates } from '../services/routingService';
import { getTransitRoute } from '../services/transitService';
import { getEVStationsAlongRoute } from '../services/evChargingService';
import { 
  calculateCarpoolCost, 
  calculateCarpoolCO2, 
  calculateRouteCO2,
  calculatePercentageCheaper, 
  calculatePercentageLowerCO2, 
  calculateTimeComparison, 
  calculateSustainabilityScore,
  selectBalancedRoute,
  getRecommendationExplanation,
  getEffectiveRouteDuration
} from '../utils/sustainabilityCalculations';
import { evaluateTrafficReroute, TRAFFIC_CONFIG, formatLastChecked } from '../utils/trafficRerouting';

export default function PlanRoute() {
  const [searchParams] = useSearchParams();
  const recenterMapRef = useRef(null);

  // Core coordinates states (initialized to Vijay Nagar and Rau)
  const [origin, setOrigin] = useState({ name: 'Home (Vijay Nagar)', lat: 22.7533, lng: 75.8937 });
  const [destination, setDestination] = useState({ name: 'College (Rau)', lat: 22.6323, lng: 75.8038 });

  // Route calculation states
  const [route, setRoute] = useState(null);
  const [allRoutes, setAllRoutes] = useState([]);
  const [routeMode, setRouteMode] = useState('DRIVING'); // DRIVING, WALKING, CYCLING
  const [loadingRoute, setLoadingRoute] = useState(false);
  const [routingError, setRoutingError] = useState(null);

  // EV Charging Station States
  const [evStations, setEvStations] = useState([]);
  const [loadingEVStations, setLoadingEVStations] = useState(false);
  const [evStationsError, setEvStationsError] = useState(null);

  // Cache/duplicate request prevention tracker (profile & options aware)
  const prevRequestCoordsRef = useRef({ origin: null, destination: null, profile: null, avoidTolls: null, preferTransit: null });

  // Input states
  const [originInput, setOriginInput] = useState('Home (Vijay Nagar)');
  const [destinationInput, setDestinationInput] = useState('College (Rau)');

  // "Use current location" (geolocation) loading indicator for the origin field.
  // Suggestion search/debounce/error state now lives inside the shared
  // LocationAutocompleteInput component (see src/components/LocationAutocompleteInput.jsx).
  const [originSearching, setOriginSearching] = useState(false);

  // Other form options
  const [passengers, setPassengers] = useState('1');
  const [preference, setPreference] = useState('Balanced');
  const [showAdvanced, setShowAdvanced] = useState(true);
  const [avoidTolls, setAvoidTolls] = useState(false);
  const [preferTransit, setPreferTransit] = useState(false);
  const [multimodalCandidates, setMultimodalCandidates] = useState([]);

  // Round 5: Dynamic Traffic Re-routing & Live Re-evaluation State
  const [lastTrafficCheckTime, setLastTrafficCheckTime] = useState(null);
  const [refreshingTraffic, setRefreshingTraffic] = useState(false);
  const [trafficUpdateNotification, setTrafficUpdateNotification] = useState(null);
  const trafficRequestInFlightRef = useRef(false);
  const lastRerouteTimeRef = useRef(0);

  // Geocode initial query parameters on mount
  useEffect(() => {
    const fromParam = searchParams.get('from');
    const toParam = searchParams.get('to');
    const passengersParam = searchParams.get('passengers');
    const priorityParam = searchParams.get('priority');

    if (fromParam) {
      setOriginInput(fromParam);
      searchLocations(fromParam)
        .then(results => {
          if (results && results.length > 0) {
            setOrigin(results[0]);
            setOriginInput(results[0].name);
          }
        })
        .catch(err => console.warn("Failed to geocode from parameter:", err));
    }

    if (toParam) {
      setDestinationInput(toParam);
      searchLocations(toParam)
        .then(results => {
          if (results && results.length > 0) {
            setDestination(results[0]);
            setDestinationInput(results[0].name);
          }
        })
        .catch(err => console.warn("Failed to geocode to parameter:", err));
    }

    if (passengersParam) {
      const val = Math.min(6, Math.max(1, parseInt(passengersParam, 10) || 1));
      setPassengers(String(val));
    }

    if (priorityParam) {
      const p = priorityParam.toLowerCase();
      if (p === 'fastest') setPreference('Fastest');
      else if (p === 'co2' || p === 'eco') setPreference('Eco');
      else if (p === 'balanced') setPreference('Balanced');
    }
  }, [searchParams]);

  // Main Route Calculation Effect
  useEffect(() => {
    if (!origin || typeof origin.lng !== 'number' || typeof origin.lat !== 'number') return;
    if (!destination || typeof destination.lng !== 'number' || typeof destination.lat !== 'number') return;

    const oLng = Number(origin.lng.toFixed(5));
    const oLat = Number(origin.lat.toFixed(5));
    const dLng = Number(destination.lng.toFixed(5));
    const dLat = Number(destination.lat.toFixed(5));

    const prev = prevRequestCoordsRef.current;
    if (prev && prev.origin && prev.destination && 
        prev.profile === routeMode &&
        prev.avoidTolls === avoidTolls && prev.preferTransit === preferTransit &&
        prev.origin.lng === oLng && prev.origin.lat === oLat &&
        prev.destination.lng === dLng && prev.destination.lat === dLat) {
      return;
    }

    // Invalidate previous route
    setRoute(null);
    setAllRoutes([]);
    setRoutingError(null);
    setLoadingRoute(true);

    const controller = new AbortController();
    const { signal } = controller;

    // Fetch multimodal candidate options in parallel for DRIVING, CYCLING, WALKING, TRANSIT
    getMultimodalCandidates(origin, destination, avoidTolls, passengers, signal)
      .then(candidates => {
        setMultimodalCandidates(candidates);
      })
      .catch(err => {
        if (err.name !== 'AbortError') {
          console.warn("[PlanRoute] Multimodal candidate generation error:", err);
        }
      });

    // Handle Public Transit preference
    if (preferTransit) {
      getTransitRoute(origin, destination)
        .then(res => {
          setAllRoutes([res]);
          setRoute(res);
          prevRequestCoordsRef.current = { origin, destination, profile: routeMode, avoidTolls, preferTransit };
        })
        .catch(err => {
          console.warn("[PlanRoute] Transit routing unavailable:", err.message);
          setRoutingError(err.message);
          prevRequestCoordsRef.current = { origin, destination, profile: routeMode, avoidTolls, preferTransit };
        })
        .finally(() => {
          setLoadingRoute(false);
        });
      return;
    }

    // Handle Road routing (with optional avoidTolls)
    getRoute(origin, destination, routeMode, avoidTolls, signal)
      .then(res => {
        console.log("[PlanRoute] ORS Route Received:", res);
        prevRequestCoordsRef.current = { origin, destination, profile: routeMode, avoidTolls, preferTransit };
        const alternatives = res.allAlternatives || [res];
        setAllRoutes(alternatives);
        setRoute(res);
      })
      .catch(err => {
        if (err.name === 'AbortError') {
          return;
        }
        console.error("[PlanRoute] Routing calculation failed:", err);
        setRoutingError(err.message || "Failed to calculate route.");
      })
      .finally(() => {
        setLoadingRoute(false);
      });

    return () => {
      controller.abort();
    };
  }, [origin, destination, routeMode, avoidTolls, preferTransit, passengers]);

  // Route-Based Open Charge Map (OCM) EV Charging Station Fetching Effect
  useEffect(() => {
    if (!route || !route.geometry || !route.geometry.coordinates || route.geometry.coordinates.length === 0) {
      setEvStations([]);
      setEvStationsError(null);
      return;
    }

    setLoadingEVStations(true);
    setEvStationsError(null);

    const waypoints = route.geometry.coordinates.map(c => ({ lat: c[1], lng: c[0] }));

    getEVStationsAlongRoute(waypoints, 5.0)
      .then(res => {
        if (res.success) {
          setEvStations(res.stations || []);
          setEvStationsError(null);
        } else {
          setEvStations([]);
          setEvStationsError(res.message || 'Charging station data is temporarily unavailable.');
        }
      })
      .catch(err => {
        console.warn("[PlanRoute] EV Charging station retrieval error:", err);
        setEvStations([]);
        setEvStationsError('Charging station data is temporarily unavailable.');
      })
      .finally(() => {
        setLoadingEVStations(false);
      });
  }, [route]);

  // Update timestamp when route calculation succeeds
  useEffect(() => {
    if (route && route.trafficAvailable) {
      setLastTrafficCheckTime(Date.now());
    }
  }, [route]);

  // Controlled Traffic Polling Effect for DRIVING mode
  useEffect(() => {
    if (!origin || !destination || routeMode !== 'DRIVING' || preferTransit) {
      return;
    }

    const intervalId = setInterval(() => {
      handleManualTrafficRefresh(true);
    }, TRAFFIC_CONFIG.RECHECK_INTERVAL_MS);

    return () => {
      clearInterval(intervalId);
    };
  }, [origin, destination, routeMode, preferTransit, avoidTolls, passengers, route]);

  // Re-evaluates traffic metrics via Google Routes API backend proxy
  const handleManualTrafficRefresh = async (isBackground = false) => {
    if (!origin || !destination || routeMode !== 'DRIVING' || preferTransit) return;
    if (trafficRequestInFlightRef.current) return;

    trafficRequestInFlightRef.current = true;
    setRefreshingTraffic(true);

    try {
      const freshRoute = await getRoute(origin, destination, 'DRIVING', avoidTolls);
      const freshAlternatives = freshRoute.allAlternatives || [freshRoute];
      const now = Date.now();
      setLastTrafficCheckTime(now);

      const result = evaluateTrafficReroute(route, freshAlternatives, TRAFFIC_CONFIG.REROUTE_THRESHOLD_SEC, lastRerouteTimeRef.current);

      if (result.rerouteRecommended && result.bestAlternative) {
        setTrafficUpdateNotification({
          bestAlternative: result.bestAlternative,
          timeSavedMinutes: result.timeSavedMinutes
        });
      } else if (freshRoute) {
        setAllRoutes(freshAlternatives);
        if (route) {
          const matchingRoute = freshAlternatives.find(r => r.id === route.id) || freshRoute;
          setRoute(matchingRoute);
        }
      }
    } catch (err) {
      console.info("[PlanRoute] Dynamic traffic refresh exception:", err.message);
    } finally {
      trafficRequestInFlightRef.current = false;
      setRefreshingTraffic(false);
    }
  };

  const handleAcceptReroute = () => {
    if (trafficUpdateNotification && trafficUpdateNotification.bestAlternative) {
      setRoute(trafficUpdateNotification.bestAlternative);
      lastRerouteTimeRef.current = Date.now();
    }
    setTrafficUpdateNotification(null);
  };

  const handleDismissReroute = () => {
    setTrafficUpdateNotification(null);
  };

  // Optimization preference route selection effect
  useEffect(() => {
    if (!allRoutes || allRoutes.length === 0) return;
    if (allRoutes.length === 1) {
      setRoute(allRoutes[0]);
      return;
    }

    if (preference === 'Fastest') {
      const fastest = allRoutes.reduce((min, r) => {
        const durR = getEffectiveRouteDuration(r);
        const durMin = getEffectiveRouteDuration(min);
        if (durR < durMin) {
          return r;
        } else if (durR === durMin) {
          const distR = r.distanceKmNum || (r.distanceMeters / 1000);
          const distMin = min.distanceKmNum || (min.distanceMeters / 1000);
          const co2R = calculateRouteCO2(distR, r.mode, passengers);
          const co2Min = calculateRouteCO2(distMin, min.mode, passengers);
          if (co2R < co2Min) return r;
          if (co2R === co2Min) return distR < distMin ? r : min;
        }
        return min;
      }, allRoutes[0]);
      setRoute(fastest);
    } else if (preference === 'Eco') {
      const eco = allRoutes.reduce((min, r) => {
        const distMin = r.distanceKmNum || (r.distanceMeters / 1000);
        const distCurrent = min.distanceKmNum || (min.distanceMeters / 1000);
        const co2R = calculateRouteCO2(distMin, r.mode, passengers);
        const co2Current = calculateRouteCO2(distCurrent, min.mode, passengers);

        if (co2R < co2Current) {
          return r;
        } else if (Math.abs(co2R - co2Current) < 0.000001) {
          if (r.durationSeconds < min.durationSeconds) {
            return r;
          } else if (r.durationSeconds === min.durationSeconds) {
            return distMin < distCurrent ? r : min;
          }
        }
        return min;
      }, allRoutes[0]);
      setRoute(eco);
    } else if (preference === 'Balanced') {
      const balanced = selectBalancedRoute(allRoutes, passengers);
      setRoute(balanced);
    } else {
      setRoute(allRoutes[0]);
    }
  }, [allRoutes, preference, passengers]);

  // Real-location suggestion search/debounce for both fields is handled by the
  // shared <LocationAutocompleteInput /> component; we only need to react to
  // a location actually being picked.
  const handleSelectOrigin = (loc) => {
    setOrigin(loc);
    setOriginInput(loc.name);
  };

  const handleSelectDestination = (loc) => {
    setDestination(loc);
    setDestinationInput(loc.name);
  };

  const handleSwapLocations = () => {
    const tempLoc = origin;
    const tempInput = originInput;
    setOrigin(destination);
    setOriginInput(destinationInput);
    setDestination(tempLoc);
    setDestinationInput(tempInput);
  };

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser.");
      return;
    }

    setOriginSearching(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        try {
          // reverseGeocode(lng, lat) returns a display-name string only; the actual
          // route origin must stay pinned to the exact device coordinates returned
          // by the browser, not to whatever coordinates the geocoder resolves the
          // address to.
          const placeName = await reverseGeocode(longitude, latitude);
          const loc = { name: placeName || `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`, lat: latitude, lng: longitude };
          setOrigin(loc);
          setOriginInput(loc.name);
        } catch (err) {
          console.error("Reverse geocoding failed:", err);
          const fallbackLoc = { name: `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`, lat: latitude, lng: longitude };
          setOrigin(fallbackLoc);
          setOriginInput(fallbackLoc.name);
        } finally {
          setOriginSearching(false);
        }
      },
      (err) => {
        console.error("Geolocation error:", err);
        alert("Unable to get current location.");
        setOriginSearching(false);
      }
    );
  };

  const handleRetry = () => {
    setRoutingError(null);
    setLoadingRoute(true);

    if (preferTransit) {
      getTransitRoute(origin, destination)
        .then(res => {
          setAllRoutes([res]);
          setRoute(res);
        })
        .catch(err => setRoutingError(err.message))
        .finally(() => setLoadingRoute(false));
    } else {
      getRoute(origin, destination, routeMode, avoidTolls)
        .then(res => {
          const alternatives = res.allAlternatives || [res];
          setAllRoutes(alternatives);
          setRoute(res);
        })
        .catch(err => setRoutingError(err.message || "Failed to calculate route."))
        .finally(() => setLoadingRoute(false));
    }
  };

  const handleFindSustainableOptions = async () => {
    if (!origin || !destination) return;
    setLoadingRoute(true);
    setRoutingError(null);

    try {
      const candidates = await getMultimodalCandidates(origin, destination, avoidTolls, passengers);
      setMultimodalCandidates(candidates);

      if (preferTransit) {
        const res = await getTransitRoute(origin, destination);
        setAllRoutes([res]);
        setRoute(res);
      } else {
        const res = await getRoute(origin, destination, routeMode, avoidTolls);
        console.log("[PlanRoute] Route Options Received:", res);
        prevRequestCoordsRef.current = { origin, destination, profile: routeMode, avoidTolls, preferTransit };
        const alternatives = res.allAlternatives || [res];
        setAllRoutes(alternatives);

        let selectedOpt = alternatives[0];

        if (preference === 'Fastest') {
          selectedOpt = alternatives.reduce((min, r) => r.durationSeconds < min.durationSeconds ? r : min, alternatives[0]);
        } else if (preference === 'Balanced') {
          selectedOpt = selectBalancedRoute(alternatives, passengers) || alternatives[0];
        } else {
          selectedOpt = alternatives.reduce((min, r) => {
            const distMin = r.distanceKmNum || (r.distanceMeters / 1000);
            const distCurrent = min.distanceKmNum || (min.distanceMeters / 1000);
            const co2R = calculateRouteCO2(distMin, r.mode, passengers);
            const co2Current = calculateRouteCO2(distCurrent, min.mode, passengers);

            if (co2R < co2Current) {
              return r;
            } else if (Math.abs(co2R - co2Current) < 0.000001) {
              if (r.durationSeconds < min.durationSeconds) {
                return r;
              } else if (r.durationSeconds === min.durationSeconds) {
                return distMin < distCurrent ? r : min;
              }
            }
            return min;
          }, alternatives[0]);
        }

        setRoute(selectedOpt);
        const distKmNum = selectedOpt.distanceKmNum || (selectedOpt.distanceMeters / 1000);
        saveJourney({
          origin: origin || originInput || 'Vijay Nagar, Indore',
          destination: destination || destinationInput || 'Rau, Indore',
          mode: selectedOpt.mode || routeMode,
          distanceKmNum: distKmNum,
          distanceKm: selectedOpt.distanceKm,
          durationMinutes: selectedOpt.durationMinutes,
          durationSeconds: selectedOpt.durationSeconds,
          costInr: selectedOpt.cost || (routeMode === 'DRIVING' ? calculateCarpoolCost(distKmNum, passengers) : 0),
          co2Kg: selectedOpt.co2Kg || calculateRouteCO2(distKmNum, selectedOpt.mode || routeMode, passengers),
          passengers: passengers,
          preference: preference,
          source: 'PLAN_ROUTE'
        });
      }
    } catch (err) {
      console.error("[PlanRoute] Manual search failed:", err);
      setRoutingError(err.message || "Failed to calculate route.");
    } finally {
      setLoadingRoute(false);
    }
  };

  // Compute sustainability metrics for active route
  const distKmNum = route ? (route.distanceKmNum || (route.distanceMeters / 1000)) : 8.2;
  const currentMode = preferTransit ? 'TRANSIT' : (route ? (route.mode || routeMode) : routeMode);

  const rawCO2 = calculateRouteCO2(distKmNum, currentMode, passengers);
  const displayCO2 = rawCO2.toFixed(1);

  const displayCost = currentMode === 'DRIVING'
    ? calculateCarpoolCost(distKmNum, passengers)
    : (route && route.cost ? route.cost : 0);

  const displayScore = calculateSustainabilityScore(distKmNum, passengers);

  const rawExplanation = getRecommendationExplanation({ 
    route, 
    allRoutes, 
    preference, 
    mode: currentMode, 
    passengers, 
    distanceKm: distKmNum 
  });
  const recBullets = typeof rawExplanation === 'string' ? rawExplanation.split('\n') : (Array.isArray(rawExplanation) ? rawExplanation : ['Optimal eco-friendly route']);

  const getRecommendationHeader = () => {
    if (preference === 'Eco') return { title: 'Most Eco-Friendly Option', label: 'RECOMMENDED FOR LOW EMISSIONS', icon: 'eco' };
    if (preference === 'Fastest') return { title: 'Fastest Travel Option', label: 'RECOMMENDED FOR SPEED', icon: 'bolt' };
    return { title: 'Recommended Green Route', label: 'BALANCED CHOICE', icon: 'eco' };
  };

  const recMeta = getRecommendationHeader();

  return (
    <div className="flex-1 w-full flex flex-col md:flex-row md:overflow-hidden min-h-0">
      {/* Left Input & Selection Drawer (25%) */}
      <div id="plan-route-input-drawer" className="w-full md:w-[380px] lg:w-[420px] bg-surface-container-lowest border-b md:border-b-0 md:border-r border-tertiary-fixed p-4 md:p-6 md:overflow-y-auto shrink-0 flex flex-col gap-4 shadow-sm z-10">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="material-symbols-outlined text-primary text-2xl">route</span>
            <h1 className="text-headline-sm font-headline-sm text-on-surface">Plan Route</h1>
          </div>
          <p className="text-body-md font-body-md text-on-surface-variant">Compare eco-friendly travel options with live traffic aware routing.</p>
        </div>

        {/* Form Inputs */}
        <div className="space-y-4">
          {/* Origin Input */}
          <div>
            <label className="text-label-xs font-label-xs text-on-surface-variant mb-1 block">Start Location</label>
            <LocationAutocompleteInput
              value={originInput}
              onInputChange={setOriginInput}
              onSelectLocation={handleSelectOrigin}
              selectedLocation={origin}
              placeholder="Enter start location..."
              leftIcon="my_location"
              leftIconClassName="text-primary"
              rightSlot={(
                <button 
                  type="button"
                  onClick={handleUseCurrentLocation}
                  title="Use Current Location"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-primary transition-colors p-1"
                >
                  <span className={`material-symbols-outlined text-sm ${originSearching ? 'animate-spin text-primary' : ''}`}>
                    {originSearching ? 'sync' : 'near_me'}
                  </span>
                </button>
              )}
            />
          </div>

          {/* Swap Locations Button */}
          <div className="flex justify-center -my-2">
            <button 
              type="button"
              onClick={handleSwapLocations}
              title="Swap Locations"
              className="w-8 h-8 rounded-full bg-surface-container border border-tertiary-fixed flex items-center justify-center text-on-surface-variant hover:text-primary hover:bg-white transition-colors cursor-pointer shadow-sm"
            >
              <span className="material-symbols-outlined text-sm">swap_vert</span>
            </button>
          </div>

          {/* Destination Input */}
          <div>
            <label className="text-label-xs font-label-xs text-on-surface-variant mb-1 block">Destination</label>
            <LocationAutocompleteInput
              value={destinationInput}
              onInputChange={setDestinationInput}
              onSelectLocation={handleSelectDestination}
              selectedLocation={destination}
              placeholder="Enter destination..."
              leftIcon="location_on"
              leftIconClassName="text-error"
            />
          </div>

          {/* Passengers Selector (1-6 Passengers) */}
          <div>
            <label className="text-label-xs font-label-xs text-on-surface-variant mb-1 block">Passengers</label>
            <div className="relative">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-sm">group</span>
              <select 
                value={passengers}
                onChange={(e) => {
                  const val = Math.min(6, Math.max(1, parseInt(e.target.value, 10) || 1));
                  setPassengers(String(val));
                }}
                className="w-full bg-white rounded-lg border border-tertiary-fixed pl-9 pr-3 py-2 text-body-md font-body-md text-on-surface text-sm appearance-none outline-none focus:border-primary cursor-pointer"
              >
                <option value="1">1 Passenger (Solo)</option>
                <option value="2">2 Passengers (Carpool)</option>
                <option value="3">3 Passengers (Carpool)</option>
                <option value="4">4 Passengers (Carpool)</option>
                <option value="5">5 Passengers (Carpool)</option>
                <option value="6">6 Passengers (Carpool)</option>
              </select>
              <span className="material-symbols-outlined absolute right-2 top-1/2 -translate-y-1/2 text-on-surface-variant text-sm pointer-events-none">expand_more</span>
            </div>
          </div>

          {/* Optimization Preference */}
          <div>
            <label className="text-label-xs font-label-xs text-on-surface-variant mb-1 block">Optimization Preference</label>
            <div className="bg-surface-container-low p-1 rounded-lg border border-tertiary-fixed flex gap-1">
              <button 
                type="button"
                onClick={() => setPreference('Fastest')}
                className={`flex-1 py-1.5 text-label-xs font-label-xs rounded-md transition-colors cursor-pointer ${
                  preference === 'Fastest' 
                    ? 'bg-white text-primary shadow-sm border border-tertiary-fixed' 
                    : 'text-on-surface-variant hover:text-primary'
                }`}
              >
                Fastest
              </button>
              <button 
                type="button"
                onClick={() => setPreference('Eco')}
                className={`flex-1 py-1.5 text-label-xs font-label-xs rounded-md transition-colors cursor-pointer ${
                  preference === 'Eco' 
                    ? 'bg-white text-primary shadow-sm border border-tertiary-fixed' 
                    : 'text-on-surface-variant hover:text-primary'
                }`}
              >
                Eco-Friendly
              </button>
              <button 
                type="button"
                onClick={() => setPreference('Balanced')}
                className={`flex-1 py-1.5 text-label-xs font-label-xs rounded-md transition-colors cursor-pointer ${
                  preference === 'Balanced' 
                    ? 'bg-white text-primary shadow-sm border border-tertiary-fixed' 
                    : 'text-on-surface-variant hover:text-primary'
                }`}
              >
                Balanced
              </button>
            </div>
          </div>

          {/* Multimodal Options Candidate Engine UI */}
          {multimodalCandidates && multimodalCandidates.length > 0 && (
            <div>
              <label className="text-label-xs font-label-xs text-on-surface-variant mb-1.5 block">Multimodal Options</label>
              <div className="flex flex-col gap-2">
                {multimodalCandidates.map((cand) => {
                  const isSelected = routeMode === cand.mode && !preferTransit;
                  const icons = { DRIVING: 'directions_car', CYCLING: 'directions_bike', WALKING: 'directions_walk', TRANSIT: 'directions_bus' };
                  const labels = { DRIVING: 'Driving', CYCLING: 'Bike', WALKING: 'Walking', TRANSIT: 'Transit' };

                  return (
                    <div 
                      key={cand.mode}
                      onClick={() => {
                        if (!cand.available) return;
                        if (cand.mode === 'TRANSIT') {
                          setPreferTransit(true);
                        } else {
                          setPreferTransit(false);
                          setRouteMode(cand.mode);
                          saveJourney({
                            origin: origin || originInput || 'Vijay Nagar, Indore',
                            destination: destination || destinationInput || 'Rau, Indore',
                            mode: cand.mode,
                            distanceKmNum: cand.distanceKmNum || (cand.distanceMeters / 1000),
                            distanceKm: cand.distanceKm,
                            durationMinutes: cand.durationMinutes,
                            durationSeconds: cand.durationSeconds,
                            costInr: cand.cost,
                            co2Kg: cand.co2Kg,
                            passengers: passengers,
                            preference: preference,
                            source: 'PLAN_ROUTE'
                          });
                        }
                      }}
                      className={`p-2.5 rounded-lg border transition-all ${
                        !cand.available
                          ? 'bg-surface-container-lowest border-outline-variant/30 opacity-60 cursor-not-allowed'
                          : isSelected
                          ? 'bg-primary-container/20 border-primary shadow-sm cursor-pointer'
                          : 'bg-white border-tertiary-fixed hover:border-primary/50 cursor-pointer'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className={`material-symbols-outlined text-sm ${isSelected ? 'text-primary' : 'text-on-surface-variant'}`}>
                            {icons[cand.mode] || 'directions'}
                          </span>
                          <span className={`text-label-sm font-label-sm ${isSelected ? 'text-primary font-semibold' : 'text-on-surface'}`}>
                            {labels[cand.mode] || cand.mode}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-label-xs font-label-xs">
                          <span className="text-on-surface-variant">{cand.durationMinutes}</span>
                          <span className="font-semibold text-primary">{(cand.co2Kg != null ? Number(cand.co2Kg).toFixed(1) : '0.0')} kg CO₂</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* EV Charging Stations Along Route Section */}
          <div className="border-t border-outline-variant/30 pt-3 mt-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5 text-on-surface">
                <span className="material-symbols-outlined text-primary text-sm">ev_station</span>
                <span className="text-label-xs font-label-xs uppercase tracking-wider font-semibold">EV Charging Stations Along Route</span>
              </div>
              <span className="text-[10px] text-on-surface-variant">5.0 km corridor</span>
            </div>

            {loadingEVStations ? (
              <div className="flex items-center gap-2 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-lg p-2.5 text-label-xs font-label-xs animate-pulse">
                <span className="material-symbols-outlined text-sm animate-spin">sync</span>
                <span>Finding charging stations along your route...</span>
              </div>
            ) : evStationsError ? (
              <div className="bg-amber-50 text-amber-800 border border-amber-200 rounded-lg p-2.5 text-label-xs font-label-xs">
                {evStationsError}
              </div>
            ) : evStations.length > 0 ? (
              <div className="space-y-2 max-h-48 overflow-y-auto scrollbar-none pr-1">
                {evStations.map((st) => (
                  <div key={st.id} className="bg-surface-container-low p-2.5 rounded-lg border border-outline-variant/30 text-label-xs">
                    <div className="flex justify-between items-start mb-1">
                      <span className="font-semibold text-on-surface">{st.name}</span>
                      <span className="text-emerald-700 font-semibold text-[10px] bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                        {st.distanceFromRouteKm} km from route
                      </span>
                    </div>
                    <p className="text-on-surface-variant text-[11px] mb-1">{st.address || st.city}</p>
                    <div className="flex items-center justify-between text-[10px] text-on-surface-variant border-t border-outline-variant/20 pt-1">
                      <span>Connectors: {st.connectors?.length > 0 ? st.connectors.map(c => `${c.powerKw || 22} kW`).join(', ') : 'Fast Charger'}</span>
                      <span className="text-[9px] text-gray-400">OCM Verified</span>
                    </div>
                  </div>
                ))}
                <div className="text-[9px] text-on-surface-variant/70 italic text-right pt-1">
                  Data provided by Open Charge Map
                </div>
              </div>
            ) : (
              <div className="bg-surface-container-low text-on-surface-variant border border-outline-variant/30 rounded-lg p-2.5 text-label-xs">
                No charging stations found near this route.
              </div>
            )}
          </div>

          {/* Advanced Options Toggle */}
          <div>
            <button 
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="text-label-xs font-label-xs text-primary hover:underline flex items-center gap-1 cursor-pointer"
            >
              <span>{showAdvanced ? 'Hide' : 'Show'} Route Options</span>
              <span className="material-symbols-outlined text-sm">{showAdvanced ? 'expand_less' : 'expand_more'}</span>
            </button>

            {showAdvanced && (
              <div className="mt-2 space-y-2 bg-surface-container-low p-3 rounded-lg border border-tertiary-fixed">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input 
                    type="checkbox"
                    checked={avoidTolls}
                    onChange={(e) => setAvoidTolls(e.target.checked)}
                    className="rounded text-primary focus:ring-primary border-outline-variant h-4 w-4" 
                  />
                  <span className="text-body-md font-body-md text-sm text-on-surface-variant">Avoid toll roads</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input 
                    type="checkbox"
                    checked={preferTransit}
                    onChange={(e) => setPreferTransit(e.target.checked)}
                    className="rounded text-primary focus:ring-primary border-outline-variant h-4 w-4" 
                  />
                  <span className="text-body-md font-body-md text-sm text-on-surface-variant">Prefer public transit</span>
                </label>
              </div>
            )}
          </div>
          <button 
            type="button"
            onClick={handleFindSustainableOptions}
            disabled={loadingRoute || !origin || !destination}
            className={`w-full text-on-primary text-label-sm font-label-sm py-3 rounded-lg transition-colors mt-2 card-shadow flex items-center justify-center gap-2 ${
              loadingRoute || !origin || !destination 
                ? 'bg-primary-container/60 cursor-not-allowed' 
                : 'bg-primary-container hover:bg-primary cursor-pointer'
            }`}
          >
            {loadingRoute ? (
              <>
                <span className="material-symbols-outlined text-sm animate-spin">sync</span>
                <span>Finding Sustainable Route...</span>
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>eco</span>
                <span>Find Sustainable Options</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Right Interactive Map Area (75%) */}
      <div id="plan-route-map-container" className="flex-1 relative bg-surface-container-low min-h-[280px] h-[320px] sm:h-[400px] md:h-[calc(100vh-64px)] w-full flex flex-col">
        <GreenMoveMap 
          origin={origin} 
          destination={destination} 
          route={route}
          evStations={evStations}
          onRecenterRef={recenterMapRef} 
        />

        {/* Bottom Results Overlay */}
        <div className="relative md:absolute md:bottom-5 left-0 right-0 md:left-4 md:right-4 lg:left-8 lg:right-8 z-20 pointer-events-auto md:pointer-events-none flex justify-center p-3 md:p-0 mt-3 md:mt-0">
          {/* Recommended Route Card */}
          <div className="bg-white/95 backdrop-blur-md rounded-2xl p-3 sm:p-4 lg:p-5 card-shadow border border-tertiary-fixed w-full max-w-3xl pointer-events-auto">
            {/* Traffic Update Notification Card */}
            {trafficUpdateNotification && (
              <div className="bg-primary-container/20 border border-primary/30 rounded-xl p-3 mb-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-sm">
                <div className="flex items-center gap-2.5">
                  <span className="material-symbols-outlined text-primary text-xl">traffic</span>
                  <div>
                    <div className="text-label-sm font-label-sm text-primary">Traffic Update Available</div>
                    <div className="text-label-xs font-label-xs text-on-surface-variant">
                      A faster route is available (saves ~{trafficUpdateNotification.timeSavedMinutes} min).
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={handleAcceptReroute}
                    className="px-3 py-1.5 bg-primary text-on-primary rounded-lg text-label-xs font-label-xs hover:bg-primary/90 transition-colors shadow-sm cursor-pointer"
                  >
                    Switch Route
                  </button>
                  <button
                    type="button"
                    onClick={handleDismissReroute}
                    className="px-2.5 py-1.5 text-on-surface-variant hover:text-on-surface rounded-lg text-label-xs font-label-xs cursor-pointer"
                  >
                    Keep Current
                  </button>
                </div>
              </div>
            )}

            {/* Loading status state */}
            {loadingRoute && (
              <div className="flex items-center gap-2 bg-primary-container/20 text-primary border border-primary/20 rounded-lg p-2.5 text-label-sm font-label-sm mb-3 animate-pulse">
                <span className="material-symbols-outlined text-sm animate-spin">sync</span>
                <span>Finding the best route...</span>
              </div>
            )}
            {/* Error status state with retry */}
            {routingError && (
              <div className="flex items-center justify-between gap-2 bg-error-container/20 border border-error/30 rounded-lg p-2.5 text-error text-label-sm font-label-sm mb-3">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="material-symbols-outlined text-sm shrink-0">warning</span>
                  <span className="truncate">
                    {routingError.includes('Public transit') 
                      ? routingError 
                      : "Unable to calculate route. Please check your locations and try again."}
                  </span>
                </div>
                {!routingError.includes('Public transit') && (
                  <button 
                    type="button" 
                    onClick={handleRetry}
                    className="px-2.5 py-1 bg-error text-white rounded-md text-label-xs font-label-xs hover:bg-error/90 transition-colors shrink-0 cursor-pointer shadow-sm"
                  >
                    Try Again
                  </button>
                )}
              </div>
            )}

            <div className="flex flex-col lg:flex-row justify-between gap-4 lg:gap-6">
              {/* Left: Recommendation Summary */}
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <span className="material-symbols-outlined text-secondary" style={{ fontVariationSettings: "'FILL' 1" }}>{recMeta.icon}</span>
                  <span className="text-label-sm font-label-sm text-secondary uppercase tracking-wider">{recMeta.label}</span>
                </div>
                <div className="flex items-baseline gap-4 mb-3">
                  <h2 className="text-headline-lg font-headline-lg text-on-surface">
                    {route ? route.durationMinutes : '25 min'}
                  </h2>
                  <span className="text-body-lg font-body-lg text-on-surface-variant">
                    ₹{displayCost} • {route ? route.distanceKm : '8.2 km'}
                  </span>
                </div>
                <div className="flex items-center gap-4">
                  <div className="bg-surface-container-low px-3 py-1.5 rounded-md flex items-center gap-2 border border-outline-variant/30">
                    <span className="material-symbols-outlined text-primary text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>co2</span>
                    <span className="text-label-sm font-label-sm text-primary">{displayCO2} kg / person</span>
                  </div>
                  <div className="flex items-center gap-2 text-on-surface-variant">
                    <div className="w-24 h-2 bg-surface-variant rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-primary to-secondary-fixed rounded-full" style={{ width: `${displayScore}%` }}></div>
                    </div>
                    <span className="text-label-xs font-label-xs">Score: {displayScore}/100</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-label-xs font-label-xs bg-surface-container border border-outline-variant/40 text-on-surface-variant">
                    <span className="material-symbols-outlined text-[14px] text-on-surface-variant">
                      {route?.trafficAvailable ? 'traffic' : 'speed'}
                    </span>
                    <span>{route?.trafficAvailable ? `Traffic: ${route.trafficStatus}` : 'Traffic: Unavailable'}</span>
                  </div>
                  {routeMode === 'DRIVING' && !preferTransit && (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleManualTrafficRefresh(false)}
                        disabled={refreshingTraffic}
                        className="px-2 py-1 bg-surface-variant hover:bg-surface-container text-on-surface-variant rounded-md text-label-xs font-label-xs flex items-center gap-1 cursor-pointer transition-colors border border-outline-variant/30"
                        title="Check for live traffic updates"
                      >
                        <span className={`material-symbols-outlined text-[14px] ${refreshingTraffic ? 'animate-spin text-primary' : ''}`}>sync</span>
                        <span>Update Traffic</span>
                      </button>
                      {lastTrafficCheckTime && (
                        <span className="text-[11px] text-on-surface-variant/80 font-label-xs">
                          {formatLastChecked(lastTrafficCheckTime)}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
              {/* Right: Explainable Rec */}
              <div className="flex-1 bg-surface-container-low rounded-lg p-3 lg:p-4 border border-tertiary-fixed flex items-center gap-4">
                <div className="relative w-14 h-14 shrink-0 flex items-center justify-center">
                  <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                    <path className="text-surface-variant" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeWidth="3"></path>
                    <path className="text-primary" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeDasharray={`${displayScore}, 100`} strokeWidth="3"></path>
                  </svg>
                  <span className="absolute text-label-sm font-label-sm text-primary">{displayScore}%</span>
                </div>
                <div>
                  <h3 className="text-label-sm font-label-sm text-on-surface mb-1">{recMeta.title}</h3>
                  <ul className="text-label-xs font-label-xs text-on-surface-variant space-y-1">
                    {recBullets.map((bullet, idx) => (
                      <li key={idx} className="flex items-center gap-1">
                        <span className="material-symbols-outlined text-[14px] text-primary">check_circle</span>
                        <span>{bullet}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>

            {/* Route Alternatives Selector Bar */}
            {allRoutes.length > 1 && (
              <div className="flex items-center gap-2 mt-3 pt-3 border-t border-tertiary-fixed/60">
                <span className="text-label-xs font-label-xs text-on-surface-variant shrink-0">Route Alternatives:</span>
                <div className="flex gap-2 overflow-x-auto scrollbar-none">
                  {allRoutes.map((alt, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setRoute(alt)}
                      className={`px-2.5 py-1 rounded-md text-label-xs font-label-xs transition-colors cursor-pointer shrink-0 ${
                        route?.id === alt.id
                          ? 'bg-primary text-on-primary font-semibold shadow-sm'
                          : 'bg-surface-container hover:bg-surface-variant text-on-surface-variant'
                      }`}
                    >
                      {alt.durationMinutes} ({alt.distanceKm})
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
