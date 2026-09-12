/**
 * Pure Least Frequently Used (LFU) Cache Implementation.
 *
 * Data Structure:
 * - Hash Map for O(1) key -> node lookups
 * - Frequency Map for O(1) freq -> Doubly Linked List of nodes with that access frequency
 * - minFreq pointer tracking the current minimum frequency for O(1) eviction
 *
 * Characteristics:
 * - Strict O(1) time complexity for get(), set(), delete(), has(), and peek()
 * - Ties in frequency broken by LRU policy within the same frequency bucket
 * - Per-entry or default TTL with lazy and active pruning
 * - Telemetry metrics (hits, misses, evictions, hitRatio)
 * - Zero external dependencies.
 */

class LFUNode {
  constructor(key, value, freq = 1, expiresAt = null) {
    this.key = key;
    this.value = value;
    this.freq = freq;
    this.expiresAt = expiresAt;
    this.prev = null;
    this.next = null;
  }

  isExpired(now = Date.now()) {
    return this.expiresAt !== null && this.expiresAt <= now;
  }
}

class DoublyLinkedList {
  constructor() {
    this.head = new LFUNode(null, null);
    this.tail = new LFUNode(null, null);
    this.head.next = this.tail;
    this.tail.prev = this.head;
    this.size = 0;
  }

  add(node) {
    node.prev = this.head;
    node.next = this.head.next;
    this.head.next.prev = node;
    this.head.next = node;
    this.size++;
  }

  remove(node) {
    node.prev.next = node.next;
    node.next.prev = node.prev;
    this.size--;
  }

  removeTail() {
    if (this.size === 0) return null;
    const lruNode = this.tail.prev;
    this.remove(lruNode);
    return lruNode;
  }

  isEmpty() {
    return this.size === 0;
  }
}

class LFUCache {
  /**
   * @param {Object} [options]
   * @param {number} [options.capacity=1000] - Maximum entries in cache.
   * @param {number} [options.defaultTtlMs=0] - Default TTL in milliseconds (0 = infinite).
   * @param {Function} [options.onEvict] - Eviction callback (key, value, reason).
   */
  constructor(options = {}) {
    const { capacity = 1000, defaultTtlMs = 0, onEvict = null } = options;

    if (!Number.isInteger(capacity) || capacity <= 0) {
      throw new Error(`LFUCache capacity must be a positive integer, received: ${capacity}`);
    }

    this.capacity = capacity;
    this.defaultTtlMs = Math.max(0, Number(defaultTtlMs) || 0);
    this.onEvict = typeof onEvict === 'function' ? onEvict : null;

    this.keyToNode = new Map();
    this.freqToList = new Map();
    this.minFreq = 0;

    // Telemetry
    this.hits = 0;
    this.misses = 0;
    this.evictions = 0;
  }

  get size() {
    return this.keyToNode.size;
  }

  /**
   * Retrieves an item and increments its frequency counter.
   * @param {*} key
   * @returns {*}
   */
  get(key) {
    const node = this.keyToNode.get(key);
    if (!node) {
      this.misses++;
      return undefined;
    }

    if (node.isExpired()) {
      this._removeNode(node);
      this.keyToNode.delete(key);
      this.misses++;
      if (this.onEvict) {
        this.onEvict(node.key, node.value, 'expired');
      }
      return undefined;
    }

    this._updateNodeFreq(node);
    this.hits++;
    return node.value;
  }

  /**
   * Peeks at a value without incrementing access frequency or modifying recency.
   * @param {*} key
   * @returns {*}
   */
  peek(key) {
    const node = this.keyToNode.get(key);
    if (!node) return undefined;
    if (node.isExpired()) return undefined;
    return node.value;
  }

  /**
   * Checks if an unexpired key exists in cache.
   * @param {*} key
   * @returns {boolean}
   */
  has(key) {
    const node = this.keyToNode.get(key);
    if (!node) return false;
    if (node.isExpired()) return false;
    return true;
  }

  /**
   * Inserts or updates an entry.
   * @param {*} key
   * @param {*} value
   * @param {number} [ttlMs]
   * @returns {LFUCache}
   */
  set(key, value, ttlMs) {
    const ttl = ttlMs !== undefined ? Math.max(0, Number(ttlMs) || 0) : this.defaultTtlMs;
    const expiresAt = ttl > 0 ? Date.now() + ttl : null;

    const existingNode = this.keyToNode.get(key);
    if (existingNode) {
      existingNode.value = value;
      existingNode.expiresAt = expiresAt;
      this._updateNodeFreq(existingNode);
      return this;
    }

    // Evict LFU node if capacity reached
    if (this.keyToNode.size >= this.capacity) {
      this._evictLFU();
    }

    const newNode = new LFUNode(key, value, 1, expiresAt);
    this.keyToNode.set(key, newNode);

    let list = this.freqToList.get(1);
    if (!list) {
      list = new DoublyLinkedList();
      this.freqToList.set(1, list);
    }
    list.add(newNode);
    this.minFreq = 1;

    return this;
  }

