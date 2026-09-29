import { describe, it, expect } from 'vitest';
import { buildPoolRouteStops, projectPointToRouteFraction } from './poolRouteStops';

/**
 * Straight west->east route along a fixed latitude, matching the style used in the
 * backend's ActivePoolDetailsTest.java (lat=0, lng from 0 to 1) so ordering
 * expectations line up with what the server-side LengthIndexedLine would compute.
 */
const STRAIGHT_ROUTE_GEOMETRY = {
  type: 'LineString',
  coordinates: [
    [0.0, 0.0],
    [1.0, 0.0]
  ]
};

function passenger(overrides = {}) {
  return {
    userName: 'Passenger',
    pickupLocation: 'Pickup Rd',
    pickupLatitude: 0,
    pickupLongitude: 0.2,
    dropoffLocation: 'Dropoff Rd',
    dropoffLatitude: 0,
    dropoffLongitude: 0.4,
    phoneNumber: '+15551234567',
    fare: 120,
    approxPickupTime: '2026-08-22T10:15:00',
    pickupTimeApproximate: true,
    ...overrides
  };
}

describe('projectPointToRouteFraction', () => {
  it('returns null for degenerate/missing geometry', () => {
    expect(projectPointToRouteFraction(0.5, 0, null)).toBeNull();
    expect(projectPointToRouteFraction(0.5, 0, [[0, 0]])).toBeNull();
  });

  it('projects a midpoint to ~0.5', () => {
    const frac = projectPointToRouteFraction(0.5, 0, STRAIGHT_ROUTE_GEOMETRY.coordinates);
    expect(frac).toBeCloseTo(0.5, 5);
  });

  it('projects the start/end points to 0 and 1', () => {
    expect(projectPointToRouteFraction(0.0, 0, STRAIGHT_ROUTE_GEOMETRY.coordinates)).toBeCloseTo(0, 5);
    expect(projectPointToRouteFraction(1.0, 0, STRAIGHT_ROUTE_GEOMETRY.coordinates)).toBeCloseTo(1, 5);
  });
});

