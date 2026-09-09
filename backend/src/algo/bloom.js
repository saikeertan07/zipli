/**
 * @file bloom.js
 * @description Pure Bloom Filter with zero external dependencies:
 * 1. Fixed-size bit array using Uint8Array
 * 2. Double-hashing (Kirsch-Mitzenmacher optimization):
 *    h_i(x) = (h1(x) + i * h2(x)) mod m
 * 3. Optimal bit size m and hash count k calculation:
 *    m = - (n * ln(p)) / (ln(2)^2)
 *    k = (m / n) * ln(2)
 * 4. Theoretical and empirical false positive rate estimation.
 */

/**
 * Computes 32-bit FNV-1a hash of a string.
 * @param {string} str
 * @param {number} [seed=0x811c9dc5]
 * @returns {number} Unsigned 32-bit integer
 */
function fnv1a(str, seed = 0x811c9dc5) {
  let hash = seed >>> 0;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

/**
 * Computes secondary hash using a Jenkins-style 32-bit mix.
 * @param {string} str
 * @param {number} [seed=0xdeadbeef]
 * @returns {number} Unsigned 32-bit integer
 */
function secondaryHash(str, seed = 0xdeadbeef) {
  let hash = seed >>> 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash + str.charCodeAt(i)) >>> 0;
    hash = (hash + (hash << 10)) >>> 0;
    hash ^= hash >>> 6;
  }
  hash = (hash + (hash << 3)) >>> 0;
  hash ^= hash >>> 11;
  hash = (hash + (hash << 15)) >>> 0;
  return hash >>> 0;
}

class BloomFilter {
  /**
   * Initializes Bloom Filter.
   *
   * @param {Object} [options]
   * @param {number} [options.expectedItems=10000] - Expected item capacity (n)
   * @param {number} [options.falsePositiveRate=0.01] - Target false positive probability (p)
   * @param {number} [options.customBitSize] - Direct bit size override
   * @param {number} [options.customHashCount] - Direct hash function count override
   */
  constructor(options = {}) {
    const n = Math.max(1, Math.floor(options.expectedItems ?? 10000));
    const p = Math.max(0.00001, Math.min(0.5, options.falsePositiveRate ?? 0.01));

    if (options.customBitSize) {
      this.sizeInBits = Math.max(8, Math.floor(options.customBitSize));
      this.hashCount = Math.max(1, Math.floor(options.customHashCount ?? 4));
    } else {
      // Optimal m = - (n * ln(p)) / (ln(2)^2)
      // ln(2)^2 ≈ 0.4804530139182
      this.sizeInBits = Math.max(8, Math.ceil((-n * Math.log(p)) / 0.4804530139182));
      // Optimal k = (m / n) * ln(2)
      // ln(2) ≈ 0.69314718056
      this.hashCount = Math.max(1, Math.round((this.sizeInBits / n) * 0.69314718056));
    }

    this.expectedItems = n;
    this.targetFalsePositiveRate = p;
    this.byteSize = Math.ceil(this.sizeInBits / 8);
    this.bitArray = new Uint8Array(this.byteSize);
    this.itemsInserted = 0;
  }

  /**
   * Generates k bit indices for a key using double hashing:
   * h_i(x) = (h1 + i * h2) % m
   *
   * @param {string} key
   * @returns {number[]}
   * @private
   */
  _getBitIndices(key) {
    const strKey = String(key);
    const h1 = fnv1a(strKey);
    const h2 = secondaryHash(strKey);
    const indices = [];

    for (let i = 0; i < this.hashCount; i++) {
      // Ensure positive modulo result
      const combined = (h1 + Math.imul(i, h2)) >>> 0;
      indices.push(combined % this.sizeInBits);
    }
    return indices;
  }

  /**
   * Adds an element into the Bloom Filter.
   * Time Complexity: O(k)
   *
   * @param {string|number} item
   * @returns {boolean} True if successfully added
   */
  add(item) {
    if (item === undefined || item === null) return false;
    const indices = this._getBitIndices(item);

    for (const bitIdx of indices) {
      const byteIdx = Math.floor(bitIdx / 8);
      const bitOffset = bitIdx % 8;
      this.bitArray[byteIdx] |= 1 << bitOffset;
    }

    this.itemsInserted++;
    return true;
  }

  /**
   * Checks if an element is probably in the Bloom Filter.
   * Returns:
   * - false: DEFINITELY NOT in the set (zero false negatives guaranteed)
   * - true:  PROBABLY in the set (subject to false positive rate p)
   * Time Complexity: O(k)
   *
   * @param {string|number} item
   * @returns {boolean}
   */
  has(item) {
    if (item === undefined || item === null) return false;
    const indices = this._getBitIndices(item);

    for (const bitIdx of indices) {
      const byteIdx = Math.floor(bitIdx / 8);
      const bitOffset = bitIdx % 8;
      if ((this.bitArray[byteIdx] & (1 << bitOffset)) === 0) {
        return false;
      }
    }

    return true;
  }

  /**
   * Computes theoretical current false positive rate based on number of items inserted:
   * p_current = (1 - e^(-k * n / m))^k
   *
   * @returns {number}
   */
  getCurrentFalsePositiveRate() {
    if (this.itemsInserted === 0) return 0.0;
    const k = this.hashCount;
    const m = this.sizeInBits;
    const n = this.itemsInserted;
    // (1 - e^(-k*n/m))^k
    const exponent = (-k * n) / m;
    const probBitNotSet = Math.exp(exponent);
    const probBitSet = 1 - probBitNotSet;
    return Math.pow(probBitSet, k);
  }

  /**
   * Returns filter telemetry stats.
   *
   * @returns {Object}
   */
  getStats() {
    let bitsSet = 0;
    for (let i = 0; i < this.byteSize; i++) {
      let b = this.bitArray[i];
      while (b > 0) {
        bitsSet += b & 1;
        b >>= 1;
      }
    }

    return {
      sizeInBits: this.sizeInBits,
      byteSize: this.byteSize,
      hashCount: this.hashCount,
      expectedItems: this.expectedItems,
      itemsInserted: this.itemsInserted,
      bitsSet,
      fillRatio: Math.round((bitsSet / this.sizeInBits) * 10000) / 100,
      targetFPRate: this.targetFalsePositiveRate,
      currentFPRate: Math.round(this.getCurrentFalsePositiveRate() * 100000) / 100000,
    };
  }

  /**
   * Resets all bits to zero.
   */
  clear() {
    this.bitArray.fill(0);
    this.itemsInserted = 0;
  }
}

function calculateOptimalM(n, p) {
  return Math.max(8, Math.ceil((-n * Math.log(p)) / 0.4804530139182));
}

function calculateOptimalK(m, n) {
  return Math.max(1, Math.round((m / n) * 0.69314718056));
}

function calculateOptimalBloomParams(n, p = 0.01) {
  const m = calculateOptimalM(n, p);
  const k = calculateOptimalK(m, n);
  return { m, k, n, p };
}

module.exports = {
  BloomFilter,
  fnv1a,
  secondaryHash,
  calculateOptimalM,
  calculateOptimalK,
  calculateOptimalBloomParams,
};
