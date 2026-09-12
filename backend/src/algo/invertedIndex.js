/**
 * @file invertedIndex.js
 * @description Pure Inverted Index data structure.
 * Maintains term-to-document postings lists, document lengths, and corpus statistics.
 */

class InvertedIndex {
  constructor() {
    // term -> Map<docId, { tf: number }>
    this.postings = new Map();
    // docId -> docLength (total token count)
    this.docLengths = new Map();
    // docId -> Map<term, tf>
    this.docTermFreqs = new Map();
    // docId -> original document object / payload
    this.documents = new Map();
    // Sum of all document lengths in the corpus
    this.totalDocLength = 0;
  }

  /**
   * Adds or replaces a document in the inverted index.
   *
   * @param {string|number} docId - Unique document identifier.
   * @param {string[]} tokens - Tokenized document terms.
   * @param {Object} [docPayload=null] - Original document representation.
   */
  addDocument(docId, tokens, docPayload = null) {
    if (docId === undefined || docId === null) return;
    const id = String(docId);

    // If document already exists, remove it first to preserve statistics
    if (this.docLengths.has(id)) {
      this.removeDocument(id);
    }

    const docLen = Array.isArray(tokens) ? tokens.length : 0;
    this.docLengths.set(id, docLen);
    this.totalDocLength += docLen;
    if (docPayload) {
      this.documents.set(id, docPayload);
    }

    // Compute term frequencies for this document
    const termFreqs = new Map();
    for (const token of tokens || []) {
      const count = termFreqs.get(token) || 0;
      termFreqs.set(token, count + 1);
    }
    this.docTermFreqs.set(id, termFreqs);

    // Update postings lists
    for (const [term, tf] of termFreqs.entries()) {
      let postingList = this.postings.get(term);
      if (!postingList) {
        postingList = new Map();
        this.postings.set(term, postingList);
      }
      postingList.set(id, { tf });
    }
  }

  /**
   * Removes a document from the inverted index and updates corpus statistics.
   *
   * @param {string|number} docId
   * @returns {boolean} True if document existed and was removed.
   */
  removeDocument(docId) {
    if (docId === undefined || docId === null) return false;
    const id = String(docId);

    if (!this.docLengths.has(id)) {
      return false;
    }

    const docLen = this.docLengths.get(id);
    this.totalDocLength -= docLen;
    this.docLengths.delete(id);
    this.documents.delete(id);

    const termFreqs = this.docTermFreqs.get(id);
    if (termFreqs) {
      for (const term of termFreqs.keys()) {
        const postingList = this.postings.get(term);
        if (postingList) {
          postingList.delete(id);
          if (postingList.size === 0) {
            this.postings.delete(term);
          }
        }
      }
      this.docTermFreqs.delete(id);
    }

    return true;
  }

  /**
   * Retrieves the postings map for a specific term.
   *
   * @param {string} term
   * @returns {Map<string, { tf: number }>} Map of docId -> { tf }
   */
  getPostings(term) {
    if (!term) return new Map();
    return this.postings.get(term.toLowerCase()) || new Map();
  }

  /**
   * Returns document frequency (df): number of documents containing the term.
   *
   * @param {string} term
   * @returns {number}
   */
  getDocFrequency(term) {
    if (!term) return 0;
    const list = this.postings.get(term.toLowerCase());
    return list ? list.size : 0;
  }

  /**
   * Returns length in tokens of a document.
   *
   * @param {string|number} docId
   * @returns {number}
   */
  getDocLength(docId) {
    return this.docLengths.get(String(docId)) || 0;
  }

  /**
   * Returns the average document length across the entire indexed corpus.
   *
   * @returns {number}
   */
  getAvgDocLength() {
    const count = this.docLengths.size;
    if (count === 0) return 0;
    return this.totalDocLength / count;
  }

  /**
   * Returns the original document payload.
   *
   * @param {string|number} docId
   * @returns {Object|null}
   */
  getDocument(docId) {
    return this.documents.get(String(docId)) || null;
  }

  /**
   * Returns all unique terms indexed in the postings lists.
   * Useful for autocomplete suggestion expansion and fuzzy spell checking.
   *
   * @returns {string[]}
   */
  getAllTerms() {
    return Array.from(this.postings.keys());
  }

  /**
   * Total number of documents indexed.
   *
   * @returns {number}
   */
  get totalDocuments() {
    return this.docLengths.size;
  }

  /**
   * Clears all inverted index state.
   */
  clear() {
    this.postings.clear();
    this.docLengths.clear();
    this.docTermFreqs.clear();
    this.documents.clear();
    this.totalDocLength = 0;
  }
}

module.exports = {
  InvertedIndex,
};
