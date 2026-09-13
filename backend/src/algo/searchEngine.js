/**
 * @file searchEngine.js
 * @description Pure in-memory Search Engine for Zipli Pro.
 * Combines Inverted Index, BM25 scoring, Trie prefix suggestions,
 * BK-Tree sub-linear typo-tolerance, Hindi/Hinglish transliteration,
 * and composite multi-signal ranking with facet calculations.
 * Zero external algorithmic dependencies.
 */

const { tokenize } = require('./tokenizer');
const { InvertedIndex } = require('./invertedIndex');
const { Trie } = require('./trie');
const { BKTree } = require('./bkTree');
const { scoreDocument } = require('./bm25');
const { expandTokensWithSynonyms } = require('./synonyms');

class Suggestion extends String {
  constructor(word, weight = 1, metadata = null) {
    super(word);
    this.word = word;
    this.weight = weight;
    this.metadata = metadata;
  }

  toJSON() {
    return this.word;
  }
}

class SearchEngine {
  constructor(options = {}) {
    this.index = new InvertedIndex();
    this.trie = new Trie();
    this.bkTree = new BKTree();
    this.options = {
      k1: 1.2,
      b: 0.75,
      fuzzyThreshold: 2,
      ...options,
    };

    // In-memory query analytics
    this.analytics = {
      recentQueries: [],
      queryCounts: new Map(),
      zeroResultQueries: new Map(),
    };
  }

  /**
   * Indexes a product into Inverted Index, Trie autocomplete, and BK-Tree.
   *
   * @param {Object} product - Product record.
   */
  indexProduct(product) {
    if (!product || product.id === undefined) return;

    const id = product.id;

    // Tokenize fields
    const nameTokens = tokenize(product.name || '');
    const catTokens = tokenize(product.category_id || product.cat || '');
    const badgeTokens = tokenize(product.badge || '');

    // Boost name terms by 3x relative frequency in the token stream
    const combinedTokens = [
      ...nameTokens,
      ...nameTokens,
      ...nameTokens,
      ...catTokens,
      ...badgeTokens,
    ];

    this.index.addDocument(id, combinedTokens, product);

    // Index terms into BK-Tree for sub-linear typo correction
    for (const token of combinedTokens) {
      this.bkTree.insert(token);
    }

    // Index whole product title into Trie for autocomplete
    const fullTitle = (product.name || '').trim().toLowerCase();
    if (fullTitle) {
      this.trie.insert(fullTitle, 10, { productId: id, categoryId: product.category_id });
      this.bkTree.insert(fullTitle);
    }

    // Index individual title words into Trie
    for (const token of nameTokens) {
      if (token.length >= 2) {
        this.trie.insert(token, 5, { productId: id });
      }
    }
  }

  /**
   * Bulk-indexes an array of products.
   *
   * @param {Array<Object>} products
   */
  indexProducts(products) {
    if (!Array.isArray(products)) return;
    for (const product of products) {
      this.indexProduct(product);
    }
  }

  /**
   * Removes a product from the search index.
   *
   * @param {number|string} productId
   */
  removeProduct(productId) {
    const doc = this.index.getDocument(productId);
    if (doc) {
      const fullTitle = (doc.name || '').trim().toLowerCase();
      if (fullTitle) {
        this.trie.remove(fullTitle);
      }
    }
    this.index.removeDocument(productId);
  }

  /**
   * Updates an existing indexed product.
   *
   * @param {Object} product
   */
  updateProduct(product) {
    if (!product || product.id === undefined) return;
    this.removeProduct(product.id);
    this.indexProduct(product);
  }

