const { editDistance } = require('../../src/algo/levenshtein');
const { scoreTerm, calculateIDF } = require('../../src/algo/bm25');
const { Trie } = require('../../src/algo/trie');
const { lightStem } = require('../../src/algo/tokenizer');

function randomString(length = 6) {
  const chars = 'abcdefghijklmnopqrstuvwxyz';
  let res = '';
  for (let i = 0; i < length; i++) {
    res += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return res;
}

describe('Mathematical Property-Style Tests (Phase 4.10)', () => {
  describe('Levenshtein Metric Space Axioms', () => {
    it('satisfies Identity of Indiscernibles: d(x, x) = 0', () => {
      for (let i = 0; i < 50; i++) {
        const s = randomString(Math.floor(Math.random() * 10) + 1);
        expect(editDistance(s, s)).toBe(0);
      }
    });

    it('satisfies Symmetry: d(x, y) = d(y, x)', () => {
      for (let i = 0; i < 50; i++) {
        const s1 = randomString(Math.floor(Math.random() * 8) + 1);
        const s2 = randomString(Math.floor(Math.random() * 8) + 1);
        expect(editDistance(s1, s2)).toBe(editDistance(s2, s1));
      }
    });

    it('satisfies Triangle Inequality: d(x, z) <= d(x, y) + d(y, z)', () => {
      for (let i = 0; i < 50; i++) {
        const x = randomString(Math.floor(Math.random() * 6) + 1);
        const y = randomString(Math.floor(Math.random() * 6) + 1);
        const z = randomString(Math.floor(Math.random() * 6) + 1);

        const dXZ = editDistance(x, z);
        const dXY = editDistance(x, y);
        const dYZ = editDistance(y, z);

        expect(dXZ).toBeLessThanOrEqual(dXY + dYZ);
      }
    });
  });

  describe('BM25 Monotonicity', () => {
    it('guarantees score increases monotonically with term frequency', () => {
      const idf = calculateIDF(100, 10);
      const docLen = 20;
      const avgDocLen = 20;

      let previousScore = -1;
      for (let tf = 1; tf <= 15; tf++) {
        const score = scoreTerm(tf, docLen, avgDocLen, idf);
        expect(score).toBeGreaterThan(previousScore);
        previousScore = score;
      }
    });

    it('guarantees longer document length decreases score for same term frequency', () => {
      const idf = calculateIDF(100, 10);
      const tf = 3;
      const avgDocLen = 20;

      let previousScore = Infinity;
      for (let docLen = 10; docLen <= 50; docLen += 5) {
        const score = scoreTerm(tf, docLen, avgDocLen, idf);
        expect(score).toBeLessThan(previousScore);
        previousScore = score;
      }
    });
  });

  describe('Trie Deletion Integrity', () => {
    it('maintains subtree structure and prefix searches after deletions', () => {
      const trie = new Trie();
      const words = ['apple', 'application', 'app', 'apply', 'banana', 'band'];

      for (const w of words) {
        trie.insert(w);
      }

      expect(trie.contains('app')).toBe(true);
      expect(trie.contains('apple')).toBe(true);
      expect(trie.contains('application')).toBe(true);

      // Delete 'apple'
      expect(trie.remove('apple')).toBe(true);
      expect(trie.contains('apple')).toBe(false);

      // Sibling and prefix words still exist
      expect(trie.contains('app')).toBe(true);
      expect(trie.contains('application')).toBe(true);
      expect(trie.contains('apply')).toBe(true);
      expect(trie.hasPrefix('app')).toBe(true);
      expect(trie.hasPrefix('ban')).toBe(true);
    });
  });

  describe('Porter-Lite Grocery Stemmer', () => {
    it('stems regular plurals and common grocery suffixes', () => {
      expect(lightStem('strawberries')).toBe('strawberry');
      expect(lightStem('blueberries')).toBe('blueberry');
      expect(lightStem('tomatoes')).toBe('tomato');
      expect(lightStem('potatoes')).toBe('potato');
      expect(lightStem('apples')).toBe('apple');
      expect(lightStem('bananas')).toBe('banana');
      expect(lightStem('leaves')).toBe('leaf');
      expect(lightStem('running')).toBe('run');
      expect(lightStem('baking')).toBe('bak');
      expect(lightStem('roasted')).toBe('roast');
      expect(lightStem('chilled')).toBe('chill');
    });

    it('preserves short words and words ending in double-s', () => {
      expect(lightStem('egg')).toBe('egg');
      expect(lightStem('tea')).toBe('tea');
      expect(lightStem('glass')).toBe('glass');
      expect(lightStem(null)).toBe('');
    });
  });
});
