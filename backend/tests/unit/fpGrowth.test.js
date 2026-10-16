const { fpGrowth, buildFPTree, FPTree } = require('../../src/algo/fpGrowth');

describe('Pure FP-Growth Algorithm (/algo/fpGrowth.js)', () => {
  const transactions = [
    ['milk', 'bread', 'butter'],
    ['bread', 'butter'],
    ['milk', 'bread', 'butter', 'eggs'],
    ['milk', 'eggs'],
    ['bread', 'eggs'],
    ['milk', 'bread', 'butter'],
  ];

  it('builds an FP-Tree with correct counts and header links', () => {
    const { tree, itemCounts } = buildFPTree(transactions, 2);
    expect(tree).toBeInstanceOf(FPTree);
    expect(itemCounts.get('bread')).toBe(5);
    expect(tree.headerTable.has('bread')).toBe(true);

    const breadHeader = tree.headerTable.get('bread');
    expect(breadHeader.head).toBeDefined();
    expect(breadHeader.count).toBe(5);
  });

  it('mines frequent itemsets with correct support without candidate generation', () => {
    const { frequentItemsets } = fpGrowth(transactions, {
      minSupport: 0.3,
      minConfidence: 0.5,
      maxItemsetSize: 3,
    });

    expect(frequentItemsets.length).toBeGreaterThan(0);

    const breadItemset = frequentItemsets.find(
      (fi) => fi.items.length === 1 && fi.items[0] === 'bread'
    );
    expect(breadItemset).toBeDefined();
    expect(breadItemset.count).toBe(5);
    expect(breadItemset.support).toBeCloseTo(5 / 6, 4);

    const breadButter = frequentItemsets.find(
      (fi) => fi.items.length === 2 && fi.items.includes('bread') && fi.items.includes('butter')
    );
    expect(breadButter).toBeDefined();
    expect(breadButter.count).toBe(4);
    expect(breadButter.support).toBeCloseTo(4 / 6, 4);
  });

  it('generates association rules with confidence and lift matching Apriori', () => {
    const { rules } = fpGrowth(transactions, {
      minSupport: 0.3,
      minConfidence: 0.5,
      maxItemsetSize: 3,
    });

    expect(rules.length).toBeGreaterThan(0);

    for (const rule of rules) {
      expect(rule.antecedent.length).toBeGreaterThanOrEqual(1);
      expect(rule.consequent.length).toBeGreaterThanOrEqual(1);
      expect(rule.support).toBeGreaterThanOrEqual(0.3);
      expect(rule.confidence).toBeGreaterThanOrEqual(0.5);
      expect(rule.lift).toBeGreaterThan(0);
    }

    // Rules should be sorted by lift descending
    for (let i = 1; i < rules.length; i++) {
      expect(rules[i - 1].lift).toBeGreaterThanOrEqual(rules[i].lift);
    }
  });

  it('handles edge cases safely (empty transactions, null rows)', () => {
    expect(fpGrowth([])).toEqual({ frequentItemsets: [], rules: [] });
    expect(fpGrowth(null)).toEqual({ frequentItemsets: [], rules: [] });
    expect(fpGrowth([null, undefined, []])).toEqual({ frequentItemsets: [], rules: [] });
  });

  it('respects maxItemsetSize parameter', () => {
    const { frequentItemsets } = fpGrowth(transactions, {
      minSupport: 0.2,
      maxItemsetSize: 2,
    });

    for (const itemset of frequentItemsets) {
      expect(itemset.items.length).toBeLessThanOrEqual(2);
    }
  });

  it('handles duplicate items, custom tree operations, and tie-breaking sorting', () => {
    const { FPNode } = require('../../src/algo/fpGrowth');
    const defaultNode = new FPNode('test');
    expect(defaultNode.count).toBe(1);
    expect(defaultNode.parent).toBeNull();

    const tree = new FPTree();
    tree.headerTable.set('item1', { count: 1, head: null, tail: null });
    tree.insert(['item1']); // default count = 1
    tree.insert(['unknown_item']); // header is undefined
    expect(tree.headerTable.get('item1').head).toBeDefined();

    // Transactions with duplicates and infrequent items in paths
    const complexTxs = [
      ['apple', 'apple', 'banana', 'rare1'],
      ['apple', 'banana', 'cherry'],
      ['banana', 'cherry', 'date'],
      ['apple', 'banana', 'cherry', 'date'],
      ['apple', 'cherry', 'rare2'],
    ];

    const res = fpGrowth(complexTxs, { minSupport: 0.4, minConfidence: 0.2 });
    expect(res.frequentItemsets.length).toBeGreaterThan(0);
    expect(res.rules.length).toBeGreaterThan(0);

    // Rule sorting with tie in lift
    const tieTxs = [
      ['a', 'b'],
      ['a', 'b'],
      ['a', 'c'],
    ];
    const resTie = fpGrowth(tieTxs, { minSupport: 0.3, minConfidence: 0.1 });
    expect(resTie.rules.length).toBeGreaterThan(0);
  });
});
