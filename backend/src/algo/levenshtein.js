/**
 * @file levenshtein.js
 * @description Pure Dynamic Programming Levenshtein / Damerau-Levenshtein distance algorithm.
 * Supports insertions, deletions, substitutions, and adjacent transpositions.
 * Used for typo-tolerant fuzzy matching in Zipli Pro search engine.
 */

/**
 * Calculates the edit distance between two strings with support for adjacent transpositions.
 *
 * Operations allowed:
 * - Insertion (cost 1)
 * - Deletion (cost 1)
 * - Substitution (cost 1)
 * - Transposition of two adjacent characters (cost 1)
 *
 * Time Complexity: O(N * M) where N = a.length, M = b.length
 * Space Complexity: O(N * M) for full matrix
 *
 * @param {string} a - First string.
 * @param {string} b - Second string.
 * @returns {number} Minimum number of edit operations.
 */
function editDistance(a, b) {
  if (a === b) return 0;
  if (!a) return b ? b.length : 0;
  if (!b) return a.length;

  const s1 = a.toLowerCase();
  const s2 = b.toLowerCase();
  const n = s1.length;
  const m = s2.length;

  // Initialize (n + 1) x (m + 1) matrix
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));

  for (let i = 0; i <= n; i++) {
    dp[i][0] = i;
  }
  for (let j = 0; j <= m; j++) {
    dp[0][j] = j;
  }

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;

      dp[i][j] = Math.min(
        dp[i - 1][j] + 1, // deletion
        dp[i][j - 1] + 1, // insertion
        dp[i - 1][j - 1] + cost // substitution
      );

      // Check adjacent transposition (Damerau condition)
      if (i > 1 && j > 1 && s1[i - 1] === s2[j - 2] && s1[i - 2] === s2[j - 1]) {
        dp[i][j] = Math.min(dp[i][j], dp[i - 2][j - 2] + 1);
      }
    }
  }

  return dp[n][m];
}

/**
 * Checks whether two words are within an acceptable edit distance threshold.
 * Uses length-difference early exit optimization.
 *
 * @param {string} word1
 * @param {string} word2
 * @param {number} [maxDistance=2] - Maximum allowed edit distance.
 * @returns {{ isMatch: boolean, distance: number }}
 */
function isFuzzyMatch(word1, word2, maxDistance = 2) {
  if (!word1 || !word2) {
    return { isMatch: false, distance: Infinity };
  }

  const lenDiff = Math.abs(word1.length - word2.length);
  if (lenDiff > maxDistance) {
    return { isMatch: false, distance: lenDiff };
  }

  const dist = editDistance(word1, word2);
  return {
    isMatch: dist <= maxDistance,
    distance: dist,
  };
}

/**
 * Finds all candidate terms within a maximum edit distance from a given term.
 * Results are sorted primarily by edit distance (ascending) and secondarily by candidate length.
 *
 * @param {string} term - The search term.
 * @param {Iterable<string>} candidates - Pool of candidate terms to match against.
 * @param {number} [maxDistance=2] - Maximum edit distance.
 * @param {number} [limit=5] - Maximum number of matches to return.
 * @returns {Array<{ term: string, distance: number }>}
 */
function findClosestTerms(term, candidates, maxDistance = 2, limit = 5) {
  if (!term || !candidates) return [];

  const lower = term.toLowerCase();
  const matches = [];

  for (const candidate of candidates) {
    if (!candidate) continue;
    const { isMatch, distance } = isFuzzyMatch(lower, candidate, maxDistance);
    if (isMatch) {
      matches.push({ term: candidate, distance });
    }
  }

  matches.sort((a, b) => {
    if (a.distance !== b.distance) {
      return a.distance - b.distance;
    }
    return a.term.localeCompare(b.term);
  });

  return matches.slice(0, limit);
}

module.exports = {
  editDistance,
  isFuzzyMatch,
  findClosestTerms,
};
