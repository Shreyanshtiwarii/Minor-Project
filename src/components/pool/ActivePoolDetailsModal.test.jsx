import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup, act } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// jsdom has no WebGL/canvas support, so the real maplibre-gl (and its worker asset)
// can't run in a unit test. Mock it with a lightweight fake that records what
// GreenMoveMap asks it to draw (markers added, route source data set) so these tests
// can assert on rendering behavior without a real GPU/browser.
const addedMarkers = [];

vi.mock('maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url', () => ({ default: 'worker-url' }));
vi.mock('maplibre-gl/dist/maplibre-gl.css', () => ({}));

vi.mock('maplibre-gl', () => {
  class FakeMarker {
    constructor({ element } = {}) {
      this.element = element;
      this._lngLat = null;
      addedMarkers.push(this);
    }
    setLngLat(coords) {
      this._lngLat = coords;
      return this;
    }
    setPopup() {
      return this;
    }
    addTo() {
      return this;
    }
    remove() {
      const idx = addedMarkers.indexOf(this);
      if (idx >= 0) addedMarkers.splice(idx, 1);
    }
  }

  class FakePopup {
    setHTML() {
      return this;
    }
  }

  class FakeLngLatBounds {
    extend() {
      return this;
    }
  }

  class FakeMap {
    constructor() {
      this._sources = {};
      this._handlers = {};
      this._layers = new Set();
    }
    on(event, cb) {
      this._handlers[event] = cb;
      if (event === 'load') {
        // Fire load asynchronously, like the real map does.
        setTimeout(() => cb(), 0);
      }
    }
    resize() {}
    remove() {}
    fitBounds() {}
    flyTo() {}
    addSource(id, data) {
      this._sources[id] = data;
    }
    getSource(id) {
      const src = this._sources[id];
      if (!src) return null;
      return { setData: (d) => { this._sources[id] = { ...src, data: d }; } };
    }
    removeSource(id) {
      delete this._sources[id];
    }
    addLayer(layer) {
      this._layers.add(layer.id);
    }
    getLayer(id) {
      return this._layers.has(id) ? {} : null;
    }
    removeLayer(id) {
      this._layers.delete(id);
    }
    setPaintProperty() {}
  }

  // GreenMoveMap uses `import * as maplibregl from 'maplibre-gl'` (namespace import),
  // so these need to be named exports, not wrapped in `default`.
  return {
    Map: FakeMap,
    Marker: FakeMarker,
    Popup: FakePopup,
    LngLatBounds: FakeLngLatBounds,
    setWorkerUrl: vi.fn()
  };
});

import ActivePoolDetailsModal from './ActivePoolDetailsModal';
import * as vehiclePoolService from '../../services/vehiclePoolService';

const ROUTE_GEOMETRY = {
  type: 'LineString',
  coordinates: [
    [77.5, 12.9],
    [77.6, 12.95],
    [77.7, 13.0]
  ]
};

function baseDetails(overrides = {}) {
  return {
    id: 'pool_1',
    startLocation: 'Koramangala',
    startLatitude: 12.9,
    startLongitude: 77.5,
    destination: 'Whitefield',
    destinationLatitude: 13.0,
    destinationLongitude: 77.7,
    routeGeometry: ROUTE_GEOMETRY,
    routeDistanceMeters: 15000,
    routeDurationSeconds: 1800,
    departureTime: '2026-08-22T09:00:00',
    status: 'ACTIVE',
    ratePerKm: 8,
    passengers: [],
    ...overrides
  };
}

