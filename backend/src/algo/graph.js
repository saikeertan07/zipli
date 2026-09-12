/**
 * @file graph.js
 * @description City road network representation with pure Dijkstra, A*, and Bidirectional Dijkstra.
 * Zero external GIS or graph libraries.
 */

const { MinHeap } = require('./heap');
const { calculateHaversineDistance } = require('./geo');

class CityGraph {
  constructor() {
    this.nodes = new Map(); // id -> { id, lat, lng, ... }
    this.adj = new Map(); // id -> Array<{ to, distanceKm, speedKmh, timeMin }>
    this.reverseAdj = new Map(); // id -> Array<{ to, distanceKm, speedKmh, timeMin }>
  }

  /**
   * Adds a vertex to the city graph.
   * @param {string|number} id
   * @param {number} lat
   * @param {number} lng
   * @param {Object} [meta={}]
   */
  addNode(id, lat, lng, meta = {}) {
    const key = String(id);
    this.nodes.set(key, { id: key, lat: Number(lat), lng: Number(lng), ...meta });
    if (!this.adj.has(key)) this.adj.set(key, []);
    if (!this.reverseAdj.has(key)) this.reverseAdj.set(key, []);
  }

  /**
   * Adds a directed road edge from u to v.
   * @param {string|number} u
   * @param {string|number} v
   * @param {number} [distanceKm]
   * @param {number} [speedKmh=25]
   */
  addEdge(u, v, distanceKm, speedKmh = 25.0) {
    const uKey = String(u);
    const vKey = String(v);

    if (!this.nodes.has(uKey) || !this.nodes.has(vKey)) {
      throw new Error(`Nodes ${uKey} and ${vKey} must exist before adding edge`);
    }

    const dist =
      typeof distanceKm === 'number' && distanceKm > 0
        ? distanceKm
        : calculateHaversineDistance(this.nodes.get(uKey), this.nodes.get(vKey));

    const speed = Math.max(5.0, Number(speedKmh) || 25.0);
    const timeMin = (dist / speed) * 60;

    const edge = { to: vKey, distanceKm: dist, speedKmh: speed, timeMin };
    const revEdge = { to: uKey, distanceKm: dist, speedKmh: speed, timeMin };

    this.adj.get(uKey).push(edge);
    this.reverseAdj.get(vKey).push(revEdge);
  }

  /**
   * Adds an undirected (bidirectional) road segment between u and v.
   * @param {string|number} u
   * @param {string|number} v
   * @param {number} [distanceKm]
   * @param {number} [speedKmh=25]
   */
  addUndirectedEdge(u, v, distanceKm, speedKmh = 25.0) {
    this.addEdge(u, v, distanceKm, speedKmh);
    this.addEdge(v, u, distanceKm, speedKmh);
  }

  /**
   * Standard Dijkstra shortest-path algorithm using binary min-heap.
   *
   * @param {string|number} startId
   * @param {string|number} targetId
   * @param {'time'|'distance'} [weightMode='time']
   * @returns {{ path: string[], totalDistanceKm: number, totalTimeMinutes: number, nodesVisited: number }}
   */
  dijkstra(startId, targetId, weightMode = 'time') {
    const start = String(startId);
    const target = String(targetId);

    if (!this.nodes.has(start) || !this.nodes.has(target)) {
      return { path: [], totalDistanceKm: Infinity, totalTimeMinutes: Infinity, nodesVisited: 0 };
    }

    const dist = new Map();
    const prev = new Map();
    const prevEdge = new Map();
    let nodesVisited = 0;

    dist.set(start, 0);

    const pq = new MinHeap((a, b) => a.cost - b.cost);
    pq.push({ id: start, cost: 0 });

    while (!pq.isEmpty()) {
      const { id: u, cost } = pq.pop();
      nodesVisited++;

      if (cost > dist.get(u)) continue;
      if (u === target) break;

      const neighbors = this.adj.get(u);
      for (const edge of neighbors) {
        const edgeWeight = weightMode === 'time' ? edge.timeMin : edge.distanceKm;
        const newCost = cost + edgeWeight;

        if (!dist.has(edge.to) || newCost < dist.get(edge.to)) {
          dist.set(edge.to, newCost);
          prev.set(edge.to, u);
          prevEdge.set(edge.to, edge);
          pq.push({ id: edge.to, cost: newCost });
        }
      }
    }

    if (!prev.has(target) && start !== target) {
      return { path: [], totalDistanceKm: Infinity, totalTimeMinutes: Infinity, nodesVisited };
    }

    return this._reconstructPath(start, target, prev, prevEdge, nodesVisited);
  }

