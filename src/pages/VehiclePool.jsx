import React, { useEffect, useState, useCallback, useRef } from 'react';
import LocationAutocompleteInput from '../components/LocationAutocompleteInput';
import ActivePoolDetailsModal from '../components/pool/ActivePoolDetailsModal';
import NotificationToast, { useToastStack } from '../components/NotificationToast';
import { useAuth } from '../context/AuthContext';
import { reverseGeocode } from '../services/geocodingService';
import { msUntilPickupReminder } from '../utils/pickupReminder';
import {
  searchPools,
  createPool,
  joinPool,
  leavePool,
  getMyPools,
  getPoolHistory,
  completePool,
  terminatePool
} from '../services/vehiclePoolService';

/** Basic client-side phone check: exactly 10 numeric digits. */
function isValidPhoneNumber(value) {
  const stripped = (value || '').trim();
  return /^[0-9]{10}$/.test(stripped);
}

/** meters -> "x.x km" for the join confirmation modal. */
function formatDistanceKm(meters) {
  if (meters === null || meters === undefined || Number.isNaN(Number(meters))) return '—';
  return `${(Number(meters) / 1000).toFixed(1)} km`;
}

const INITIAL_FORM = {
  startLocation: '',
  destination: '',
  departureTime: '',
  totalSeats: '4',
  costPerPassenger: ''
};

const INITIAL_ROUTE_SEARCH = {
  origin: '',
  destination: ''
};

/**
 * Returns the current local time formatted for an <input type="datetime-local" />
 * min attribute, so the browser's own picker already rejects past dates.
 */
function nowForDateTimeLocal() {
  const d = new Date();
  d.setSeconds(0, 0);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatDateTime(iso) {
  if (!iso) return { date: '—', time: '—' };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: '—', time: '—' };
  return {
    date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    time: d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
  };
}

