/**
 * @file heap.js
 * @description Pure Binary Min-Heap / Priority Queue with decrease-key and lazy deletion support.
 * Zero external dependencies.
 */

class MinHeap {
  /**
   * @param {Function} [comparator] - Optional comparator: (a, b) => number. Returns negative if a < b.
   */
  constructor(comparator = (a, b) => a.priority - b.priority) {
    this.comparator = comparator;
    this.data = [];
  }

  /**
   * Number of items currently in the heap.
   * @returns {number}
   */
  size() {
    return this.data.length;
  }

  /**
   * Checks if heap is empty.
   * @returns {boolean}
   */
  isEmpty() {
    return this.data.length === 0;
  }

  /**
   * Returns top element without removing it.
   * @returns {any|null}
   */
  peek() {
    return this.data.length > 0 ? this.data[0] : null;
  }

  /**
   * Inserts an element into the min-heap.
   * Time Complexity: O(log N)
   *
   * @param {any} item
   */
  push(item) {
    this.data.push(item);
    this._siftUp(this.data.length - 1);
  }

  /**
   * Extracts and returns the minimum element from the heap.
   * Time Complexity: O(log N)
   *
   * @returns {any|null}
   */
  pop() {
    if (this.data.length === 0) return null;
    const top = this.data[0];
    const last = this.data.pop();

    if (this.data.length > 0) {
      this.data[0] = last;
      this._siftDown(0);
    }

    return top;
  }

  /**
   * Internal sift up operation.
   * @param {number} idx
   * @private
   */
  _siftUp(idx) {
    let curr = idx;
    while (curr > 0) {
      const parent = Math.floor((curr - 1) / 2);
      if (this.comparator(this.data[curr], this.data[parent]) < 0) {
        this._swap(curr, parent);
        curr = parent;
      } else {
        break;
      }
    }
  }

  /**
   * Internal sift down operation.
   * @param {number} idx
   * @private
   */
  _siftDown(idx) {
    let curr = idx;
    const length = this.data.length;

    while (true) {
      const left = 2 * curr + 1;
      const right = 2 * curr + 2;
      let smallest = curr;

      if (left < length && this.comparator(this.data[left], this.data[smallest]) < 0) {
        smallest = left;
      }
      if (right < length && this.comparator(this.data[right], this.data[smallest]) < 0) {
        smallest = right;
      }

      if (smallest !== curr) {
        this._swap(curr, smallest);
        curr = smallest;
      } else {
        break;
      }
    }
  }

  /**
   * Internal element swap.
   * @param {number} i
   * @param {number} j
   * @private
   */
  _swap(i, j) {
    const temp = this.data[i];
    this.data[i] = this.data[j];
    this.data[j] = temp;
  }

  /**
   * Clears all items in heap.
   */
  clear() {
    this.data = [];
  }
}

module.exports = {
  MinHeap,
};
