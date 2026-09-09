/**
 * @file bkTree.js
 * @description Pure Burkhard-Keller Tree (BK-Tree) data structure for sub-linear metric space discrete metric search.
 * Optimizes typo and fuzzy spelling recovery from O(N) linear scan down to O(log N) average tree traversal.
 * Zero external algorithmic dependencies.
 */

const { editDistance } = require('./levenshtein');

class BKNode {
  constructor(term) {
    this.term = term;
    this.children = new Map(); // Map<integer distance, BKNode>
  }
}

class BKTree {
  /**
   * @param {Function} [distanceFn=editDistance] - Metric distance function obeying metric space axioms.
   */
  constructor(distanceFn = editDistance) {
    this.root = null;
    this.distanceFn = distanceFn;
    this._size = 0;
  }

  /**
   * Total number of unique terms stored in the BK-tree.
   */
  get size() {
    return this._size;
  }

  /**
   * Inserts a term into the BK-tree.
   *
   * @param {string} term - Term to insert.
   * @returns {boolean} True if inserted, false if duplicate or invalid.
   */
  insert(term) {
    if (!term || typeof term !== 'string') {
      return false;
    }

    const normalized = term.trim().toLowerCase();
    if (!normalized) {
      return false;
    }

    if (!this.root) {
      this.root = new BKNode(normalized);
      this._size++;
      return true;
    }

    let current = this.root;

    while (current) {
      const dist = this.distanceFn(normalized, current.term);

      if (dist === 0) {
        // Word already exists in tree
        return false;
      }

      const child = current.children.get(dist);
      if (child) {
        current = child;
      } else {
        current.children.set(dist, new BKNode(normalized));
        this._size++;
        return true;
      }
    }
  }

  /**
   * Batch inserts multiple terms.
   *
   * @param {Iterable<string>} terms
   * @returns {number} Number of newly inserted terms.
   */
  insertAll(terms) {
    if (!terms || typeof terms[Symbol.iterator] !== 'function') {
      return 0;
    }
    let count = 0;
    for (const term of terms) {
      if (this.insert(term)) {
        count++;
      }
    }
    return count;
  }

  /**
   * Searches the BK-tree for words within maxDistance of the target term.
   * Utilizes the triangle inequality:
   *   |d(target, node.term) - d(node.term, child)| <= d(target, child) <= d(target, node.term) + d(node.term, child)
   *
   * @param {string} target - Query string to match against.
   * @param {number} [maxDistance=2] - Maximum allowable edit distance.
   * @param {number} [limit=10] - Maximum matches to return.
   * @returns {Array<{ term: string, distance: number }>}
   */
  search(target, maxDistance = 2, limit = 10) {
    if (!this.root || !target || typeof target !== 'string' || maxDistance < 0) {
      return [];
    }

    const normalized = target.trim().toLowerCase();
    if (!normalized) {
      return [];
    }

    const matches = [];
    const queue = [this.root];

    while (queue.length > 0) {
      const current = queue.shift();
      const dist = this.distanceFn(normalized, current.term);

      if (dist <= maxDistance) {
        matches.push({ term: current.term, distance: dist });
      }

      // Check all children whose distance edge k satisfies:
      // dist - maxDistance <= k <= dist + maxDistance
      const minEdge = Math.max(1, dist - maxDistance);
      const maxEdge = dist + maxDistance;

      for (const [edgeDist, childNode] of current.children.entries()) {
        if (edgeDist >= minEdge && edgeDist <= maxEdge) {
          queue.push(childNode);
        }
      }
    }

    // Sort by distance ascending, then alphabetically
    matches.sort((a, b) => {
      if (a.distance !== b.distance) {
        return a.distance - b.distance;
      }
      return a.term.localeCompare(b.term);
    });

    return matches.slice(0, limit);
  }

  /**
   * Resets and clears the BK-tree.
   */
  clear() {
    this.root = null;
    this._size = 0;
  }
}

module.exports = {
  BKTree,
  BKNode,
};
