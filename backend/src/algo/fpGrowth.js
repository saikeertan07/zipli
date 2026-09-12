/**
 * @file fpGrowth.js
 * @description Pure FP-Growth (Frequent Pattern Growth) frequent itemset and association rule mining algorithm.
 * Constructs an in-memory FP-Tree (Frequent Pattern Tree) with header table and node-links
 * to mine frequent itemsets without candidate generation in two dataset passes.
 * Zero external algorithmic dependencies.
 */

class FPNode {
  constructor(item, count = 1, parent = null) {
    this.item = item;
    this.count = count;
    this.parent = parent;
    this.children = new Map(); // Map<item, FPNode>
    this.nodeLink = null; // Next node with same item in header chain
  }
}

class FPTree {
  constructor() {
    this.root = new FPNode(null, 0, null);
    this.headerTable = new Map(); // Map<item, { count: number, head: FPNode, tail: FPNode }>
  }

  /**
   * Inserts an ordered transaction path into the FP-tree.
   *
   * @param {string[]} items - Filtered, sorted transaction items.
   * @param {number} [count=1] - Multiplicity / count of transaction.
   */
  insert(items, count = 1) {
    let current = this.root;

    for (const item of items) {
      if (current.children.has(item)) {
        const child = current.children.get(item);
        child.count += count;
        current = child;
      } else {
        const newNode = new FPNode(item, count, current);
        current.children.set(item, newNode);

        // Update header table node-link chain
        const header = this.headerTable.get(item);
        if (header) {
          if (!header.head) {
            header.head = newNode;
            header.tail = newNode;
          } else {
            header.tail.nodeLink = newNode;
            header.tail = newNode;
          }
        }

        current = newNode;
      }
    }
  }
}

/**
 * Builds the FP-tree from transactions.
 *
 * @param {Array<Array<string|number>>} transactions
 * @param {number} minCount
 * @returns {{ tree: FPTree, itemOrder: Map<string, number>, itemCounts: Map<string, number> }}
 */
function buildFPTree(transactions, minCount) {
  // Pass 1: Count item frequencies
  const itemCounts = new Map();
  for (const tx of transactions) {
    if (!Array.isArray(tx)) continue;
    const seen = new Set();
    for (const item of tx) {
      const key = String(item);
      if (!seen.has(key)) {
        seen.add(key);
        itemCounts.set(key, (itemCounts.get(key) || 0) + 1);
      }
    }
  }

  // Filter infrequent items and establish global sort order (descending frequency)
  const frequentItems = Array.from(itemCounts.entries())
    .filter(([, count]) => count >= minCount)
    .sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return a[0].localeCompare(b[0]);
    });

  const itemOrder = new Map();
  const tree = new FPTree();

  frequentItems.forEach(([item, count], index) => {
    itemOrder.set(item, index);
    tree.headerTable.set(item, { count, head: null, tail: null });
  });

  // Pass 2: Insert filtered and sorted items into FP-tree
  for (const tx of transactions) {
    if (!Array.isArray(tx)) continue;
    const filtered = [];
    const seen = new Set();
    for (const item of tx) {
      const key = String(item);
      if (itemOrder.has(key) && !seen.has(key)) {
        seen.add(key);
        filtered.push(key);
      }
    }

    filtered.sort((a, b) => itemOrder.get(a) - itemOrder.get(b));

    if (filtered.length > 0) {
      tree.insert(filtered, 1);
    }
  }

  return { tree, itemOrder, itemCounts };
}

/**
 * Recursively mines frequent patterns from an FP-tree.
 *
 * @param {FPTree} tree
 * @param {string[]} suffix
 * @param {number} minCount
 * @param {number} maxItemsetSize
 * @param {Array<{ items: string[], count: number }>} frequentItemsets
 */