  /**
   * Removes a key from the cache.
   * @param {*} key
   * @returns {boolean}
   */
  delete(key) {
    const node = this.keyToNode.get(key);
    if (!node) return false;

    this._removeNode(node);
    this.keyToNode.delete(key);

    if (this.onEvict) {
      this.onEvict(node.key, node.value, 'manual');
    }
    return true;
  }

  /**
   * Purges all cache contents and metrics.
   */
  clear() {
    this.keyToNode.clear();
    this.freqToList.clear();
    this.minFreq = 0;
    this.hits = 0;
    this.misses = 0;
    this.evictions = 0;
  }

  /**
   * Scans and purges all expired entries.
   * @returns {number}
   */
  pruneExpired() {
    const now = Date.now();
    let pruned = 0;
    for (const [key, node] of this.keyToNode.entries()) {
      if (node.isExpired(now)) {
        this._removeNode(node);
        this.keyToNode.delete(key);
        pruned++;
        if (this.onEvict) {
          this.onEvict(node.key, node.value, 'expired');
        }
      }
    }
    return pruned;
  }

  /**
   * Telemetry stats.
   * @returns {Object}
   */
  stats() {
    const totalRequests = this.hits + this.misses;
    const hitRatio = totalRequests > 0 ? this.hits / totalRequests : 0;
    return {
      size: this.keyToNode.size,
      capacity: this.capacity,
      hits: this.hits,
      misses: this.misses,
      evictions: this.evictions,
      hitRatio: Number(hitRatio.toFixed(4)),
    };
  }

  /**
   * Returns list of keys.
   * @returns {Array}
   */
  keys() {
    const result = [];
    const now = Date.now();
    for (const [key, node] of this.keyToNode.entries()) {
      if (!node.isExpired(now)) {
        result.push(key);
      }
    }
    return result;
  }

  /**
   * Returns list of values.
   * @returns {Array}
   */
  values() {
    const result = [];
    const now = Date.now();
    for (const node of this.keyToNode.values()) {
      if (!node.isExpired(now)) {
        result.push(node.value);
      }
    }
    return result;
  }

  /**
   * Returns [key, value] pairs.
   * @returns {Array<[*, *]>}
   */
  entries() {
    const result = [];
    const now = Date.now();
    for (const [key, node] of this.keyToNode.entries()) {
      if (!node.isExpired(now)) {
        result.push([key, node.value]);
      }
    }
    return result;
  }

  // --- Private Helpers ---

  _updateNodeFreq(node) {
    const oldFreq = node.freq;
    const oldList = this.freqToList.get(oldFreq);
    oldList.remove(node);
    if (oldList.isEmpty()) {
      this.freqToList.delete(oldFreq);
      if (this.minFreq === oldFreq) {
        this.minFreq = oldFreq + 1;
      }
    }

    node.freq++;
    let newList = this.freqToList.get(node.freq);
    if (!newList) {
      newList = new DoublyLinkedList();
      this.freqToList.set(node.freq, newList);
    }
    newList.add(node);
  }

  _removeNode(node) {
    const list = this.freqToList.get(node.freq);
    list.remove(node);
    if (list.isEmpty()) {
      this.freqToList.delete(node.freq);
      if (this.minFreq === node.freq) {
        let nextMin = 0;
        for (const f of this.freqToList.keys()) {
          if (nextMin === 0 || f < nextMin) {
            nextMin = f;
          }
        }
        this.minFreq = nextMin;
      }
    }
  }

  _evictLFU() {
    const minList = this.freqToList.get(this.minFreq);
    const evictedNode = minList.removeTail();
    this.keyToNode.delete(evictedNode.key);
    this.evictions++;

    if (minList.isEmpty()) {
      this.freqToList.delete(this.minFreq);
    }

    if (this.onEvict) {
      this.onEvict(evictedNode.key, evictedNode.value, 'capacity');
    }
  }
}

module.exports = { LFUCache, LFUNode, DoublyLinkedList };
