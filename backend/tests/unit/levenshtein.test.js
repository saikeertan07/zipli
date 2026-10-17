const { editDistance, isFuzzyMatch, findClosestTerms } = require('../../src/algo/levenshtein');

describe('Pure Levenshtein Distance & Fuzzy Matcher (/algo/levenshtein.js)', () => {
  describe('editDistance', () => {
    it('returns 0 for identical strings', () => {
      expect(editDistance('apple', 'apple')).toBe(0);
      expect(editDistance('', '')).toBe(0);
    });

    it('handles empty strings by returning the length of the other string', () => {
      expect(editDistance('', 'milk')).toBe(4);
      expect(editDistance('bread', '')).toBe(5);
    });

    it('calculates single insertion, deletion, and substitution', () => {
      expect(editDistance('cat', 'cats')).toBe(1); // insertion
      expect(editDistance('cats', 'cat')).toBe(1); // deletion
      expect(editDistance('cat', 'car')).toBe(1); // substitution
    });

    it('supports Damerau transposition of adjacent characters with cost 1', () => {
      // 'teh' -> 'the' is 1 transposition
      expect(editDistance('teh', 'the')).toBe(1);
      // 'mllk' -> 'milk' (sub) vs 'mlik' -> 'milk' (transposition of li)
      expect(editDistance('mlik', 'milk')).toBe(1);
    });

    it('calculates distance for typical grocery typos', () => {
      expect(editDistance('avcado', 'avocado')).toBe(1);
      expect(editDistance('bannana', 'banana')).toBe(1);
      expect(editDistance('tomatto', 'tomato')).toBe(1);
      expect(editDistance('strawbery', 'strawberry')).toBe(1);
    });

    it('is case-insensitive', () => {
      expect(editDistance('Milk', 'milk')).toBe(0);
      expect(editDistance('AvOcAdO', 'avocado')).toBe(0);
    });
  });

  describe('isFuzzyMatch', () => {
    it('returns isMatch: true when edit distance is within threshold', () => {
      const match = isFuzzyMatch('avcado', 'avocado', 2);
      expect(match.isMatch).toBe(true);
      expect(match.distance).toBe(1);
    });

    it('returns isMatch: false when edit distance exceeds threshold', () => {
      const match = isFuzzyMatch('apple', 'banana', 2);
      expect(match.isMatch).toBe(false);
      expect(match.distance).toBeGreaterThan(2);
    });

    it('exits early when length difference exceeds maxDistance', () => {
      const match = isFuzzyMatch('a', 'avocado', 2);
      expect(match.isMatch).toBe(false);
      expect(match.distance).toBe(6);
    });

    it('handles null or empty inputs safely', () => {
      expect(isFuzzyMatch(null, 'test').isMatch).toBe(false);
      expect(isFuzzyMatch('test', null).isMatch).toBe(false);
    });
  });

  describe('findClosestTerms', () => {
    it('finds and sorts closest terms from candidate pool by edit distance', () => {
      const candidates = ['avocado', 'apple', 'apricot', 'banana', 'almond'];
      const matches = findClosestTerms('avcado', candidates, 2);

      expect(matches.length).toBeGreaterThan(0);
      expect(matches[0].term).toBe('avocado');
      expect(matches[0].distance).toBe(1);
    });

    it('limits the number of returned results', () => {
      const candidates = ['milk', 'silk', 'mill', 'mink', 'mock'];
      const matches = findClosestTerms('milk', candidates, 1, 2);

      expect(matches.length).toBe(2);
      expect(matches[0].term).toBe('milk');
      expect(matches[0].distance).toBe(0);
    });

    it('handles null, undefined, and empty inputs gracefully', () => {
      expect(findClosestTerms(null, ['apple'])).toEqual([]);
      expect(findClosestTerms('apple', null)).toEqual([]);
      expect(findClosestTerms('apple', [''])).toEqual([]);
    });
  });
});
