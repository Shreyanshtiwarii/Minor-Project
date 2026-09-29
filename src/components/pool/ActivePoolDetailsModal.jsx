import React, { useEffect, useRef, useState } from 'react';
import GreenMoveMap from '../map/GreenMoveMap';
import NotificationToast, { useToastStack } from '../NotificationToast';
import { getActivePoolDetails } from '../../services/vehiclePoolService';
import { buildPoolRouteStops } from '../../utils/poolRouteStops';

/**
 * Phase 5 - Carpool operational integration: how often this modal re-fetches
 * /active-details, while it's open, purely to detect newly-joined passengers and
 * surface a "X just joined your pool" notification to the driver. There's no
 * websocket/push infrastructure in this app, so short polling of the already-existing
 * (Phase 3) endpoint -- not a new one -- is the mechanism; it also keeps the map/stop
 * list current if a passenger joins while the driver has this modal open.
 */
const NEW_PASSENGER_POLL_MS = 15000;

/** Stable-enough per-passenger identity for diffing across polls (no member id is exposed). */
function passengerKey(p) {
  return `${p.userName || ''}|${p.joinedAt || ''}|${p.pickupLocation || ''}`;
}

function formatTime(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function formatFare(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  return `₹${Number(value).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

/**
 * Phase 4 - Active Pool Details map.
 *
 * Only ever mounted from "My Pools -> Active Pool -> Details" (see VehiclePool.jsx).
 * Fetches the driver-only /pools/{id}/active-details payload and renders:
 *   - the driver's existing stored route_geom (A -> B), start & destination markers
 *   - one pickup + one dropoff marker per joined passenger, multiple at once
 *   - stops ordered by position along the route (not DB insertion order)
 *   - a click-to-reveal passenger detail (name, pickup/dropoff, approx pickup time,
 *     fare) via the map marker popup, plus a matching list panel alongside the map
 *   - phone number, since this endpoint is already restricted server-side to the
 *     authenticated pool owner, is simply rendered whenever the API returns it
 * Renders the route with no passengers, and degrades gracefully for legacy pools
 * with no stored route geometry (map still shows start/destination).
 * Never calls Google Routes -- everything comes from already-stored pool data.
 */
export default function ActivePoolDetailsModal({ poolId, onClose }) {
  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedStopId, setSelectedStopId] = useState(null);

  // Phase 5 - Carpool operational integration: notify the driver when a new passenger
  // joins while this modal is open, via the shared toast stack.
  const { toasts, pushToast, dismissToast } = useToastStack();
  const knownPassengerKeys = useRef(null); // null until the first successful load

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setDetails(null);
    knownPassengerKeys.current = null;

    getActivePoolDetails(poolId)
      .then((data) => {
        if (cancelled) return;
        setDetails(data);
        knownPassengerKeys.current = new Set((data.passengers || []).map(passengerKey));
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Unable to load pool details right now.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    // Poll for newly-joined passengers so the driver is notified even without manually
    // refreshing -- reuses the existing active-details endpoint, no new backend call.
    const intervalId = setInterval(() => {
      getActivePoolDetails(poolId)
        .then((data) => {
          if (cancelled) return;
          const previousKeys = knownPassengerKeys.current;
          const incoming = data.passengers || [];
          if (previousKeys) {
            const newArrivals = incoming.filter((p) => !previousKeys.has(passengerKey(p)));
            newArrivals.forEach((p) => {
              const timeLabel = formatTime(p.approxPickupTime);
              pushToast({
                icon: 'person_add',
                tone: 'success',
                title: `${p.userName || 'A passenger'} joined your pool`,
                message: [
                  p.pickupLocation ? `Pickup: ${p.pickupLocation}` : null,
                  timeLabel ? `~${timeLabel}` : null
                ].filter(Boolean).join(' · ') || 'View their details in the list below.'
              });
            });
          }
          knownPassengerKeys.current = new Set(incoming.map(passengerKey));
          setDetails(data);
        })
        .catch(() => {
          // Silent: a failed background poll shouldn't disrupt the modal the driver
          // already has open, or surface a duplicate of the initial-load error state.
        });
    }, NEW_PASSENGER_POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [poolId]);

  const stops = details ? buildPoolRouteStops(details) : [];

  const origin = details && typeof details.startLatitude === 'number' && typeof details.startLongitude === 'number'
    ? { lat: details.startLatitude, lng: details.startLongitude }
    : null;
  const destination = details && typeof details.destinationLatitude === 'number' && typeof details.destinationLongitude === 'number'
    ? { lat: details.destinationLatitude, lng: details.destinationLongitude }
    : null;
  const route = details && details.routeGeometry
    ? { geometry: details.routeGeometry, mode: 'DRIVING', trafficAvailable: false }
    : null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm px-4 py-6 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="active-pool-details-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-5xl rounded-2xl bg-surface-container-lowest border border-outline-variant shadow-lg my-auto overflow-hidden flex flex-col max-h-[90vh] relative"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant/30">
          <div className="min-w-0">
            <h2 id="active-pool-details-title" className="text-headline-md font-headline-md font-bold text-on-surface truncate">
              Active Pool Details
            </h2>
            {details && (
              <p className="text-label-xs text-on-surface-variant truncate mt-0.5">
                {details.startLocation} → {details.destination}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-on-surface-variant hover:text-on-surface cursor-pointer shrink-0 ml-4"
            aria-label="Close"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {loading && (
          <div className="flex flex-col items-center justify-center py-20">
            <span className="material-symbols-outlined text-4xl text-primary animate-spin mb-3">progress_activity</span>
            <p className="text-body-md text-on-surface-variant">Loading pool details…</p>
          </div>
        )}

        {!loading && error && (
          <div className="flex flex-col items-center justify-center py-20 px-6">
            <span className="material-symbols-outlined text-4xl text-error mb-3">error</span>
            <p className="text-body-md text-on-surface-variant text-center">{error}</p>
          </div>
        )}

        {!loading && !error && details && (
          <div className="flex flex-col md:flex-row flex-1 min-h-0">
            {/* Map */}
            <div className="relative w-full md:w-2/3 h-[240px] sm:h-[320px] md:h-[520px] bg-surface-container-low shrink-0 md:shrink">
              <GreenMoveMap
                origin={origin}
                destination={destination}
                route={route}
                stops={stops}
                onStopClick={(stop) => setSelectedStopId(stop.id)}
              />
            </div>

            {/* Passenger stop list */}
            <div className="w-full md:w-1/3 border-t md:border-t-0 md:border-l border-outline-variant/30 p-4 overflow-y-auto">
              <p className="text-label-xs font-semibold text-on-surface-variant mb-3 flex items-center gap-1">
                <span className="material-symbols-outlined text-sm">group</span>
                Passengers ({details.passengers ? details.passengers.length : 0})
              </p>

              {stops.length === 0 && (
                <p className="text-label-xs text-on-surface-variant italic">
                  No passengers have joined yet. The route above still shows your planned trip.
                </p>
              )}

              <ul className="space-y-2">
                {stops.map((stop) => {
                  const isSelected = selectedStopId === stop.id;
                  const timeLabel = formatTime(stop.approxPickupTime);
                  return (
                    <li
                      key={stop.id}
                      className={`rounded-xl border p-3 cursor-pointer transition-colors ${
                        isSelected ? 'border-primary bg-primary-container/10' : 'border-outline-variant/30 hover:bg-surface-container-low'
                      }`}
                      onClick={() => setSelectedStopId(stop.id)}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="flex items-center gap-1.5 text-body-md font-body-md font-semibold text-on-surface truncate">
                          <span
                            className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-white text-[10px] font-bold shrink-0 ${
                              stop.kind === 'pickup' ? 'bg-primary' : 'bg-amber-600'
                            }`}
                          >
                            {stop.order}
                          </span>
                          <span className="truncate">{stop.passengerName || 'Passenger'}</span>
                        </span>
                        <span className="text-label-xs text-on-surface-variant shrink-0">
                          {stop.kind === 'pickup' ? 'Pickup' : 'Dropoff'}
                        </span>
                      </div>
                      {stop.locationLabel && (
                        <p className="text-label-xs text-on-surface-variant truncate">{stop.locationLabel}</p>
                      )}
                      <div className="flex items-center justify-between mt-1.5 text-label-xs">
                        <span className="font-semibold text-on-surface">{formatFare(stop.fare)}</span>
                      </div>
                      {stop.phoneNumber && (
                        <p className="text-label-xs text-on-surface-variant mt-1 flex items-center gap-1">
                          <span className="material-symbols-outlined text-[13px]">call</span>
                          {stop.phoneNumber}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        )}

        <NotificationToast toasts={toasts} onDismiss={dismissToast} contained />
      </div>
    </div>
  );
}
