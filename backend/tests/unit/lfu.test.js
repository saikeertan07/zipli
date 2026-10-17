const { LFUCache, LFUNode, DoublyLinkedList } = require('../../src/algo/lfu');

describe('Pure LFUCache (/algo/lfu.js)', () => {
  describe('constructor validation and defaults', () => {
    it('initializes with default settings', () => {
      const cache = new LFUCache();
      expect(cache.capacity).toBe(1000);
      expect(cache.size).toBe(0);
      expect(cache.defaultTtlMs).toBe(0);
      expect(cache.onEvict).toBeNull();
    });

    it('accepts custom configuration', () => {
      const onEvict = jest.fn();
      const cache = new LFUCache({ capacity: 10, defaultTtlMs: 5000, onEvict });
      expect(cache.capacity).toBe(10);
      expect(cache.defaultTtlMs).toBe(5000);
      expect(cache.onEvict).toBe(onEvict);
    });

    it('ignores onEvict if not a function', () => {
      const cache = new LFUCache({ capacity: 10, onEvict: 12345 });
      expect(cache.onEvict).toBeNull();
    });

    it('throws when capacity is not a positive integer', () => {
      expect(() => new LFUCache({ capacity: 0 })).toThrow(/capacity must be a positive integer/);
      expect(() => new LFUCache({ capacity: -5 })).toThrow(/capacity must be a positive integer/);
      expect(() => new LFUCache({ capacity: 'bad' })).toThrow(
        /capacity must be a positive integer/
      );
    });
  });

  describe('basic get, set, has, delete operations', () => {
    it('stores, retrieves, and updates frequency', () => {
      const cache = new LFUCache({ capacity: 3 });
      cache.set('a', 10);
      cache.set('b', 20);

      expect(cache.get('a')).toBe(10); // freq of a: 2
      expect(cache.get('b')).toBe(20); // freq of b: 2
      expect(cache.get('c')).toBeUndefined();
      expect(cache.has('a')).toBe(true);
      expect(cache.has('missing')).toBe(false);

      expect(cache.stats()).toMatchObject({
        hits: 2,
        misses: 1,
        size: 2,
        capacity: 3,
      });
    });

    it('updates existing key without changing overall size', () => {
      const cache = new LFUCache({ capacity: 2 });
      cache.set('k', 'v1');
      cache.set('k', 'v2');
      expect(cache.size).toBe(1);
      expect(cache.get('k')).toBe('v2');
    });

    it('deletes keys and invokes manual eviction hook', () => {
      const onEvict = jest.fn();
      const cache = new LFUCache({ capacity: 3, onEvict });
      cache.set('x', 100);
      cache.set('y', 200);

      expect(cache.delete('non_existent')).toBe(false);
      expect(cache.delete('x')).toBe(true);
      expect(cache.get('x')).toBeUndefined();
      expect(cache.size).toBe(1);
      expect(onEvict).toHaveBeenCalledWith('x', 100, 'manual');
    });

    it('deletes keys without onEvict hook gracefully', () => {
      const cache = new LFUCache({ capacity: 3 });
      cache.set('x', 100);
      expect(cache.delete('x')).toBe(true);
      expect(cache.size).toBe(0);
    });

    it('recalculates minFreq when deleting the only item with minFreq in multi-item cache', () => {
      const cache = new LFUCache({ capacity: 5 });
      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);

      // Increase frequency of b and c to 3
      cache.get('b');
      cache.get('b');
      cache.get('c');
      cache.get('c');

      // 'a' has freq 1, 'b' has 3, 'c' has 3 -> minFreq = 1
      expect(cache.minFreq).toBe(1);

      // Delete 'a' -> minFreq should recompute to 3
      cache.delete('a');
      expect(cache.minFreq).toBe(3);
    });

    it('clears all items and resets minFreq & telemetry', () => {
      const cache = new LFUCache({ capacity: 2 });
      cache.set('a', 1);
      cache.get('a');
      cache.clear();

      expect(cache.size).toBe(0);
      expect(cache.minFreq).toBe(0);
      expect(cache.stats()).toEqual({
        size: 0,
        capacity: 2,
        hits: 0,
        misses: 0,
        evictions: 0,
        hitRatio: 0,
      });
    });
  });

  describe('LFU eviction and frequency-based tie-breaking', () => {
    it('evicts the least frequently used item', () => {
      const onEvict = jest.fn();
      const cache = new LFUCache({ capacity: 3, onEvict });

      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);

      // Access 'a' three times (freq = 4)
      cache.get('a');
      cache.get('a');
      cache.get('a');

      // Access 'b' once (freq = 2)
      cache.get('b');

      // 'c' has freq = 1 (least frequently used)
      // Inserting 'd' should evict 'c'
      cache.set('d', 4);

      expect(cache.get('c')).toBeUndefined();
      expect(cache.get('a')).toBe(1);
      expect(cache.get('b')).toBe(2);
      expect(cache.get('d')).toBe(4);
      expect(onEvict).toHaveBeenCalledWith('c', 3, 'capacity');
      expect(cache.stats().evictions).toBe(1);
    });

    it('evicts without onEvict hook gracefully', () => {
      const cache = new LFUCache({ capacity: 2 });
      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3); // evicts 'a'
      expect(cache.get('a')).toBeUndefined();
      expect(cache.get('b')).toBe(2);
      expect(cache.get('c')).toBe(3);
    });

    it('breaks ties using LRU policy among items with the same frequency', () => {
      const onEvict = jest.fn();
      const cache = new LFUCache({ capacity: 3, onEvict });

      // All items initially freq = 1
      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);

      // 'a' is the oldest with freq 1 (LRU of freq 1 bucket)
      // Inserting 'd' should evict 'a'
      cache.set('d', 4);

      expect(cache.get('a')).toBeUndefined();
      expect(cache.get('b')).toBe(2);
      expect(cache.get('c')).toBe(3);
      expect(cache.get('d')).toBe(4);
      expect(onEvict).toHaveBeenCalledWith('a', 1, 'capacity');
    });

    it('peek() retrieves value without altering frequency or stats', () => {
      const cache = new LFUCache({ capacity: 2 });
      cache.set('x', 'val');
      const statsBefore = { ...cache.stats() };

      expect(cache.peek('x')).toBe('val');
      expect(cache.peek('y')).toBeUndefined();
      expect(cache.stats()).toEqual(statsBefore);
    });

    it('handles keys(), values(), and entries() correctly', () => {
      const cache = new LFUCache({ capacity: 3 });
      cache.set('k1', 'v1');
      cache.set('k2', 'v2');

      expect(cache.keys()).toEqual(['k1', 'k2']);
      expect(cache.values()).toEqual(['v1', 'v2']);
      expect(cache.entries()).toEqual([
        ['k1', 'v1'],
        ['k2', 'v2'],
      ]);
    });
  });

  describe('TTL and expiration', () => {
    it('uses defaultTtlMs when ttlMs parameter is omitted', () => {
      const cache = new LFUCache({ capacity: 5, defaultTtlMs: 250 });
      const now = Date.now();
      jest.spyOn(Date, 'now').mockReturnValue(now);

      cache.set('autoTtl', 'hello');
      expect(cache.get('autoTtl')).toBe('hello');

      Date.now.mockReturnValue(now + 300);
      expect(cache.get('autoTtl')).toBeUndefined();

      Date.now.mockRestore();
    });

    it('expires items lazily on get() and has()', () => {
      const onEvict = jest.fn();
      const cache = new LFUCache({ capacity: 5, onEvict });
      const now = Date.now();
      jest.spyOn(Date, 'now').mockReturnValue(now);

      cache.set('temp', 123, 100);
      expect(cache.get('temp')).toBe(123);

      Date.now.mockReturnValue(now + 150);
      expect(cache.has('temp')).toBe(false);
      expect(cache.peek('temp')).toBeUndefined();
      expect(cache.get('temp')).toBeUndefined();
      expect(onEvict).toHaveBeenCalledWith('temp', 123, 'expired');

      Date.now.mockRestore();
    });

    it('expires items lazily on get() without onEvict hook', () => {
      const cache = new LFUCache({ capacity: 5 });
      const now = Date.now();
      jest.spyOn(Date, 'now').mockReturnValue(now);

      cache.set('temp', 123, 100);
      Date.now.mockReturnValue(now + 150);
      expect(cache.get('temp')).toBeUndefined();

      Date.now.mockRestore();
    });

    it('prunes expired entries with pruneExpired() with and without onEvict', () => {
      const onEvict = jest.fn();
      const cache = new LFUCache({ capacity: 5, onEvict });
      const now = Date.now();
      jest.spyOn(Date, 'now').mockReturnValue(now);

      cache.set('alive', 'ok', 0);
      cache.set('e1', 'bye', 50);

      Date.now.mockReturnValue(now + 60);
      const pruned = cache.pruneExpired();
      expect(pruned).toBe(1);
      expect(cache.has('e1')).toBe(false);
      expect(cache.has('alive')).toBe(true);
      expect(onEvict).toHaveBeenCalledWith('e1', 'bye', 'expired');

      // Now test without onEvict
      const cacheNoHook = new LFUCache({ capacity: 5 });
      cacheNoHook.set('expNoHook', 'gone', 10);
      Date.now.mockReturnValue(now + 100);
      expect(cacheNoHook.pruneExpired()).toBe(1);

      Date.now.mockRestore();
    });

    it('updates a node whose frequency is higher than minFreq', () => {
      const cache = new LFUCache({ capacity: 5 });
      cache.set('minNode', 1); // freq 1
      cache.set('highNode', 2); // freq 1
      cache.get('highNode'); // freq 2
      cache.get('highNode'); // freq 3

      // minFreq is 1
      expect(cache.minFreq).toBe(1);

      // Updating highNode (freq 3 -> 4) should not change minFreq (which is 1)
      cache.get('highNode');
      expect(cache.minFreq).toBe(1);
    });

    it('omits expired items in keys(), values(), and entries()', () => {
      const cache = new LFUCache({ capacity: 5 });
      const now = Date.now();
      jest.spyOn(Date, 'now').mockReturnValue(now);

      cache.set('valid', 10, 500);
      cache.set('dead', 20, 50);

      Date.now.mockReturnValue(now + 100);
      expect(cache.keys()).toEqual(['valid']);
      expect(cache.values()).toEqual([10]);
      expect(cache.entries()).toEqual([['valid', 10]]);

      Date.now.mockRestore();
    });
  });

  describe('Internal DoublyLinkedList edge cases', () => {
    it('returns null when removeTail on empty list', () => {
      const list = new DoublyLinkedList();
      expect(list.removeTail()).toBeNull();
      expect(list.isEmpty()).toBe(true);
    });

    it('correctly tracks node expiration', () => {
      const node = new LFUNode('k', 'v', 1, 1000);
      expect(node.isExpired(500)).toBe(false);
      expect(node.isExpired(1000)).toBe(true);
      expect(node.isExpired(1500)).toBe(true);

      const eternal = new LFUNode('k', 'v', 1, null);
      expect(eternal.isExpired(999999999)).toBe(false);
    });
  });
});
