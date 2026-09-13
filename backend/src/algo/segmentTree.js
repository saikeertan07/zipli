/**
 * @file segmentTree.js
 * @description Pure Segment Tree data structure for O(log K) delivery slot capacity management,
 * range minimum capacity queries, and atomic slot reservations.
 * Zero external dependencies.
 */

class SegmentTree {
  /**
   * Initializes segment tree with initial capacity array or size with default capacity.
   *
   * @param {number[]|number} capacityOrSize - Array of slot capacities or count of slots.
   * @param {number} [defaultCapacity=15] - Default initial capacity if size passed.
   */
  constructor(capacityOrSize, defaultCapacity = 15) {
    if (Array.isArray(capacityOrSize)) {
      this.n = capacityOrSize.length;
      this.capacities = [...capacityOrSize];
    } else {
      this.n = Math.max(1, Math.floor(Number(capacityOrSize) || 24));
      this.capacities = new Array(this.n).fill(defaultCapacity);
    }

    // Allocate 4 * n space for tree nodes
    this.treeMin = new Int32Array(4 * this.n);
    this.treeSum = new Int32Array(4 * this.n);

    if (this.n > 0) {
      this._build(1, 0, this.n - 1);
    }
  }

  /**
   * Internal recursive tree construction.
   * Time Complexity: O(N)
   *
   * @param {number} node
   * @param {number} start
   * @param {number} end
   * @private
   */
  _build(node, start, end) {
    if (start === end) {
      const val = this.capacities[start];
      this.treeMin[node] = val;
      this.treeSum[node] = val;
      return;
    }

    const mid = Math.floor((start + end) / 2);
    const left = 2 * node;
    const right = 2 * node + 1;

    this._build(left, start, mid);
    this._build(right, mid + 1, end);

    this.treeMin[node] = Math.min(this.treeMin[left], this.treeMin[right]);
    this.treeSum[node] = this.treeSum[left] + this.treeSum[right];
  }

  /**
   * Queries minimum remaining capacity across slot range [L, R].
   * Time Complexity: O(log N)
   *
   * @param {number} l
   * @param {number} r
   * @returns {number}
   */
  queryMin(l, r) {
    const leftBound = Math.max(0, Math.min(l, r));
    const rightBound = Math.min(this.n - 1, Math.max(l, r));
    return this._queryMin(1, 0, this.n - 1, leftBound, rightBound);
  }

  _queryMin(node, start, end, l, r) {
    if (r < start || end < l) {
      return Infinity;
    }
    if (l <= start && end <= r) {
      return this.treeMin[node];
    }

    const mid = Math.floor((start + end) / 2);
    const p1 = this._queryMin(2 * node, start, mid, l, r);
    const p2 = this._queryMin(2 * node + 1, mid + 1, end, l, r);
    return Math.min(p1, p2);
  }

  /**
   * Queries total available capacity across slot range [L, R].
   * Time Complexity: O(log N)
   *
   * @param {number} l
   * @param {number} r
   * @returns {number}
   */
  querySum(l, r) {
    const leftBound = Math.max(0, Math.min(l, r));
    const rightBound = Math.min(this.n - 1, Math.max(l, r));
    return this._querySum(1, 0, this.n - 1, leftBound, rightBound);
  }

  _querySum(node, start, end, l, r) {
    if (r < start || end < l) {
      return 0;
    }
    if (l <= start && end <= r) {
      return this.treeSum[node];
    }

    const mid = Math.floor((start + end) / 2);
    const p1 = this._querySum(2 * node, start, mid, l, r);
    const p2 = this._querySum(2 * node + 1, mid + 1, end, l, r);
    return p1 + p2;
  }

  /**
   * Reserves capacity in a delivery slot.
   * Time Complexity: O(log N)
   *
   * @param {number} slotIndex
   * @param {number} [count=1]
   * @returns {boolean} True if successfully reserved; false if insufficient capacity
   */
  reserveSlot(slotIndex, count = 1) {
    if (slotIndex < 0 || slotIndex >= this.n || count <= 0) {
      return false;
    }

    const currentCap = this.queryMin(slotIndex, slotIndex);
    if (currentCap < count) {
      return false;
    }

    this._update(1, 0, this.n - 1, slotIndex, currentCap - count);
    this.capacities[slotIndex] = currentCap - count;
    return true;
  }

  /**
   * Releases previously reserved capacity back into the slot.
   * Time Complexity: O(log N)
   *
   * @param {number} slotIndex
   * @param {number} [count=1]
   * @returns {number} New available capacity
   */
  releaseSlot(slotIndex, count = 1) {
    if (slotIndex < 0 || slotIndex >= this.n || count <= 0) {
      return 0;
    }

    const currentCap = this.queryMin(slotIndex, slotIndex);
    const newCap = currentCap + count;

    this._update(1, 0, this.n - 1, slotIndex, newCap);
    this.capacities[slotIndex] = newCap;
    return newCap;
  }

  /**
   * Internal recursive update.
   * @private
   */
  _update(node, start, end, idx, val) {
    if (start === end) {
      this.treeMin[node] = val;
      this.treeSum[node] = val;
      return;
    }

    const mid = Math.floor((start + end) / 2);
    const left = 2 * node;
    const right = 2 * node + 1;

    if (idx <= mid) {
      this._update(left, start, mid, idx, val);
    } else {
      this._update(right, mid + 1, end, idx, val);
    }

    this.treeMin[node] = Math.min(this.treeMin[left], this.treeMin[right]);
    this.treeSum[node] = this.treeSum[left] + this.treeSum[right];
  }

  /**
   * Returns current capacity of a specific slot.
   * @param {number} slotIndex
   * @returns {number}
   */
  getCapacity(slotIndex) {
    if (slotIndex < 0 || slotIndex >= this.n) return 0;
    return this.capacities[slotIndex];
  }

  /**
   * Returns copy of all current capacities.
   * @returns {number[]}
   */
  getAllCapacities() {
    return [...this.capacities];
  }
}

module.exports = {
  SegmentTree,
};
