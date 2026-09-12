/**
 * Pure Least Recently Used (LRU) Cache Implementation.
 *
 * Data Structure:
 * - Hash Map (O(1) key-to-node lookup)
 * - Doubly Linked List (O(1) node relocation, insertion, and eviction)
 *
 * Characteristics:
 * - O(1) time complexity for get(), set(), delete(), has(), and peek()
 * - Per-entry or default Time-To-Live (TTL) with lazy and active pruning
 * - Eviction hooks for telemetry and cache-aside synchronization
 * - Zero external dependencies.
 */

class DoublyLinkedNode {
  constructor(key, value, expiresAt = null) {
    this.key = key;
    this.value = value;
    this.expiresAt = expiresAt;
    this.prev = null;
    this.next = null;
  }

  isExpired(now = Date.now()) {
    return this.expiresAt !== null && this.expiresAt <= now;
  }
}

class LRUCache {
  /**
   * @param {Object} [options]
   * @param {number} [options.capacity=1000] - Maximum entries allowed in cache.
   * @param {number} [options.defaultTtlMs=0] - Default TTL in milliseconds (0 = no expiry).
   * @param {Function} [options.onEvict] - Callback (key, value, reason) on removal ('capacity' | 'expired' | 'manual').
   */
  constructor(options = {}) {
    const { capacity = 1000, defaultTtlMs = 0, onEvict = null } = options;

    if (!Number.isInteger(capacity) || capacity <= 0) {
      throw new Error(`LRUCache capacity must be a positive integer, received: ${capacity}`);
    }

    this.capacity = capacity;
    this.defaultTtlMs = Math.max(0, Number(defaultTtlMs) || 0);
    this.onEvict = typeof onEvict === 'function' ? onEvict : null;

    this.map = new Map();

    // Sentinel dummy nodes for O(1) boundary updates
    this.head = new DoublyLinkedNode(null, null);
    this.tail = new DoublyLinkedNode(null, null);
    this.head.next = this.tail;
    this.tail.prev = this.head;

    // Telemetry counters
    this.hits = 0;
    this.misses = 0;
    this.evictions = 0;
  }

  /**
   * Returns current number of active entries.
   * @returns {number}
   */
  get size() {
    return this.map.size;
  }

  /**
   * Retrieves an item and marks it as Most Recently Used.
   * @param {*} key
   * @returns {*} Value if found and unexpired, otherwise undefined.
   */
  get(key) {
    const node = this.map.get(key);
    if (!node) {
      this.misses++;
      return undefined;
    }

    if (node.isExpired()) {
      this._removeNode(node);
      this.map.delete(key);
      this.misses++;
      if (this.onEvict) {
        this.onEvict(node.key, node.value, 'expired');
      }
      return undefined;
    }

    // Move to head (MRU)
    this._moveToHead(node);
    this.hits++;
    return node.value;
  }

  /**
   * Peeks at an item without altering recency or incrementing hit/miss counters.
   * @param {*} key
   * @returns {*}
   */
  peek(key) {
    const node = this.map.get(key);
    if (!node) return undefined;
    if (node.isExpired()) return undefined;
    return node.value;
  }

  /**
   * Checks whether a non-expired key exists in the cache.
   * @param {*} key
   * @returns {boolean}
   */
  has(key) {
    const node = this.map.get(key);
    if (!node) return false;
    if (node.isExpired()) {
      return false;
    }
    return true;
  }

  /**
   * Inserts or updates an entry in the cache.
   * @param {*} key
   * @param {*} value
   * @param {number} [ttlMs] - Custom TTL in milliseconds for this specific entry.
   * @returns {LRUCache} Current instance for method chaining.
   */
  set(key, value, ttlMs) {
    const ttl = ttlMs !== undefined ? Math.max(0, Number(ttlMs) || 0) : this.defaultTtlMs;
    const expiresAt = ttl > 0 ? Date.now() + ttl : null;

    const existingNode = this.map.get(key);
    if (existingNode) {
      existingNode.value = value;
      existingNode.expiresAt = expiresAt;
      this._moveToHead(existingNode);
      return this;
    }

    // Evict least recently used entry if at capacity
    if (this.map.size >= this.capacity) {
      this._evictLRU();
    }

    const newNode = new DoublyLinkedNode(key, value, expiresAt);
    this.map.set(key, newNode);
    this._addNode(newNode);

    return this;
  }

