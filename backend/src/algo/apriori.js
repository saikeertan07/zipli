/**
 * @file apriori.js
 * @description Pure implementation of the Apriori frequent itemset and association rule mining algorithm.
 * Mines "Frequently Bought Together" product associations with support, confidence, and lift metrics.
 * Zero external algorithmic dependencies.
 */

/**
 * Computes frequency of all single items across transactions.
 *
 * @param {Array<Array<string|number>>} transactions
 * @returns {Map<string, number>}
 */
function getItemFrequencies(transactions) {
  const freqs = new Map();
  for (const tx of transactions) {
    if (!Array.isArray(tx)) continue;
    const seen = new Set();
    for (const item of tx) {
      const key = String(item);
      if (!seen.has(key)) {
        seen.add(key);
        freqs.set(key, (freqs.get(key) || 0) + 1);
      }
    }
  }
  return freqs;
}

/**
 * Encodes an itemset array into a canonical sorted comma-delimited string key.
 *
 * @param {Array<string>} itemset
 * @returns {string}
 */
function serializeItemset(itemset) {
  return [...itemset].sort().join(',');
}

/**
 * Generates candidate itemsets C_k of size k by joining L_{k-1} with itself.
 * Applies the Apriori pruning property: any subset of size k-1 must be in L_{k-1}.
 *
 * @param {Array<Array<string>>} prevFrequent
 * @param {number} k - Target itemset size
 * @param {Set<string>} prevFreqSet - Set of serialized L_{k-1} itemsets for fast O(1) pruning
 * @returns {Array<Array<string>>}
 */
function generateCandidates(prevFrequent, k, prevFreqSet) {
  const candidates = [];
  const n = prevFrequent.length;

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const itemset1 = prevFrequent[i];
      const itemset2 = prevFrequent[j];

      // Join step: items must match on first k-2 items
      let canJoin = true;
      for (let p = 0; p < k - 2; p++) {
        if (itemset1[p] !== itemset2[p]) {
          canJoin = false;
          break;
        }
      }

      if (canJoin) {
        const candidate = [...new Set([...itemset1, ...itemset2])].sort();
        // Prune step: all (k-1) subsets of candidate must be in prevFrequent
        if (hasValidSubsets(candidate, prevFreqSet)) {
          candidates.push(candidate);
        }
      }
    }
  }

  return candidates;
}

/**
 * Verifies that all (k-1) subsets of candidate are frequent.
 *
 * @param {Array<string>} candidate
 * @param {Set<string>} prevFreqSet
 * @returns {boolean}
 */
function hasValidSubsets(candidate, prevFreqSet) {
  const k = candidate.length;
  for (let i = 0; i < k; i++) {
    // Generate subset without candidate[i]
    const subset = [];
    for (let j = 0; j < k; j++) {
      if (j !== i) subset.push(candidate[j]);
    }
    if (!prevFreqSet.has(serializeItemset(subset))) {
      return false;
    }
  }
  return true;
}

/**
 * Generates all non-empty proper subsets of an itemset.
 *
 * @param {Array<string>} itemset
 * @returns {Array<Array<string>>}
 */
function getProperSubsets(itemset) {
  const subsets = [];
  const n = itemset.length;
  const total = 1 << n; // 2^n

  for (let i = 1; i < total - 1; i++) {
    const subset = [];
    for (let j = 0; j < n; j++) {
      if (i & (1 << j)) {
        subset.push(itemset[j]);
      }
    }
    subsets.push(subset);
  }

  return subsets;
}

/**
 * Pure Apriori Algorithm.
 *
 * @param {Array<Array<string|number>>} transactions - Array of transaction item lists.
 * @param {Object} [options]
 * @param {number} [options.minSupport=0.01] - Minimum support fraction (0.0 to 1.0).
 * @param {number} [options.minConfidence=0.1] - Minimum confidence fraction (0.0 to 1.0).
 * @param {number} [options.maxItemsetSize=3] - Maximum size of frequent itemsets to mine.
 * @returns {{
 *   frequentItemsets: Array<{ items: string[], support: number, count: number }>,
 *   rules: Array<{
 *     antecedent: string[],
 *     consequent: string[],
 *     support: number,
 *     confidence: number,
 *     lift: number
 *   }>
 * }}
 */