/** Mirrors the backend's normalizeRouteText: trim + collapse whitespace + lowercase. */
function normalizeRouteText(value) {
  if (!value) return '';
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

function routesMatch(pool, route) {
  return (
    normalizeRouteText(pool.startLocation) === normalizeRouteText(route.origin) &&
    normalizeRouteText(pool.destination) === normalizeRouteText(route.destination)
  );
}

function formatCurrency(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '₹0';
  return `₹${Number(value).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

/**
 * Single source of truth for how each of the four pool statuses (Available / Full /
 * Completed / Terminated) is labeled and colored, shared by the browse list and the
 * "My Pools" management view so a pool never looks different depending on where it's
 * shown. Mirrors the precedence used server-side: an explicit Completed/Terminated
 * outcome always wins, then a departed-but-unended pool shows as Departed, then Full,
 * otherwise the pool reads as open/Available (no badge needed).
 */
function getStatusBadge(pool) {
  if (pool.status === 'TERMINATED') {
    return { label: 'Terminated', className: 'bg-error-container/30 text-error border-error/30' };
  }
  if (pool.status === 'COMPLETED') {
    return { label: 'Completed', className: 'bg-primary-container/30 text-primary border-primary/30' };
  }
  if (pool.past) {
    return { label: 'Departed', className: 'bg-surface-container-high text-on-surface-variant border-outline-variant' };
  }
  if (pool.status === 'FULL') {
    return { label: 'Full', className: 'bg-amber-50 text-amber-800 border-amber-300' };
  }
  return null;
}

export default function VehiclePool() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('browse'); // 'browse' | 'mine' | 'history'

  // Route-based discovery (Phase 2): Browse Pools no longer loads every pool up front.
  // The user enters an origin/destination first; `pools` only ever holds the results of
  // the last successful route search, and `hasSearched` gates whether we show the search
  // prompt or the results/empty state.
  const [routeSearch, setRouteSearch] = useState(INITIAL_ROUTE_SEARCH);
  const [routeSearchFieldErrors, setRouteSearchFieldErrors] = useState({});
  // The real, geocoded location behind each route-search text field (or null while the
  // text doesn't match a location the user actually picked from the suggestions). Reuses
  // the same MapTiler-backed geocoding used on Plan Route -- see LocationAutocompleteInput.
  const [routeOriginLocation, setRouteOriginLocation] = useState(null);
  const [routeDestinationLocation, setRouteDestinationLocation] = useState(null);
  const [pools, setPools] = useState([]);
  const [loadingPools, setLoadingPools] = useState(false);
  const [poolsError, setPoolsError] = useState(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchedRoute, setSearchedRoute] = useState(null); // { origin, destination } last searched, for the results header

  const [myPools, setMyPools] = useState([]);
  const [loadingMyPools, setLoadingMyPools] = useState(false);
  const [myPoolsError, setMyPoolsError] = useState(null);
  const [myPoolsLoaded, setMyPoolsLoaded] = useState(false);

  // Pool / Trip History: pools the user created or joined that have since been
  // completed or terminated. Loaded lazily (like "My Pools") the first time the
  // History tab is opened, and persists across refresh/login since it's read
  // straight from the backend rather than kept only in local state.
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyError, setHistoryError] = useState(null);
  const [historyLoaded, setHistoryLoaded] = useState(false);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [form, setForm] = useState(INITIAL_FORM);
  // Real, geocoded locations behind the Create Pool form's Start location / Destination
  // fields, same pattern as the route search above.
  const [formStartLocationGeo, setFormStartLocationGeo] = useState(null);
  const [formDestinationGeo, setFormDestinationGeo] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [createError, setCreateError] = useState(null);
  const [creating, setCreating] = useState(false);

  const [actionPoolId, setActionPoolId] = useState(null);
  const [actionErrors, setActionErrors] = useState({});

  // Phase 2 - Passenger Join flow: clicking "Join Pool" opens a confirmation modal
  // instead of joining immediately. It collects ONLY pickup location (GPS or map
  // selection) and phone number -- destination is reused from the pool's already
  // matched/searched destination and never asked again.
  const [joinModalPool, setJoinModalPool] = useState(null);
  const [joinPickupText, setJoinPickupText] = useState('');
  const [joinPickupGeo, setJoinPickupGeo] = useState(null);
  const [joinLocating, setJoinLocating] = useState(false);
  const [joinPhone, setJoinPhone] = useState('');
  const [joinFieldErrors, setJoinFieldErrors] = useState({});
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState(null);

  // Phase 5 - Carpool operational integration: passenger-facing "join succeeded" +
  // "pickup coming up" notifications, both rendered through the shared toast stack.
  const { toasts, pushToast, dismissToast } = useToastStack();
  const pickupReminderTimers = useRef(new Map());

  // Clear any pending pickup-reminder timers when the page unmounts, so a scheduled
  // reminder never fires (or throws) after the component is gone.
  useEffect(() => {
    const timersMap = pickupReminderTimers.current;
    return () => {
      timersMap.forEach((timer) => clearTimeout(timer));
      timersMap.clear();
    };
  }, []);

  // Creator "end pool" flow: which pool is the confirm dialog open for, which outcome
  // is currently being submitted, and any error from the last attempt.
  const [endDialogPool, setEndDialogPool] = useState(null);

  // Phase 4 - Active Pool Details map. Only ever opened from a "My Pools" active pool
  // card's "Details" button -- never from Browse/Search or Create Pool.
  const [detailsPoolId, setDetailsPoolId] = useState(null);
  const [endingPoolId, setEndingPoolId] = useState(null);
  const [endErrors, setEndErrors] = useState({});

  const runRouteSearch = useCallback(async (origin, destination, originLoc, destinationLoc) => {
    setLoadingPools(true);
    setPoolsError(null);
    setHasSearched(true);
    setSearchedRoute({ origin, destination });
    try {
      const data = await searchPools(
        origin,
        destination,
        originLoc?.lat ?? null,       // latitude
        originLoc?.lng ?? null,       // longitude
        destinationLoc?.lat ?? null,
        destinationLoc?.lng ?? null
      );
      setPools(Array.isArray(data) ? data : []);
    } catch (err) {
      setPoolsError(err.message || 'Unable to search vehicle pools right now.');
    } finally {
      setLoadingPools(false);
    }
  }, []);

  // Free-text typing updates the visible field but invalidates whatever location was
  // previously selected for it (unless the text still matches that location's name) --
  // a pool search can only run against a real, geocoded place, never arbitrary text.
  const handleRouteOriginInputChange = (value) => {
    setRouteSearch((prev) => ({ ...prev, origin: value }));
    setRouteOriginLocation((prev) => (prev && prev.name === value ? prev : null));
    setRouteSearchFieldErrors((prev) => ({ ...prev, origin: undefined }));
  };

  const handleRouteDestinationInputChange = (value) => {
    setRouteSearch((prev) => ({ ...prev, destination: value }));
    setRouteDestinationLocation((prev) => (prev && prev.name === value ? prev : null));
    setRouteSearchFieldErrors((prev) => ({ ...prev, destination: undefined }));
  };

  const handleRouteOriginSelect = (loc) => {
    setRouteSearch((prev) => ({ ...prev, origin: loc.name }));
    setRouteOriginLocation(loc);
    setRouteSearchFieldErrors((prev) => ({ ...prev, origin: undefined }));
  };

  const handleRouteDestinationSelect = (loc) => {
    setRouteSearch((prev) => ({ ...prev, destination: loc.name }));
    setRouteDestinationLocation(loc);
    setRouteSearchFieldErrors((prev) => ({ ...prev, destination: undefined }));
  };

  const handleRouteSearchSubmit = (e) => {
    e.preventDefault();
    const origin = routeSearch.origin.trim();
    const destination = routeSearch.destination.trim();
    const errors = {};
    if (!origin) {
      errors.origin = 'Current location / origin is required';
    } else if (!routeOriginLocation || routeOriginLocation.name !== origin) {
      errors.origin = 'Please select a location from the suggestions';
    }
    if (!destination) {
      errors.destination = 'Destination is required';
    } else if (!routeDestinationLocation || routeDestinationLocation.name !== destination) {
      errors.destination = 'Please select a location from the suggestions';
    }
    setRouteSearchFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;
    runRouteSearch(origin, destination, routeOriginLocation, routeDestinationLocation);
  };

  const loadMyPools = useCallback(async () => {
    setLoadingMyPools(true);
    setMyPoolsError(null);
    try {
      const data = await getMyPools();
      setMyPools(Array.isArray(data) ? data : []);
      setMyPoolsLoaded(true);
    } catch (err) {
      setMyPoolsError(err.message || 'Unable to load your vehicle pools right now.');
    } finally {
      setLoadingMyPools(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'mine' && !myPoolsLoaded) {
      loadMyPools();
    }
  }, [activeTab, myPoolsLoaded, loadMyPools]);

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    setHistoryError(null);
    try {
      const data = await getPoolHistory();
      setHistory(Array.isArray(data) ? data : []);
      setHistoryLoaded(true);
    } catch (err) {
      setHistoryError(err.message || 'Unable to load your trip history right now.');
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'history' && !historyLoaded) {
      loadHistory();
    }
  }, [activeTab, historyLoaded, loadHistory]);

  // Keep the two lists (public browse list + creator's own list) consistent whenever a
  // pool anywhere changes seats or status, so the same pool never shows different
  // seat counts/status depending on which tab you're looking at.
  const applyPoolUpdate = (updated) => {
    setPools((prev) => prev.map((p) => (p.id === updated.id ? { ...p, ...updated } : p)));
    setMyPools((prev) => prev.map((p) => (p.id === updated.id ? { ...p, ...updated } : p)));
  };

  const totalCostPreview = (Number(form.costPerPassenger) || 0) * (Number(form.totalSeats) || 0);

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    setFieldErrors((prev) => ({ ...prev, [name]: undefined }));
  };

  // Start location / destination in the Create Pool form use the same real-location
  // autocomplete as the route search above and Plan Route -- typing invalidates the
  // previously selected location unless the text still matches it.
  const handleFormStartLocationInputChange = (value) => {
    setForm((prev) => ({ ...prev, startLocation: value }));
    setFormStartLocationGeo((prev) => (prev && prev.name === value ? prev : null));
    setFieldErrors((prev) => ({ ...prev, startLocation: undefined }));
  };

  const handleFormDestinationInputChange = (value) => {
    setForm((prev) => ({ ...prev, destination: value }));
    setFormDestinationGeo((prev) => (prev && prev.name === value ? prev : null));
    setFieldErrors((prev) => ({ ...prev, destination: undefined }));
  };

  const handleFormStartLocationSelect = (loc) => {
    setForm((prev) => ({ ...prev, startLocation: loc.name }));
    setFormStartLocationGeo(loc);
    setFieldErrors((prev) => ({ ...prev, startLocation: undefined }));
  };

  const handleFormDestinationSelect = (loc) => {
    setForm((prev) => ({ ...prev, destination: loc.name }));
    setFormDestinationGeo(loc);
    setFieldErrors((prev) => ({ ...prev, destination: undefined }));
  };

  const validateForm = () => {
    const errors = {};
    if (!form.startLocation.trim()) {
      errors.startLocation = 'Start location is required';
    } else if (form.startLocation.trim().length > 255) {
      errors.startLocation = 'Start location is too long';
    } else if (!formStartLocationGeo || formStartLocationGeo.name !== form.startLocation.trim()) {
      errors.startLocation = 'Please select a location from the suggestions';
    }

    if (!form.destination.trim()) {
      errors.destination = 'Destination is required';
    } else if (form.destination.trim().length > 255) {
      errors.destination = 'Destination is too long';
    } else if (!formDestinationGeo || formDestinationGeo.name !== form.destination.trim()) {
      errors.destination = 'Please select a location from the suggestions';
    }

    if (!form.departureTime) {
      errors.departureTime = 'Date & time is required';
    } else {
      const chosen = new Date(form.departureTime);
      if (Number.isNaN(chosen.getTime())) {
        errors.departureTime = 'Enter a valid date & time';
      } else if (chosen.getTime() < Date.now()) {
        errors.departureTime = 'Departure must be in the future';
      }
    }

    const seats = Number(form.totalSeats);
    if (!form.totalSeats || !Number.isInteger(seats)) {
      errors.totalSeats = 'Available seats is required';
    } else if (seats < 1 || seats > 20) {
      errors.totalSeats = 'Must be between 1 and 20 seats';
    }

    const cost = Number(form.costPerPassenger);
    if (form.costPerPassenger === '' || Number.isNaN(cost)) {
      errors.costPerPassenger = 'Cost per passenger is required';
    } else if (cost < 0) {
      errors.costPerPassenger = 'Cost cannot be negative';
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    setCreateError(null);
    if (!validateForm()) return;

    setCreating(true);
    try {
      const created = await createPool({
        startLocation: form.startLocation.trim(),
        startLatitude: formStartLocationGeo.lat,
        startLongitude: formStartLocationGeo.lng,
        destination: form.destination.trim(),
        destinationLatitude: formDestinationGeo.lat,
        destinationLongitude: formDestinationGeo.lng,
        departureTime: form.departureTime,
        totalSeats: Number(form.totalSeats),
        costPerPassenger: Number(form.costPerPassenger)
      });
      // Only splice the newly created pool into the current Browse results if the user has
      // an active route search open and this pool actually matches that route -- Browse no
      // longer holds "all pools", so we can't just prepend unconditionally.
      if (hasSearched && searchedRoute && routesMatch(created, searchedRoute)) {
        setPools((prev) => [created, ...prev]);
      }
      // The creator's own pool list should reflect a newly created pool too, if loaded.
      setMyPools((prev) => (myPoolsLoaded ? [created, ...prev] : prev));
      setShowCreateModal(false);
      setForm(INITIAL_FORM);
      setFormStartLocationGeo(null);
      setFormDestinationGeo(null);
      setFieldErrors({});
    } catch (err) {
      setCreateError(err.message || 'Unable to create this pool. Please try again.');
    } finally {
      setCreating(false);
    }
  };

  const closeCreateModal = () => {
    if (creating) return;
    setShowCreateModal(false);
    setForm(INITIAL_FORM);
    setFormStartLocationGeo(null);
    setFormDestinationGeo(null);
    setFieldErrors({});
    setCreateError(null);
  };

  const runAction = async (poolId, action) => {
    // Only "leave" goes through here now -- "join" opens the confirmation modal instead
    // (see openJoinModal / submitJoin below).
    setActionPoolId(poolId);
    setActionErrors((prev) => ({ ...prev, [poolId]: undefined }));
    try {
      const updated = await leavePool(poolId);
      applyPoolUpdate(updated);
    } catch (err) {
      setActionErrors((prev) => ({ ...prev, [poolId]: err.message || 'Something went wrong. Please try again.' }));
    } finally {
      setActionPoolId(null);
    }
  };

  // ---------------------------------------------------------------------
  // Phase 2 - Passenger Join flow: confirmation modal
  // ---------------------------------------------------------------------

  const openJoinModal = (pool) => {
    setJoinError(null);
    setJoinFieldErrors({});
    setJoinPhone('');
    // Prefill pickup with whatever origin the passenger already searched with, if any --
    // they can still change it (GPS or map) before confirming.
    setJoinPickupText(routeOriginLocation?.name || '');
    setJoinPickupGeo(routeOriginLocation || null);
    setJoinModalPool(pool);
  };

  const closeJoinModal = () => {
    if (joining) return;
    setJoinModalPool(null);
    setJoinPickupText('');
    setJoinPickupGeo(null);
    setJoinPhone('');
    setJoinFieldErrors({});
    setJoinError(null);
  };

  const handleJoinPickupInputChange = (value) => {
    setJoinPickupText(value);
    setJoinPickupGeo((prev) => (prev && prev.name === value ? prev : null));
    setJoinFieldErrors((prev) => ({ ...prev, pickup: undefined }));
  };

  const handleJoinPickupSelect = (loc) => {
    setJoinPickupText(loc.name);
    setJoinPickupGeo(loc);
    setJoinFieldErrors((prev) => ({ ...prev, pickup: undefined }));
  };

  const handleUseCurrentLocationForJoin = () => {
    if (!navigator.geolocation) {
      setJoinFieldErrors((prev) => ({ ...prev, pickup: 'Geolocation is not supported by your browser.' }));
      return;
    }
    setJoinLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        try {
          const placeName = await reverseGeocode(longitude, latitude);
          const loc = { name: placeName || `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`, lat: latitude, lng: longitude };
          setJoinPickupGeo(loc);
          setJoinPickupText(loc.name);
          setJoinFieldErrors((prev) => ({ ...prev, pickup: undefined }));
        } catch (err) {
          const fallbackLoc = { name: `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`, lat: latitude, lng: longitude };
          setJoinPickupGeo(fallbackLoc);
          setJoinPickupText(fallbackLoc.name);
        } finally {
          setJoinLocating(false);
        }
      },
      () => {
        setJoinFieldErrors((prev) => ({ ...prev, pickup: 'Unable to get your current location.' }));
        setJoinLocating(false);
      }
    );
  };

  const submitJoin = async (e) => {
    e.preventDefault();
    if (!joinModalPool) return;

    const errors = {};
    if (!joinPickupText.trim()) {
      errors.pickup = 'Pickup location is required';
    } else if (!joinPickupGeo || joinPickupGeo.name !== joinPickupText.trim()) {
      errors.pickup = 'Please select a location from the suggestions, or use current location';
    }
    if (!joinPhone.trim()) {
      errors.phone = 'Phone number is required';
    } else if (!isValidPhoneNumber(joinPhone)) {
      errors.phone = 'Enter a valid phone number';
    }
    setJoinFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setJoining(true);
    setJoinError(null);
    try {
      const updated = await joinPool(joinModalPool.id, {
        pickupLocation: joinPickupGeo.name,
        pickupLatitude: joinPickupGeo.lat,
        pickupLongitude: joinPickupGeo.lng,
        // Destination is reused from the pool's already matched/searched destination --
        // never re-asked in this modal.
        dropoffLocation: joinModalPool.destination,
        dropoffLatitude: joinModalPool.destinationLatitude,
        dropoffLongitude: joinModalPool.destinationLongitude,
        phoneNumber: joinPhone.trim(),
        // Informational only -- the backend always recalculates the authoritative fare
        // itself and ignores this value.
        clientCalculatedFare: joinModalPool.passengerFare ?? null
      });
      applyPoolUpdate(updated);
      closeJoinModal();

      // Phase 5 - Carpool operational integration: notify the passenger their join
      // succeeded, showing the authoritative server-recalculated fare and the
      // APPROXIMATE pickup time -- both already present on the join response, so no
      // extra request is needed.
      const pickupTimeLabel = updated.approxPickupTime ? formatDateTime(updated.approxPickupTime).time : null;
      pushToast({
        icon: 'check_circle',
        tone: 'success',
        title: "You're in! Pool joined successfully.",
        message: [
          updated.passengerFare != null ? `Fare: ${formatCurrency(updated.passengerFare)}` : null,
          pickupTimeLabel ? `Pickup: ${updated.pickupTimeApproximate ? '~' : ''}${pickupTimeLabel}` : null
        ].filter(Boolean).join(' · ') || 'The driver has been notified.'
      });

      schedulePickupReminder(updated.id, updated.approxPickupTime);
    } catch (err) {
      setJoinError(err.message || 'Unable to join this pool. Please try again.');
    } finally {
      setJoining(false);
    }
  };

  /**
   * Phase 5 - Carpool operational integration: schedules an in-app "pickup coming up"
   * reminder ~1 minute before the passenger's APPROXIMATE pickup time, reusing the same
   * toast stack as the join-success notification (no duplicate notification mechanism).
   * A no-op when there's no approx pickup time to work from, or it's too far out /
   * already past to usefully schedule (see msUntilPickupReminder).
   */
  const schedulePickupReminder = (poolId, approxPickupTime) => {
    const delayMs = msUntilPickupReminder(approxPickupTime);
    if (delayMs === null) return;

    const existing = pickupReminderTimers.current.get(poolId);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      pickupReminderTimers.current.delete(poolId);
      const timeLabel = formatDateTime(approxPickupTime).time;
      pushToast({
        icon: 'directions_car',
        tone: 'reminder',
        title: 'Pickup coming up',
        message: `Your ride is picking you up in about 1 minute (~${timeLabel}). Head to your pickup spot.`
      });
    }, delayMs);
    pickupReminderTimers.current.set(poolId, timer);
  };

  const openEndDialog = (pool) => {
    setEndErrors((prev) => ({ ...prev, [pool.id]: undefined }));
    setEndDialogPool(pool);
  };

  const closeEndDialog = () => {
    if (endingPoolId) return;
    setEndDialogPool(null);
  };

  const runEndPool = async (poolId, outcome) => {
    setEndingPoolId(poolId);
    setEndErrors((prev) => ({ ...prev, [poolId]: undefined }));
    try {
      const updated = outcome === 'complete' ? await completePool(poolId) : await terminatePool(poolId);
      
      // Notify the Navbar (or any other listener) that savings might have changed
      if (outcome === 'complete') {
        window.dispatchEvent(new Event('impact-updated'));
      }

      // Reflect the new status anywhere the pool is currently visible in Browse...
      setPools((prev) => prev.map((p) => (p.id === updated.id ? { ...p, ...updated } : p)));
      // ...then move it out of the active "My Pools" list (it's no longer ACTIVE)...
      setMyPools((prev) => prev.filter((p) => p.id !== updated.id));
      // ...and into Trip History, if that tab has already been loaded, so it shows up
      // immediately without needing a refresh.
      setHistory((prev) => (historyLoaded ? [updated, ...prev.filter((p) => p.id !== updated.id)] : prev));
      setEndDialogPool(null);
    } catch (err) {
      setEndErrors((prev) => ({ ...prev, [poolId]: err.message || 'Unable to end this pool. Please try again.' }));
    } finally {
      setEndingPoolId(null);
    }
  };

  return (
    <main className="flex-1 w-full pt-[24px] px-4 md:px-lg pb-xl max-w-7xl mx-auto overflow-y-auto scrollbar-none">
      <header className="mb-lg flex flex-col md:flex-row justify-between md:items-end gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="material-symbols-outlined text-primary text-2xl">group</span>
            <h2 className="text-headline-lg font-headline-lg text-on-surface">Vehicle Pool</h2>
          </div>
          <p className="text-body-md font-body-md text-on-surface-variant">
            Create a vehicle pool for your route or join an available one to share the ride and split the cost.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreateModal(true)}
          className="bg-primary text-on-primary rounded-xl px-5 py-2.5 text-label-sm font-label-sm hover:bg-primary/90 transition-colors shadow-sm cursor-pointer flex items-center gap-2 self-start md:self-auto"
        >
          <span className="material-symbols-outlined text-sm">add_circle</span>
          <span>Create Pool</span>
        </button>
      </header>

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-lg border-b border-outline-variant/40">
        <button
          type="button"
          onClick={() => setActiveTab('browse')}
          className={`px-4 py-2.5 text-label-sm font-label-sm cursor-pointer border-b-2 transition-colors -mb-px flex items-center gap-2 ${
            activeTab === 'browse'
              ? 'border-primary text-primary font-semibold'
              : 'border-transparent text-on-surface-variant hover:text-on-surface'
          }`}
        >
          <span className="material-symbols-outlined text-base">travel_explore</span>
          Browse Pools
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('mine')}
          className={`px-4 py-2.5 text-label-sm font-label-sm cursor-pointer border-b-2 transition-colors -mb-px flex items-center gap-2 ${
            activeTab === 'mine'
              ? 'border-primary text-primary font-semibold'
              : 'border-transparent text-on-surface-variant hover:text-on-surface'
          }`}
        >
          <span className="material-symbols-outlined text-base">manage_accounts</span>
          My Pools
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('history')}
          className={`px-4 py-2.5 text-label-sm font-label-sm cursor-pointer border-b-2 transition-colors -mb-px flex items-center gap-2 ${
            activeTab === 'history'
              ? 'border-primary text-primary font-semibold'
              : 'border-transparent text-on-surface-variant hover:text-on-surface'
          }`}
        >
          <span className="material-symbols-outlined text-base">history</span>
          Trip History
        </button>
      </div>

      {activeTab === 'browse' && (
        <>
          {/* Route search -- Browse Pools never loads the full list. The user must
              search by origin/destination first; only matching, ACTIVE pools with an
              open seat come back from the server. */}
          <form
            onSubmit={handleRouteSearchSubmit}
            className="bg-surface-container-lowest rounded-2xl p-4 md:p-5 border border-tertiary-fixed shadow-sm mb-lg"
          >
            <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-3 items-start">
              <div>
                <label htmlFor="routeOrigin" className="block text-label-xs font-semibold text-on-surface mb-1">
                  Current location / Origin
                </label>
                <LocationAutocompleteInput
                  id="routeOrigin"
                  name="origin"
                  value={routeSearch.origin}
                  onInputChange={handleRouteOriginInputChange}
                  onSelectLocation={handleRouteOriginSelect}
                  selectedLocation={routeOriginLocation}
                  placeholder="e.g. Vijay Nagar, Indore"
                  hasError={!!routeSearchFieldErrors.origin}
                  inputClassName={`w-full bg-surface-container-low border rounded-xl pl-9 pr-3 py-2.5 text-body-md text-on-surface focus:outline-none focus:border-primary ${routeSearchFieldErrors.origin ? 'border-error' : 'border-outline-variant'}`}
                />
                {routeSearchFieldErrors.origin && (
                  <p className="text-error text-label-xs mt-1">{routeSearchFieldErrors.origin}</p>
                )}
              </div>
              <div>
                <label htmlFor="routeDestination" className="block text-label-xs font-semibold text-on-surface mb-1">
                  Destination
                </label>
                <LocationAutocompleteInput
                  id="routeDestination"
                  name="destination"
                  value={routeSearch.destination}
                  onInputChange={handleRouteDestinationInputChange}
                  onSelectLocation={handleRouteDestinationSelect}
                  selectedLocation={routeDestinationLocation}
                  placeholder="e.g. Rajwada, Indore"
                  hasError={!!routeSearchFieldErrors.destination}
                  inputClassName={`w-full bg-surface-container-low border rounded-xl pl-9 pr-3 py-2.5 text-body-md text-on-surface focus:outline-none focus:border-primary ${routeSearchFieldErrors.destination ? 'border-error' : 'border-outline-variant'}`}
                />
                {routeSearchFieldErrors.destination && (
                  <p className="text-error text-label-xs mt-1">{routeSearchFieldErrors.destination}</p>
                )}
              </div>
              <button
                type="submit"
                disabled={loadingPools}
                className="mt-0 md:mt-6 bg-primary text-on-primary rounded-xl px-6 py-2.5 text-label-sm font-label-sm hover:bg-primary/90 transition-colors shadow-sm cursor-pointer flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
              >
                <span className="material-symbols-outlined text-sm">search</span>
                <span>Search Pools</span>
              </button>
            </div>
          </form>

          {/* Search prompt -- shown until the user runs their first search */}
          {!hasSearched && (
            <div className="flex flex-col items-center justify-center py-16 bg-surface-container-lowest border border-tertiary-fixed rounded-2xl my-6">
              <span className="material-symbols-outlined text-5xl text-outline-variant mb-3">travel_explore</span>
              <h3 className="text-headline-sm font-headline-sm text-on-surface mb-2">Search for a vehicle pool</h3>
              <p className="text-body-md font-body-md text-on-surface-variant text-center max-w-md">
                Enter your current location and destination above to find pools matching your route.
              </p>
            </div>
          )}

          {/* Loading state */}
          {hasSearched && loadingPools && (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="bg-surface-container-lowest rounded-2xl p-5 border border-outline-variant animate-pulse h-[210px]"
                >
                  <div className="h-4 w-2/3 bg-surface-container-high rounded mb-3" />
                  <div className="h-3 w-1/2 bg-surface-container-high rounded mb-6" />
                  <div className="h-3 w-full bg-surface-container-high rounded mb-2" />
                  <div className="h-3 w-4/5 bg-surface-container-high rounded" />
                </div>
              ))}
            </div>
          )}

          {/* Error state */}
          {hasSearched && !loadingPools && poolsError && (
            <div className="flex flex-col items-center justify-center py-16 bg-surface-container-lowest border border-tertiary-fixed rounded-2xl my-6">
              <span className="material-symbols-outlined text-5xl text-error mb-3">error</span>
              <h3 className="text-headline-sm font-headline-sm text-on-surface mb-2">Couldn't search vehicle pools</h3>
              <p className="text-body-md font-body-md text-on-surface-variant text-center max-w-md mb-6">{poolsError}</p>
              <button
                type="button"
                onClick={() => searchedRoute && runRouteSearch(searchedRoute.origin, searchedRoute.destination)}
                className="bg-primary text-on-primary rounded-xl px-6 py-2.5 text-label-sm font-label-sm hover:bg-primary/90 transition-colors shadow-md cursor-pointer flex items-center gap-2"
              >
                <span className="material-symbols-outlined text-sm">refresh</span>
                <span>Try Again</span>
              </button>
            </div>
          )}

          {/* No matching pools for this route */}
          {hasSearched && !loadingPools && !poolsError && pools.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 bg-surface-container-lowest border border-tertiary-fixed rounded-2xl my-6">
              <span className="material-symbols-outlined text-5xl text-outline-variant mb-3">group_off</span>
              <h3 className="text-headline-sm font-headline-sm text-on-surface mb-2">Currently not available for this route.</h3>
              <p className="text-body-md font-body-md text-on-surface-variant text-center max-w-md mb-6">
                Be the first to create a vehicle pool for {searchedRoute?.origin} → {searchedRoute?.destination} and invite others to share the ride.
              </p>
              <button
                type="button"
                onClick={() => setShowCreateModal(true)}
                className="bg-primary text-on-primary rounded-xl px-6 py-2.5 text-label-sm font-label-sm hover:bg-primary/90 transition-colors shadow-md cursor-pointer flex items-center gap-2"
              >
                <span className="material-symbols-outlined text-sm">add_circle</span>
                <span>Create a Pool for This Route</span>
              </button>
            </div>
          )}

          {/* Pool list */}
          {hasSearched && !loadingPools && !poolsError && pools.length > 0 && (
            <>
              <p className="text-label-xs text-on-surface-variant mb-3">
                {pools.length} pool{pools.length === 1 ? '' : 's'} found for {searchedRoute?.origin} → {searchedRoute?.destination}
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {pools.map((pool) => {
                const { date, time } = formatDateTime(pool.departureTime);
                const isBusy = actionPoolId === pool.id;
                const actionError = actionErrors[pool.id];
                const badge = getStatusBadge(pool);
                const ended = pool.status === 'COMPLETED' || pool.status === 'TERMINATED';

                let buttonLabel = 'Join Pool';
                let buttonIcon = 'person_add';
                let buttonAction = () => openJoinModal(pool);
                let buttonDisabled = false;
                let buttonClass = 'bg-primary text-on-primary hover:bg-primary/90';

                if (pool.own) {
                  buttonLabel = 'Your Pool';
                  buttonDisabled = true;
                  buttonClass = 'bg-surface-container-high text-on-surface-variant cursor-not-allowed';
                  buttonIcon = 'person';
                } else if (pool.status === 'TERMINATED') {
                  buttonLabel = 'Terminated';
                  buttonDisabled = true;
                  buttonClass = 'bg-surface-container-high text-on-surface-variant cursor-not-allowed';
                  buttonIcon = 'block';
                } else if (pool.status === 'COMPLETED') {
                  buttonLabel = 'Completed';
                  buttonDisabled = true;
                  buttonClass = 'bg-surface-container-high text-on-surface-variant cursor-not-allowed';
                  buttonIcon = 'flag';
                } else if (pool.joined) {
                  buttonLabel = 'Leave Pool';
                  buttonIcon = 'logout';
                  buttonAction = () => runAction(pool.id, 'leave');
                  buttonClass = 'bg-error-container/40 text-error hover:bg-error-container/60 border border-error/30';
                } else if (pool.past) {
                  buttonLabel = 'Departed';
                  buttonDisabled = true;
                  buttonClass = 'bg-surface-container-high text-on-surface-variant cursor-not-allowed';
                  buttonIcon = 'schedule';
                } else if (pool.status === 'FULL') {
                  buttonLabel = 'Pool Full';
                  buttonDisabled = true;
                  buttonClass = 'bg-surface-container-high text-on-surface-variant cursor-not-allowed';
                  buttonIcon = 'block';
                }

                return (
                  <div
                    key={pool.id}
                    className={`bg-surface-container-lowest rounded-2xl p-5 border shadow-sm hover:shadow-md transition-all flex flex-col ${
                      ended ? 'border-outline-variant opacity-90' : 'border-tertiary-fixed'
                    }`}
                  >
                    <div className="flex justify-between items-start mb-3 gap-2">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 shrink-0 rounded-full bg-primary-container/30 text-primary font-bold flex items-center justify-center border border-primary/20">
                          {pool.creatorName ? pool.creatorName.charAt(0).toUpperCase() : '?'}
                        </div>
                        <div className="min-w-0">
                          <h4 className="text-label-sm font-label-sm text-on-surface font-semibold truncate">
                            {pool.creatorName}{pool.own ? ' (You)' : ''}
                          </h4>
                          <p className="text-label-xs text-on-surface-variant">{date} • {time}</p>
                        </div>
                      </div>
                      {badge && (
                        <span className={`px-2.5 py-1 rounded-full text-label-xs font-label-xs font-bold border shrink-0 ${badge.className}`}>
                          {badge.label}
                        </span>
                      )}
                    </div>

                    <div className="bg-surface-container-low p-3 rounded-xl mb-3 border border-outline-variant/30">
                      <div className="flex items-start gap-2 text-body-md font-body-md font-semibold text-on-surface">
                        <span className="material-symbols-outlined text-primary text-base mt-0.5">trip_origin</span>
                        <span className="min-w-0 break-words">{pool.startLocation}</span>
                      </div>
                      <div className="flex items-start gap-2 text-body-md font-body-md font-semibold text-on-surface mt-1">
                        <span className="material-symbols-outlined text-error text-base mt-0.5">location_on</span>
                        <span className="min-w-0 break-words">{pool.destination}</span>
                      </div>
                    </div>

                    <div className="flex justify-between text-label-xs text-on-surface-variant mb-3">
                      <span className="flex items-center gap-1">
                        <span className="material-symbols-outlined text-sm">event_seat</span>
                        {pool.availableSeats} of {pool.totalSeats} seats available
                      </span>
                    </div>

                    <div className="flex justify-between items-center pt-2 border-t border-outline-variant/20 text-label-xs mb-4">
                      <div>
                        <span className="text-on-surface-variant">Cost: </span>
                        <strong className="text-primary">{formatCurrency(pool.costPerPassenger)}</strong>
                        <span className="text-on-surface-variant"> / seat</span>
                      </div>
                      <div className="text-on-surface-variant">
                        Total: <strong className="text-on-surface">{formatCurrency(pool.totalCost)}</strong>
                      </div>
                    </div>

                    {(pool.ratePerKm != null || pool.passengerFare != null) && (
                      <div className="flex justify-between items-center text-label-xs text-on-surface-variant -mt-3 mb-4">
                        <span>
                          {pool.ratePerKm != null && <>{formatCurrency(pool.ratePerKm)}/km</>}
                        </span>
                        {pool.passengerFare != null && (
                          <span>
                            Est. fare for you: <strong className="text-primary">{formatCurrency(pool.passengerFare)}</strong>
                          </span>
                        )}
                      </div>
                    )}

                    {actionError && (
                      <p role="alert" className="text-error text-label-xs mb-2">{actionError}</p>
                    )}

                    <button
                      type="button"
                      onClick={buttonAction}
                      disabled={buttonDisabled || isBusy}
                      className={`mt-auto w-full py-2.5 rounded-xl font-label-xs font-semibold transition-colors cursor-pointer flex items-center justify-center gap-2 disabled:cursor-not-allowed ${buttonClass}`}
                    >
                      {isBusy ? (
                        <>
                          <span className="material-symbols-outlined text-base animate-spin">progress_activity</span>
                          <span>Please wait...</span>
                        </>
                      ) : (
                        <>
                          <span className="material-symbols-outlined text-sm">{buttonIcon}</span>
                          <span>{buttonLabel}</span>
                        </>
                      )}
                    </button>
                  </div>
                );
              })}
              </div>
            </>
          )}
        </>
      )}

      {activeTab === 'mine' && (
        <>
          {/* Loading state */}
          {loadingMyPools && (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {[0, 1].map((i) => (
                <div
                  key={i}
                  className="bg-surface-container-lowest rounded-2xl p-5 border border-outline-variant animate-pulse h-[240px]"
                >
                  <div className="h-4 w-2/3 bg-surface-container-high rounded mb-3" />
                  <div className="h-3 w-1/2 bg-surface-container-high rounded mb-6" />
                  <div className="h-3 w-full bg-surface-container-high rounded mb-2" />
                  <div className="h-3 w-4/5 bg-surface-container-high rounded" />
                </div>
              ))}
            </div>
          )}

          {/* Error state */}
          {!loadingMyPools && myPoolsError && (
            <div className="flex flex-col items-center justify-center py-16 bg-surface-container-lowest border border-tertiary-fixed rounded-2xl my-6">
              <span className="material-symbols-outlined text-5xl text-error mb-3">error</span>
              <h3 className="text-headline-sm font-headline-sm text-on-surface mb-2">Couldn't load your vehicle pools</h3>
              <p className="text-body-md font-body-md text-on-surface-variant text-center max-w-md mb-6">{myPoolsError}</p>
              <button
                type="button"
                onClick={loadMyPools}
                className="bg-primary text-on-primary rounded-xl px-6 py-2.5 text-label-sm font-label-sm hover:bg-primary/90 transition-colors shadow-md cursor-pointer flex items-center gap-2"
              >
                <span className="material-symbols-outlined text-sm">refresh</span>
                <span>Try Again</span>
              </button>
            </div>
          )}

          {/* Empty state */}
          {!loadingMyPools && !myPoolsError && myPools.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 bg-surface-container-lowest border border-tertiary-fixed rounded-2xl my-6">
              <span className="material-symbols-outlined text-5xl text-outline-variant mb-3">directions_car</span>
              <h3 className="text-headline-sm font-headline-sm text-on-surface mb-2">No active pools right now</h3>
              <p className="text-body-md font-body-md text-on-surface-variant text-center max-w-md mb-6">
                Create a vehicle pool for your route and manage passengers, seats, and status here. Once a pool is
                completed or terminated, it moves to Trip History.
              </p>
              <button
                type="button"
                onClick={() => setShowCreateModal(true)}
                className="bg-primary text-on-primary rounded-xl px-6 py-2.5 text-label-sm font-label-sm hover:bg-primary/90 transition-colors shadow-md cursor-pointer flex items-center gap-2"
              >
                <span className="material-symbols-outlined text-sm">add_circle</span>
                <span>Create a Pool</span>
              </button>
            </div>
          )}

          {/* My pools list */}
          {!loadingMyPools && !myPoolsError && myPools.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {myPools.map((pool) => {
                const { date, time } = formatDateTime(pool.departureTime);
                const badge = getStatusBadge(pool);
                const endError = endErrors[pool.id];
                const members = Array.isArray(pool.members) ? pool.members : [];

                return (
                  <div
                    key={pool.id}
                    className="bg-surface-container-lowest rounded-2xl p-5 border border-tertiary-fixed shadow-sm hover:shadow-md transition-all flex flex-col"
                  >
                    <div className="flex justify-between items-start mb-3 gap-2">
                      <div className="min-w-0">
                        <p className="text-label-xs text-on-surface-variant">{date} • {time}</p>
                        <p className="text-label-xs text-on-surface-variant mt-0.5">Created {formatDateTime(pool.createdAt).date}</p>
                      </div>
                      <span
                        className={`px-2.5 py-1 rounded-full text-label-xs font-label-xs font-bold border shrink-0 ${
                          badge ? badge.className : 'bg-primary-container/20 text-primary border-primary/30'
                        }`}
                      >
                        {badge ? badge.label : 'Available'}
                      </span>
                    </div>

                    <div className="bg-surface-container-low p-3 rounded-xl mb-3 border border-outline-variant/30">
                      <div className="flex items-start gap-2 text-body-md font-body-md font-semibold text-on-surface">
                        <span className="material-symbols-outlined text-primary text-base mt-0.5">trip_origin</span>
                        <span className="min-w-0 break-words">{pool.startLocation}</span>
                      </div>
                      <div className="flex items-start gap-2 text-body-md font-body-md font-semibold text-on-surface mt-1">
                        <span className="material-symbols-outlined text-error text-base mt-0.5">location_on</span>
                        <span className="min-w-0 break-words">{pool.destination}</span>
                      </div>
                    </div>

                    <div className="flex justify-between text-label-xs text-on-surface-variant mb-3">
                      <span className="flex items-center gap-1">
                        <span className="material-symbols-outlined text-sm">event_seat</span>
                        {pool.availableSeats} of {pool.totalSeats} seats available
                      </span>
                      <span>{formatCurrency(pool.costPerPassenger)} / seat</span>
                    </div>

                    {/* Passenger list */}
                    <div className="border-t border-outline-variant/20 pt-3 mb-4">
                      <p className="text-label-xs font-semibold text-on-surface-variant mb-2 flex items-center gap-1">
                        <span className="material-symbols-outlined text-sm">group</span>
                        Passengers ({members.length})
                      </p>
                      {members.length === 0 ? (
                        <p className="text-label-xs text-on-surface-variant italic">No passengers have joined yet.</p>
                      ) : (
                        <ul className="space-y-1 max-h-28 overflow-y-auto scrollbar-none">
                          {members.map((m, idx) => {
                            const joined = formatDateTime(m.joinedAt);
                            return (
                              <li key={`${pool.id}-${idx}`} className="flex justify-between text-label-xs text-on-surface">
                                <span className="truncate">{m.userName}</span>
                                <span className="text-on-surface-variant shrink-0 ml-2">{joined.date}</span>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>

                    {endError && (
                      <p role="alert" className="text-error text-label-xs mb-2">{endError}</p>
                    )}

                    {pool.canEnd ? (
                      <div className="mt-auto space-y-2">
                        <button
                          type="button"
                          onClick={() => setDetailsPoolId(pool.id)}
                          className="w-full py-2.5 rounded-xl font-label-xs font-semibold transition-colors cursor-pointer flex items-center justify-center gap-2 bg-primary-container/20 text-primary hover:bg-primary-container/40 border border-primary/30"
                        >
                          <span className="material-symbols-outlined text-sm">map</span>
                          <span>Details</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => openEndDialog(pool)}
                          disabled={endingPoolId === pool.id}
                          className="w-full py-2.5 rounded-xl font-label-xs font-semibold transition-colors cursor-pointer flex items-center justify-center gap-2 disabled:cursor-not-allowed bg-error-container/30 text-error hover:bg-error-container/50 border border-error/30"
                        >
                          <span className="material-symbols-outlined text-sm">stop_circle</span>
                          <span>End Pool</span>
                        </button>
                      </div>
                    ) : (
                      <div className="mt-auto w-full py-2.5 rounded-xl font-label-xs font-semibold text-center bg-surface-container-high text-on-surface-variant">
                        {pool.status === 'COMPLETED' ? 'Trip completed' : 'Pool terminated'}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {activeTab === 'history' && (
        <>
          {/* Loading state */}
          {loadingHistory && (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {[0, 1].map((i) => (
                <div
                  key={i}
                  className="bg-surface-container-lowest rounded-2xl p-5 border border-outline-variant animate-pulse h-[240px]"
                >
                  <div className="h-4 w-2/3 bg-surface-container-high rounded mb-3" />
                  <div className="h-3 w-1/2 bg-surface-container-high rounded mb-6" />
                  <div className="h-3 w-full bg-surface-container-high rounded mb-2" />
                  <div className="h-3 w-4/5 bg-surface-container-high rounded" />
                </div>
              ))}
            </div>
          )}

          {/* Error state */}
          {!loadingHistory && historyError && (
            <div className="flex flex-col items-center justify-center py-16 bg-surface-container-lowest border border-tertiary-fixed rounded-2xl my-6">
              <span className="material-symbols-outlined text-5xl text-error mb-3">error</span>
              <h3 className="text-headline-sm font-headline-sm text-on-surface mb-2">Couldn't load your trip history</h3>
              <p className="text-body-md font-body-md text-on-surface-variant text-center max-w-md mb-6">{historyError}</p>
              <button
                type="button"
                onClick={loadHistory}
                className="bg-primary text-on-primary rounded-xl px-6 py-2.5 text-label-sm font-label-sm hover:bg-primary/90 transition-colors shadow-md cursor-pointer flex items-center gap-2"
              >
                <span className="material-symbols-outlined text-sm">refresh</span>
                <span>Try Again</span>
              </button>
            </div>
          )}

          {/* Empty state */}
          {!loadingHistory && !historyError && history.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 bg-surface-container-lowest border border-tertiary-fixed rounded-2xl my-6">
              <span className="material-symbols-outlined text-5xl text-outline-variant mb-3">history</span>
              <h3 className="text-headline-sm font-headline-sm text-on-surface mb-2">No completed trips yet</h3>
              <p className="text-body-md font-body-md text-on-surface-variant text-center max-w-md">
                Pools you've created or joined will show up here once they're marked completed or terminated.
              </p>
            </div>
          )}

          {/* History list */}
          {!loadingHistory && !historyError && history.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {history.map((pool) => {
                const { date, time } = formatDateTime(pool.departureTime);
                const badge = getStatusBadge(pool);
                const members = Array.isArray(pool.members) ? pool.members : [];

                return (
                  <div
                    key={pool.id}
                    className="bg-surface-container-lowest rounded-2xl p-5 border border-tertiary-fixed shadow-sm hover:shadow-md transition-all flex flex-col opacity-95"
                  >
                    <div className="flex justify-between items-start mb-3 gap-2">
                      <div className="min-w-0">
                        <p className="text-label-xs font-semibold text-on-surface-variant flex items-center gap-1">
                          <span className="material-symbols-outlined text-sm">
                            {pool.own ? 'directions_car' : 'person'}
                          </span>
                          {pool.own ? 'You created this pool' : `Joined • ${pool.creatorName}`}
                        </p>
                        <p className="text-label-xs text-on-surface-variant mt-0.5">{date} • {time}</p>
                      </div>
                      {badge && (
                        <span className={`px-2.5 py-1 rounded-full text-label-xs font-label-xs font-bold border shrink-0 ${badge.className}`}>
                          {badge.label}
                        </span>
                      )}
                    </div>

                    <div className="bg-surface-container-low p-3 rounded-xl mb-3 border border-outline-variant/30">
                      <div className="flex items-start gap-2 text-body-md font-body-md font-semibold text-on-surface">
                        <span className="material-symbols-outlined text-primary text-base mt-0.5">trip_origin</span>
                        <span className="min-w-0 break-words">{pool.startLocation}</span>
                      </div>
                      <div className="flex items-start gap-2 text-body-md font-body-md font-semibold text-on-surface mt-1">
                        <span className="material-symbols-outlined text-error text-base mt-0.5">location_on</span>
                        <span className="min-w-0 break-words">{pool.destination}</span>
                      </div>
                    </div>

                    <div className="flex justify-between items-center pt-1 text-label-xs mb-3">
                      <div>
                        <span className="text-on-surface-variant">Cost: </span>
                        <strong className="text-primary">{formatCurrency(pool.costPerPassenger)}</strong>
                        <span className="text-on-surface-variant"> / seat</span>
                      </div>
                      <div className="text-on-surface-variant">
                        Total: <strong className="text-on-surface">{formatCurrency(pool.totalCost)}</strong>
                      </div>
                    </div>

                    {/* Member list -- who shared this ride */}
                    <div className="border-t border-outline-variant/20 pt-3">
                      <p className="text-label-xs font-semibold text-on-surface-variant mb-2 flex items-center gap-1">
                        <span className="material-symbols-outlined text-sm">group</span>
                        Members ({members.length + 1})
                      </p>
                      <ul className="space-y-1 max-h-28 overflow-y-auto scrollbar-none">
                        <li className="flex justify-between text-label-xs text-on-surface">
                          <span className="truncate">{pool.creatorName}{pool.own ? ' (You, creator)' : ' (creator)'}</span>
                        </li>
                        {members.map((m, idx) => {
                          const joined = formatDateTime(m.joinedAt);
                          return (
                            <li key={`${pool.id}-${idx}`} className="flex justify-between text-label-xs text-on-surface">
                              <span className="truncate">{m.userName}{pool.joined && !pool.own && user?.name === m.userName ? ' (You)' : ''}</span>
                              <span className="text-on-surface-variant shrink-0 ml-2">{joined.date}</span>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Phase 4 - Active Pool Details map (My Pools -> Active Pool -> Details only) */}
      {detailsPoolId && (
        <ActivePoolDetailsModal poolId={detailsPoolId} onClose={() => setDetailsPoolId(null)} />
      )}

      {/* End Pool confirm dialog */}
      {endDialogPool && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm px-4 py-6 overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-labelledby="end-pool-title"
          onClick={closeEndDialog}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-surface-container-lowest border border-outline-variant shadow-lg p-6 my-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-2">
              <h2 id="end-pool-title" className="text-headline-md font-headline-md font-bold text-on-surface">
                End this Vehicle Pool?
              </h2>
              <button
                type="button"
                onClick={closeEndDialog}
                disabled={endingPoolId === endDialogPool.id}
                className="text-on-surface-variant hover:text-on-surface cursor-pointer disabled:opacity-50"
                aria-label="Close"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <p className="text-body-md font-body-md text-on-surface-variant mb-5">
              Once ended, <strong className="text-on-surface">{endDialogPool.startLocation} → {endDialogPool.destination}</strong> will
              stop accepting new passengers. This can't be undone.
            </p>

            {endErrors[endDialogPool.id] && (
              <div role="alert" className="bg-error-container/20 border border-error/30 text-error p-3 rounded-xl text-label-xs mb-4">
                {endErrors[endDialogPool.id]}
              </div>
            )}

            <div className="space-y-2">
              <button
                type="button"
                onClick={() => runEndPool(endDialogPool.id, 'complete')}
                disabled={endingPoolId === endDialogPool.id}
                className="w-full py-2.5 rounded-xl font-label-sm font-semibold transition-colors cursor-pointer flex items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-70 bg-primary text-on-primary hover:bg-primary/90"
              >
                <span className="material-symbols-outlined text-sm">flag</span>
                <span>Mark Trip Completed</span>
              </button>
              <button
                type="button"
                onClick={() => runEndPool(endDialogPool.id, 'terminate')}
                disabled={endingPoolId === endDialogPool.id}
                className="w-full py-2.5 rounded-xl font-label-sm font-semibold transition-colors cursor-pointer flex items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-70 bg-error-container/30 text-error hover:bg-error-container/50 border border-error/30"
              >
                {endingPoolId === endDialogPool.id ? (
                  <>
                    <span className="material-symbols-outlined text-base animate-spin">progress_activity</span>
                    <span>Please wait...</span>
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-sm">block</span>
                    <span>Terminate Pool</span>
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={closeEndDialog}
                disabled={endingPoolId === endDialogPool.id}
                className="w-full py-2.5 rounded-xl font-label-sm text-on-surface-variant hover:bg-surface-variant transition-colors cursor-pointer disabled:opacity-60"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Pool Modal */}
      {showCreateModal && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm px-4 py-6 overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-pool-title"
          onClick={closeCreateModal}
        >
          <div
            className="w-full max-w-lg rounded-2xl bg-surface-container-lowest border border-outline-variant shadow-lg p-6 my-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 id="create-pool-title" className="text-headline-md font-headline-md font-bold text-on-surface">
                Create a Vehicle Pool
              </h2>
              <button
                type="button"
                onClick={closeCreateModal}
                className="text-on-surface-variant hover:text-on-surface cursor-pointer"
                aria-label="Close"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            {createError && (
              <div role="alert" className="bg-error-container/20 border border-error/30 text-error p-3 rounded-xl text-label-xs mb-4">
                {createError}
              </div>
            )}

            <form onSubmit={handleCreateSubmit} noValidate className="space-y-4">
              <div>
                <label htmlFor="startLocation" className="block text-label-xs font-semibold text-on-surface mb-1">Start location</label>
                <LocationAutocompleteInput
                  id="startLocation"
                  name="startLocation"
                  value={form.startLocation}
                  onInputChange={handleFormStartLocationInputChange}
                  onSelectLocation={handleFormStartLocationSelect}
                  selectedLocation={formStartLocationGeo}
                  placeholder="e.g. Vijay Nagar, Indore"
                  hasError={!!fieldErrors.startLocation}
                  inputClassName={`w-full bg-surface-container-low border rounded-xl pl-9 pr-3 py-2.5 text-body-md text-on-surface focus:outline-none focus:border-primary ${fieldErrors.startLocation ? 'border-error' : 'border-outline-variant'}`}
                />
                {fieldErrors.startLocation && <p className="text-error text-label-xs mt-1">{fieldErrors.startLocation}</p>}
              </div>

              <div>
                <label htmlFor="destination" className="block text-label-xs font-semibold text-on-surface mb-1">Destination</label>
                <LocationAutocompleteInput
                  id="destination"
                  name="destination"
                  value={form.destination}
                  onInputChange={handleFormDestinationInputChange}
                  onSelectLocation={handleFormDestinationSelect}
                  selectedLocation={formDestinationGeo}
                  placeholder="e.g. Rajwada, Indore"
                  hasError={!!fieldErrors.destination}
                  inputClassName={`w-full bg-surface-container-low border rounded-xl pl-9 pr-3 py-2.5 text-body-md text-on-surface focus:outline-none focus:border-primary ${fieldErrors.destination ? 'border-error' : 'border-outline-variant'}`}
                />
                {fieldErrors.destination && <p className="text-error text-label-xs mt-1">{fieldErrors.destination}</p>}
              </div>

              <div>
                <label htmlFor="departureTime" className="block text-label-xs font-semibold text-on-surface mb-1">Date &amp; time</label>
                <input
                  id="departureTime"
                  name="departureTime"
                  type="datetime-local"
                  min={nowForDateTimeLocal()}
                  value={form.departureTime}
                  onChange={handleFormChange}
                  className={`w-full bg-surface-container-low border rounded-xl px-4 py-2.5 text-body-md text-on-surface focus:outline-none focus:border-primary ${fieldErrors.departureTime ? 'border-error' : 'border-outline-variant'}`}
                />
                {fieldErrors.departureTime && <p className="text-error text-label-xs mt-1">{fieldErrors.departureTime}</p>}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="totalSeats" className="block text-label-xs font-semibold text-on-surface mb-1">Available seats</label>
                  <input
                    id="totalSeats"
                    name="totalSeats"
                    type="number"
                    min="1"
                    max="20"
                    step="1"
                    value={form.totalSeats}
                    onChange={handleFormChange}
                    className={`w-full bg-surface-container-low border rounded-xl px-4 py-2.5 text-body-md text-on-surface focus:outline-none focus:border-primary ${fieldErrors.totalSeats ? 'border-error' : 'border-outline-variant'}`}
                  />
                  {fieldErrors.totalSeats && <p className="text-error text-label-xs mt-1">{fieldErrors.totalSeats}</p>}
                </div>

                <div>
                  <label htmlFor="costPerPassenger" className="block text-label-xs font-semibold text-on-surface mb-1">Cost per passenger (₹)</label>
                  <input
                    id="costPerPassenger"
                    name="costPerPassenger"
                    type="number"
                    min="0"
                    step="1"
                    value={form.costPerPassenger}
                    onChange={handleFormChange}
                    className={`w-full bg-surface-container-low border rounded-xl px-4 py-2.5 text-body-md text-on-surface focus:outline-none focus:border-primary ${fieldErrors.costPerPassenger ? 'border-error' : 'border-outline-variant'}`}
                    placeholder="e.g. 50"
                  />
                  {fieldErrors.costPerPassenger && <p className="text-error text-label-xs mt-1">{fieldErrors.costPerPassenger}</p>}
                </div>
              </div>

              <div className="bg-surface-container-low rounded-xl px-4 py-3 flex justify-between items-center text-label-sm">
                <span className="text-on-surface-variant">Estimated total cost</span>
                <strong className="text-primary">{formatCurrency(totalCostPreview)}</strong>
              </div>

              <div className="flex gap-3 justify-end pt-2">
                <button
                  type="button"
                  onClick={closeCreateModal}
                  disabled={creating}
                  className="px-4 py-2.5 rounded-xl font-label-sm text-on-surface-variant hover:bg-surface-variant transition-colors cursor-pointer disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-5 py-2.5 rounded-xl font-label-sm bg-primary text-on-primary hover:bg-primary/90 transition-colors shadow-sm cursor-pointer flex items-center gap-2 font-semibold disabled:opacity-70 disabled:cursor-not-allowed"
                >
                  {creating ? (
                    <>
                      <span className="material-symbols-outlined text-base animate-spin">progress_activity</span>
                      <span>Creating...</span>
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-sm">add_circle</span>
                      <span>Create Pool</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Join Pool confirmation modal (Phase 2) */}
      {joinModalPool && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm px-4 py-6 overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-labelledby="join-pool-title"
          onClick={closeJoinModal}
        >
          <div
            className="w-full max-w-lg rounded-2xl bg-surface-container-lowest border border-outline-variant shadow-lg p-6 my-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 id="join-pool-title" className="text-headline-md font-headline-md font-bold text-on-surface">
                Confirm Your Ride
              </h2>
              <button
                type="button"
                onClick={closeJoinModal}
                disabled={joining}
                className="text-on-surface-variant hover:text-on-surface cursor-pointer disabled:opacity-50"
                aria-label="Close"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="bg-surface-container-low rounded-xl p-4 mb-4 space-y-2">
              <div className="flex items-start gap-2 text-body-md font-body-md font-semibold text-on-surface">
                <span className="material-symbols-outlined text-error text-base mt-0.5">location_on</span>
                <span className="min-w-0 break-words">To {joinModalPool.destination}</span>
              </div>
              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-outline-variant/30 text-label-xs">
                <div>
                  <span className="text-on-surface-variant block">Rate</span>
                  <strong className="text-on-surface">
                    {joinModalPool.ratePerKm != null ? `${formatCurrency(joinModalPool.ratePerKm)}/km` : '—'}
                  </strong>
                </div>
                <div>
                  <span className="text-on-surface-variant block">Route distance</span>
                  <strong className="text-on-surface">{formatDistanceKm(joinModalPool.passengerRouteDistanceMeters)}</strong>
                </div>
                <div className="col-span-2 pt-1">
                  <span className="text-on-surface-variant block">Estimated fare</span>
                  <strong className="text-primary text-body-md">
                    {joinModalPool.passengerFare != null ? formatCurrency(joinModalPool.passengerFare) : 'Calculated after you confirm'}
                  </strong>
                </div>
              </div>
              <p className="text-label-xs text-on-surface-variant pt-1">
                Final fare is always recalculated by the server and may differ slightly if you change your pickup location below.
              </p>
            </div>

            {joinError && (
              <div role="alert" className="bg-error-container/20 border border-error/30 text-error p-3 rounded-xl text-label-xs mb-4">
                {joinError}
              </div>
            )}

            <form onSubmit={submitJoin} noValidate className="space-y-4">
              <div>
                <label htmlFor="joinPickup" className="block text-label-xs font-semibold text-on-surface mb-1">
                  Pickup location
                </label>
                <LocationAutocompleteInput
                  id="joinPickup"
                  name="joinPickup"
                  value={joinPickupText}
                  onInputChange={handleJoinPickupInputChange}
                  onSelectLocation={handleJoinPickupSelect}
                  selectedLocation={joinPickupGeo}
                  placeholder="Where should the driver pick you up?"
                  hasError={!!joinFieldErrors.pickup}
                  inputClassName={`w-full bg-surface-container-low border rounded-xl pl-9 pr-3 py-2.5 text-body-md text-on-surface focus:outline-none focus:border-primary ${joinFieldErrors.pickup ? 'border-error' : 'border-outline-variant'}`}
                  rightSlot={
                    <button
                      type="button"
                      onClick={handleUseCurrentLocationForJoin}
                      disabled={joinLocating}
                      title="Use current location"
                      className="text-primary hover:text-primary/80 cursor-pointer disabled:opacity-50 shrink-0 px-1"
                    >
                      <span className={`material-symbols-outlined text-base ${joinLocating ? 'animate-spin' : ''}`}>
                        {joinLocating ? 'progress_activity' : 'my_location'}
                      </span>
                    </button>
                  }
                />
                {joinFieldErrors.pickup && <p className="text-error text-label-xs mt-1">{joinFieldErrors.pickup}</p>}
              </div>

              <div>
                <label htmlFor="joinPhone" className="block text-label-xs font-semibold text-on-surface mb-1">
                  Phone number
                </label>
                <input
                  id="joinPhone"
                  name="joinPhone"
                  type="tel"
                  value={joinPhone}
                  onChange={(e) => {
                    setJoinPhone(e.target.value);
                    setJoinFieldErrors((prev) => ({ ...prev, phone: undefined }));
                  }}
                  placeholder="e.g. +91 98765 43210"
                  className={`w-full bg-surface-container-low border rounded-xl px-4 py-2.5 text-body-md text-on-surface focus:outline-none focus:border-primary ${joinFieldErrors.phone ? 'border-error' : 'border-outline-variant'}`}
                />
                {joinFieldErrors.phone && <p className="text-error text-label-xs mt-1">{joinFieldErrors.phone}</p>}
                <p className="text-label-xs text-on-surface-variant mt-1">Shared with the driver only, so they can reach you.</p>
              </div>

              <div className="flex gap-3 justify-end pt-2">
                <button
                  type="button"
                  onClick={closeJoinModal}
                  disabled={joining}
                  className="px-4 py-2.5 rounded-xl font-label-sm text-on-surface-variant hover:bg-surface-variant transition-colors cursor-pointer disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={joining}
                  className="px-5 py-2.5 rounded-xl font-label-sm bg-primary text-on-primary hover:bg-primary/90 transition-colors shadow-sm cursor-pointer flex items-center gap-2 font-semibold disabled:opacity-70 disabled:cursor-not-allowed"
                >
                  {joining ? (
                    <>
                      <span className="material-symbols-outlined text-base animate-spin">progress_activity</span>
                      <span>Joining...</span>
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-sm">person_add</span>
                      <span>Confirm &amp; Join</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <NotificationToast toasts={toasts} onDismiss={dismissToast} />
    </main>
  );
}
