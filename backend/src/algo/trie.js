/**
 * @file trie.js
 * @description Pure Prefix Tree (Trie) data structure for autocomplete and instant search.
 * Supports weighted terms, prefix suggestion lookup, and frequency ranking.
 */

class TrieNode {
  constructor() {
    this.children = new Map();
    this.isEndOfWord = false;
    this.weight = 0; // Usage frequency or popularity rank
    this.metadata = null;
  }
}

class Trie {
  constructor() {
    this.root = new TrieNode();
    this.wordCount = 0;
  }

  /**
   * Inserts a word with an optional frequency weight and metadata into the Trie.
   *
   * Time Complexity: O(L) where L = word.length
   * Space Complexity: O(L)
   *
   * @param {string} word - The term to index.
   * @param {number} [weight=1] - Frequency/relevance weight (higher ranks earlier in suggestions).
   * @param {Object} [metadata=null] - Optional arbitrary metadata (e.g. category, product id).
   */
  insert(word, weight = 1, metadata = null) {
    if (typeof word !== 'string') return;

    const normalized = word.trim().toLowerCase();
    if (!normalized) return;

    let current = this.root;
    for (let i = 0; i < normalized.length; i++) {
      const char = normalized[i];
      if (!current.children.has(char)) {
        current.children.set(char, new TrieNode());
      }
      current = current.children.get(char);
    }

    if (!current.isEndOfWord) {
      current.isEndOfWord = true;
      this.wordCount++;
    }

    current.weight = Math.max(current.weight, weight);
    if (metadata) {
      current.metadata = { ...(current.metadata || {}), ...metadata };
    }
  }

  /**
   * Checks if an exact word exists in the Trie.
   *
   * Time Complexity: O(L)
   *
   * @param {string} word
   * @returns {boolean}
   */
  contains(word) {
    if (typeof word !== 'string' || !word.trim()) return false;
    const normalized = word.trim().toLowerCase();

    let current = this.root;
    for (let i = 0; i < normalized.length; i++) {
      const char = normalized[i];
      if (!current.children.has(char)) {
        return false;
      }
      current = current.children.get(char);
    }

    return current.isEndOfWord;
  }

  /**
   * Checks if any word starts with the given prefix.
   *
   * Time Complexity: O(P) where P = prefix.length
   *
   * @param {string} prefix
   * @returns {boolean}
   */
  hasPrefix(prefix) {
    if (typeof prefix !== 'string' || !prefix.trim()) return false;
    const normalized = prefix.trim().toLowerCase();

    let current = this.root;
    for (let i = 0; i < normalized.length; i++) {
      const char = normalized[i];
      if (!current.children.has(char)) {
        return false;
      }
      current = current.children.get(char);
    }

    return true;
  }

  /**
   * Retrieves autocomplete suggestions for a given prefix, ranked by weight descending.
   *
   * Time Complexity: O(P + K) where P = prefix.length, K = subtree node count
   *
   * @param {string} prefix - The search query prefix.
   * @param {number} [limit=5] - Maximum number of suggestions to return.
   * @returns {Array<{ word: string, weight: number, metadata: Object|null }>}
   */
  suggest(prefix, limit = 5) {
    if (typeof prefix !== 'string' || !prefix.trim()) return [];
    const normalized = prefix.trim().toLowerCase();

    let current = this.root;
    for (let i = 0; i < normalized.length; i++) {
      const char = normalized[i];
      if (!current.children.has(char)) {
        return [];
      }
      current = current.children.get(char);
    }

    const results = [];
    this._collectWords(current, normalized, results);

    // Rank by weight descending, then alphabetically ascending
    results.sort((a, b) => {
      if (b.weight !== a.weight) {
        return b.weight - a.weight;
      }
      return a.word.localeCompare(b.word);
    });

    return results.slice(0, limit);
  }

  /**
   * Internal recursive helper to collect all words starting from a node.
   * @private
   */
  _collectWords(node, currentPrefix, results) {
    if (node.isEndOfWord) {
      results.push({
        word: currentPrefix,
        weight: node.weight,
        metadata: node.metadata,
      });
    }

    for (const [char, childNode] of node.children.entries()) {
      this._collectWords(childNode, currentPrefix + char, results);
    }
  }

  /**
   * Removes a word from the Trie.
   *
   * @param {string} word
   * @returns {boolean} True if the word was found and removed.
   */
  remove(word) {
    if (typeof word !== 'string' || !word.trim()) return false;
    const normalized = word.trim().toLowerCase();

    let removed = false;

    const deleteHelper = (node, depth) => {
      if (!node) return false;

      if (depth === normalized.length) {
        if (!node.isEndOfWord) return false;
        node.isEndOfWord = false;
        this.wordCount--;
        removed = true;
        return node.children.size === 0;
      }

      const char = normalized[depth];
      const child = node.children.get(char);
      if (!child) return false;

      const shouldDeleteChild = deleteHelper(child, depth + 1);

      if (shouldDeleteChild) {
        node.children.delete(char);
        return !node.isEndOfWord && node.children.size === 0;
      }

      return false;
    };

    deleteHelper(this.root, 0);
    return removed;
  }

  /**
   * Returns total number of unique words in the Trie.
   */
  size() {
    return this.wordCount;
  }

  /**
   * Clears the entire Trie.
   */
  clear() {
    this.root = new TrieNode();
    this.wordCount = 0;
  }
}

module.exports = {
  TrieNode,
  Trie,
};
