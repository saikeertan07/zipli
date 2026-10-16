/**
 * @file heap.test.js
 * @description Unit tests for pure Binary MinHeap in heap.js
 */

const { MinHeap } = require('../../src/algo/heap');

describe('heap.js pure MinHeap', () => {
  it('initializes with empty heap and zero size', () => {
    const heap = new MinHeap();
    expect(heap.isEmpty()).toBe(true);
    expect(heap.size()).toBe(0);
    expect(heap.peek()).toBeNull();
    expect(heap.pop()).toBeNull();
  });

  it('maintains min-heap property on arbitrary insertions and extractions', () => {
    const heap = new MinHeap((a, b) => a - b);
    const nums = [42, 10, 8, 15, 3, 99, 1, 23, 7];

    nums.forEach((n) => heap.push(n));
    expect(heap.size()).toBe(nums.length);
    expect(heap.peek()).toBe(1);

    const sorted = [];
    while (!heap.isEmpty()) {
      sorted.push(heap.pop());
    }

    expect(sorted).toEqual([1, 3, 7, 8, 10, 15, 23, 42, 99]);
    expect(heap.isEmpty()).toBe(true);
  });

  it('works with custom object comparators and default priority comparator', () => {
    const heap = new MinHeap(); // uses a.priority - b.priority by default
    heap.push({ id: 'taskA', priority: 50 });
    heap.push({ id: 'taskB', priority: 10 });
    heap.push({ id: 'taskC', priority: 30 });

    expect(heap.peek().id).toBe('taskB');
    expect(heap.pop().id).toBe('taskB');
    expect(heap.pop().id).toBe('taskC');
    expect(heap.pop().id).toBe('taskA');
    expect(heap.pop()).toBeNull();
  });

  it('clears heap correctly', () => {
    const heap = new MinHeap();
    heap.push({ priority: 1 });
    heap.push({ priority: 2 });
    heap.clear();
    expect(heap.isEmpty()).toBe(true);
    expect(heap.size()).toBe(0);
  });
});
