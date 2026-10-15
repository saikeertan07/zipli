const {
  calculateIDF,
  scoreTerm,
  scoreDocument,
  DEFAULT_K1,
  DEFAULT_B,
} = require('../../src/algo/bm25');

describe('Pure Okapi BM25 Ranking Algorithm (/algo/bm25.js)', () => {
  describe('calculateIDF', () => {
    it('returns positive IDF for terms appearing in a subset of documents', () => {
      const idf = calculateIDF(100, 10);
      expect(idf).toBeGreaterThan(0);
      expect(idf).toBeCloseTo(Math.log(1 + 90.5 / 10.5), 4);
    });

    it('returns strictly non-negative score even when term appears in all documents', () => {
      const idf = calculateIDF(100, 100);
      expect(idf).toBeGreaterThanOrEqual(0);
    });

    it('handles zero documents or zero term frequency', () => {
      expect(calculateIDF(0, 5)).toBe(0);
      expect(calculateIDF(100, 0)).toBe(0);
    });
  });

  describe('scoreTerm', () => {
    it('calculates term score scaling with term frequency and IDF', () => {
      const idf = 2.0;
      const scoreTf1 = scoreTerm(1, 10, 10, idf);
      const scoreTf3 = scoreTerm(3, 10, 10, idf);

      expect(scoreTf3).toBeGreaterThan(scoreTf1);
    });

    it('demonstrates sub-linear term frequency saturation (diminishing returns)', () => {
      const idf = 1.0;
      const scoreTf1 = scoreTerm(1, 10, 10, idf);
      const scoreTf2 = scoreTerm(2, 10, 10, idf);
      const scoreTf100 = scoreTerm(100, 10, 10, idf);

      // Gain from 1 -> 2 is much higher than gain from 99 -> 100
      const gain1to2 = scoreTf2 - scoreTf1;
      const gainFromHugeTf = scoreTf100 - scoreTf2;
      expect(gain1to2).toBeGreaterThan(0);
      expect(gainFromHugeTf).toBeLessThan(gain1to2 * 10);
    });

    it('penalizes longer documents for the same term frequency (b parameter effect)', () => {
      const idf = 1.5;
      const shortDocScore = scoreTerm(2, 5, 10, idf);
      const longDocScore = scoreTerm(2, 20, 10, idf);

      // Short document is more focused -> higher relevance score
      expect(shortDocScore).toBeGreaterThan(longDocScore);
    });

    it('returns 0 when tf or idf is 0', () => {
      expect(scoreTerm(0, 10, 10, 2)).toBe(0);
      expect(scoreTerm(2, 10, 10, 0)).toBe(0);
    });
  });

  describe('scoreDocument', () => {
    it('scores a document by summing the BM25 scores of matching query terms', () => {
      const queryTerms = ['fresh', 'milk'];
      const docTf = new Map([
        ['fresh', 2],
        ['milk', 1],
      ]);
      const corpusDf = new Map([
        ['fresh', 10],
        ['milk', 5],
      ]);

      const score = scoreDocument(queryTerms, docTf, 5, 8, 50, corpusDf);
      expect(score).toBeGreaterThan(0);
    });

    it('works with plain JS objects as frequency maps', () => {
      const queryTerms = ['organic'];
      const docTf = { organic: 1 };
      const corpusDf = { organic: 20 };

      const score = scoreDocument(queryTerms, docTf, 5, 5, 100, corpusDf);
      expect(score).toBeGreaterThan(0);
    });

    it('returns 0 when query terms do not match document', () => {
      const queryTerms = ['bread'];
      const docTf = new Map([['milk', 1]]);
      const corpusDf = new Map([['bread', 10]]);

      const score = scoreDocument(queryTerms, docTf, 5, 5, 100, corpusDf);
      expect(score).toBe(0);
    });

    it('supports custom k1 and b parameters and handles non-positive doc lengths', () => {
      const customScore = scoreTerm(2, 5, 5, 1, { k1: 1.5, b: 0.8 });
      expect(customScore).toBeGreaterThan(0);

      const zeroDocLenScore = scoreTerm(2, 0, 0, 1);
      expect(zeroDocLenScore).toBeGreaterThan(0);
    });

    it('works with function as corpusDocFrequencies and handles null containers', () => {
      const queryTerms = ['fresh'];
      const docTf = { fresh: 2 };
      const score = scoreDocument(queryTerms, docTf, 5, 5, 100, (term) =>
        term === 'fresh' ? 10 : 0
      );
      expect(score).toBeGreaterThan(0);

      const funcDocTfScore = scoreDocument(
        ['fresh'],
        (term) => (term === 'fresh' ? 1 : 0),
        5,
        5,
        100,
        { fresh: 10 }
      );
      expect(funcDocTfScore).toBeGreaterThan(0);

      expect(scoreDocument(['fresh'], null, 5, 5, 100, null)).toBe(0);

      const missingScore = scoreDocument(['missing'], { present: 5 }, 5, 5, 10, { present: 2 });
      expect(missingScore).toBe(0);
    });

    it('returns 0 for empty query or empty corpus', () => {
      expect(scoreDocument([], {}, 5, 5, 100, {})).toBe(0);
      expect(scoreDocument(['milk'], {}, 5, 5, 0, {})).toBe(0);
    });

    it('exports DEFAULT_K1 and DEFAULT_B constants', () => {
      expect(DEFAULT_K1).toBe(1.2);
      expect(DEFAULT_B).toBe(0.75);
    });
  });
});