  /**
   * Explicitly removes a key from the cache.
   * @param {*} key
   * @returns {boolean} True if found and deleted, false otherwise.
   */
  delete(key) {
    const node = this.map.get(key);
    if (!node) return false;

    this._removeNode(node);
    this.map.delete(key);

    if (this.onEvict) {
      this.onEvict(node.key, node.value, 'manual');
    }
    return true;
  }

  /**
   * Purges all entries and resets metrics.
   */
  clear() {
    this.map.clear();
    this.head.next = this.tail;
    this.tail.prev = this.head;
    this.hits = 0;
    this.misses = 0;
    this.evictions = 0;
  }

  /**
   * Actively scans and removes all expired entries.
   * @returns {number} Number of expired items pruned.
   */
  pruneExpired() {
    const now = Date.now();
    let pruned = 0;
    for (const [key, node] of this.map.entries()) {
      if (node.isExpired(now)) {
        this._removeNode(node);
        this.map.delete(key);
        pruned++;
        if (this.onEvict) {
          this.onEvict(node.key, node.value, 'expired');
        }
      }
    }
    return pruned;
  }

  /**
   * Returns telemetry metrics including hit ratio.
   * @returns {Object}
   */
  stats() {
    const totalRequests = this.hits + this.misses;
    const hitRatio = totalRequests > 0 ? this.hits / totalRequests : 0;
    return {
      size: this.map.size,
      capacity: this.capacity,
      hits: this.hits,
      misses: this.misses,
      evictions: this.evictions,
      hitRatio: Number(hitRatio.toFixed(4)),
    };
  }

  /**
   * Returns an array of keys in order from most to least recently used.
   * @returns {Array}
   */
  keys() {
    const result = [];
    let current = this.head.next;
    const now = Date.now();
    while (current !== this.tail) {
      if (!current.isExpired(now)) {
        result.push(current.key);
      }
      current = current.next;
    }
    return result;
  }

  /**
   * Returns an array of values in order from most to least recently used.
   * @returns {Array}
   */
  values() {
    const result = [];
    let current = this.head.next;
    const now = Date.now();
    while (current !== this.tail) {
      if (!current.isExpired(now)) {
        result.push(current.value);
      }
      current = current.next;
    }
    return result;
  }

  /**
   * Returns an array of [key, value] pairs in MRU to LRU order.
   * @returns {Array<[*, *]>}
   */
  entries() {
    const result = [];
    let current = this.head.next;
    const now = Date.now();
    while (current !== this.tail) {
      if (!current.isExpired(now)) {
        result.push([current.key, current.value]);
      }
      current = current.next;
    }
    return result;
  }

  // --- Private Doubly Linked List Operations ---

  _addNode(node) {
    // Insert immediately following head (MRU position)
    node.prev = this.head;
    node.next = this.head.next;
    this.head.next.prev = node;
    this.head.next = node;
  }

  _removeNode(node) {
    node.prev.next = node.next;
    node.next.prev = node.prev;
  }

  _moveToHead(node) {
    this._removeNode(node);
    this._addNode(node);
  }

  _evictLRU() {
    const lruNode = this.tail.prev;
    if (lruNode === this.head) return;

    this._removeNode(lruNode);
    this.map.delete(lruNode.key);
    this.evictions++;

    if (this.onEvict) {
      this.onEvict(lruNode.key, lruNode.value, 'capacity');
    }
  }
}

module.exports = { LRUCache, DoublyLinkedNode };
