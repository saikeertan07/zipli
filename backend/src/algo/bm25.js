/**
 * @file bm25.js
 * @description Pure Okapi BM25 ranking algorithm.
 * Evaluates document relevance scores using term frequencies, document lengths,
 * inverse document frequencies (IDF), and tunable saturation parameters.
 */

const DEFAULT_K1 = 1.2; // Term frequency saturation limit
const DEFAULT_B = 0.75; // Document length normalization penalizer

/**
 * Calculates Robertson-Spärck Jones Inverse Document Frequency (IDF) with Lucene non-negative smoothing.
 *
 * Formula: ln(1 + (N - n + 0.5) / (n + 0.5))
 * Guarantees IDF is strictly non-negative (>= 0) even for very frequent terms.
 *
 * @param {number} totalDocs - Total documents in corpus (N).
 * @param {number} docFreq - Number of documents containing the term (n).
 * @returns {number} Non-negative IDF score.
 */
function calculateIDF(totalDocs, docFreq) {
  if (totalDocs <= 0 || docFreq <= 0) return 0;
  const n = Math.min(docFreq, totalDocs);
  const numerator = totalDocs - n + 0.5;
  const denominator = n + 0.5;
  return Math.log(1 + numerator / denominator);
}

/**
 * Calculates the BM25 score component for a single term in a document.
 *
 * Formula:
 *   IDF * (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * (docLen / avgDocLen)))
 *
 * Time Complexity: O(1)
 *
 * @param {number} tf - Term frequency in the document.
 * @param {number} docLen - Length of the document in tokens.
 * @param {number} avgDocLen - Average document length across corpus.
 * @param {number} idf - Inverse document frequency of the term.
 * @param {Object} [params]
 * @param {number} [params.k1=1.2]
 * @param {number} [params.b=0.75]
 * @returns {number} BM25 term score.
 */
function scoreTerm(tf, docLen, avgDocLen, idf, params = {}) {
  if (tf <= 0 || idf <= 0) return 0;

  const k1 = params.k1 !== undefined ? params.k1 : DEFAULT_K1;
  const b = params.b !== undefined ? params.b : DEFAULT_B;

  const safeAvgDocLen = avgDocLen > 0 ? avgDocLen : 1;
  const safeDocLen = docLen > 0 ? docLen : 1;

  const lengthNorm = 1 - b + b * (safeDocLen / safeAvgDocLen);
  const tfComponent = (tf * (k1 + 1)) / (tf + k1 * lengthNorm);

  return idf * tfComponent;
}

/**
 * Computes complete BM25 score for a document against a query.
 *
 * @param {string[]} queryTerms - Tokenized search terms.
 * @param {Map<string, number>|Object} docTermFrequencies - Term frequencies in document.
 * @param {number} docLength - Length of the document.
 * @param {number} avgDocLength - Average document length of corpus.
 * @param {number} totalCorpusDocs - Total number of documents in corpus.
 * @param {Map<string, number>|Object} corpusDocFrequencies - Number of docs containing each term.
 * @param {Object} [options]
 * @param {number} [options.k1=1.2]
 * @param {number} [options.b=0.75]
 * @returns {number} Aggregate BM25 relevance score.
 */
function scoreDocument(
  queryTerms,
  docTermFrequencies,
  docLength,
  avgDocLength,
  totalCorpusDocs,
  corpusDocFrequencies,
  options = {}
) {
  if (!queryTerms || !queryTerms.length || totalCorpusDocs <= 0) {
    return 0;
  }

  function getFrequency(container, term) {
    if (!container) return 0;
    if (typeof container.get === 'function') {
      return container.get(term) || 0;
    }
    if (typeof container === 'function') {
      return container(term) || 0;
    }
    return container[term] || 0;
  }

  let totalScore = 0;

  for (const term of queryTerms) {
    const tf = getFrequency(docTermFrequencies, term);
    if (tf <= 0) continue;

    const df = getFrequency(corpusDocFrequencies, term);
    const idf = calculateIDF(totalCorpusDocs, df);
    const termScore = scoreTerm(tf, docLength, avgDocLength, idf, options);

    totalScore += termScore;
  }

  return totalScore;
}

module.exports = {
  DEFAULT_K1,
  DEFAULT_B,
  calculateIDF,
  scoreTerm,
  scoreDocument,
};
