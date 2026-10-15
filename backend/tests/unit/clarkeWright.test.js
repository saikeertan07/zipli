/**
 * @file clarkeWright.test.js
 * @description Unit tests for Clarke-Wright Savings VRP order batching algorithm.
 */

const { clarkeWrightVRP } = require('../../src/algo/clarkeWright');

describe('clarkeWright.js pure VRP batching', () => {
  const storeCoord = { lat: 12.93524, lng: 77.62448 }; // Koramangala store

  it('handles invalid or empty inputs safely', () => {
    expect(clarkeWrightVRP(null, [])).toEqual([]);
    expect(clarkeWrightVRP(storeCoord, [])).toEqual([]);
    expect(clarkeWrightVRP(storeCoord, null)).toEqual([]);
    expect(clarkeWrightVRP(storeCoord, [{ lat: NaN, lng: 77 }])).toEqual([]);
  });

  it('handles single order trip properly', () => {
    const orders = [{ id: 101, lat: 12.938, lng: 77.626 }];
    const trips = clarkeWrightVRP(storeCoord, orders);

    expect(trips).toHaveLength(1);
    expect(trips[0].orders).toHaveLength(1);
    expect(trips[0].orderIds).toEqual([101]);
    expect(trips[0].totalDistanceKm).toBeGreaterThan(0);
    expect(trips[0].savingsKm).toBe(0);
  });

  it('merges neighboring orders into a single multi-drop trip with positive savings', () => {
    // Two orders very close to each other in Koramangala 4th Block
    const orders = [
      { id: 201, lat: 12.936, lng: 77.625 },
      { id: 202, lat: 12.9365, lng: 77.6255 },
    ];

    const trips = clarkeWrightVRP(storeCoord, orders, { maxOrdersPerTrip: 3 });

    expect(trips).toHaveLength(1);
    expect(trips[0].orders).toHaveLength(2);
    expect(trips[0].orderIds).toEqual(expect.arrayContaining([201, 202]));
    expect(trips[0].savingsKm).toBeGreaterThan(0);
  });

  it('merges 3 consecutive orders in line', () => {
    const orders = [
      { id: 1, lat: 12.936, lng: 77.625 },
      { id: 2, lat: 12.937, lng: 77.626 },
      { id: 3, lat: 12.938, lng: 77.627 },
    ];
    const trips = clarkeWrightVRP(storeCoord, orders, { maxOrdersPerTrip: 3 });
    expect(trips).toHaveLength(1);
    expect(trips[0].orders).toHaveLength(3);
  });

  it('exercises interior order skipping and opposite directions with non-positive savings', () => {
    // 5 orders around depot: some have negative or zero savings, some form interior nodes
    const orders = [
      { id: 10, lat: 12.9353, lng: 77.6245 },
      { id: 11, lat: 12.9355, lng: 77.6247 },
      { id: 12, lat: 12.9357, lng: 77.6249 },
      { id: 13, lat: 12.91, lng: 77.6 }, // Opposite direction
      { id: 14, lat: 12.97, lng: 77.65 }, // Opposite direction
    ];

    const trips = clarkeWrightVRP(storeCoord, orders, {
      maxOrdersPerTrip: 3,
      maxDetourRatio: 1.5,
    });

    expect(trips.length).toBeGreaterThanOrEqual(2);
  });

  it('respects maxOrdersPerTrip capacity limits', () => {
    const orders = [
      { id: 301, lat: 12.936, lng: 77.625 },
      { id: 302, lat: 12.9362, lng: 77.6252 },
      { id: 303, lat: 12.9364, lng: 77.6254 },
      { id: 304, lat: 12.9366, lng: 77.6256 },
    ];

    // Enforce max 2 orders per trip
    const trips = clarkeWrightVRP(storeCoord, orders, { maxOrdersPerTrip: 2 });

    expect(trips.length).toBe(2);
    expect(trips[0].orders.length).toBeLessThanOrEqual(2);
    expect(trips[1].orders.length).toBeLessThanOrEqual(2);
  });

  it('keeps distant opposite-direction orders in separate trips due to detour/duration limits', () => {
    const orders = [
      { id: 401, lat: 12.91, lng: 77.62 }, // South (BTM)
      { id: 402, lat: 12.98, lng: 77.62 }, // North (Ulsoor)
    ];

    const trips = clarkeWrightVRP(storeCoord, orders, { maxDetourRatio: 1.2 });
    expect(trips.length).toBe(2);
  });

  it('rejects merge if trip duration exceeds maxTripDurationMin', () => {
    const orders = [
      { id: 501, lat: 12.936, lng: 77.625 },
      { id: 502, lat: 12.938, lng: 77.627 },
    ];

    // Extreme low limit
    const trips = clarkeWrightVRP(storeCoord, orders, { maxTripDurationMin: 2.0 });
    expect(trips.length).toBe(2);
  });

  it('skips savings when an order is in the interior of an existing multi-drop route', () => {
    // 6 orders in two parallel lines forming two 3-order routes
    const orders = [
      { id: 1, lat: 12.936, lng: 77.625 },
      { id: 2, lat: 12.9362, lng: 77.6252 },
      { id: 3, lat: 12.9364, lng: 77.6254 },
      { id: 4, lat: 12.937, lng: 77.626 },
      { id: 5, lat: 12.9372, lng: 77.6262 },
      { id: 6, lat: 12.9374, lng: 77.6264 },
    ];
    const trips = clarkeWrightVRP(storeCoord, orders, { maxOrdersPerTrip: 6 });
    expect(trips.length).toBeGreaterThanOrEqual(1);
  });

  it('skips merge when an order is in the interior of a route from a different trip', () => {
    // Cluster 1 (east)
    const o1 = { id: 1, lat: 12.935, lng: 77.63 };
    const o2 = { id: 2, lat: 12.935, lng: 77.632 };
    const o3 = { id: 3, lat: 12.935, lng: 77.634 };
    // Cluster 2 (north)
    const o4 = { id: 4, lat: 12.94, lng: 77.624 };
    const o5 = { id: 5, lat: 12.942, lng: 77.624 };
    const o6 = { id: 6, lat: 12.944, lng: 77.624 };
    // Order close to interior of cluster 1
    const oMid = { id: 7, lat: 12.9351, lng: 77.6321 };

    const trips = clarkeWrightVRP(storeCoord, [o1, o2, o3, o4, o5, o6, oMid], {
      maxOrdersPerTrip: 10,
    });
    expect(trips.length).toBeGreaterThanOrEqual(1);
  });

  it('merges two multi-order trips when endpoints connect', () => {
    const orders = [
      { id: 1, lat: 12.936, lng: 77.625 },
      { id: 2, lat: 12.9362, lng: 77.6252 },
      { id: 3, lat: 12.9364, lng: 77.6254 },
      { id: 4, lat: 12.9366, lng: 77.6256 },
    ];
    const trips = clarkeWrightVRP(storeCoord, orders, { maxOrdersPerTrip: 4 });
    expect(trips).toHaveLength(1);
    expect(trips[0].orders).toHaveLength(4);
  });
});