beforeEach(() => {
  addedMarkers.length = 0;
  vi.spyOn(vehiclePoolService, 'getActivePoolDetails');
  process.env.VITE_MAPTILER_API_KEY = 'test-key';
  import.meta.env.VITE_MAPTILER_API_KEY = 'test-key';
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('ActivePoolDetailsModal (Phase 4 map)', () => {
  it('renders the route and start/end markers with an empty passenger list', async () => {
    vehiclePoolService.getActivePoolDetails.mockResolvedValue(baseDetails());

    render(<ActivePoolDetailsModal poolId="pool_1" onClose={() => {}} />);

    await waitFor(() => expect(vehiclePoolService.getActivePoolDetails).toHaveBeenCalledWith('pool_1'));
    await waitFor(() => expect(screen.getByText(/Koramangala/)).toBeInTheDocument());

    expect(screen.getByText(/No passengers have joined yet/i)).toBeInTheDocument();
    // Two markers: origin + destination (no passenger stop markers).
    await waitFor(() => expect(addedMarkers.length).toBe(2));
  });

  it('renders pickup and dropoff markers for one passenger', async () => {
    vehiclePoolService.getActivePoolDetails.mockResolvedValue(baseDetails({
      passengers: [{
        userName: 'Alice',
        pickupLocation: 'HSR Layout',
        pickupLatitude: 12.92,
        pickupLongitude: 77.55,
        dropoffLocation: 'ITPL',
        dropoffLatitude: 12.98,
        dropoffLongitude: 77.68,
        phoneNumber: '+919876543210',
        fare: 150,
        approxPickupTime: '2026-08-22T09:10:00',
        pickupTimeApproximate: true
      }]
    }));

    render(<ActivePoolDetailsModal poolId="pool_1" onClose={() => {}} />);

    await waitFor(() => expect(screen.getAllByText('Alice').length).toBeGreaterThan(0));
    // origin + destination + pickup + dropoff = 4 markers
    await waitFor(() => expect(addedMarkers.length).toBe(4));
    // Phone number is shown for both the pickup and dropoff list rows.
    expect(screen.getAllByText('+919876543210').length).toBeGreaterThan(0);
  });

  it('renders multiple passengers simultaneously, ordered by route position', async () => {
    vehiclePoolService.getActivePoolDetails.mockResolvedValue(baseDetails({
      passengers: [
        {
          userName: 'Carol',
          pickupLatitude: 12.97,
          pickupLongitude: 77.66,
          dropoffLatitude: 12.99,
          dropoffLongitude: 77.7,
          fare: 200
        },
        {
          userName: 'Alice',
          pickupLatitude: 12.91,
          pickupLongitude: 77.52,
          dropoffLatitude: 12.94,
          dropoffLongitude: 77.58,
          fare: 90
        }
      ]
    }));

    render(<ActivePoolDetailsModal poolId="pool_1" onClose={() => {}} />);

    await waitFor(() => expect(addedMarkers.length).toBe(6)); // origin+dest + 2*(pickup+dropoff)

    const items = await screen.findAllByRole('listitem');
    const names = items.map((li) => li.textContent);
    // Alice's stops (closer to start) should be listed before Carol's, regardless of
    // API array order (Carol was listed first in the mocked response above).
    const aliceIndex = names.findIndex((t) => t.includes('Alice'));
    const carolIndex = names.findIndex((t) => t.includes('Carol'));
    expect(aliceIndex).toBeLessThan(carolIndex);
  });

  it('handles legacy pools with null route geometry without crashing', async () => {
    vehiclePoolService.getActivePoolDetails.mockResolvedValue(baseDetails({
      routeGeometry: null,
      passengers: [{
        userName: 'Dev',
        pickupLatitude: 12.92,
        pickupLongitude: 77.55,
        dropoffLatitude: 12.98,
        dropoffLongitude: 77.68,
        fare: 100
      }]
    }));

    render(<ActivePoolDetailsModal poolId="pool_1" onClose={() => {}} />);

    await waitFor(() => expect(screen.getAllByText('Dev').length).toBeGreaterThan(0));
    // Start + destination markers still render even without route geometry, plus
    // this passenger's pickup + dropoff.
    await waitFor(() => expect(addedMarkers.length).toBe(4));
  });

  it('shows an error state when the fetch fails', async () => {
    vehiclePoolService.getActivePoolDetails.mockRejectedValue(new Error('Only the pool creator can view passenger details'));

    render(<ActivePoolDetailsModal poolId="pool_1" onClose={() => {}} />);

    await waitFor(() => expect(screen.getByText(/Only the pool creator can view passenger details/)).toBeInTheDocument());
  });

  // ---------------------------------------------------------------
  // Phase 5 - Carpool operational integration: driver "passenger joined" notification
  // ---------------------------------------------------------------
  describe('Phase 5 - new passenger notification', () => {
    beforeEach(() => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('does not notify for passengers already present on the initial load', async () => {
      vehiclePoolService.getActivePoolDetails.mockResolvedValue(baseDetails({
        passengers: [{
          userName: 'Alice',
          pickupLocation: 'HSR Layout',
          pickupLatitude: 12.92,
          pickupLongitude: 77.55,
          dropoffLatitude: 12.98,
          dropoffLongitude: 77.68,
          fare: 150,
          joinedAt: '2026-08-22T08:00:00'
        }]
      }));

      render(<ActivePoolDetailsModal poolId="pool_1" onClose={() => {}} />);

      await waitFor(() => expect(screen.getAllByText('Alice').length).toBeGreaterThan(0));
      expect(screen.queryByText(/joined your pool/i)).not.toBeInTheDocument();
    });

    it('notifies the driver when a new passenger appears on a later poll', async () => {
      const initial = baseDetails({ passengers: [] });
      const withNewPassenger = baseDetails({
        passengers: [{
          userName: 'Bob',
          pickupLocation: 'Indiranagar',
          pickupLatitude: 12.93,
          pickupLongitude: 77.58,
          dropoffLatitude: 12.98,
          dropoffLongitude: 77.68,
          fare: 120,
          approxPickupTime: '2026-08-22T09:15:00',
          joinedAt: '2026-08-22T08:30:00'
        }]
      });

      vehiclePoolService.getActivePoolDetails
        .mockResolvedValueOnce(initial)
        .mockResolvedValue(withNewPassenger);

      render(<ActivePoolDetailsModal poolId="pool_1" onClose={() => {}} />);

      await waitFor(() => expect(vehiclePoolService.getActivePoolDetails).toHaveBeenCalledTimes(1));
      expect(screen.getByText(/No passengers have joined yet/i)).toBeInTheDocument();

      // Advance past the polling interval to trigger the next fetch.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(15000);
      });

      await waitFor(() => expect(screen.getByText(/Bob joined your pool/i)).toBeInTheDocument());
      expect(screen.getByText(/Pickup: Indiranagar/)).toBeInTheDocument();
    });

    it('stops polling after the modal unmounts', async () => {
      vehiclePoolService.getActivePoolDetails.mockResolvedValue(baseDetails({ passengers: [] }));

      const { unmount } = render(<ActivePoolDetailsModal poolId="pool_1" onClose={() => {}} />);
      await waitFor(() => expect(vehiclePoolService.getActivePoolDetails).toHaveBeenCalledTimes(1));

      unmount();
      const callsAtUnmount = vehiclePoolService.getActivePoolDetails.mock.calls.length;

      await act(async () => {
        await vi.advanceTimersByTimeAsync(60000);
      });
      expect(vehiclePoolService.getActivePoolDetails.mock.calls.length).toBe(callsAtUnmount);
    });
  });
});