  /**
   * A* shortest-path algorithm with Euclidean distance heuristic.
   *
   * @param {string|number} startId
   * @param {string|number} targetId
   * @param {'time'|'distance'} [weightMode='time']
   * @returns {{ path: string[], totalDistanceKm: number, totalTimeMinutes: number, nodesVisited: number }}
   */
  aStar(startId, targetId, weightMode = 'time') {
    const start = String(startId);
    const target = String(targetId);

    if (!this.nodes.has(start) || !this.nodes.has(target)) {
      return { path: [], totalDistanceKm: Infinity, totalTimeMinutes: Infinity, nodesVisited: 0 };
    }

    const targetNode = this.nodes.get(target);
    const maxSpeedKmh = 50.0; // Admissible upper bound for time heuristic

    const heuristic = (nodeId) => {
      const node = this.nodes.get(nodeId);
      const distKm = calculateHaversineDistance(node, targetNode);
      return weightMode === 'time' ? (distKm / maxSpeedKmh) * 60 : distKm;
    };

    const gScore = new Map();
    const prev = new Map();
    const prevEdge = new Map();
    let nodesVisited = 0;

    gScore.set(start, 0);

    const openSet = new MinHeap((a, b) => a.fScore - b.fScore);
    openSet.push({ id: start, fScore: heuristic(start) });

    while (!openSet.isEmpty()) {
      const { id: u } = openSet.pop();
      nodesVisited++;

      if (u === target) break;

      const currentG = gScore.get(u);
      const neighbors = this.adj.get(u);

      for (const edge of neighbors) {
        const edgeWeight = weightMode === 'time' ? edge.timeMin : edge.distanceKm;
        const tentativeG = currentG + edgeWeight;

        if (!gScore.has(edge.to) || tentativeG < gScore.get(edge.to)) {
          gScore.set(edge.to, tentativeG);
          prev.set(edge.to, u);
          prevEdge.set(edge.to, edge);
          const fScore = tentativeG + heuristic(edge.to);
          openSet.push({ id: edge.to, fScore });
        }
      }
    }

    if (!prev.has(target) && start !== target) {
      return { path: [], totalDistanceKm: Infinity, totalTimeMinutes: Infinity, nodesVisited };
    }

    return this._reconstructPath(start, target, prev, prevEdge, nodesVisited);
  }

  /**
   * Bidirectional Dijkstra algorithm: searches simultaneously forward from start and backward from target.
   *
   * @param {string|number} startId
   * @param {string|number} targetId
   * @param {'time'|'distance'} [weightMode='time']
   * @returns {{ path: string[], totalDistanceKm: number, totalTimeMinutes: number, nodesVisited: number }}
   */
  bidirectionalDijkstra(startId, targetId, weightMode = 'time') {
    const start = String(startId);
    const target = String(targetId);

    if (!this.nodes.has(start) || !this.nodes.has(target)) {
      return { path: [], totalDistanceKm: Infinity, totalTimeMinutes: Infinity, nodesVisited: 0 };
    }

    if (start === target) {
      return { path: [start], totalDistanceKm: 0, totalTimeMinutes: 0, nodesVisited: 1 };
    }

    const distF = new Map([[start, 0]]);
    const distB = new Map([[target, 0]]);
    const prevF = new Map();
    const prevB = new Map();
    const visitedF = new Set();
    const visitedB = new Set();

    const pqF = new MinHeap((a, b) => a.cost - b.cost);
    const pqB = new MinHeap((a, b) => a.cost - b.cost);

    pqF.push({ id: start, cost: 0 });
    pqB.push({ id: target, cost: 0 });

    let mu = Infinity; // Best path length found so far
    let meetingNode = null;
    let nodesVisited = 0;

    while (!pqF.isEmpty() && !pqB.isEmpty()) {
      // Step forward
      const { id: u, cost: costF } = pqF.pop();
      nodesVisited++;
      visitedF.add(u);

      if (costF <= distF.get(u)) {
        const neighbors = this.adj.get(u);
        for (const edge of neighbors) {
          const w = weightMode === 'time' ? edge.timeMin : edge.distanceKm;
          const newCost = costF + w;
          if (!distF.has(edge.to) || newCost < distF.get(edge.to)) {
            distF.set(edge.to, newCost);
            prevF.set(edge.to, { parent: u, edge });
            pqF.push({ id: edge.to, cost: newCost });

            const distInB = distB.get(edge.to);
            if (distInB !== undefined && newCost + distInB < mu) {
              mu = newCost + distInB;
              meetingNode = edge.to;
            }
          }
        }
      }

      // Step backward along reverse edges
      const { id: v, cost: costB } = pqB.pop();
      nodesVisited++;
      visitedB.add(v);

      if (costB <= distB.get(v)) {
        const revNeighbors = this.reverseAdj.get(v);
        for (const edge of revNeighbors) {
          const w = weightMode === 'time' ? edge.timeMin : edge.distanceKm;
          const newCost = costB + w;
          if (!distB.has(edge.to) || newCost < distB.get(edge.to)) {
            distB.set(edge.to, newCost);
            prevB.set(edge.to, { parent: v, edge });
            pqB.push({ id: edge.to, cost: newCost });

            const distInF = distF.get(edge.to);
            if (distInF !== undefined && distInF + newCost < mu) {
              mu = distInF + newCost;
              meetingNode = edge.to;
            }
          }
        }
      }

      // Termination condition
      const topF = pqF.peek();
      const topB = pqB.peek();
      if (topF && topB && topF.cost + topB.cost >= mu) {
        break;
      }
    }

    if (!meetingNode) {
      return { path: [], totalDistanceKm: Infinity, totalTimeMinutes: Infinity, nodesVisited };
    }

    // Stitch forward path: start -> meetingNode
    const pathForward = [];
    let curr = meetingNode;
    let totalDistKm = 0;
    let totalTimeMin = 0;

    while (curr !== start) {
      pathForward.unshift(curr);
      const step = prevF.get(curr);
      totalDistKm += step.edge.distanceKm;
      totalTimeMin += step.edge.timeMin;
      curr = step.parent;
    }
    pathForward.unshift(start);

    // Stitch backward path: meetingNode -> target
    const pathBackward = [];
    curr = meetingNode;
    while (curr !== target) {
      const step = prevB.get(curr);
      totalDistKm += step.edge.distanceKm;
      totalTimeMin += step.edge.timeMin;
      curr = step.parent;
      pathBackward.push(curr);
    }

    const fullPath = [...pathForward, ...pathBackward];

    return {
      path: fullPath,
      totalDistanceKm: Math.round(totalDistKm * 1000) / 1000,
      totalTimeMinutes: Math.round(totalTimeMin * 10) / 10,
      nodesVisited,
    };
  }