  /**
   * Searches the catalog using BM25 relevance ranking, typo-tolerance, and composite scoring.
   *
   * @param {string} queryStr - User's search text.
   * @param {Object} [options]
   * @param {string} [options.category] - Optional category filter.
   * @param {number} [options.limit=50]
   * @param {number} [options.offset=0]
   * @param {boolean} [options.fuzzy=true] - Enable fuzzy matching on typo.
   * @param {boolean} [options.explain=false] - Attach scoring explanation.
   * @returns {{
   *   results: Array<{ product: Object, score: number, explanation?: Object }>,
   *   total: number,
   *   correctedQuery: string|null,
   *   facets: Object
   * }}
   */
  search(queryStr, options = {}) {
    const { category, limit = 50, offset = 0, fuzzy = true, explain = false } = options;

    if (!queryStr || typeof queryStr !== 'string' || !queryStr.trim()) {
      const result = this._listAll(category, limit, offset);
      this._recordAnalytics(queryStr, result.total);
      return result;
    }

    let queryTokens = tokenize(queryStr);
    let correctedQuery = null;
    let typoPenalty = 1.0;

    if (!queryTokens.length) {
      queryTokens = tokenize(queryStr, { keepStopWords: true });
    }

    if (!queryTokens.length) {
      this._recordAnalytics(queryStr, 0);
      return { results: [], total: 0, correctedQuery: null, facets: this.computeFacets([]) };
    }

    // Expand tokens with Hindi / Hinglish vernacular equivalents
    const expandedTokens = expandTokensWithSynonyms(queryTokens);

    // 1. Find candidate document IDs that match any of the query tokens (or synonyms)
    let candidateDocIds = new Set();
    for (const term of expandedTokens) {
      const postings = this.index.getPostings(term);
      for (const docId of postings.keys()) {
        candidateDocIds.add(docId);
      }
    }

    // 2. Fuzzy Typo Fallback via BK-Tree if 0 candidates found and fuzzy is enabled
    if (candidateDocIds.size === 0 && fuzzy) {
      const correctedTokens = [];
      let foundCorrection = false;

      for (const token of queryTokens) {
        // Query BK-Tree for nearest terms within fuzzy threshold
        const matches = this.bkTree.search(token, this.options.fuzzyThreshold, 1);
        if (matches.length > 0) {
          correctedTokens.push(matches[0].term);
          foundCorrection = true;
          typoPenalty = Math.max(0.5, 1 - matches[0].distance * 0.15);
        } else {
          correctedTokens.push(token);
        }
      }

      if (foundCorrection) {
        correctedQuery = correctedTokens.join(' ');
        for (const term of correctedTokens) {
          const postings = this.index.getPostings(term);
          for (const docId of postings.keys()) {
            candidateDocIds.add(docId);
          }
        }
        queryTokens = correctedTokens;
      }
    }

    if (candidateDocIds.size === 0) {
      this._recordAnalytics(queryStr, 0);
      return {
        results: [],
        total: 0,
        correctedQuery,
        facets: this.computeFacets([]),
      };
    }

    // 3. Multi-Signal Scoring:
    // score = 0.6 * BM25 + 0.2 * popularity + 0.1 * inStock + 0.1 * discountBoost
    const totalDocs = this.index.totalDocuments;
    const avgDocLen = this.index.getAvgDocLength();
    const scoredDocs = [];
    const candidateProductsForFacets = [];

    const normalizedRawQuery = queryStr.trim().toLowerCase();

    for (const docId of candidateDocIds) {
      const product = this.index.getDocument(docId);
      if (!product) continue;

      candidateProductsForFacets.push(product);

      // Category filter check
      if (category && (product.category_id || product.cat) !== category) {
        continue;
      }

      const docLen = this.index.getDocLength(docId);
      const docTermFreqs = this.index.docTermFreqs.get(docId);

      // Base BM25 score
      let rawBm25 = scoreDocument(
        queryTokens,
        docTermFreqs,
        docLen,
        avgDocLen,
        totalDocs,
        {
          get: (term) => this.index.getDocFrequency(term),
        },
        { k1: this.options.k1, b: this.options.b }
      );

      // Apply typo penalty if query was corrected
      rawBm25 *= typoPenalty;

      // Exact substring boost: if product title contains the raw query string verbatim
      const productName = (product.name || '').toLowerCase();
      let exactMultiplier = 1.0;
      if (productName.includes(normalizedRawQuery)) {
        exactMultiplier = 2.0;
      }
      if (productName.startsWith(normalizedRawQuery)) {
        exactMultiplier *= 1.5;
      }
      rawBm25 *= exactMultiplier;

      // Popularity signal (0.0 to 1.0)
      const popularity =
        product.popularity !== undefined
          ? product.popularity
          : product.badge === 'Bestseller'
            ? 1.0
            : product.badge === 'Organic'
              ? 0.8
              : 0.5;

      // In-stock signal (1.0 if stock > 0, else 0.0)
      const inStock = product.stock === undefined || product.stock > 0 ? 1.0 : 0.0;

      // Discount boost (0.0 to 1.0 based on % savings)
      let discountBoost = 0.0;
      if (product.mrp && product.price && product.mrp > product.price) {
        discountBoost = Math.min(1.0, (product.mrp - product.price) / product.mrp);
      }

      // Master Composite Formula (4.4)
      const finalScore = 0.6 * rawBm25 + 0.2 * popularity + 0.1 * inStock + 0.1 * discountBoost;

      const scoredItem = {
        product,
        score: Math.round(finalScore * 1000) / 1000,
      };

      if (explain) {
        scoredItem.explanation = {
          bm25Raw: Math.round(rawBm25 * 1000) / 1000,
          bm25Weighted: Math.round(0.6 * rawBm25 * 1000) / 1000,
          popularityWeighted: Math.round(0.2 * popularity * 1000) / 1000,
          inStockWeighted: Math.round(0.1 * inStock * 1000) / 1000,
          discountWeighted: Math.round(0.1 * discountBoost * 1000) / 1000,
          exactMultiplier,
          typoPenalty,
          finalScore: scoredItem.score,
        };
      }

      scoredDocs.push(scoredItem);
    }

    // 4. Sort by score descending, then by name
    scoredDocs.sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      return (a.product.name || '').localeCompare(b.product.name || '');
    });

    const paginated = scoredDocs.slice(offset, offset + limit);
    const facets = this.computeFacets(candidateProductsForFacets);

    this._recordAnalytics(queryStr, scoredDocs.length);

    return {
      results: paginated,
      total: scoredDocs.length,
      correctedQuery,
      facets,
    };
  }

  /**
   * Retrieves prefix suggestions from the Trie.
   *
   * @param {string} prefix
   * @param {number} [limit=5]
   * @returns {Suggestion[]}
   */
  suggest(prefix, limit = 5) {
    if (!prefix || typeof prefix !== 'string') return [];
    const rawSuggestions = this.trie.suggest(prefix, limit);
    return rawSuggestions.map((item) => new Suggestion(item.word, item.weight, item.metadata));
  }

  /**
   * Computes facets (category, price range, in-stock count, badges) in a single pass.
   *
   * @param {Array<Object>} products
   * @returns {Object}
   */
  computeFacets(products) {
    const categories = {};
    const priceRanges = {
      under_50: 0,
      '50_to_100': 0,
      '100_to_200': 0,
      above_200: 0,
    };
    const inStock = { true: 0, false: 0 };
    const badges = {};

    for (const p of products || []) {
      const cat = p.category_id || p.cat || 'other';
      categories[cat] = (categories[cat] || 0) + 1;

      const price = Number(p.price) || 0;
      if (price < 50) priceRanges.under_50++;
      else if (price <= 100) priceRanges['50_to_100']++;
      else if (price <= 200) priceRanges['100_to_200']++;
      else priceRanges.above_200++;

      const hasStock = p.stock === undefined || p.stock > 0;
      if (hasStock) inStock.true++;
      else inStock.false++;

      if (p.badge) {
        badges[p.badge] = (badges[p.badge] || 0) + 1;
      }
    }

    return {
      categories,
      priceRanges,
      inStock,
      badges,
    };
  }

  /**
   * Returns top search queries.
   */
  getTopQueries(limit = 20) {
    return Array.from(this.analytics.queryCounts.entries())
      .map(([query, count]) => ({ query, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  /**
   * Returns queries that produced zero search results.
   */
  getZeroResultQueries(limit = 20) {
    return Array.from(this.analytics.zeroResultQueries.entries())
      .map(([query, count]) => ({ query, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  /**
   * Records query execution for search analytics.
   * @private
   */
  _recordAnalytics(queryStr, resultCount) {
    if (!queryStr || typeof queryStr !== 'string') return;
    const clean = queryStr.trim().toLowerCase();
    if (!clean) return;

    this.analytics.queryCounts.set(clean, (this.analytics.queryCounts.get(clean) || 0) + 1);

    if (resultCount === 0) {
      this.analytics.zeroResultQueries.set(
        clean,
        (this.analytics.zeroResultQueries.get(clean) || 0) + 1
      );
    }

    if (this.analytics.recentQueries.length >= 500) {
      this.analytics.recentQueries.shift();
    }
    this.analytics.recentQueries.push({ query: clean, resultCount, time: Date.now() });
  }

  /**
   * Returns all products (filtered by category if provided) when query is empty.
   * @private
   */
  _listAll(category, limit, offset) {
    const list = [];
    for (const doc of this.index.documents.values()) {
      if (category && (doc.category_id || doc.cat) !== category) {
        continue;
      }
      list.push({ product: doc, score: 1.0 });
    }
    const paginated = list.slice(offset, offset + limit);
    return {
      results: paginated,
      total: list.length,
      correctedQuery: null,
      facets: this.computeFacets(Array.from(this.index.documents.values())),
    };
  }

  /**
   * Total number of indexed documents.
   */
  get size() {
    return this.index.totalDocuments;
  }

  /**
   * Clears the search index and BK-Tree.
   */
  clear() {
    this.index.clear();
    this.trie.clear();
    this.bkTree.clear();
    this.analytics.queryCounts.clear();
    this.analytics.zeroResultQueries.clear();
    this.analytics.recentQueries.length = 0;
  }
}

module.exports = {
  SearchEngine,
  Suggestion,
};