function mineFPTree(tree, suffix, minCount, maxItemsetSize, frequentItemsets) {
  // Process items in header table in reverse order of frequency (bottom-up)
  const items = Array.from(tree.headerTable.keys()).reverse();

  for (const item of items) {
    const header = tree.headerTable.get(item);
    const newSuffix = [item, ...suffix].sort();

    frequentItemsets.push({
      items: newSuffix,
      count: header.count,
    });

    if (newSuffix.length >= maxItemsetSize) {
      continue;
    }

    // Build conditional pattern base (prefix paths for item)
    const conditionalPatterns = [];
    let node = header.head;

    while (node) {
      const pathCount = node.count;
      const prefixPath = [];
      let parent = node.parent;

      while (parent && parent.item !== null) {
        prefixPath.push(parent.item);
        parent = parent.parent;
      }

      if (prefixPath.length > 0) {
        conditionalPatterns.push({ path: prefixPath.reverse(), count: pathCount });
      }

      node = node.nodeLink;
    }

    // Count frequencies in conditional pattern base
    const condItemCounts = new Map();
    for (const { path, count } of conditionalPatterns) {
      for (const pItem of path) {
        condItemCounts.set(pItem, (condItemCounts.get(pItem) || 0) + count);
      }
    }

    // Filter conditional frequent items
    const condFrequentItems = Array.from(condItemCounts.entries())
      .filter(([, count]) => count >= minCount)
      .sort((a, b) => {
        if (b[1] !== a[1]) return b[1] - a[1];
        return a[0].localeCompare(b[0]);
      });

    if (condFrequentItems.length === 0) continue;

    // Construct conditional FP-tree
    const condTree = new FPTree();
    const condOrder = new Map();

    condFrequentItems.forEach(([cItem, count], idx) => {
      condOrder.set(cItem, idx);
      condTree.headerTable.set(cItem, { count, head: null, tail: null });
    });

    for (const { path, count } of conditionalPatterns) {
      const filteredPath = path
        .filter((cItem) => condOrder.has(cItem))
        .sort((a, b) => condOrder.get(a) - condOrder.get(b));

      if (filteredPath.length > 0) {
        condTree.insert(filteredPath, count);
      }
    }

    mineFPTree(condTree, newSuffix, minCount, maxItemsetSize, frequentItemsets);
  }
}

/**
 * Generates all non-empty proper subsets of an itemset.
 *
 * @param {string[]} itemset
 * @returns {Array<string[]>}
 */
function getProperSubsets(itemset) {
  const subsets = [];
  const n = itemset.length;
  const total = 1 << n;

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
 * Encodes an itemset array into a canonical sorted comma-delimited string key.
 *
 * @param {string[]} itemset
 * @returns {string}
 */
function serializeItemset(itemset) {
  return [...itemset].sort().join(',');
}

/**
 * Pure FP-Growth Algorithm.
 *
 * @param {Array<Array<string|number>>} transactions - Dataset of transactions.
 * @param {Object} [options]
 * @param {number} [options.minSupport=0.01] - Minimum support fraction (0.0 to 1.0).
 * @param {number} [options.minConfidence=0.1] - Minimum confidence fraction (0.0 to 1.0).
 * @param {number} [options.maxItemsetSize=3] - Maximum itemset size.
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
function fpGrowth(transactions, options = {}) {
  const { minSupport = 0.01, minConfidence = 0.1, maxItemsetSize = 3 } = options;

  if (!Array.isArray(transactions) || transactions.length === 0) {
    return { frequentItemsets: [], rules: [] };
  }

  const numTransactions = transactions.length;
  const minCount = Math.max(1, Math.ceil(minSupport * numTransactions));

  const { tree } = buildFPTree(transactions, minCount);

  const rawFrequentItemsets = [];
  mineFPTree(tree, [], minCount, maxItemsetSize, rawFrequentItemsets);

  const frequentItemsets = [];
  const itemsetSupportMap = new Map();

  for (const { items, count } of rawFrequentItemsets) {
    const support = count / numTransactions;
    const key = serializeItemset(items);
    itemsetSupportMap.set(key, support);
    frequentItemsets.push({ items, support, count });
  }

  // Generate association rules from frequent itemsets with length >= 2
  const rules = [];

  for (const { items, support: itemsetSupport } of frequentItemsets) {
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
    frequentItemsets,
    rules,
  };
}

module.exports = {
  fpGrowth,
  buildFPTree,
  FPTree,
  FPNode,
};