function apriori(transactions, options = {}) {
  const { minSupport = 0.01, minConfidence = 0.1, maxItemsetSize = 3 } = options;

  if (!Array.isArray(transactions) || transactions.length === 0) {
    return { frequentItemsets: [], rules: [] };
  }

  const numTransactions = transactions.length;
  const minCount = Math.max(1, Math.ceil(minSupport * numTransactions));

  // Convert transactions to Sets of strings for fast itemset containment checks
  const txSets = transactions.map((tx) => new Set((Array.isArray(tx) ? tx : []).map(String)));

  const allFrequentItemsets = [];
  const itemsetSupportMap = new Map(); // key -> support fraction

  // 1. Generate L1 (Frequent 1-itemsets)
  const itemFrequencies = getItemFrequencies(transactions);
  let currentFrequent = [];

  for (const [item, count] of itemFrequencies.entries()) {
    if (count >= minCount) {
      const itemset = [item];
      const support = count / numTransactions;
      currentFrequent.push(itemset);
      allFrequentItemsets.push({ items: itemset, support, count });
      itemsetSupportMap.set(serializeItemset(itemset), support);
    }
  }

  currentFrequent.sort((a, b) => a[0].localeCompare(b[0]));

  // 2. Iteratively generate L_k from L_{k-1}
  let k = 2;
  while (currentFrequent.length > 0 && k <= maxItemsetSize) {
    const prevFreqSet = new Set(currentFrequent.map(serializeItemset));
    const candidates = generateCandidates(currentFrequent, k, prevFreqSet);

    if (candidates.length === 0) break;

    // Count support for candidates
    const candidateCounts = new Array(candidates.length).fill(0);
    for (const tx of txSets) {
      for (let c = 0; c < candidates.length; c++) {
        const cand = candidates[c];
        let hasAll = true;
        for (let i = 0; i < cand.length; i++) {
          if (!tx.has(cand[i])) {
            hasAll = false;
            break;
          }
        }
        if (hasAll) {
          candidateCounts[c]++;
        }
      }
    }

    const nextFrequent = [];
    for (let c = 0; c < candidates.length; c++) {
      const count = candidateCounts[c];
      if (count >= minCount) {
        const itemset = candidates[c];
        const support = count / numTransactions;
        nextFrequent.push(itemset);
        allFrequentItemsets.push({ items: itemset, support, count });
        itemsetSupportMap.set(serializeItemset(itemset), support);
      }
    }

    currentFrequent = nextFrequent;
    k++;
  }

  // 3. Generate Association Rules from frequent itemsets with size >= 2
  const rules = [];

  for (const { items, support: itemsetSupport } of allFrequentItemsets) {
    if (items.length < 2) continue;

    const properSubsets = getProperSubsets(items);

    for (const antecedent of properSubsets) {
      const anteSet = new Set(antecedent);
      const consequent = items.filter((item) => !anteSet.has(item));

      const anteKey = serializeItemset(antecedent);
      const conseqKey = serializeItemset(consequent);

      const anteSupport = itemsetSupportMap.get(anteKey);
      const conseqSupport = itemsetSupportMap.get(conseqKey);

      const confidence = itemsetSupport / anteSupport;

      if (confidence >= minConfidence) {
        const lift = itemsetSupport / (anteSupport * conseqSupport);

        rules.push({
          antecedent: antecedent.sort(),
          consequent: consequent.sort(),
          support: Math.round(itemsetSupport * 100000) / 100000,
          confidence: Math.round(confidence * 100000) / 100000,
          lift: Math.round(lift * 10000) / 10000,
        });
      }
    }
  }

  // Sort rules by lift descending, then confidence descending
  rules.sort((a, b) => {
    if (b.lift !== a.lift) return b.lift - a.lift;
    return b.confidence - a.confidence;
  });

  return {
    frequentItemsets: allFrequentItemsets,
    rules,
  };
}

module.exports = {
  apriori,
  getItemFrequencies,
  serializeItemset,
};
