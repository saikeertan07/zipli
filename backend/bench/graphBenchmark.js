/**
 * @file graphBenchmark.js
 * @description Benchmark suite for Phase 7 Delivery Intelligence:
 * 1. Graph Shortest Path: Dijkstra vs A* vs Bidirectional Dijkstra (nodes expanded and latency)
 * 2. Bipartite Matching: Hungarian O(N^3) optimal vs Greedy Nearest-Neighbor (cost and latency)
 * 3. TSP Tour Sequencing: Held-Karp exact DP vs 2-Opt local search (optimality gap and runtime)
 * 4. Clarke-Wright VRP Batching: unbatched direct vs batched routing distance
 * 5. Segment Tree: 100,000 range capacity queries and reservations throughput
 */

const {
  createGridCityGraph,
  hungarianMatching,
  clarkeWrightVRP,
  optimizeBatchRoute,
  SegmentTree,
  calculateHaversineDistance,
} = require('../src/algo');
const { solveTSP2Opt, solveTSPHeldKarp, buildDistanceMatrix } = require('../src/algo/tsp');

function runGraphBenchmark() {
  console.log('='.repeat(75));
  console.log(' ZIPLI PRO — PHASE 7 DELIVERY INTELLIGENCE & GRAPH BENCHMARK');
  console.log('='.repeat(75));

  // -------------------------------------------------------------
  // 1. Graph Shortest Path Benchmark (25x25 Grid = 625 Nodes)
  // -------------------------------------------------------------
  console.log('\n[1] SHORTEST PATH ROUTING BENCHMARK (625 Nodes, ~2,400 Edges)');
  const graph = createGridCityGraph({
    rows: 25,
    cols: 25,
    baseLat: 12.93524,
    baseLng: 77.62448,
    spacingKm: 0.25,
  });

  const ROUTE_RUNS = 200;
  const startEndPairs = [];
  for (let i = 0; i < ROUTE_RUNS; i++) {
    const r1 = Math.floor(Math.random() * 25);
    const c1 = Math.floor(Math.random() * 25);
    const r2 = Math.floor(Math.random() * 25);
    const c2 = Math.floor(Math.random() * 25);
    startEndPairs.push({
      start: `node_${r1}_${c1}`,
      target: `node_${r2}_${c2}`,
    });
  }

  // Dijkstra
  let dijkstraNodes = 0;
  const startDijkstra = process.hrtime.bigint();
  for (const { start, target } of startEndPairs) {
    const res = graph.dijkstra(start, target, 'distance');
    dijkstraNodes += res.nodesVisited;
  }
  const dijkstraMs = Number(process.hrtime.bigint() - startDijkstra) / 1e6;

  // A* (Euclidean Heuristic)
  let astarNodes = 0;
  const startAStar = process.hrtime.bigint();
  for (const { start, target } of startEndPairs) {
    const res = graph.aStar(start, target, 'distance');
    astarNodes += res.nodesVisited;
  }
  const astarMs = Number(process.hrtime.bigint() - startAStar) / 1e6;

  // Bidirectional Dijkstra
  let biNodes = 0;
  const startBi = process.hrtime.bigint();
  for (const { start, target } of startEndPairs) {
    const res = graph.bidirectionalDijkstra(start, target, 'distance');
    biNodes += res.nodesVisited;
  }
  const biMs = Number(process.hrtime.bigint() - startBi) / 1e6;

  console.log(
    `  Dijkstra:             ${dijkstraMs.toFixed(2)} ms total | ${(dijkstraMs / ROUTE_RUNS).toFixed(3)} ms/route | Avg nodes visited: ${(dijkstraNodes / ROUTE_RUNS).toFixed(1)}`
  );
  console.log(
    `  A* (Heuristic):       ${astarMs.toFixed(2)} ms total | ${(astarMs / ROUTE_RUNS).toFixed(3)} ms/route | Avg nodes visited: ${(astarNodes / ROUTE_RUNS).toFixed(1)} (${(((dijkstraNodes - astarNodes) / dijkstraNodes) * 100).toFixed(1)}% node expansion reduction)`
  );
  console.log(
    `  Bidirectional:        ${biMs.toFixed(2)} ms total | ${(biMs / ROUTE_RUNS).toFixed(3)} ms/route | Avg nodes visited: ${(biNodes / ROUTE_RUNS).toFixed(1)} (${(((dijkstraNodes - biNodes) / dijkstraNodes) * 100).toFixed(1)}% node expansion reduction)`
  );

  // -------------------------------------------------------------
  // 2. Hungarian Matching vs Greedy Baseline (20x20 and 50x50)
  // -------------------------------------------------------------
  console.log('\n[2] BIPARTITE MATCHING BENCHMARK: HUNGARIAN O(N^3) vs GREEDY');
  for (const N of [20, 50]) {
    const MATCH_RUNS = 50;
    let totalHungarianKm = 0;
    let totalGreedyKm = 0;

    const startHungarian = process.hrtime.bigint();
    for (let r = 0; r < MATCH_RUNS; r++) {
      const matrix = Array.from({ length: N }, () =>
        Array.from({ length: N }, () => 1 + Math.random() * 8)
      );
      const hRes = hungarianMatching(matrix);
      totalHungarianKm += hRes.totalCost;

      // Greedy baseline
      const used = new Set();
      let gCost = 0;
      for (let i = 0; i < N; i++) {
        let bestJ = -1;
        let minC = Infinity;
        for (let j = 0; j < N; j++) {
          if (!used.has(j) && matrix[i][j] < minC) {
            minC = matrix[i][j];
            bestJ = j;
          }
        }
        if (bestJ !== -1) {
          used.add(bestJ);
          gCost += minC;
        }
      }
      totalGreedyKm += gCost;
    }
    const hungarianMs = Number(process.hrtime.bigint() - startHungarian) / 1e6;
    const savingsPercent = (((totalGreedyKm - totalHungarianKm) / totalGreedyKm) * 100).toFixed(2);

    console.log(`  Size ${N}x${N} (${MATCH_RUNS} runs):`);
    console.log(
      `    Hungarian Optimal Total: ${(totalHungarianKm / MATCH_RUNS).toFixed(2)} km | ${(hungarianMs / MATCH_RUNS).toFixed(3)} ms/match`
    );
    console.log(`    Greedy Baseline Total:   ${(totalGreedyKm / MATCH_RUNS).toFixed(2)} km`);
    console.log(
      `    Optimization Advantage:  ${savingsPercent}% lower travel distance achieved by Kuhn-Munkres`
    );
  }

  // -------------------------------------------------------------
  // 3. TSP Exact Held-Karp vs 2-Opt Local Search
  // -------------------------------------------------------------
  console.log('\n[3] TRAVELLING SALESPERSON (TSP) BENCHMARK');
  // n = 10 (Compare Exact DP vs Heuristic)
  const TSP_RUNS = 20;
  let heldKarpKm = 0;
  let twoOptKm10 = 0;

  const startHK = process.hrtime.bigint();
  for (let r = 0; r < TSP_RUNS; r++) {
    const points = Array.from({ length: 10 }, (_, i) => ({
      lat: 12.935 + (Math.random() - 0.5) * 0.04,
      lng: 77.624 + (Math.random() - 0.5) * 0.04,
    }));
    const matrix = buildDistanceMatrix(points);
    const hk = solveTSPHeldKarp(matrix);
    const opt = solveTSP2Opt(matrix);
    heldKarpKm += hk.totalDistance;
    twoOptKm10 += opt.totalDistance;
  }
  const hkMs = Number(process.hrtime.bigint() - startHK) / 1e6;
  const gap10 = (((twoOptKm10 - heldKarpKm) / heldKarpKm) * 100).toFixed(2);

  console.log(`  n = 10 stops (${TSP_RUNS} runs):`);
  console.log(
    `    Held-Karp Exact DP:      ${(heldKarpKm / TSP_RUNS).toFixed(2)} km | ${(hkMs / TSP_RUNS).toFixed(3)} ms/solve`
  );
  console.log(
    `    2-Opt Local Search:      ${(twoOptKm10 / TSP_RUNS).toFixed(2)} km | Optimality Gap: ${gap10}%`
  );

  // n = 20 (2-Opt scalability)
  const start2Opt20 = process.hrtime.bigint();
  let twoOptKm20 = 0;
  for (let r = 0; r < 50; r++) {
    const points = Array.from({ length: 20 }, (_, i) => ({
      lat: 12.935 + (Math.random() - 0.5) * 0.05,
      lng: 77.624 + (Math.random() - 0.5) * 0.05,
    }));
    const matrix = buildDistanceMatrix(points);
    const opt = solveTSP2Opt(matrix);
    twoOptKm20 += opt.totalDistance;
  }
  const twoOpt20Ms = Number(process.hrtime.bigint() - start2Opt20) / 1e6;
  console.log(`  n = 20 stops (50 runs):`);
  console.log(
    `    2-Opt Heuristic:         ${(twoOptKm20 / 50).toFixed(2)} km | ${(twoOpt20Ms / 50).toFixed(3)} ms/solve (sub-millisecond)`
  );

  // -------------------------------------------------------------
  // 4. Clarke-Wright VRP Multi-Drop Batching Benchmark
  // -------------------------------------------------------------
  console.log('\n[4] CLARKE-WRIGHT SAVINGS VRP BATCHING BENCHMARK');
  const depot = { lat: 12.93524, lng: 77.62448 };
  const orders = Array.from({ length: 30 }, (_, i) => ({
    id: `ord-${i + 1}`,
    lat: 12.93524 + (Math.random() - 0.5) * 0.03,
    lng: 77.62448 + (Math.random() - 0.5) * 0.03,
  }));

  const startVRP = process.hrtime.bigint();
  const trips = clarkeWrightVRP(depot, orders, { maxOrdersPerTrip: 3 });
  const vrpMs = Number(process.hrtime.bigint() - startVRP) / 1e6;

  const baselineDist = orders.reduce((sum, o) => sum + calculateHaversineDistance(depot, o) * 2, 0);
  const batchedDist = trips.reduce((sum, t) => {
    const tsp = optimizeBatchRoute(depot, t.orders);
    return sum + tsp.totalDistanceKm;
  }, 0);
  const vrpSavings = (((baselineDist - batchedDist) / baselineDist) * 100).toFixed(1);

  console.log(
    `  30 Orders partition:      ${trips.length} multi-drop trips generated in ${vrpMs.toFixed(3)} ms`
  );
  console.log(`  Direct unbatched travel:  ${baselineDist.toFixed(2)} km`);
  console.log(
    `  Batched + TSP travel:     ${batchedDist.toFixed(2)} km (${vrpSavings}% distance reduction)`
  );

  // -------------------------------------------------------------
  // 5. Segment Tree Range Capacity Throughput
  // -------------------------------------------------------------
  console.log('\n[5] SEGMENT TREE CAPACITY DATA STRUCTURE THROUGHPUT');
  const tree = new SegmentTree(24, 50);
  const TREE_OPS = 100000;

  const startTree = process.hrtime.bigint();
  for (let i = 0; i < TREE_OPS; i++) {
    const l = i % 24;
    const r = (i + 4) % 24;
    tree.queryMin(l, r);
    tree.querySum(l, r);
    if (i % 5 === 0) {
      tree.reserveSlot(l, 1);
      tree.releaseSlot(l, 1);
    }
  }
  const treeMs = Number(process.hrtime.bigint() - startTree) / 1e6;
  const treeOpsPerSec = Math.round(TREE_OPS / (treeMs / 1000));

  console.log(`  ${TREE_OPS.toLocaleString()} operations executed in ${treeMs.toFixed(2)} ms`);
  console.log(`  Throughput:               ${treeOpsPerSec.toLocaleString()} ops/sec`);

  console.log('\n' + '='.repeat(75));
  console.log(' ALL DELIVERY INTELLIGENCE BENCHMARKS EXECUTED SUCCESSFULLY');
  console.log('='.repeat(75));
}

if (require.main === module) {
  runGraphBenchmark();
}

module.exports = { runGraphBenchmark };
