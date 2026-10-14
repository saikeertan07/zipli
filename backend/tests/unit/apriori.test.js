const { apriori, getItemFrequencies, serializeItemset } = require('../../src/algo/apriori');

describe('Pure Apriori Algorithm (/algo/apriori.js)', () => {
  const transactions = [
    ['milk', 'bread', 'butter'],
    ['bread', 'butter'],
    ['milk', 'bread', 'butter', 'eggs'],
    ['milk', 'eggs'],
    ['bread', 'eggs'],
    ['milk', 'bread', 'butter'],
  ];

  it('mines frequent itemsets with support meeting threshold', () => {
    const { frequentItemsets } = apriori(transactions, {
      minSupport: 0.3,
      minConfidence: 0.5,
      maxItemsetSize: 3,
    });

    expect(frequentItemsets.length).toBeGreaterThan(0);

    // Verify support calculation
    const breadItemset = frequentItemsets.find(
      (fi) => fi.items.length === 1 && fi.items[0] === 'bread'
    );
    expect(breadItemset).toBeDefined();
    // Bread appears in 5 of 6 transactions: 5/6 = 0.8333
    expect(breadItemset.count).toBe(5);
    expect(breadItemset.support).toBeCloseTo(5 / 6, 4);

    // Bread + Butter appears in 4 of 6 transactions: 4/6 = 0.6667
    const breadButter = frequentItemsets.find(
      (fi) => fi.items.length === 2 && fi.items.includes('bread') && fi.items.includes('butter')
    );
    expect(breadButter).toBeDefined();
    expect(breadButter.count).toBe(4);
    expect(breadButter.support).toBeCloseTo(4 / 6, 4);
  });

  it('generates association rules with accurate confidence and lift', () => {
    const { rules } = apriori(transactions, {
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

  it('handles empty transactions, nulls, and non-array rows safely', () => {
    expect(apriori([])).toEqual({ frequentItemsets: [], rules: [] });
    expect(apriori(null)).toEqual({ frequentItemsets: [], rules: [] });
    expect(apriori([null, undefined, 'not an array'])).toEqual({ frequentItemsets: [], rules: [] });

    // Item frequencies helper
    const freqs = getItemFrequencies([['apple', 'banana'], null, ['apple']]);
    expect(freqs.get('apple')).toBe(2);
    expect(freqs.get('banana')).toBe(1);

    // Serializer helper
    expect(serializeItemset(['z', 'a', 'm'])).toBe('a,m,z');
  });

  it('respects maxItemsetSize parameter', () => {
    const { frequentItemsets } = apriori(transactions, {
      minSupport: 0.2,
      maxItemsetSize: 2,
    });

    for (const itemset of frequentItemsets) {
      expect(itemset.items.length).toBeLessThanOrEqual(2);
    }
  });

  it('handles duplicate items in transactions and single-item catalogs without error', () => {
    const txsWithDups = [
      ['apple', 'apple', 'banana'],
      ['banana', 'orange'],
      ['apple', 'banana', 'orange'],
    ];
    const freqs = getItemFrequencies(txsWithDups);
    expect(freqs.get('apple')).toBe(2);

    // Only 1 item passes minSupport -> candidates array is empty for k=2
    const resSingle = apriori([['apple'], ['apple'], ['banana']], { minSupport: 0.5 });
    expect(resSingle.frequentItemsets.length).toBe(1);
    expect(resSingle.rules.length).toBe(0);

    // Rule sorting with identical lift but different confidence
    const customTxs = [
      ['itemA', 'itemB'],
      ['itemA', 'itemB'],
      ['itemA', 'itemC'],
    ];
    const resRules = apriori(customTxs, { minSupport: 0.3, minConfidence: 0.1 });
    expect(resRules.rules.length).toBeGreaterThan(0);
  });
});
