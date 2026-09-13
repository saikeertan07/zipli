/**
 * @file rrf.js
 * @description Pure Reciprocal Rank Fusion (RRF) for Hybrid Multi-Modal Search (F-031).
 * Blends ranked retrieval lists from diverse scoring regimes (e.g., Dense Vector Embeddings,
 * BM25 Sparse Lexical Scores, and Fuzzy Edit Distance) without requiring score normalization.
 *
 * Mathematical Formula:
 *   RRF_Score(d) = \sum_{m \in M} \frac{w_m}{k + r_m(d)}
 * Where:
 *   - M is the set of retrieval models (rankings)
 *   - w_m is the model weight (default 1.0)
 *   - k is the ranking smoothing constant (standard default = 60)
 *   - r_m(d) is the 1-based rank position of document d in model m
 */

/**
 * Combines multiple ranked candidate lists into a unified, fused ranking.
 *
 * Time Complexity: O(M * N + D log D) where M is models count, N is candidates per model, D is unique docs.
 * Space Complexity: O(D) memory for unique document scores map.
 *
 * @param {Array<{ name?: string, weight?: number, items: Array<{ id: string|number, [key: string]: any }> }>} rankedLists
 * @param {Object} [options]
 * @param {number} [options.k=60] - RRF rank smoothing constant (Cormack et al. default 60)
 * @param {number} [options.limit=20] - Maximum fused results to return
 * @returns {Array<{ id: string|number, rrfScore: number, matchSources: string[], item: Object }>}
 */
function reciprocalRankFusion(rankedLists, options = {}) {
  if (!Array.isArray(rankedLists) || rankedLists.length === 0) {
    return [];
  }

  const k = typeof options.k === 'number' && options.k > 0 ? options.k : 60;
  const limit = typeof options.limit === 'number' && options.limit > 0 ? options.limit : 20;

  // Map of docId -> { id, rrfScore, matchSources: Set<string>, item: Object }
  const docScores = new Map();

  for (let listIdx = 0; listIdx < rankedLists.length; listIdx++) {
    const listObj = rankedLists[listIdx];
    if (!listObj || !Array.isArray(listObj.items)) continue;

    const sourceName = listObj.name || `source_${listIdx + 1}`;
    const weight = typeof listObj.weight === 'number' && listObj.weight > 0 ? listObj.weight : 1.0;

    for (let rank = 0; rank < listObj.items.length; rank++) {
      const candidate = listObj.items[rank];
      if (!candidate || candidate.id === undefined || candidate.id === null) continue;

      const docId = String(candidate.id);
      const rankContribution = weight / (k + (rank + 1));

      if (!docScores.has(docId)) {
        docScores.set(docId, {
          id: candidate.id,
          rrfScore: rankContribution,
          matchSources: new Set([sourceName]),
          item: candidate,
        });
      } else {
        const existing = docScores.get(docId);
        existing.rrfScore += rankContribution;
        existing.matchSources.add(sourceName);
        // Merge metadata if richer
        existing.item = { ...candidate, ...existing.item };
      }
    }
  }

  // Sort candidates by descending RRF score, breaking ties by docId
  const sorted = Array.from(docScores.values())
    .sort((a, b) => {
      if (b.rrfScore !== a.rrfScore) {
        return b.rrfScore - a.rrfScore;
      }
      return String(a.id).localeCompare(String(b.id));
    })
    .slice(0, limit);

  return sorted.map((res) => ({
    id: res.id,
    rrfScore: Number(res.rrfScore.toFixed(6)),
    matchSources: Array.from(res.matchSources),
    item: res.item,
  }));
}

module.exports = {
  reciprocalRankFusion,
};
