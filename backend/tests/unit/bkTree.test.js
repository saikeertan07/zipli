const { BKTree } = require('../../src/algo/bkTree');

describe('Pure Burkhard-Keller Tree (/algo/bkTree.js)', () => {
  let tree;

  beforeEach(() => {
    tree = new BKTree();
  });

  it('inserts words and tracks tree size accurately', () => {
    expect(tree.size).toBe(0);
    expect(tree.insert('milk')).toBe(true);
    expect(tree.insert('silk')).toBe(true);
    expect(tree.insert('mile')).toBe(true);
    expect(tree.size).toBe(3);

    // Duplicate insertion returns false and does not change size
    expect(tree.insert('milk')).toBe(false);
    expect(tree.size).toBe(3);
  });

  it('handles invalid and empty inputs gracefully', () => {
    expect(tree.insert(null)).toBe(false);
    expect(tree.insert('')).toBe(false);
    expect(tree.insert('   ')).toBe(false);
    expect(tree.insert(123)).toBe(false);
    expect(tree.insertAll(null)).toBe(0);
    expect(tree.insertAll([null, ''])).toBe(0);
  });

  it('batch inserts words with insertAll', () => {
    const count = tree.insertAll(['apple', 'banana', 'orange', 'pear', 'apple']);
    expect(count).toBe(4);
    expect(tree.size).toBe(4);
  });

  it('searches for words within edit distance threshold', () => {
    tree.insertAll(['milk', 'silk', 'mile', 'mole', 'water', 'butter']);

    // Query "milkk" (distance 1 to "milk", distance 2 to "silk", "mile")
    const results = tree.search('milkk', 1);
    expect(results.length).toBe(1);
    expect(results[0].term).toBe('milk');
    expect(results[0].distance).toBe(1);

    const widerResults = tree.search('milkk', 2);
    const terms = widerResults.map((r) => r.term);
    expect(terms).toContain('milk');
    expect(terms).toContain('silk');
    expect(terms).toContain('mile');
    expect(terms).not.toContain('water');
  });

  it('respects search limit parameter and sorts by distance', () => {
    tree.insertAll(['cat', 'bat', 'hat', 'mat', 'fat', 'rate', 'date']);
    const results = tree.search('cat', 1, 3);
    expect(results.length).toBe(3);
    expect(results[0].term).toBe('cat');
    expect(results[0].distance).toBe(0);
  });

  it('handles search edge cases on empty tree or invalid query', () => {
    expect(tree.search('test', 2)).toEqual([]);

    tree.insert('hello');
    expect(tree.search('', 2)).toEqual([]);
    expect(tree.search('   ', 2)).toEqual([]);
    expect(tree.search(null, 2)).toEqual([]);
    expect(tree.search('hello', -1)).toEqual([]);
    expect(tree.search('hello', 0)).toEqual([{ term: 'hello', distance: 0 }]);
  });

  it('clears all tree nodes and resets size', () => {
    tree.insertAll(['milk', 'bread', 'cheese']);
    expect(tree.size).toBe(3);

    tree.clear();
    expect(tree.size).toBe(0);
    expect(tree.search('milk', 2)).toEqual([]);
  });
});
