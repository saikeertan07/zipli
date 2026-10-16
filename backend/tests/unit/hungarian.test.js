/**
 * @file hungarian.test.js
 * @description Unit tests for Kuhn-Munkres (Hungarian) minimum cost bipartite matching algorithm.
 */

const { solveHungarian } = require('../../src/algo/hungarian');

describe('hungarian.js pure Kuhn-Munkres Bipartite Matching', () => {
  it('handles invalid or empty matrix inputs safely', () => {
    expect(solveHungarian(null).assignments).toEqual([]);
    expect(solveHungarian([]).assignments).toEqual([]);
    expect(solveHungarian([[]]).assignments).toEqual([]);
    expect(solveHungarian([[], []]).assignments).toEqual([]);
  });

  it('solves 1x1 base case', () => {
    const res = solveHungarian([[4.5]]);
    expect(res.assignments).toEqual([{ orderIndex: 0, riderIndex: 0, cost: 4.5 }]);
    expect(res.totalCost).toBe(4.5);
    expect(res.unassignedOrders).toEqual([]);
    expect(res.unassignedRiders).toEqual([]);
  });

  it('solves 2x2 assignment finding global minimum rather than greedy traps', () => {
    // Order 0: Rider 0 costs 2, Rider 1 costs 3
    // Order 1: Rider 0 costs 1, Rider 1 costs 10
    // Greedy would pick (0, 0) costing 2, leaving (1, 1) costing 10 -> total 12.
    // Hungarian optimally assigns (0, 1) costing 3 and (1, 0) costing 1 -> total 4!
    const cost = [
      [2, 3],
      [1, 10],
    ];
    const res = solveHungarian(cost);

    expect(res.totalCost).toBe(4);
    expect(res.assignments).toEqual([
      { orderIndex: 0, riderIndex: 1, cost: 3 },
      { orderIndex: 1, riderIndex: 0, cost: 1 },
    ]);
  });

  it('solves 3x3 standard textbook matching problem', () => {
    const cost = [
      [250, 400, 350],
      [400, 600, 350],
      [200, 400, 250],
    ];
    const res = solveHungarian(cost);

    expect(res.assignments.length).toBe(3);
    // Optimal: 250 (0,0) + 350 (1,2) + 400 (2,1) = 1000 or 250 (2,2) + 350 (1,2) + 400 (0,1)...
    expect(res.totalCost).toBeLessThanOrEqual(1000);
  });

  it('handles rectangular matrices: more orders than riders', () => {
    // 3 orders, 2 riders
    const cost = [
      [10, 20],
      [5, 15],
      [1, 3],
    ];
    const res = solveHungarian(cost);

    expect(res.assignments.length).toBe(2);
    expect(res.unassignedOrders.length).toBe(1);
    expect(res.unassignedRiders.length).toBe(0);
  });

  it('handles rectangular matrices: more riders than orders', () => {
    // 2 orders, 4 riders
    const cost = [
      [12, 5, 8, 20],
      [9, 14, 4, 18],
    ];
    const res = solveHungarian(cost);

    expect(res.assignments.length).toBe(2);
    expect(res.unassignedOrders.length).toBe(0);
    expect(res.unassignedRiders.length).toBe(2);
    // Optimal: (0, 1) costing 5, (1, 2) costing 4 -> total 9
    expect(res.totalCost).toBe(9);
  });
});
