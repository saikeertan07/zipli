/**
 * @file fefo.js
 * @description First-Expiry-First-Out (FEFO) batch inventory allocation engine:
 * 1. Prioritizes batches by earliest expiry date using a pure MinHeap
 * 2. Multi-batch partial fulfillment and allocation tracking
 * 3. Expired batch quarantine and remaining shelf-life calculations
 * Zero external dependencies.
 */

const { MinHeap } = require('./heap');

class FEFOInventoryManager {
  /**
   * Initializes FEFO manager for a specific product or global catalog.
   */
  constructor() {
    // productBatchesMap: Map<productId, MinHeap<Batch>>
    this.productHeaps = new Map();
  }

  /**
   * Normalizes expiry date to timestamp.
   * @param {string|number|Date} date
   * @returns {number}
   */
  static parseExpiry(date) {
    if (typeof date === 'number') return date;
    const t = new Date(date).getTime();
    return isNaN(t) ? Date.now() + 7 * 86400000 : t;
  }

  /**
   * Adds an inventory batch to the FEFO pool.
   *
   * @param {Object} batch
   * @param {string|number} batch.productId
   * @param {string|number} batch.batchId
   * @param {number} batch.quantity
   * @param {string|number|Date} batch.expiryDate
   * @param {number} [batch.costPrice=0]
   * @returns {number} New total active quantity for product
   */
  addBatch(batch, now = Date.now()) {
    if (!batch || !batch.productId || !batch.batchId) {
      throw new Error('Valid batch with productId and batchId required');
    }
    const pid = String(batch.productId);
    const qty = Math.max(0, Math.floor(Number(batch.quantity) || 0));
    if (qty === 0) return this.getTotalStock(pid, now);

    const expiryTime = FEFOInventoryManager.parseExpiry(batch.expiryDate);

    if (!this.productHeaps.has(pid)) {
      // MinHeap ordered by earliest expiryTime
      this.productHeaps.set(pid, new MinHeap((a, b) => a.expiryTime - b.expiryTime));
    }

    const heap = this.productHeaps.get(pid);
    heap.push({
      batchId: String(batch.batchId),
      productId: pid,
      quantity: qty,
      expiryTime,
      expiryDate: new Date(expiryTime).toISOString(),
      costPrice: Number(batch.costPrice) || 0,
    });

    return this.getTotalStock(pid);
  }

  /**
   * Returns total available non-expired stock for a product.
   *
   * @param {string|number} productId
   * @param {number} [now=Date.now()]
   * @returns {number}
   */
  getTotalStock(productId, now = Date.now()) {
    const pid = String(productId);
    const heap = this.productHeaps.get(pid);
    if (!heap || heap.isEmpty()) return 0;

    let total = 0;
    for (const b of heap.data) {
      if (b.expiryTime > now && b.quantity > 0) {
        total += b.quantity;
      }
    }
    return total;
  }

  /**
   * Returns list of all active batches for a product sorted by earliest expiry.
   *
   * @param {string|number} productId
   * @param {number} [now=Date.now()]
   * @returns {Array<Object>}
   */
  getActiveBatches(productId, now = Date.now()) {
    const pid = String(productId);
    const heap = this.productHeaps.get(pid);
    if (!heap || heap.isEmpty()) return [];

    const active = [];
    for (const b of heap.data) {
      const daysLeft = Math.max(0, Math.round(((b.expiryTime - now) / 86400000) * 10) / 10);
      active.push({
        batchId: b.batchId,
        productId: b.productId,
        quantity: b.quantity,
        expiryDate: b.expiryDate,
        daysToExpiry: daysLeft,
        isExpired: b.expiryTime <= now,
      });
    }

    return active.sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate));
  }

  /**
   * Allocates Q units using FEFO priority: earliest expiring batches are exhausted first.
   * Atomic operation: only commits if entire requested quantity is available.
   *
   * @param {string|number} productId
   * @param {number} requestedQty
   * @param {number} [now=Date.now()]
   * @returns {{
   *   success: boolean,
   *   allocatedBatches: Array<{ batchId: string, quantityAllocated: number, expiryDate: string }>,
   *   shortage: number,
   *   remainingStock: number
   * }}
   */
  allocateFEFO(productId, requestedQty, now = Date.now()) {
    const pid = String(productId);
    const qtyToAllocate = Math.max(0, Math.floor(Number(requestedQty) || 0));

    if (qtyToAllocate === 0) {
      return {
        success: true,
        allocatedBatches: [],
        shortage: 0,
        remainingStock: this.getTotalStock(pid, now),
      };
    }

    const totalAvailable = this.getTotalStock(pid, now);
    if (totalAvailable < qtyToAllocate) {
      return {
        success: false,
        allocatedBatches: [],
        shortage: qtyToAllocate - totalAvailable,
        remainingStock: totalAvailable,
      };
    }

    const heap = this.productHeaps.get(pid);
    let remainingNeeded = qtyToAllocate;
    const allocatedBatches = [];

    // Temporarily extract and update batches in order
    const updatedBatches = [];

    while (!heap.isEmpty() && remainingNeeded > 0) {
      const earliestBatch = heap.pop();

      // Skip expired batches
      if (earliestBatch.expiryTime <= now) {
        updatedBatches.push(earliestBatch);
        continue;
      }

      if (earliestBatch.quantity <= remainingNeeded) {
        // Entire batch is consumed
        allocatedBatches.push({
          batchId: earliestBatch.batchId,
          quantityAllocated: earliestBatch.quantity,
          expiryDate: earliestBatch.expiryDate,
        });
        remainingNeeded -= earliestBatch.quantity;
        earliestBatch.quantity = 0;
      } else {
        // Partial batch consumption
        allocatedBatches.push({
          batchId: earliestBatch.batchId,
          quantityAllocated: remainingNeeded,
          expiryDate: earliestBatch.expiryDate,
        });
        earliestBatch.quantity -= remainingNeeded;
        remainingNeeded = 0;
        updatedBatches.push(earliestBatch);
      }
    }

    // Re-insert unexhausted batches
    for (const b of updatedBatches) {
      heap.push(b);
    }

    return {
      success: true,
      allocatedBatches,
      shortage: 0,
      remainingStock: this.getTotalStock(pid, now),
    };
  }

  /**
   * Identifies and returns all expired batches across all products for quarantine / disposal.
   *
   * @param {number} [now=Date.now()]
   * @returns {Array<Object>}
   */
  quarantineExpiredBatches(now = Date.now()) {
    const expiredList = [];

    for (const [pid, heap] of this.productHeaps.entries()) {
      const validBatches = [];
      while (!heap.isEmpty()) {
        const b = heap.pop();
        if (b.expiryTime <= now) {
          expiredList.push({
            batchId: b.batchId,
            productId: pid,
            quantity: b.quantity,
            expiryDate: b.expiryDate,
          });
        } else {
          validBatches.push(b);
        }
      }

      // Restore non-expired batches
      for (const b of validBatches) {
        heap.push(b);
      }
    }

    return expiredList;
  }
}

module.exports = {
  FEFOInventoryManager,
};
