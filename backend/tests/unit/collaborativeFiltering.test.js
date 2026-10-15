const { ItemItemCF } = require('../../src/algo/collaborativeFiltering');

describe('Pure Item-Item Collaborative Filtering (/algo/collaborativeFiltering.js)', () => {
  let cf;

  // Interactions between users and products
  // User 1 buys: Milk (1), Bread (2), Butter (3)
  // User 2 buys: Milk (1), Bread (2)
  // User 3 buys: Bread (2), Butter (3), Eggs (4)
  // User 4 buys: Eggs (4), Bacon (5)
  const interactions = [
    { userId: 1, productId: 1 },
    { userId: 1, productId: 2 },
    { userId: 1, productId: 3 },
    { userId: 2, productId: 1 },
    { userId: 2, productId: 2 },
    { userId: 3, productId: 2 },
    { userId: 3, productId: 3 },
    { userId: 3, productId: 4 },
    { userId: 4, productId: 4 },
    { userId: 4, productId: 5 },
  ];

  beforeEach(() => {
    cf = new ItemItemCF();
    cf.fit(interactions);
  });

  it('computes cosine similarities between co-purchased items', () => {
    // Milk (1) was co-purchased with Bread (2) and Butter (3)
    const similarToMilk = cf.getSimilarItems(1);
    expect(similarToMilk.length).toBeGreaterThan(0);

    const neighborIds = similarToMilk.map((n) => n.itemId);
    expect(neighborIds).toContain('2'); // Bread
    expect(neighborIds).toContain('3'); // Butter

    for (const neighbor of similarToMilk) {
      expect(neighbor.similarity).toBeGreaterThan(0);
      expect(neighbor.similarity).toBeLessThanOrEqual(1.0);
    }
  });

  it('ranks similar items by cosine similarity descending', () => {
    const similar = cf.getSimilarItems(2, 5);
    for (let i = 1; i < similar.length; i++) {
      expect(similar[i - 1].similarity).toBeGreaterThanOrEqual(similar[i].similarity);
    }
  });

  it('generates personalized recommendations for a user', () => {
    // User 2 only bought Milk (1) and Bread (2). Should recommend Butter (3)
    const recs = cf.recommendForUser(2, 5);
    expect(recs.length).toBeGreaterThan(0);

    const recIds = recs.map((r) => r.itemId);
    expect(recIds).toContain('3'); // Butter
    expect(recIds).not.toContain('1'); // Excludes already bought
    expect(recIds).not.toContain('2');
  });

  it('honors excludeItemIds parameter (e.g. current cart items)', () => {
    const recs = cf.recommendForUser(2, 5, ['3']);
    const recIds = recs.map((r) => r.itemId);
    expect(recIds).not.toContain('3');

    // Test with null excludeItemIds
    const recsNoExclude = cf.recommendForUser(2, 5, null);
    expect(recsNoExclude.length).toBeGreaterThan(0);
  });

  it('supports custom interaction weights and minCoOccurrences threshold', () => {
    const customCF = new ItemItemCF({ minCoOccurrences: 2 });
    customCF.fit([
      { userId: 1, productId: 10, weight: 3 },
      { userId: 1, productId: 20, weight: 2 },
      { userId: 2, productId: 10, weight: 1 },
      { userId: 2, productId: 20, weight: 4 },
      { userId: 3, productId: 10, weight: 1 }, // Only 1 co-occurrence with 30
      { userId: 3, productId: 30, weight: 1 },
    ]);

    const similar = customCF.getSimilarItems(10);
    const itemIds = similar.map((s) => s.itemId);
    expect(itemIds).toContain('20'); // 2 co-occurrences
    expect(itemIds).not.toContain('30'); // Only 1 co-occurrence, pruned by minCoOccurrences=2
  });

  it('returns empty recommendations for cold-start user without history', () => {
    expect(cf.recommendForUser(99999)).toEqual([]);
  });

  it('handles invalid interactions and empty datasets safely', () => {
    const emptyCF = new ItemItemCF();
    emptyCF.fit(null);
    expect(emptyCF.getSimilarItems(1)).toEqual([]);
    expect(emptyCF.recommendForUser(1)).toEqual([]);

    emptyCF.fit([null, {}, { userId: undefined }]);
    expect(emptyCF.getSimilarItems(1)).toEqual([]);
  });

  it('clears internal structures completely', () => {
    cf.clear();
    expect(cf.getSimilarItems(1)).toEqual([]);
    expect(cf.recommendForUser(1)).toEqual([]);
  });

  it('supports buildMatrix alias and itemId records', () => {
    const aliasCF = new ItemItemCF();
    aliasCF.buildMatrix([
      { userId: 'u1', itemId: 'i1' },
      { userId: 'u1', itemId: 'i2' },
    ]);
    expect(aliasCF.getSimilarItems('i1').length).toBe(1);
    expect(aliasCF.getSimilarItems('i1')[0].itemId).toBe('i2');
  });
});
