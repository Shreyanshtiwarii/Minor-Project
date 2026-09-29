import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { searchLocations, reverseGeocode } from '../services/geocodingService';
import { getMultimodalCandidates } from '../services/routingService';
import { saveJourney } from '../services/historyService';
import { 
  selectBalancedRoute, 
  getEffectiveRouteDuration, 
  calculateSustainabilityScore,
  calculateRouteCO2,
  calculateCarpoolCost 
} from '../utils/sustainabilityCalculations';

export default function CompareOptions() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  // Search & Location States
  const [origin, setOrigin] = useState(null);
  const [destination, setDestination] = useState(null);
  const [originInput, setOriginInput] = useState('');
  const [destinationInput, setDestinationInput] = useState('');

  // Autocomplete UI States
  const [originSuggestions, setOriginSuggestions] = useState([]);
  const [destinationSuggestions, setDestinationSuggestions] = useState([]);
  const [originSearching, setOriginSearching] = useState(false);
  const [destinationSearching, setDestinationSearching] = useState(false);
  const [originError, setOriginError] = useState(null);
  const [destinationError, setDestinationError] = useState(null);

  // Form Options
  const [passengers, setPassengers] = useState('1');
  const [preference, setPreference] = useState('Balanced');

  // Calculation & Candidate States
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [candidates, setCandidates] = useState([]);
  const [calcError, setCalcError] = useState(null);
  const [hasSearched, setHasSearched] = useState(false);

  // Helper: Execute Multimodal Route Candidates Comparison
  const fetchAndCalculateCandidates = async (origObj, destObj, passNum) => {
    if (!origObj || !destObj) return;
    if (origObj.name === destObj.name || (origObj.lat === destObj.lat && origObj.lng === destObj.lng)) {
      setCalcError("Origin and Destination cannot be the same location.");
      return;
    }

    setLoadingCandidates(true);
    setCalcError(null);
    setHasSearched(true);

    try {
      const cands = await getMultimodalCandidates(origObj, destObj, false, passNum);
      setCandidates(cands || []);
    } catch (err) {
      console.error("[CompareOptions] Candidate calculation failed:", err);
      setCalcError(err.message || "Failed to calculate travel candidates.");
    } finally {
      setLoadingCandidates(false);
    }
  };

  // Parse URL Search Parameters on Mount & Auto-Calculate on Refresh (F5 Resilience)
  useEffect(() => {
    const fromParam = searchParams.get('from');
    const toParam = searchParams.get('to');
    const passengersParam = searchParams.get('passengers');
    const preferenceParam = searchParams.get('preference');

    const passValue = (passengersParam && parseInt(passengersParam, 10) >= 1 && parseInt(passengersParam, 10) <= 6)
      ? passengersParam 
      : '1';
    setPassengers(passValue);

    if (preferenceParam && ['Fastest', 'Eco', 'Balanced'].includes(preferenceParam)) {
      setPreference(preferenceParam);
    }

    if (fromParam && toParam) {
      setOriginInput(fromParam);
      setDestinationInput(toParam);

      Promise.all([searchLocations(fromParam), searchLocations(toParam)])
        .then(([origResults, destResults]) => {
          if (origResults && origResults.length > 0 && destResults && destResults.length > 0) {
            const oObj = origResults[0];
            const dObj = destResults[0];
            setOrigin(oObj);
            setOriginInput(oObj.name);
            setDestination(dObj);
            setDestinationInput(dObj.name);

            // Trigger comparison calculation directly for URL queries
            fetchAndCalculateCandidates(oObj, dObj, passValue);
          }
        })
        .catch(err => console.error("URL location search error:", err));
    }
  }, [searchParams]);

  // Autocomplete debounced search effect for Origin
  useEffect(() => {
    if (!originInput || originInput.trim().length < 2) {
      setOriginSuggestions([]);
      setOriginSearching(false);
      return;
    }
    if (origin && origin.name === originInput) return;

    setOriginSearching(true);
    setOriginError(null);
    const timer = setTimeout(() => {
      searchLocations(originInput)
        .then(results => {
          setOriginSuggestions(results || []);
          if (!results || results.length === 0) setOriginError("No matching locations found");
        })
        .catch(() => setOriginError("Unable to search location"))
        .finally(() => setOriginSearching(false));
    }, 300);

    return () => clearTimeout(timer);
  }, [originInput, origin]);

  // Autocomplete debounced search effect for Destination
  useEffect(() => {
    if (!destinationInput || destinationInput.trim().length < 2) {
      setDestinationSuggestions([]);
      setDestinationSearching(false);
      return;
    }
    if (destination && destination.name === destinationInput) return;

    setDestinationSearching(true);
    setDestinationError(null);
    const timer = setTimeout(() => {
      searchLocations(destinationInput)
        .then(results => {
          setDestinationSuggestions(results || []);
          if (!results || results.length === 0) setDestinationError("No matching locations found");
        })
        .catch(() => setDestinationError("Unable to search location"))
        .finally(() => setDestinationSearching(false));
    }, 300);

    return () => clearTimeout(timer);
  }, [destinationInput, destination]);

  // Swap Origin and Destination
  const handleSwap = () => {
    const tempOrigin = origin;
    const tempOriginInput = originInput;

    setOrigin(destination);
    setOriginInput(destinationInput);

    setDestination(tempOrigin);
    setDestinationInput(tempOriginInput);
  };

  // Browser Geolocation helper for Origin
  const handleBrowserGeolocation = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { longitude, latitude } = pos.coords;
        const placeName = await reverseGeocode(longitude, latitude);
        const locObj = { name: placeName, lng: longitude, lat: latitude };
        setOrigin(locObj);
        setOriginInput(placeName);
      },
      (err) => console.error("Geolocation error:", err)
    );
  };

  // Trigger manual Compare button action
  const handleCompareClick = () => {
    if (!origin || !destination) return;
    setSearchParams({
      from: origin.name,
      to: destination.name,
      passengers: passengers,
      preference: preference
    });
    fetchAndCalculateCandidates(origin, destination, passengers);
  };

  // Navigation handlers
  const handleSelectRoute = (cand) => {
    const rawOrig = origin || originInput || 'Palasia, Indore';
    const rawDest = destination || destinationInput || 'Airport, Indore';

    saveJourney({
      origin: rawOrig,
      destination: rawDest,
      mode: cand.mode,
      distanceKmNum: cand.distanceKmNum || (cand.distanceMeters / 1000),
      distanceKm: cand.distanceKm,
      durationMinutes: cand.durationMinutes,
      durationSeconds: cand.durationSeconds,
      costInr: cand.cost,
      co2Kg: cand.co2Kg,
      passengers: passengers,
      preference: preference,
      source: 'COMPARE'
    });

    const fromName = typeof rawOrig === 'string' ? rawOrig : rawOrig.name;
    const toName = typeof rawDest === 'string' ? rawDest : rawDest.name;

    navigate(`/plan-route?from=${encodeURIComponent(fromName)}&to=${encodeURIComponent(toName)}&mode=${cand.mode}&passengers=${passengers}&priority=${preference}`);
  };

  const handleBookSeat = (cand) => {
    const rawOrig = origin || originInput || 'Palasia, Indore';
    const rawDest = destination || destinationInput || 'Airport, Indore';

    saveJourney({
      origin: rawOrig,
      destination: rawDest,
      mode: cand.mode,
      distanceKmNum: cand.distanceKmNum || (cand.distanceMeters / 1000),
      distanceKm: cand.distanceKm,
      durationMinutes: cand.durationMinutes,
      durationSeconds: cand.durationSeconds,
      costInr: cand.cost,
      co2Kg: cand.co2Kg,
      passengers: passengers,
      preference: preference,
      source: 'COMPARE'
    });

    navigate('/ev-carpool', {
      state: {
        origin: rawOrig,
        destination: rawDest,
        passengers: passengers,
        cost: cand.cost,
        co2: cand.co2Kg
      }
    });
  };

  // Determine Dynamic Recommendation based on selected preference
  const availableCandidates = candidates.filter(c => c.available);
  
  const getRecommendedCandidate = () => {
    if (!availableCandidates || availableCandidates.length === 0) return null;
    if (availableCandidates.length === 1) return availableCandidates[0];

    const passNum = parseInt(passengers, 10) || 1;

    if (preference === 'Fastest') {
      return availableCandidates.reduce((min, c) => {
        const durC = getEffectiveRouteDuration(c);
        const durMin = getEffectiveRouteDuration(min);
        return durC < durMin ? c : min;
      }, availableCandidates[0]);
    } else if (preference === 'Eco') {
      return availableCandidates.reduce((min, c) => {
        const distC = c.distanceKmNum || (c.distanceMeters / 1000);
        const distMin = min.distanceKmNum || (min.distanceMeters / 1000);
        const co2C = calculateRouteCO2(distC, c.mode, passNum);
        const co2Min = calculateRouteCO2(distMin, min.mode, passNum);
        return co2C < co2Min ? c : min;
      }, availableCandidates[0]);
    } else {
      // Balanced Mode (40% Time + 30% Cost + 30% CO2)
      return selectBalancedRoute(availableCandidates, passNum);
    }
  };

  const recommendedCand = getRecommendedCandidate();

  // Summary Chart Scaled Max Metrics
  const maxCO2 = availableCandidates.length > 0
    ? Math.max(...availableCandidates.map(c => c.co2Kg))
    : 1;
  const maxCost = availableCandidates.length > 0
    ? Math.max(...availableCandidates.map(c => c.cost))
    : 1;

  const isFormValid = origin && destination && (origin.name !== destination.name);

  return (
    <main className="flex-1 p-4 md:p-6 lg:p-8 w-full max-w-7xl mx-auto overflow-y-auto scrollbar-none">
      {/* Header */}
      <header className="mb-6 flex flex-col md:flex-row md:items-end justify-between gap-2 border-b border-outline-variant/30 pb-4">
        <div>
          <h2 className="text-headline-lg font-headline-lg text-on-surface">Compare your options</h2>
          {origin && destination ? (
            <p className="text-body-md font-body-md text-primary font-medium mt-1 flex items-center gap-2">
              <span>{origin.name.split(',')[0]}</span>
              <span className="material-symbols-outlined text-sm">arrow_forward</span>
              <span>{destination.name.split(',')[0]}</span>
              <span className="text-on-surface-variant font-normal text-xs ml-2">({passengers} Passenger{parseInt(passengers,10) > 1 ? 's' : ''})</span>
            </p>
          ) : (
            <p className="text-body-md font-body-md text-on-surface-variant mt-1">
              Choose your journey parameters to compare real travel options across modes.
            </p>
          )}
        </div>
      </header>

      {/* Journey Search Input Panel (Preserved Round 1A Infrastructure) */}
      <section className="bg-surface-container-lowest border border-tertiary-fixed rounded-2xl p-4 md:p-6 mb-8 shadow-sm">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-4">
          
          {/* Inputs Container */}
          <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4 relative">
            
            {/* Origin Search Field */}
            <div className="relative">
              <label className="text-label-xs font-label-xs text-on-surface-variant mb-1 block">From (Origin)</label>
              <div className="flex items-center bg-white rounded-lg border border-tertiary-fixed px-3 py-2 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20 transition-all">
                <span className="material-symbols-outlined text-primary text-sm mr-2" style={{ fontVariationSettings: "'FILL' 1" }}>my_location</span>
                <input
                  type="text"
                  value={originInput}
                  onChange={(e) => setOriginInput(e.target.value)}
                  placeholder="Search starting location..."
                  className="bg-transparent border-none focus:ring-0 text-body-md font-body-md text-on-surface w-full p-0 outline-none placeholder:text-outline text-sm"
                />
                <button
                  type="button"
                  onClick={handleBrowserGeolocation}
                  title="Use current location"
                  className="text-on-surface-variant hover:text-primary cursor-pointer flex items-center ml-1"
                >
                  <span className="material-symbols-outlined text-sm">my_location</span>
                </button>
              </div>
              {/* Origin Autocomplete Suggestions List */}
              {originSuggestions.length > 0 && (
                <ul className="absolute top-full left-0 right-0 bg-white border border-outline-variant rounded-lg mt-1 shadow-md max-h-48 overflow-y-auto z-50">
                  {originSuggestions.map((place, idx) => (
                    <li
                      key={idx}
                      onClick={() => {
                        setOrigin(place);
                        setOriginInput(place.name);
                        setOriginSuggestions([]);
                      }}
                      className="px-3 py-2 hover:bg-surface-container cursor-pointer text-sm text-on-surface border-b border-outline-variant/30 last:border-b-0"
                    >
                      {place.name}
                    </li>
                  ))}
                </ul>
              )}
              {originSearching && (
                <div className="absolute top-full left-0 right-0 bg-white border border-outline-variant rounded-lg mt-1 p-2.5 text-label-xs font-label-xs text-on-surface-variant z-50 flex items-center gap-2">
                  <span className="material-symbols-outlined text-sm animate-spin text-primary">sync</span> Searching locations...
                </div>
              )}
              {originError && originInput.trim().length >= 2 && !originSearching && (
                <div className="absolute top-full left-0 right-0 bg-white border border-outline-variant rounded-lg mt-1 p-2.5 text-label-xs font-label-xs text-error z-50">
                  {originError}
                </div>
              )}
            </div>

            {/* Destination Search Field */}
            <div className="relative">
              <label className="text-label-xs font-label-xs text-on-surface-variant mb-1 block">To (Destination)</label>
              <div className="flex items-center bg-white rounded-lg border border-tertiary-fixed px-3 py-2 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20 transition-all">
                <span className="material-symbols-outlined text-error text-sm mr-2" style={{ fontVariationSettings: "'FILL' 1" }}>location_on</span>
                <input
                  type="text"
                  value={destinationInput}
                  onChange={(e) => setDestinationInput(e.target.value)}
                  placeholder="Search destination..."
                  className="bg-transparent border-none focus:ring-0 text-body-md font-body-md text-on-surface w-full p-0 outline-none placeholder:text-outline text-sm"
                />
              </div>
              {/* Destination Autocomplete Suggestions List */}
              {destinationSuggestions.length > 0 && (
                <ul className="absolute top-full left-0 right-0 bg-white border border-outline-variant rounded-lg mt-1 shadow-md max-h-48 overflow-y-auto z-50">
                  {destinationSuggestions.map((place, idx) => (
                    <li
                      key={idx}
                      onClick={() => {
                        setDestination(place);
                        setDestinationInput(place.name);
                        setDestinationSuggestions([]);
                      }}
                      className="px-3 py-2 hover:bg-surface-container cursor-pointer text-sm text-on-surface border-b border-outline-variant/30 last:border-b-0"
                    >
                      {place.name}
                    </li>
                  ))}
                </ul>
              )}
              {destinationSearching && (
                <div className="absolute top-full left-0 right-0 bg-white border border-outline-variant rounded-lg mt-1 p-2.5 text-label-xs font-label-xs text-on-surface-variant z-50 flex items-center gap-2">
                  <span className="material-symbols-outlined text-sm animate-spin text-primary">sync</span> Searching locations...
                </div>
              )}
              {destinationError && destinationInput.trim().length >= 2 && !destinationSearching && (
                <div className="absolute top-full left-0 right-0 bg-white border border-outline-variant rounded-lg mt-1 p-2.5 text-label-xs font-label-xs text-error z-50">
                  {destinationError}
                </div>
              )}
            </div>

            {/* Swap Button */}
            <button
              type="button"
              onClick={handleSwap}
              title="Swap Locations"
              className="hidden md:flex absolute right-1/2 translate-x-1/2 top-[34px] bg-surface border border-tertiary-fixed rounded-full p-1.5 text-on-surface-variant hover:text-primary hover:bg-surface-variant transition-colors z-20 shadow-sm cursor-pointer"
            >
              <span className="material-symbols-outlined text-sm">swap_horiz</span>
            </button>
          </div>

          {/* Passengers Selector */}
          <div className="w-full lg:w-48">
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
          <div className="w-full lg:w-56">
            <label className="text-label-xs font-label-xs text-on-surface-variant mb-1 block">Preference</label>
            <div className="bg-surface-container-low p-1 rounded-lg border border-tertiary-fixed flex gap-1 h-[38px]">
              <button
                type="button"
                onClick={() => setPreference('Fastest')}
                className={`flex-1 text-label-xs font-label-xs rounded-md transition-colors cursor-pointer ${
                  preference === 'Fastest'
                    ? 'bg-white text-primary shadow-sm border border-tertiary-fixed font-semibold'
                    : 'text-on-surface-variant hover:text-primary'
                }`}
              >
                Fastest
              </button>
              <button
                type="button"
                onClick={() => setPreference('Eco')}
                className={`flex-1 text-label-xs font-label-xs rounded-md transition-colors cursor-pointer ${
                  preference === 'Eco'
                    ? 'bg-white text-primary shadow-sm border border-tertiary-fixed font-semibold'
                    : 'text-on-surface-variant hover:text-primary'
                }`}
              >
                Eco
              </button>
              <button
                type="button"
                onClick={() => setPreference('Balanced')}
                className={`flex-1 text-label-xs font-label-xs rounded-md transition-colors cursor-pointer ${
                  preference === 'Balanced'
                    ? 'bg-white text-primary shadow-sm border border-tertiary-fixed font-semibold'
                    : 'text-on-surface-variant hover:text-primary'
                }`}
              >
                Balanced
              </button>
            </div>
          </div>

          {/* Primary CTA: Compare Options Button */}
          <div className="w-full lg:w-auto self-end">
            <button
              type="button"
              onClick={handleCompareClick}
              disabled={!isFormValid || loadingCandidates}
              className={`w-full lg:w-auto px-6 py-2.5 rounded-lg text-label-sm font-label-sm transition-all flex items-center justify-center gap-2 ${
                !isFormValid || loadingCandidates
                  ? 'bg-primary-container/60 text-on-primary/60 cursor-not-allowed'
                  : 'bg-primary text-on-primary hover:bg-primary/90 shadow-md cursor-pointer'
              }`}
            >
              {loadingCandidates ? (
                <>
                  <span className="material-symbols-outlined text-sm animate-spin">sync</span>
                  <span>Calculating...</span>
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-sm">compare_arrows</span>
                  <span>Compare Options</span>
                </>
              )}
            </button>
          </div>

        </div>
      </section>

      {/* Validation / Error Banner */}
      {calcError && (
        <div className="bg-error-container/20 border border-error/30 text-error rounded-xl p-4 mb-6 flex items-center gap-2 text-label-sm font-label-sm">
          <span className="material-symbols-outlined text-base">error</span>
          <span>{calcError}</span>
        </div>
      )}

      {/* Initial Empty State */}
      {!hasSearched && !loadingCandidates && (
        <div className="bg-surface-container-lowest border border-tertiary-fixed rounded-2xl p-12 text-center my-6">
          <span className="material-symbols-outlined text-5xl text-primary mb-3">explore</span>
          <h3 className="text-headline-sm font-headline-sm text-on-surface mb-2">Search Your Journey to Compare</h3>
          <p className="text-body-md font-body-md text-on-surface-variant max-w-md mx-auto">
            Select a starting location and destination above to calculate and compare real multimodal travel options.
          </p>
        </div>
      )}

      {/* Loading State */}
      {loadingCandidates && (
        <div className="bg-surface-container-lowest border border-tertiary-fixed rounded-2xl p-12 text-center my-6 animate-pulse">
          <span className="material-symbols-outlined text-5xl text-primary animate-spin mb-3">sync</span>
          <h3 className="text-headline-sm font-headline-sm text-on-surface mb-1">Calculating Real Multimodal Options...</h3>
          <p className="text-body-sm font-body-sm text-on-surface-variant">Querying Google Routes API live traffic, ORS directions, and emissions engine.</p>
        </div>
      )}

      {/* ROUND 2 RESULTS SECTION (Emissions vs Cost Summary & Green8 Dynamic Route Cards) */}
      {hasSearched && !loadingCandidates && !calcError && (
        <div className="space-y-8">
          
          {/* 1. EMISSIONS VS COST SUMMARY SECTION */}
          {availableCandidates.length > 0 && (
            <section className="bg-surface-container-lowest border border-tertiary-fixed rounded-2xl p-6 shadow-sm">
              <h3 className="text-headline-md font-headline-md text-on-surface mb-1">Emissions vs Cost Summary</h3>
              <p className="text-body-sm text-on-surface-variant mb-6">
                Dynamic comparison of calculated CO₂ emissions (kg) and per-person cost (₹) relative to maximum values.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                
                {/* CO2 Emissions Comparison */}
                <div>
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-label-sm font-label-sm text-on-surface-variant flex items-center gap-1">
                      <span className="material-symbols-outlined text-sm text-primary">eco</span>
                      <span>CO₂ Impact (Lower is better)</span>
                    </span>
                  </div>
                  <div className="space-y-3">
                    {candidates.map((c) => {
                      if (!c.available) return null;
                      const pct = maxCO2 > 0 ? Math.max(4, Math.round((c.co2Kg / maxCO2) * 100)) : 4;
                      const isZero = c.co2Kg === 0;

                      return (
                        <div key={`co2-${c.mode}`} className="flex items-center gap-3">
                          <span className="w-28 text-label-xs font-label-xs text-right font-medium text-on-surface truncate">
                            {c.mode === 'DRIVING' ? (parseInt(passengers, 10) > 1 ? 'Carpool' : 'Driving') : c.mode === 'MOTORCYCLE' ? 'Bike (Motorcycle)' : c.mode}
                          </span>
                          <div className="flex-1 h-3.5 bg-surface-container rounded-full overflow-hidden flex items-center">
                            <div 
                              className={`h-full rounded-full transition-all duration-500 ${
                                isZero 
                                  ? 'bg-emerald-500' 
                                  : c.mode === 'DRIVING' && parseInt(passengers, 10) === 1 
                                    ? 'bg-error' 
                                    : 'bg-primary'
                              }`} 
                              style={{ width: `${pct}%` }}
                            ></div>
                          </div>
                          <span className="w-20 text-label-xs font-label-xs text-on-surface font-semibold text-right">
                            {c.co2Kg.toFixed(2)} kg
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Cost Comparison */}
                <div>
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-label-sm font-label-sm text-on-surface-variant flex items-center gap-1">
                      <span className="material-symbols-outlined text-sm text-primary">payments</span>
                      <span>Cost Comparison (Lower is better)</span>
                    </span>
                  </div>
                  <div className="space-y-3">
                    {candidates.map((c) => {
                      if (!c.available) return null;
                      const pct = maxCost > 0 ? Math.max(4, Math.round((c.cost / maxCost) * 100)) : 4;
                      const isZero = c.cost === 0;

                      return (
                        <div key={`cost-${c.mode}`} className="flex items-center gap-3">
                          <span className="w-28 text-label-xs font-label-xs text-right font-medium text-on-surface truncate">
                            {c.mode === 'DRIVING' ? (parseInt(passengers, 10) > 1 ? 'Carpool' : 'Driving') : c.mode === 'MOTORCYCLE' ? 'Bike (Motorcycle)' : c.mode}
                          </span>
                          <div className="flex-1 h-3.5 bg-surface-container rounded-full overflow-hidden flex items-center">
                            <div 
                              className={`h-full rounded-full transition-all duration-500 ${
                                isZero 
                                  ? 'bg-emerald-500' 
                                  : c.mode === 'DRIVING' && parseInt(passengers, 10) === 1 
                                    ? 'bg-amber-500' 
                                    : 'bg-primary'
                              }`} 
                              style={{ width: `${pct}%` }}
                            ></div>
                          </div>
                          <span className="w-20 text-label-xs font-label-xs text-on-surface font-semibold text-right">
                            ₹{c.cost}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

              </div>
            </section>
          )}

          {/* 2. DYNAMIC GREEN8 ROUTE CARDS BENTO GRID */}
          <section>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {candidates.map((cand) => {
                const isRecommended = recommendedCand && recommendedCand.mode === cand.mode && cand.available;
                const passNum = parseInt(passengers, 10) || 1;
                const distKm = cand.distanceKmNum || (cand.distanceMeters / 1000) || 0;

                // Icons and Tags
                const modeIcons = { DRIVING: 'directions_car', MOTORCYCLE: 'two_wheeler', CYCLING: 'directions_bike', WALKING: 'directions_walk', TRANSIT: 'directions_bus' };
                const modeTitles = { 
                  DRIVING: passNum > 1 ? 'Carpool' : 'Driving (Solo)', 
                  MOTORCYCLE: 'Bike / Motorcycle',
                  CYCLING: 'Cycling', 
                  WALKING: 'Walking', 
                  TRANSIT: 'Public Transit' 
                };

                const modeTags = {
                  DRIVING: cand.provider === 'GOOGLE_ROUTES' ? 'Live Traffic' : 'Car Route',
                  MOTORCYCLE: 'Petrol Two-Wheeler',
                  CYCLING: 'Active Travel',
                  WALKING: '100% Green',
                  TRANSIT: 'Coming Soon'
                };

                const displayModeLabels = {
                  DRIVING: passNum > 1 ? 'Carpool' : 'Driving (Solo)',
                  MOTORCYCLE: 'Bike (Motorcycle)',
                  CYCLING: 'Cycling',
                  WALKING: 'Walking',
                  TRANSIT: 'Public Transit'
                };

                // Score Calculation for Recommended Card
                const score = isRecommended
                  ? (cand.mode === 'WALKING' || cand.mode === 'CYCLING' ? 100 : calculateSustainabilityScore(distKm, cand.mode === 'DRIVING' ? passNum : 1))
                  : null;

                // Handle Transit Truthful Unavailable Card
                if (cand.mode === 'TRANSIT' && !cand.available) {
                  return (
                    <div 
                      key={cand.mode}
                      className="bg-surface-container-lowest border border-outline-variant/30 rounded-2xl p-5 shadow-sm flex flex-col opacity-75"
                    >
                      <div className="flex justify-between items-start mb-4">
                        <div className="w-12 h-12 bg-surface-container rounded-xl flex items-center justify-center text-on-surface-variant">
                          <span className="material-symbols-outlined">directions_bus</span>
                        </div>
                        <span className="bg-surface-container-high text-on-surface-variant px-2.5 py-1 rounded-lg text-label-xs font-label-xs">
                          Coming Soon
                        </span>
                      </div>
                      <h3 className="text-headline-md font-headline-md text-on-surface mb-1">Public Transit</h3>
                      <p className="text-label-sm font-label-sm text-error font-medium mb-6">
                        GTFS/OTP feed not configured
                      </p>
                      <div className="text-body-sm text-on-surface-variant flex-1 mb-6">
                        Real bus routes, stops, schedules, and fares will be available when GTFS data is integrated.
                      </div>
                      <button 
                        disabled
                        className="w-full bg-surface-container text-outline py-2.5 rounded-xl text-label-sm font-label-sm cursor-not-allowed"
                      >
                        Unavailable
                      </button>
                    </div>
                  );
                }

                // Render Active Available Candidate Card
                return (
                  <div
                    key={cand.mode}
                    className={`rounded-2xl p-5 flex flex-col transition-all duration-200 relative ${
                      isRecommended
                        ? 'bg-surface-container-lowest border-2 border-primary shadow-md transform hover:-translate-y-1'
                        : 'bg-surface-container-lowest border border-tertiary-fixed shadow-sm hover:border-outline-variant'
                    }`}
                  >
                    {/* Floating Recommended Badge */}
                    {isRecommended && (
                      <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-primary text-on-primary px-3.5 py-1 rounded-full text-label-xs font-label-xs shadow-sm z-10 flex items-center gap-1 font-semibold tracking-wide">
                        <span className="material-symbols-outlined text-[14px]">stars</span> RECOMMENDED
                      </div>
                    )}

                    {/* Card Header */}
                    <div className="flex justify-between items-start mb-4 mt-1">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${isRecommended ? 'bg-primary-container/20 text-primary' : 'bg-surface-container text-primary'}`}>
                        <span className="material-symbols-outlined">{modeIcons[cand.mode]}</span>
                      </div>

                      <div className="flex flex-col items-end">
                        {isRecommended && score !== null && (
                          <span className="text-label-xs font-label-xs font-bold text-primary mb-1">
                            Score: {score}/100
                          </span>
                        )}
                        <span className={`px-2.5 py-1 rounded-lg text-label-xs font-label-xs ${
                          cand.mode === 'WALKING' || cand.mode === 'CYCLING'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-primary-container/20 text-primary'
                        }`}>
                          {modeTags[cand.mode]}
                        </span>
                      </div>
                    </div>

                    {/* Title & Distance */}
                    <h3 className="text-headline-md font-headline-md text-on-surface mb-1">
                      {modeTitles[cand.mode]}
                    </h3>
                    <p className="text-label-sm font-label-sm text-on-surface-variant mb-6">
                      {cand.distanceKm} {cand.mode === 'DRIVING' && passNum > 1 ? `• ${6 - passNum} Seats Left` : ''}
                    </p>

                    {/* Main Metrics Grid */}
                    <div className="grid grid-cols-2 gap-4 mb-6 flex-1 bg-surface-container-lowest/50 p-3 rounded-xl border border-outline-variant/20">
                      <div>
                        <span className="text-label-xs font-label-xs text-on-surface-variant block mb-0.5">Time</span>
                        <span className="text-body-md font-body-md font-semibold text-on-surface">{cand.durationMinutes}</span>
                      </div>

                      <div>
                        <span className="text-label-xs font-label-xs text-on-surface-variant block mb-0.5">Cost</span>
                        <span className={`text-body-md font-body-md font-semibold ${isRecommended ? 'text-primary font-bold' : 'text-on-surface'}`}>
                          ₹{cand.cost}
                        </span>
                      </div>

                      <div>
                        <span className="text-label-xs font-label-xs text-on-surface-variant block mb-0.5">CO₂ / Person</span>
                        <span className={`text-body-md font-body-md font-semibold ${cand.co2Kg === 0 ? 'text-emerald-600 font-bold' : 'text-on-surface'}`}>
                          {typeof cand.co2Kg === 'number' ? cand.co2Kg.toFixed(2) : '0.00'} kg
                        </span>
                      </div>

                      {cand.mode === 'DRIVING' && passNum > 1 ? (
                        <div>
                          <span className="text-label-xs font-label-xs text-on-surface-variant block mb-0.5">Occupancy</span>
                          <span className="text-body-md font-body-md font-semibold text-on-surface">{passNum}/6</span>
                        </div>
                      ) : (
                        <div>
                          <span className="text-label-xs font-label-xs text-on-surface-variant block mb-0.5">Distance</span>
                          <span className="text-body-md font-body-md font-semibold text-on-surface">{cand.distanceKm}</span>
                        </div>
                      )}
                    </div>

                    {/* Dynamic Action Buttons */}
                    {cand.mode === 'DRIVING' && passNum > 1 ? (
                      <button
                        type="button"
                        onClick={() => handleBookSeat(cand)}
                        className={`w-full py-2.5 rounded-xl text-label-sm font-label-sm transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                          isRecommended
                            ? 'bg-primary text-on-primary hover:bg-primary/90 shadow-md font-semibold'
                            : 'border border-primary text-primary hover:bg-primary/10'
                        }`}
                      >
                        <span className="material-symbols-outlined text-sm">group</span>
                        <span>Book Seat</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleSelectRoute(cand)}
                        className={`w-full py-2.5 rounded-xl text-label-sm font-label-sm transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                          isRecommended
                            ? 'bg-primary text-on-primary hover:bg-primary/90 shadow-md font-semibold'
                            : 'border border-primary text-primary hover:bg-primary/10'
                        }`}
                      >
                        <span className="material-symbols-outlined text-sm">directions</span>
                        <span>Select Route</span>
                      </button>
                    )}

                  </div>
                );
              })}
            </div>
          </section>

        </div>
      )}
    </main>
  );
}