  /**
   * Internal path reconstruction helper.
   * @private
   */
  _reconstructPath(start, target, prev, prevEdge, nodesVisited) {
    const path = [];
    let curr = target;
    let totalDist = 0;
    let totalTime = 0;

    while (curr !== start) {
      path.unshift(curr);
      const edge = prevEdge.get(curr);
      totalDist += edge.distanceKm;
      totalTime += edge.timeMin;
      curr = prev.get(curr);
    }
    path.unshift(start);

    return {
      path,
      totalDistanceKm: Math.round(totalDist * 1000) / 1000,
      totalTimeMinutes: Math.round(totalTime * 10) / 10,
      nodesVisited,
    };
  }
}

/**
 * Procedurally generates a deterministic grid city graph representing urban street layout.
 *
 * @param {Object} [options]
 * @param {number} [options.rows=20]
 * @param {number} [options.cols=20]
 * @param {number} [options.baseLat=12.93524]
 * @param {number} [options.baseLng=77.62448]
 * @param {number} [options.spacingKm=0.3]
 * @returns {CityGraph}
 */
function createGridCityGraph(options = {}) {
  const rows = options.rows || 20;
  const cols = options.cols || 20;
  const baseLat = options.baseLat || 12.93524;
  const baseLng = options.baseLng || 77.62448;
  const spacingKm = options.spacingKm || 0.3;

  const graph = new CityGraph();
  const kmPerLatDegree = 111.0;
  const kmPerLngDegree = 111.0 * Math.cos((baseLat * Math.PI) / 180);

  const dLat = spacingKm / kmPerLatDegree;
  const dLng = spacingKm / kmPerLngDegree;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const id = `node_${r}_${c}`;
      const lat = baseLat + (r - Math.floor(rows / 2)) * dLat;
      const lng = baseLng + (c - Math.floor(cols / 2)) * dLng;
      graph.addNode(id, lat, lng, { row: r, col: c });
    }
  }

  // Connect adjacent street grid nodes
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const u = `node_${r}_${c}`;

      // Horizontal edge (East-West)
      if (c + 1 < cols) {
        const v = `node_${r}_${c + 1}`;
        const speed = r % 4 === 0 ? 35.0 : 22.0; // Arterial avenues have higher speeds
        graph.addUndirectedEdge(u, v, spacingKm, speed);
      }

      // Vertical edge (North-South)
      if (r + 1 < rows) {
        const v = `node_${r + 1}_${c}`;
        const speed = c % 4 === 0 ? 35.0 : 22.0;
        graph.addUndirectedEdge(u, v, spacingKm, speed);
      }
    }
  }

  return graph;
}

module.exports = {
  CityGraph,
  createGridCityGraph,
};
