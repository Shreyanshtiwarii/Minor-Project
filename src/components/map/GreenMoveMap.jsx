import React, { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
// MapLibre GL JS v6 is ESM-only and loads its vector-tile worker from a separate file at
// runtime. Bundlers (including Vite) cannot auto-resolve that worker URL, so without this
// one-time setWorkerUrl() call the worker request 404s silently: the style's background
// layer still renders (hence a flat, blank-colored map) but vector tile data (streets,
// labels) never loads, and since the map can be left waiting on tile requests that never
// resolve, 'load' may never fire either — which also prevents markers/route rendering,
// since those are gated behind the mapLoaded flag. The '?worker&url' query (not plain
// '?url') is required so Vite emits a self-contained worker chunk that includes the
// worker's sibling module rather than a bare file that fails on its first import.
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';

if (typeof maplibregl.setWorkerUrl === 'function') {
  maplibregl.setWorkerUrl(maplibreWorkerUrl);
}

// Default center: Bangalore
const DEFAULT_CENTER = [77.5946, 12.9716];

export default function GreenMoveMap({ origin, destination, route, evStations = [], unsafeSegment = null, stops = [], onStopClick = null, onRecenterRef }) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  
  // Marker references
  const originMarkerRef = useRef(null);
  const destinationMarkerRef = useRef(null);
  const evStationMarkersRef = useRef([]);
  // Phase 4 - Active Pool Details: pickup/dropoff passenger stop markers. Purely
  // additive -- callers that don't pass `stops` render exactly as before.
  const stopMarkersRef = useRef([]);

  const apiKey = import.meta.env.VITE_MAPTILER_API_KEY || '';
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapError, setMapError] = useState(null);

  // Initialize MapLibre Map
  useEffect(() => {
    if (!apiKey || !mapContainerRef.current) return;
    setMapError(null);

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: `https://api.maptiler.com/maps/streets-v2/style.json?key=${apiKey}`,
      center: DEFAULT_CENTER,
      zoom: 12,
    });

    mapRef.current = map;

    // Attach ResizeObserver to automatically handle container dimension changes
    let resizeObserver = null;
    if (typeof ResizeObserver !== 'undefined' && mapContainerRef.current) {
      resizeObserver = new ResizeObserver(() => {
        if (mapRef.current) {
          mapRef.current.resize();
        }
      });
      resizeObserver.observe(mapContainerRef.current);
    }

    // Safety net: if the map's 'load' event never fires (e.g. the MapTiler key/style
    // request is blocked, restricted to a different domain, or times out) the map would
    // otherwise stay silently blank forever with no marker/route rendering and no visible
    // error. Surface a clear message instead so this failure mode is never invisible.
    const loadTimeoutId = setTimeout(() => {
      setMapError("Map failed to load in time. This usually means the MapTiler API key is invalid, expired, or not allow-listed for this domain. Check your VITE_MAPTILER_API_KEY configuration and the key's allowed origins in the MapTiler dashboard.");
    }, 10000);

    map.on('load', () => {
      clearTimeout(loadTimeoutId);
      map.resize();
      setTimeout(() => map?.resize(), 100);
      setTimeout(() => map?.resize(), 500);
      setMapLoaded(true);
      setMapError(null);
    });

    map.on('error', (e) => {
      console.error("MapLibre error encountered:", e);
      const msg = e && e.error && e.error.message ? e.error.message : '';
      const status = e && e.error && e.error.status ? e.error.status : null;
      if (msg.includes('403') || status === 403 || msg.includes('Forbidden') || msg.includes('Key usage restricted')) {
        setMapError("MapTiler 403 Forbidden: the API key is invalid or this domain isn't allow-listed for it. Check VITE_MAPTILER_API_KEY and the key's allowed origins in the MapTiler dashboard.");
      } else if (msg.includes('401') || status === 401 || msg.toLowerCase().includes('unauthorized')) {
        setMapError("MapTiler 401 Unauthorized: the API key is missing or invalid. Check VITE_MAPTILER_API_KEY.");
      } else if (msg) {
        setMapError(`Map loading error: ${msg}`);
      } else {
        // Even when MapLibre doesn't attach a readable message (common for blocked/CORS
        // network failures), still surface something actionable rather than staying silent.
        setMapError("Map failed to load a required resource. Check your network connection, ad blockers/CORS, and that VITE_MAPTILER_API_KEY is valid for this domain.");
      }
    });

    return () => {
      clearTimeout(loadTimeoutId);
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      if (originMarkerRef.current) {
        originMarkerRef.current.remove();
        originMarkerRef.current = null;
      }
      if (destinationMarkerRef.current) {
        destinationMarkerRef.current.remove();
        destinationMarkerRef.current = null;
      }
      evStationMarkersRef.current.forEach(m => m.remove());
      evStationMarkersRef.current = [];
      stopMarkersRef.current.forEach(m => m.remove());
      stopMarkersRef.current = [];
      map.remove();
    };
  }, [apiKey]);

  // Handle Marker & Centering updates dynamically
  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return;
    const map = mapRef.current;

    // 1. Manage Origin Marker
    if (!origin || typeof origin.lng !== 'number' || typeof origin.lat !== 'number') {
      if (originMarkerRef.current) {
        originMarkerRef.current.remove();
        originMarkerRef.current = null;
      }
    } else {
      const coords = [origin.lng, origin.lat];
      if (originMarkerRef.current) {
        originMarkerRef.current.setLngLat(coords);
      } else {
        const originEl = document.createElement('div');
        originEl.className = 'w-6 h-6 rounded-full bg-white border-[3px] border-primary flex items-center justify-center shadow-md';
        const originDot = document.createElement('div');
        originDot.className = 'w-2 h-2 rounded-full bg-primary';
        originEl.appendChild(originDot);

        originMarkerRef.current = new maplibregl.Marker({ element: originEl })
          .setLngLat(coords)
          .addTo(map);
      }
    }

    // 2. Manage Destination Marker
    if (!destination || typeof destination.lng !== 'number' || typeof destination.lat !== 'number') {
      if (destinationMarkerRef.current) {
        destinationMarkerRef.current.remove();
        destinationMarkerRef.current = null;
      }
    } else {
      const coords = [destination.lng, destination.lat];
      if (destinationMarkerRef.current) {
        destinationMarkerRef.current.setLngLat(coords);
      } else {
        const destEl = document.createElement('div');
        destEl.className = 'flex items-center justify-center';
        destEl.innerHTML = `
          <div class="relative drop-shadow-md">
            <span class="material-symbols-outlined text-[36px] text-error" style="font-variation-settings: 'FILL' 1;">location_on</span>
            <div class="absolute top-[7px] left-[12px] w-3 h-3 rounded-full bg-white"></div>
          </div>
        `;

        destinationMarkerRef.current = new maplibregl.Marker({ element: destEl })
          .setLngLat(coords)
          .addTo(map);
      }
    }

    // 3. Manage EV Charging Station Markers
    evStationMarkersRef.current.forEach(m => m.remove());
    evStationMarkersRef.current = [];

    if (Array.isArray(evStations) && evStations.length > 0) {
      evStations.forEach(st => {
        if (typeof st.longitude === 'number' && typeof st.latitude === 'number') {
          // Optional sequence number (Stop 1, Stop 2, ...) so a calculated multi-stop route
          // clearly shows its Origin -> Stop 1 -> Stop 2 -> Destination segments on the map.
          // Purely additive: callers that don't pass stopNumber render exactly as before.
          const hasStopNumber = typeof st.stopNumber === 'number';
          const stopBadge = hasStopNumber
            ? `<span class="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-white text-emerald-700 border border-emerald-600 text-[10px] font-bold flex items-center justify-center shadow-sm">${st.stopNumber}</span>`
            : '';

          // Optional star badge marking a station the EV Intelligence charging-plan
          // algorithm recommends as a stop (Phase 3/4: ⭐ Recommended charging stops).
          // Purely additive: callers that don't pass isRecommended render exactly as before.
          const recommendedBadge = (st.isRecommended && !hasStopNumber)
            ? `<span class="absolute -top-1.5 -right-1.5 w-[18px] h-[18px] rounded-full bg-amber-400 border border-white text-white text-[10px] flex items-center justify-center shadow-sm">★</span>`
            : '';

          // A station is rendered in red when it is the last reachable point beyond which
          // the route becomes unsafe (Phase 4: 🔴 unsafe segment marker). Purely additive:
          // callers that don't pass `unsafe` render the existing emerald marker as before.
          const markerColorClass = st.unsafe
            ? 'bg-error'
            : (st.isRecommended || hasStopNumber ? 'bg-emerald-600' : 'bg-emerald-600');

          const evEl = document.createElement('div');
          evEl.className = `relative w-8 h-8 rounded-full ${markerColorClass} border-2 border-white text-white flex items-center justify-center shadow-lg cursor-pointer hover:scale-110 transition-transform`;
          evEl.innerHTML = `<span class="material-symbols-outlined text-sm">ev_station</span>${stopBadge}${recommendedBadge}`;

          const connSummary = Array.isArray(st.connectors) && st.connectors.length > 0
            ? st.connectors.map(c => `${c.powerKw || 22} kW (${c.connectorType || 'Plug'})`).join(', ')
            : 'Fast Charging Available';

          const stopLabel = hasStopNumber ? `Stop ${st.stopNumber}: ` : '';

          // Optional richer recommendation/safety details (Phase 3), shown in the popup only
          // when the caller supplies them — purely additive, existing callers (e.g. Plan
          // Route) that pass plain station objects render exactly the same popup as before.
          const hasRecommendationDetails = st.reason || typeof st.rangeOnArrivalKm === 'number' || typeof st.nextStationDistanceKm === 'number';
          const safetyLine = st.safetyStatus === 'unsafe'
            ? `<div style="font-size: 11px; font-weight: 700; color: #ba1a1a; margin-bottom: 4px;">🔴 Not Safe beyond this point</div>`
            : (st.safetyStatus === 'safe'
                ? `<div style="font-size: 11px; font-weight: 700; color: #047857; margin-bottom: 4px;">🟢 Safe — next charger in range</div>`
                : '');
          const recommendationDetails = hasRecommendationDetails
            ? `
              <div style="font-size: 10px; color: #374151; margin-top: 4px; border-top: 1px solid #e5e7eb; padding-top: 4px;">
                ${typeof st.rangeOnArrivalKm === 'number' ? `<div>Range on arrival: <strong>~${st.rangeOnArrivalKm} km</strong></div>` : ''}
                ${typeof st.nextStationDistanceKm === 'number' ? `<div>Next stop (${st.nextStationLabel || 'onward'}): <strong>${st.nextStationDistanceKm} km</strong></div>` : ''}
                ${st.reason ? `<div style="margin-top:2px;">${st.reason}</div>` : ''}
              </div>
            `
            : '';

          const popupContent = `
            <div style="font-family: system-ui, sans-serif; padding: 4px; max-width: 240px;">
              <div style="font-weight: bold; font-size: 13px; color: #004100; margin-bottom: 4px;">${stopLabel}${st.name}</div>
              <div style="font-size: 11px; color: #4b5563; margin-bottom: 6px;">${st.address || st.city}</div>
              ${safetyLine}
              <div style="font-size: 11px; font-weight: 600; color: #059669; margin-bottom: 4px;">⚡ ${st.distanceFromRouteKm ? `${st.distanceFromRouteKm} km from route` : 'Along route'}</div>
              <div style="font-size: 10px; color: #6b7280;">${connSummary}</div>
              ${recommendationDetails}
              <div style="font-size: 9px; color: #9ca3af; border-top: 1px solid #e5e7eb; pt: 4px; mt: 4px;">${st.attribution || 'Data provided by Open Charge Map'}</div>
            </div>
          `;

          const popup = new maplibregl.Popup({ offset: 15 }).setHTML(popupContent);

          const marker = new maplibregl.Marker({ element: evEl })
            .setLngLat([st.longitude, st.latitude])
            .setPopup(popup)
            .addTo(map);

          evStationMarkersRef.current.push(marker);
        }
      });
    }

    // 3b. Manage Passenger Pickup/Dropoff Stop Markers (Phase 4: Active Pool Details).
    // Purely additive -- only drawn when the caller supplies `stops`; existing callers
    // that don't pass this prop render exactly as before.
    stopMarkersRef.current.forEach(m => m.remove());
    stopMarkersRef.current = [];

    if (Array.isArray(stops) && stops.length > 0) {
      stops.forEach((stop) => {
        if (typeof stop.lng !== 'number' || typeof stop.lat !== 'number') return;

        const isPickup = stop.kind === 'pickup';
        const stopEl = document.createElement('div');
        stopEl.className = `relative w-8 h-8 rounded-full ${isPickup ? 'bg-primary' : 'bg-amber-600'} border-2 border-white text-white flex items-center justify-center shadow-lg cursor-pointer hover:scale-110 transition-transform text-[11px] font-bold`;
        stopEl.textContent = isPickup ? 'P' : 'D';
        if (typeof stop.order === 'number') {
          const badge = document.createElement('span');
          badge.className = 'absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-white text-on-surface border border-outline-variant text-[10px] font-bold flex items-center justify-center shadow-sm';
          badge.textContent = String(stop.order);
          stopEl.appendChild(badge);
        }

        const timeLabel = stop.approxPickupTime
          ? new Date(stop.approxPickupTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
          : null;

        const popupContent = `
          <div style="font-family: system-ui, sans-serif; padding: 4px; max-width: 220px;">
            <div style="font-weight: bold; font-size: 13px; color: #004100; margin-bottom: 2px;">${stop.passengerName || 'Passenger'}</div>
            <div style="font-size: 11px; font-weight: 600; color: ${isPickup ? '#00658f' : '#9a3412'}; margin-bottom: 4px;">${isPickup ? '📍 Pickup' : '🏁 Dropoff'}${stop.locationLabel ? `: ${stop.locationLabel}` : ''}</div>
            ${timeLabel ? `<div style="font-size: 11px; color: #4b5563;">${stop.pickupTimeApproximate ? 'Approx. pickup time' : 'Pickup time'}: <strong>${timeLabel}</strong></div>` : ''}
            ${typeof stop.fare === 'number' ? `<div style="font-size: 11px; color: #4b5563;">Fare: <strong>₹${stop.fare.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</strong></div>` : ''}
            ${stop.phoneNumber ? `<div style="font-size: 11px; color: #4b5563;">Phone: <strong>${stop.phoneNumber}</strong></div>` : ''}
          </div>
        `;
        const popup = new maplibregl.Popup({ offset: 15 }).setHTML(popupContent);

        const marker = new maplibregl.Marker({ element: stopEl })
          .setLngLat([stop.lng, stop.lat])
          .setPopup(popup)
          .addTo(map);

        if (typeof onStopClick === 'function') {
          stopEl.addEventListener('click', () => onStopClick(stop));
        }

        stopMarkersRef.current.push(marker);
      });
    }

    // 4. Manage Route Polyline Layers
    const sourceId = 'route-source';
    const layerId = 'route-layer';
    const outlineLayerId = 'route-outline-layer';

    const getTrafficLineColor = (r) => {
      if (!r) return '#004100';
      if (r.mode === 'CYCLING') return '#059669';
      if (r.mode === 'WALKING') return '#2563EB';

      if (r.mode === 'DRIVING' && r.trafficAvailable) {
        const severity = r.trafficSeverity || (
          r.trafficDelaySeconds > 600 ? 'HEAVY' :
          r.trafficDelaySeconds > 180 ? 'MODERATE' : 'LOW'
        );

        if (severity === 'HEAVY') return '#EF4444';      // Heavy Traffic - Red
        if (severity === 'MODERATE') return '#F59E0B';   // Moderate Traffic - Orange
        if (severity === 'LOW') return '#10B981';        // Low Traffic - Green
      }
      return '#004100'; // Standard route green line when traffic is unconfigured/unavailable
    };

    if (!route || !route.geometry) {
      if (map.getLayer(layerId)) map.removeLayer(layerId);
      if (map.getLayer(outlineLayerId)) map.removeLayer(outlineLayerId);
      if (map.getSource(sourceId)) map.removeSource(sourceId);
    } else {
      const geojsonSourceData = {
        type: 'Feature',
        properties: {},
        geometry: route.geometry
      };

      const lineColor = getTrafficLineColor(route);
      const existingSource = map.getSource(sourceId);

      if (existingSource) {
        existingSource.setData(geojsonSourceData);
        if (map.getLayer(layerId)) {
          map.setPaintProperty(layerId, 'line-color', lineColor);
        }
      } else {
        map.addSource(sourceId, {
          type: 'geojson',
          data: geojsonSourceData
        });

        // Add subtle casing outline
        map.addLayer({
          id: outlineLayerId,
          type: 'line',
          source: sourceId,
          layout: {
            'line-join': 'round',
            'line-cap': 'round'
          },
          paint: {
            'line-color': '#FFFFFF',
            'line-width': 8
          }
        });

        // Add primary route vector line
        map.addLayer({
          id: layerId,
          type: 'line',
          source: sourceId,
          layout: {
            'line-join': 'round',
            'line-cap': 'round'
          },
          paint: {
            'line-color': lineColor,
            'line-width': 5
          }
        });
      }
    }

    // 4b. Unsafe Segment Overlay (Phase 4: 🔴 highlight the portion of the route beyond
    // which the vehicle cannot safely reach the next charger). Purely additive — only
    // drawn when the caller supplies an `unsafeSegment` coordinate array; existing callers
    // (e.g. Plan Route) that don't pass this prop render exactly as before.
    const unsafeSourceId = 'unsafe-segment-source';
    const unsafeLayerId = 'unsafe-segment-layer';

    if (!unsafeSegment || !Array.isArray(unsafeSegment) || unsafeSegment.length < 2) {
      if (map.getLayer(unsafeLayerId)) map.removeLayer(unsafeLayerId);
      if (map.getSource(unsafeSourceId)) map.removeSource(unsafeSourceId);
    } else {
      const unsafeGeojson = {
        type: 'Feature',
        properties: {},
        geometry: { type: 'LineString', coordinates: unsafeSegment }
      };
      const existingUnsafeSource = map.getSource(unsafeSourceId);
      if (existingUnsafeSource) {
        existingUnsafeSource.setData(unsafeGeojson);
      } else {
        map.addSource(unsafeSourceId, { type: 'geojson', data: unsafeGeojson });
        map.addLayer({
          id: unsafeLayerId,
          type: 'line',
          source: unsafeSourceId,
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: {
            'line-color': '#ba1a1a',
            'line-width': 6,
            'line-dasharray': [0.5, 1.5]
          }
        });
      }
    }

    // 5. Fit Bounds / Centering Behavior
    if (route && route.geometry && route.geometry.coordinates) {
      const coords = route.geometry.coordinates;
      const bounds = new maplibregl.LngLatBounds();
      coords.forEach(coord => bounds.extend(coord));
      map.fitBounds(bounds, { padding: 80, duration: 1000 });
    } else {
      const hasOrigin = origin && typeof origin.lng === 'number' && typeof origin.lat === 'number';
      const hasDest = destination && typeof destination.lng === 'number' && typeof destination.lat === 'number';

      if (hasOrigin && hasDest) {
        const bounds = new maplibregl.LngLatBounds()
          .extend([origin.lng, origin.lat])
          .extend([destination.lng, destination.lat]);
        map.fitBounds(bounds, { padding: 80, duration: 1000 });
      } else if (hasOrigin) {
        map.flyTo({ center: [origin.lng, origin.lat], zoom: 14, duration: 1000 });
      } else if (hasDest) {
        map.flyTo({ center: [destination.lng, destination.lat], zoom: 14, duration: 1000 });
      }
    }
  }, [mapLoaded, origin, destination, route, evStations, unsafeSegment, stops, onStopClick]);

  // Wire recenter triggers to the parent
  useEffect(() => {
    if (onRecenterRef) {
      onRecenterRef.current = handleRecenterMap;
    }
  }, [onRecenterRef, origin, destination, route, mapLoaded]);

  const handleZoomIn = () => {
    mapRef.current?.zoomIn();
  };

  const handleZoomOut = () => {
    mapRef.current?.zoomOut();
  };

  const handleRecenterMap = () => {
    if (!mapRef.current || !mapLoaded) return;
    const map = mapRef.current;
    
    if (route && route.geometry && route.geometry.coordinates) {
      const coords = route.geometry.coordinates;
      const bounds = new maplibregl.LngLatBounds();
      coords.forEach(coord => bounds.extend(coord));
      map.fitBounds(bounds, { padding: 80, duration: 1000 });
      return;
    }
    
    const hasOrigin = origin && typeof origin.lng === 'number' && typeof origin.lat === 'number';
    const hasDest = destination && typeof destination.lng === 'number' && typeof destination.lat === 'number';

    if (hasOrigin && hasDest) {
      const bounds = new maplibregl.LngLatBounds()
        .extend([origin.lng, origin.lat])
        .extend([destination.lng, destination.lat]);
      map.fitBounds(bounds, { padding: 80, duration: 1000 });
    } else if (hasOrigin) {
      map.flyTo({ center: [origin.lng, origin.lat], zoom: 14, duration: 1000 });
    } else if (hasDest) {
      map.flyTo({ center: [destination.lng, destination.lat], zoom: 14, duration: 1000 });
    } else {
      map.flyTo({ center: DEFAULT_CENTER, zoom: 12, duration: 1000 });
    }
  };

  const handleGeolocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { longitude, latitude } = position.coords;
          mapRef.current?.flyTo({
            center: [longitude, latitude],
            zoom: 14,
            essential: true
          });
        },
        (error) => {
          console.error("Geolocation request failed:", error);
          alert("Unable to retrieve location. Please check browser permissions.");
        }
      );
    } else {
      alert("Geolocation is not supported by your browser.");
    }
  };

  if (!apiKey) {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-surface-container-low text-center p-md z-10 border border-outline-variant rounded-[24px]">
        <span className="material-symbols-outlined text-[48px] text-primary mb-4">map</span>
        <h3 className="text-headline-md font-headline-md text-on-surface mb-2">MapTiler API Key Required</h3>
        <p className="text-body-md text-on-surface-variant max-w-sm mb-4">
          To view the interactive map, please configure the <code>VITE_MAPTILER_API_KEY</code> environment variable in your Vite setup.
        </p>
        <div className="bg-surface-container border border-outline-variant p-3 rounded-lg text-label-xs font-label-xs font-mono text-left max-w-md">
          # Example .env file in root:<br/>
          VITE_MAPTILER_API_KEY=your_maptiler_key_here
        </div>
      </div>
    );
  }

  return (
    <div className="absolute inset-0">
      <div ref={mapContainerRef} className="w-full h-full rounded-[24px] overflow-hidden" />

      {/* Traffic Legend Overlay */}
      {route && route.mode === 'DRIVING' && route.trafficAvailable && (
        <div className="absolute top-4 left-4 z-20 bg-white/90 backdrop-blur-sm border border-tertiary-fixed rounded-xl p-3 shadow-md text-label-xs font-label-xs flex flex-col gap-1.5 min-w-[130px]">
          <div className="flex items-center justify-between text-on-surface font-semibold border-b border-outline-variant/30 pb-1">
            <span>Traffic Status</span>
            <span className="material-symbols-outlined text-[14px] text-primary">traffic</span>
          </div>
          <div className="flex items-center gap-2 text-on-surface-variant">
            <span className="w-2.5 h-2.5 rounded-full bg-[#10B981] inline-block shadow-sm"></span>
            <span>Low Traffic</span>
          </div>
          <div className="flex items-center gap-2 text-on-surface-variant">
            <span className="w-2.5 h-2.5 rounded-full bg-[#F59E0B] inline-block shadow-sm"></span>
            <span>Moderate Traffic</span>
          </div>
          <div className="flex items-center gap-2 text-on-surface-variant">
            <span className="w-2.5 h-2.5 rounded-full bg-[#EF4444] inline-block shadow-sm"></span>
            <span>Heavy Traffic</span>
          </div>
        </div>
      )}

      {mapError && (
        <div className="absolute top-4 left-4 z-30 bg-white border border-error text-error p-3 rounded-lg flex items-center gap-2 max-w-md shadow-md text-label-xs font-label-xs">
          <span className="material-symbols-outlined text-base text-error">warning</span>
          <span>{mapError}</span>
        </div>
      )}

      {/* Floating Map Controls */}
      <div className="absolute right-4 top-4 flex flex-col gap-2 z-20">
        <button 
          onClick={handleGeolocation}
          title="Recenter to Current Location"
          className="w-10 h-10 bg-white rounded-lg shadow-sm border border-tertiary-fixed flex items-center justify-center text-on-surface-variant hover:text-primary transition-colors cursor-pointer"
        >
          <span className="material-symbols-outlined">my_location</span>
        </button>
        <button 
          onClick={handleRecenterMap}
          title="Recenter Route Map"
          className="w-10 h-10 bg-white rounded-lg shadow-sm border border-tertiary-fixed flex items-center justify-center text-on-surface-variant hover:text-primary transition-colors cursor-pointer"
        >
          <span className="material-symbols-outlined">home</span>
        </button>
        <button 
          onClick={handleZoomIn}
          title="Zoom In"
          className="w-10 h-10 bg-white rounded-lg shadow-sm border border-tertiary-fixed flex items-center justify-center text-on-surface-variant hover:text-primary transition-colors cursor-pointer"
        >
          <span className="material-symbols-outlined">add</span>
        </button>
        <button 
          onClick={handleZoomOut}
          title="Zoom Out"
          className="w-10 h-10 bg-white rounded-lg shadow-sm border border-tertiary-fixed flex items-center justify-center text-on-surface-variant hover:text-primary transition-colors cursor-pointer"
        >
          <span className="material-symbols-outlined">remove</span>
        </button>
      </div>
    </div>
  );
}
