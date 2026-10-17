const { InvertedIndex } = require('../../src/algo/invertedIndex');

describe('Pure Inverted Index Data Structure (/algo/invertedIndex.js)', () => {
  let index;

  beforeEach(() => {
    index = new InvertedIndex();
  });

  it('adds documents and updates postings and corpus statistics', () => {
    index.addDocument(1, ['fresh', 'milk'], { id: 1, name: 'Fresh Milk' });
    index.addDocument(2, ['organic', 'milk'], { id: 2, name: 'Organic Milk' });

    expect(index.totalDocuments).toBe(2);
    expect(index.getDocLength(1)).toBe(2);
    expect(index.getDocLength(2)).toBe(2);
    expect(index.getAvgDocLength()).toBe(2);

    expect(index.getDocFrequency('milk')).toBe(2);
    expect(index.getDocFrequency('fresh')).toBe(1);
    expect(index.getDocFrequency('organic')).toBe(1);

    const milkPostings = index.getPostings('milk');
    expect(milkPostings.get('1')).toEqual({ tf: 1 });
    expect(milkPostings.get('2')).toEqual({ tf: 1 });
  });

  it('updates document and correctly adjusts corpus length', () => {
    index.addDocument(1, ['milk'], { id: 1, name: 'Milk' });
    expect(index.totalDocLength).toBe(1);

    // Overwrite document 1 with longer text
    index.addDocument(1, ['fresh', 'organic', 'whole', 'milk'], { id: 1, name: 'Whole Milk' });
    expect(index.totalDocuments).toBe(1);
    expect(index.totalDocLength).toBe(4);
    expect(index.getDocLength(1)).toBe(4);
    expect(index.getDocFrequency('whole')).toBe(1);
  });

  it('removes documents and cleans up postings and totals', () => {
    index.addDocument(1, ['apple', 'juice']);
    index.addDocument(2, ['orange', 'juice']);

    expect(index.getDocFrequency('juice')).toBe(2);
    expect(index.getDocFrequency('apple')).toBe(1);

    const removed = index.removeDocument(1);
    expect(removed).toBe(true);
    expect(index.totalDocuments).toBe(1);
    expect(index.getDocFrequency('apple')).toBe(0);
    expect(index.getDocFrequency('juice')).toBe(1);
  });

  it('returns all unique terms indexed across all documents', () => {
    index.addDocument(1, ['banana', 'chips']);
    index.addDocument(2, ['potato', 'chips']);

    const terms = index.getAllTerms().sort();
    expect(terms).toEqual(['banana', 'chips', 'potato']);
  });

  it('retrieves stored document representation', () => {
    const raw = { id: 10, name: 'Avocado', price: 150 };
    index.addDocument(10, ['avocado'], raw);

    expect(index.getDocument(10)).toEqual(raw);
    expect(index.getDocument(999)).toBeNull();
  });

  it('handles empty, null, and non-existent queries safely', () => {
    expect(index.getPostings(null)).toEqual(new Map());
    expect(index.getDocFrequency('')).toBe(0);
    expect(index.getDocLength(999)).toBe(0);
    expect(index.removeDocument(999)).toBe(false);
    expect(index.removeDocument(null)).toBe(false);

    index.addDocument(null, ['test']);
    index.addDocument(3, null);
    expect(index.getDocLength(3)).toBe(0);
    expect(index.totalDocuments).toBe(1);
  });

  it('clears all internal data structures', () => {
    index.addDocument(1, ['test']);
    index.clear();

    expect(index.totalDocuments).toBe(0);
    expect(index.totalDocLength).toBe(0);
    expect(index.getAvgDocLength()).toBe(0);
    expect(index.getAllTerms()).toEqual([]);
  });
});
