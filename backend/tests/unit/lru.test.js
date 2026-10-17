const { LRUCache, DoublyLinkedNode } = require('../../src/algo/lru');

describe('Pure LRUCache (/algo/lru.js)', () => {
  describe('constructor validation and defaults', () => {
    it('initializes with default options', () => {
      const cache = new LRUCache();
      expect(cache.capacity).toBe(1000);
      expect(cache.size).toBe(0);
      expect(cache.defaultTtlMs).toBe(0);
      expect(cache.onEvict).toBeNull();
    });

    it('accepts valid custom options', () => {
      const onEvict = jest.fn();
      const cache = new LRUCache({ capacity: 5, defaultTtlMs: 2000, onEvict });
      expect(cache.capacity).toBe(5);
      expect(cache.defaultTtlMs).toBe(2000);
      expect(cache.onEvict).toBe(onEvict);
    });

    it('ignores onEvict if not a function', () => {
      const cache = new LRUCache({ capacity: 5, onEvict: 'not_a_func' });
      expect(cache.onEvict).toBeNull();
    });

    it('throws when capacity is not a positive integer', () => {
      expect(() => new LRUCache({ capacity: 0 })).toThrow(/capacity must be a positive integer/);
      expect(() => new LRUCache({ capacity: -10 })).toThrow(/capacity must be a positive integer/);
      expect(() => new LRUCache({ capacity: 3.14 })).toThrow(/capacity must be a positive integer/);
      expect(() => new LRUCache({ capacity: 'large' })).toThrow(
        /capacity must be a positive integer/
      );
    });
  });

  describe('basic get, set, has, delete operations', () => {
    it('stores and retrieves values', () => {
      const cache = new LRUCache({ capacity: 3 });
      cache.set('a', 1);
      cache.set('b', 2);
      expect(cache.get('a')).toBe(1);
      expect(cache.get('b')).toBe(2);
      expect(cache.get('c')).toBeUndefined();
      expect(cache.has('a')).toBe(true);
      expect(cache.has('z')).toBe(false);
    });

    it('updates existing keys without altering size', () => {
      const cache = new LRUCache({ capacity: 3 });
      cache.set('a', 1);
      expect(cache.size).toBe(1);
      cache.set('a', 99);
      expect(cache.size).toBe(1);
      expect(cache.get('a')).toBe(99);
    });

    it('deletes keys and invokes manual eviction callback', () => {
      const onEvict = jest.fn();
      const cache = new LRUCache({ capacity: 3, onEvict });
      cache.set('k1', 'v1');
      expect(cache.delete('non_existent')).toBe(false);
      expect(cache.delete('k1')).toBe(true);
      expect(cache.get('k1')).toBeUndefined();
      expect(cache.size).toBe(0);
      expect(onEvict).toHaveBeenCalledWith('k1', 'v1', 'manual');
    });

    it('deletes keys without onEvict callback gracefully', () => {
      const cache = new LRUCache({ capacity: 3 });
      cache.set('k1', 'v1');
      expect(cache.delete('k1')).toBe(true);
      expect(cache.size).toBe(0);
    });

    it('clears all items and resets stats', () => {
      const cache = new LRUCache({ capacity: 3 });
      cache.set('a', 1);
      cache.set('b', 2);
      cache.get('a'); // hit
      cache.get('c'); // miss
      expect(cache.size).toBe(2);
      cache.clear();
      expect(cache.size).toBe(0);
      expect(cache.stats()).toEqual({
        size: 0,
        capacity: 3,
        hits: 0,
        misses: 0,
        evictions: 0,
        hitRatio: 0,
      });
    });
  });

  describe('LRU eviction policy and ordering', () => {
    it('evicts the least recently used element when capacity is exceeded', () => {
      const onEvict = jest.fn();
      const cache = new LRUCache({ capacity: 3, onEvict });
      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);

      // Access 'a' so 'b' becomes the LRU item
      cache.get('a');

      // Add 'd' -> 'b' should be evicted
      cache.set('d', 4);

      expect(cache.get('b')).toBeUndefined();
      expect(cache.get('a')).toBe(1);
      expect(cache.get('c')).toBe(3);
      expect(cache.get('d')).toBe(4);
      expect(onEvict).toHaveBeenCalledWith('b', 2, 'capacity');
      expect(cache.stats().evictions).toBe(1);
    });

    it('evicts correctly without onEvict hook', () => {
      const cache = new LRUCache({ capacity: 2 });
      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);
      expect(cache.get('a')).toBeUndefined();
      expect(cache.get('b')).toBe(2);
      expect(cache.get('c')).toBe(3);
    });

    it('returns keys, values, and entries in MRU to LRU order', () => {
      const cache = new LRUCache({ capacity: 4 });
      cache.set('x', 10);
      cache.set('y', 20);
      cache.set('z', 30);
      // Access y to bring it to MRU
      cache.get('y');

      expect(cache.keys()).toEqual(['y', 'z', 'x']);
      expect(cache.values()).toEqual([20, 30, 10]);
      expect(cache.entries()).toEqual([
        ['y', 20],
        ['z', 30],
        ['x', 10],
      ]);
    });

    it('peek() returns value without altering order or metrics', () => {
      const cache = new LRUCache({ capacity: 3 });
      cache.set('a', 1);
      cache.set('b', 2);

      const beforeStats = { ...cache.stats() };
      expect(cache.peek('a')).toBe(1);
      expect(cache.peek('missing')).toBeUndefined();
      expect(cache.stats()).toEqual(beforeStats);

      // 'b' is still MRU, 'a' is still LRU
      expect(cache.keys()).toEqual(['b', 'a']);
    });
  });

  describe('TTL and expiration', () => {
    it('uses defaultTtlMs when ttlMs parameter is omitted', () => {
      const cache = new LRUCache({ capacity: 5, defaultTtlMs: 250 });
      const now = Date.now();
      jest.spyOn(Date, 'now').mockReturnValue(now);

      cache.set('autoTtl', 'hello');
      expect(cache.get('autoTtl')).toBe('hello');

      Date.now.mockReturnValue(now + 300);
      expect(cache.get('autoTtl')).toBeUndefined();

      Date.now.mockRestore();
    });

    it('lazily expires items upon get()', () => {
      const onEvict = jest.fn();
      const cache = new LRUCache({ capacity: 5, onEvict });
      const now = Date.now();
      jest.spyOn(Date, 'now').mockReturnValue(now);

      cache.set('temp', 'secret', 100);
      expect(cache.get('temp')).toBe('secret');

      // Fast-forward time past TTL
      Date.now.mockReturnValue(now + 150);
      expect(cache.has('temp')).toBe(false);
      expect(cache.peek('temp')).toBeUndefined();
      expect(cache.get('temp')).toBeUndefined();
      expect(onEvict).toHaveBeenCalledWith('temp', 'secret', 'expired');

      Date.now.mockRestore();
    });

    it('lazily expires items upon get() without onEvict hook', () => {
      const cache = new LRUCache({ capacity: 5 });
      const now = Date.now();
      jest.spyOn(Date, 'now').mockReturnValue(now);

      cache.set('temp', 'secret', 100);
      Date.now.mockReturnValue(now + 150);
      expect(cache.get('temp')).toBeUndefined();

      Date.now.mockRestore();
    });

    it('prunes expired items with pruneExpired() with and without callback', () => {
      const onEvict = jest.fn();
      const cache = new LRUCache({ capacity: 5, onEvict });
      const now = Date.now();
      jest.spyOn(Date, 'now').mockReturnValue(now);

      cache.set('persist', 1, 0); // No expiry
      cache.set('exp1', 2, 50);
      cache.set('exp2', 3, 80);

      Date.now.mockReturnValue(now + 60); // exp1 expired, exp2 still valid
      const pruned = cache.pruneExpired();
      expect(pruned).toBe(1);
      expect(cache.has('exp1')).toBe(false);
      expect(cache.has('exp2')).toBe(true);
      expect(cache.has('persist')).toBe(true);

      Date.now.mockRestore();
    });

    it('filters expired items from keys(), values(), entries()', () => {
      const cache = new LRUCache({ capacity: 5 });
      const now = Date.now();
      jest.spyOn(Date, 'now').mockReturnValue(now);

      cache.set('a', 1, 50);
      cache.set('b', 2, 200);

      Date.now.mockReturnValue(now + 100);
      expect(cache.keys()).toEqual(['b']);
      expect(cache.values()).toEqual([2]);
      expect(cache.entries()).toEqual([['b', 2]]);

      Date.now.mockRestore();
    });
  });

  describe('DoublyLinkedNode unit edge cases', () => {
    it('correctly reports expiration status', () => {
      const node = new DoublyLinkedNode('k', 'v', 1000);
      expect(node.isExpired(500)).toBe(false);
      expect(node.isExpired(1000)).toBe(true);
      expect(node.isExpired(1500)).toBe(true);

      const eternal = new DoublyLinkedNode('k', 'v', null);
      expect(eternal.isExpired(999999999)).toBe(false);
    });
  });
});