describe('buildPoolRouteStops', () => {
  it('route renders / empty passengers still produces an empty (non-crashing) stop list', () => {
    const details = { routeGeometry: STRAIGHT_ROUTE_GEOMETRY, passengers: [] };
    expect(buildPoolRouteStops(details)).toEqual([]);
  });

  it('handles a missing passengers array without crashing', () => {
    const details = { routeGeometry: STRAIGHT_ROUTE_GEOMETRY };
    expect(buildPoolRouteStops(details)).toEqual([]);
  });

  it('one passenger produces exactly a pickup stop and a dropoff stop', () => {
    const details = {
      routeGeometry: STRAIGHT_ROUTE_GEOMETRY,
      passengers: [passenger({ userName: 'Alice' })]
    };
    const stops = buildPoolRouteStops(details);
    expect(stops).toHaveLength(2);
    expect(stops.map((s) => s.kind)).toEqual(['pickup', 'dropoff']);
    expect(stops.every((s) => s.passengerName === 'Alice')).toBe(true);
  });

  it('pickup + dropoff: pickup always precedes its own dropoff on a simple route', () => {
    const details = {
      routeGeometry: STRAIGHT_ROUTE_GEOMETRY,
      passengers: [passenger({ userName: 'Bob', pickupLongitude: 0.1, dropoffLongitude: 0.9 })]
    };
    const stops = buildPoolRouteStops(details);
    const pickup = stops.find((s) => s.kind === 'pickup');
    const dropoff = stops.find((s) => s.kind === 'dropoff');
    expect(pickup.order).toBeLessThan(dropoff.order);
  });

  it('multiple passengers are all rendered simultaneously (4 stops for 2 passengers)', () => {
    const details = {
      routeGeometry: STRAIGHT_ROUTE_GEOMETRY,
      passengers: [
        passenger({ userName: 'Alice', pickupLongitude: 0.1, dropoffLongitude: 0.3 }),
        passenger({ userName: 'Carol', pickupLongitude: 0.5, dropoffLongitude: 0.8 })
      ]
    };
    const stops = buildPoolRouteStops(details);
    expect(stops).toHaveLength(4);
    const names = new Set(stops.map((s) => s.passengerName));
    expect(names).toEqual(new Set(['Alice', 'Carol']));
  });

  it('orders stops by position along the route, not insertion order', () => {
    // Carol is listed FIRST in the passengers array but her pickup/dropoff are
    // physically further along the route than Alice's -- correct output order must
    // still be Alice-pickup, Alice-dropoff, Carol-pickup, Carol-dropoff.
    const details = {
      routeGeometry: STRAIGHT_ROUTE_GEOMETRY,
      passengers: [
        passenger({ userName: 'Carol', pickupLongitude: 0.6, dropoffLongitude: 0.9 }),
        passenger({ userName: 'Alice', pickupLongitude: 0.1, dropoffLongitude: 0.3 })
      ]
    };
    const stops = buildPoolRouteStops(details);
    expect(stops.map((s) => `${s.passengerName}-${s.kind}`)).toEqual([
      'Alice-pickup',
      'Alice-dropoff',
      'Carol-pickup',
      'Carol-dropoff'
    ]);
    expect(stops.map((s) => s.order)).toEqual([1, 2, 3, 4]);
  });

  it('interleaves stops from different passengers correctly when their pickup/dropoff overlap', () => {
    // Alice: pickup 0.1 -> dropoff 0.5. Carol: pickup 0.3 -> dropoff 0.7.
    // Along-route order should be Alice-pickup(0.1), Carol-pickup(0.3), Alice-dropoff(0.5), Carol-dropoff(0.7).
    const details = {
      routeGeometry: STRAIGHT_ROUTE_GEOMETRY,
      passengers: [
        passenger({ userName: 'Alice', pickupLongitude: 0.1, dropoffLongitude: 0.5 }),
        passenger({ userName: 'Carol', pickupLongitude: 0.3, dropoffLongitude: 0.7 })
      ]
    };
    const stops = buildPoolRouteStops(details);
    expect(stops.map((s) => `${s.passengerName}-${s.kind}`)).toEqual([
      'Alice-pickup',
      'Carol-pickup',
      'Alice-dropoff',
      'Carol-dropoff'
    ]);
  });

  it('falls back to a stable pickup-before-dropoff order per passenger when route geometry is null (legacy pool)', () => {
    const details = {
      routeGeometry: null,
      passengers: [
        passenger({ userName: 'Alice' }),
        passenger({ userName: 'Carol' })
      ]
    };
    const stops = buildPoolRouteStops(details);
    expect(stops.map((s) => `${s.passengerName}-${s.kind}`)).toEqual([
      'Alice-pickup',
      'Alice-dropoff',
      'Carol-pickup',
      'Carol-dropoff'
    ]);
  });

  it('handles degenerate route geometry (single point / empty coordinates) without crashing', () => {
    const detailsSinglePoint = {
      routeGeometry: { type: 'LineString', coordinates: [[0, 0]] },
      passengers: [passenger({ userName: 'Alice' })]
    };
    expect(() => buildPoolRouteStops(detailsSinglePoint)).not.toThrow();
    expect(buildPoolRouteStops(detailsSinglePoint)).toHaveLength(2);

    const detailsEmptyCoords = {
      routeGeometry: { type: 'LineString', coordinates: [] },
      passengers: [passenger({ userName: 'Alice' })]
    };
    expect(() => buildPoolRouteStops(detailsEmptyCoords)).not.toThrow();
  });

  it('skips a passenger missing pickup or dropoff coordinates instead of crashing', () => {
    const details = {
      routeGeometry: STRAIGHT_ROUTE_GEOMETRY,
      passengers: [
        passenger({ userName: 'NoPickup', pickupLatitude: null, pickupLongitude: null }),
        passenger({ userName: 'NoDropoff', dropoffLatitude: undefined, dropoffLongitude: undefined })
      ]
    };
    const stops = buildPoolRouteStops(details);
    expect(stops).toHaveLength(2);
    expect(stops.find((s) => s.passengerName === 'NoPickup').kind).toBe('dropoff');
    expect(stops.find((s) => s.passengerName === 'NoDropoff').kind).toBe('pickup');
  });

  it('carries through fare, approx pickup time, and phone number for popup/list display', () => {
    const details = {
      routeGeometry: STRAIGHT_ROUTE_GEOMETRY,
      passengers: [passenger({ userName: 'Alice', fare: 87.5, phoneNumber: '+919876543210' })]
    };
    const [pickup] = buildPoolRouteStops(details);
    expect(pickup.fare).toBe(87.5);
    expect(pickup.phoneNumber).toBe('+919876543210');
    expect(pickup.approxPickupTime).toBe('2026-08-22T10:15:00');
    expect(pickup.pickupTimeApproximate).toBe(true);
  });

  it('handles a completely missing details object without crashing', () => {
    expect(buildPoolRouteStops(null)).toEqual([]);
    expect(buildPoolRouteStops(undefined)).toEqual([]);
  });
});
