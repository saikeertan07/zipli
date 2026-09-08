/**
 * @file embeddingProvider.js
 * @description Embedding Provider Abstraction for Dense Vector Search (F-031, P1).
 * Supports:
 * - DeterministicEmbeddingProvider: Fast, pure-math 384-dimensional dense semantic vectors
 *   with cross-lingual Hinglish semantic mappings ("dahi" -> "curd", "doodh" -> "milk").
 * - RemoteEmbeddingProvider: External OpenAI / Anthropic / Voyage embedding API via EMBEDDING_API_KEY.
 */

const crypto = require('crypto');
const logger = require('../utils/logger');

const EMBEDDING_DIM = 384;

// Semantic Hinglish & synonym synonym dictionary to bridge lexical gap in dense space
const SYNONYM_MAP = {
  dahi: ['curd', 'yogurt', 'masti', 'dairy'],
  curd: ['dahi', 'yogurt', 'dairy'],
  doodh: ['milk', 'cow milk', 'toned milk', 'dairy'],
  milk: ['doodh', 'dairy', 'cow milk'],
  aloo: ['potato', 'potatoes', 'vegetable'],
  potato: ['aloo', 'potatoes', 'vegetables'],
  atta: ['flour', 'wheat flour', 'chakki atta', 'grains'],
  flour: ['atta', 'wheat', 'grains'],
  paneer: ['cottage cheese', 'malai paneer', 'dairy'],
  butter: ['makhan', 'amul butter', 'dairy'],
  makhan: ['butter', 'dairy'],
  chai: ['tea', 'black tea', 'tea leaves', 'beverage'],
  tea: ['chai', 'green tea', 'beverage'],
  chawal: ['rice', 'basmati', 'grains'],
  rice: ['chawal', 'basmati', 'grains'],
  ghee: ['clarified butter', 'desi ghee', 'dairy'],
  poha: ['flattened rice', 'rice flakes', 'breakfast'],
  cheeni: ['sugar', 'sweetener'],
  sugar: ['cheeni', 'sweetener'],
};

/**
 * Base EmbeddingProvider interface.
 */
class EmbeddingProvider {
  /**
   * Generates a dense normalized float embedding vector for text.
   * @param {string} _text
   * @returns {Promise<number[]>} 384-dim normalized vector
   */
  async embedText(_text) {
    throw new Error('embedText() must be implemented by provider');
  }

  /**
   * Generates batch embeddings.
   * @param {string[]} texts
   * @returns {Promise<number[][]>}
   */
  async embedBatch(texts) {
    return Promise.all(texts.map((t) => this.embedText(t)));
  }
}

/**
 * DeterministicEmbeddingProvider generates 384-dimensional semantic dense vectors
 * using multi-hash n-gram projections and Hinglish semantic synonym expansion.
 */
class DeterministicEmbeddingProvider extends EmbeddingProvider {
  constructor() {
    super();
    this.dim = EMBEDDING_DIM;
    this.name = 'DETERMINISTIC_LOCAL';
  }

  /**
   * Expands text with synonyms and transliterated Hinglish terms.
   */
  _expandSemanticTokens(text) {
    const tokens = (text || '').toLowerCase().split(/[\s,._-]+/).filter(Boolean);
    const expanded = [...tokens];

    for (const t of tokens) {
      if (SYNONYM_MAP[t]) {
        expanded.push(...SYNONYM_MAP[t]);
      }
    }
    return expanded;
  }

  async embedText(text) {
    const vector = new Float32Array(this.dim);
    const tokens = this._expandSemanticTokens(text);

    if (tokens.length === 0) {
      // Unit vector on dimension 0
      vector[0] = 1.0;
      return Array.from(vector);
    }

    // Hash tokens and character trigrams onto the dense vector space
    for (const token of tokens) {
      // Whole token hash
      const hash1 = crypto.createHash('sha256').update(token).digest();
      const idx1 = hash1.readUInt16BE(0) % this.dim;
      const sign1 = (hash1.readUInt8(2) % 2 === 0 ? 1 : -1);
      vector[idx1] += sign1 * 1.5;

      // Character 3-grams for typo resilience
      for (let i = 0; i <= token.length - 3; i++) {
        const trigram = token.slice(i, i + 3);
        const hash2 = crypto.createHash('md5').update(trigram).digest();
        const idx2 = hash2.readUInt16BE(0) % this.dim;
        const sign2 = (hash2.readUInt8(2) % 2 === 0 ? 1 : -1);
        vector[idx2] += sign2 * 0.5;
      }
    }

    // L2 Normalization so dot product equals cosine similarity
    let norm = 0;
    for (let i = 0; i < this.dim; i++) {
      norm += vector[i] * vector[i];
    }
    norm = Math.sqrt(norm);

    if (norm > 0) {
      for (let i = 0; i < this.dim; i++) {
        vector[i] = vector[i] / norm;
      }
    } else {
      vector[0] = 1.0;
    }

    return Array.from(vector);
  }
}

/**
 * RemoteEmbeddingProvider for external embedding APIs.
 */
class RemoteEmbeddingProvider extends EmbeddingProvider {
  constructor(options = {}) {
    super();
    this.apiKey = options.apiKey || process.env.EMBEDDING_API_KEY;
    this.apiBase = options.apiBase || 'https://api.openai.com/v1';
    this.model = options.model || 'text-embedding-3-small';
    this.name = 'REMOTE_API';
    this.fallback = new DeterministicEmbeddingProvider();
  }

  async embedText(text) {
    if (!this.apiKey) {
      return this.fallback.embedText(text);
    }

    try {
      const res = await fetch(`${this.apiBase}/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          input: text,
          dimensions: EMBEDDING_DIM,
        }),
        signal: AbortSignal.timeout(8000),
      });

      if (!res.ok) {
        throw new Error(`Remote embedding failed with status ${res.status}`);
      }

      const data = await res.json();
      return data.data[0].embedding;
    } catch (err) {
      logger.warn('Remote embedding failed, falling back to deterministic local', { error: err.message });
      return this.fallback.embedText(text);
    }
  }
}

let providerInstance = null;

function getEmbeddingProvider() {
  if (!providerInstance) {
    const isProd = process.env.NODE_ENV === 'production';
    const providerConfig = (process.env.EMBEDDING_PROVIDER || '').toLowerCase();

    if (isProd && providerConfig !== 'deterministic' && !process.env.EMBEDDING_API_KEY) {
      throw new Error(
        'Production boot error: EMBEDDING_API_KEY must be configured for dense vector search, or set EMBEDDING_PROVIDER=deterministic explicitly.'
      );
    }

    const isRemote =
      (providerConfig === 'remote' || isProd) && Boolean(process.env.EMBEDDING_API_KEY);
    providerInstance = isRemote ? new RemoteEmbeddingProvider() : new DeterministicEmbeddingProvider();
  }
  return providerInstance;
}

/**
 * Pure cosine similarity between two float vectors.
 */
function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom > 0 ? dot / denom : 0;
}

module.exports = {
  EmbeddingProvider,
  DeterministicEmbeddingProvider,
  RemoteEmbeddingProvider,
  getEmbeddingProvider,
  cosineSimilarity,
  EMBEDDING_DIM,
};
