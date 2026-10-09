/**
 * ZIPLI PRO — Offline Cart Mutation Queue
 *
 * Queues cart operations while offline and syncs them automatically
 * when connectivity is restored.
 */

import { storage } from './storage.js';

const QUEUE_KEY = 'zipli_offline_cart_queue';

export class OfflineQueue {
  constructor() {
    this.queue = storage.get(QUEUE_KEY, []);
  }

  enqueue(action, payload) {
    this.queue.push({
      id: Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      action,
      payload,
      timestamp: Date.now(),
    });
    this._save();
  }

  getItems() {
    return [...this.queue];
  }

  clear() {
    this.queue = [];
    this._save();
  }

  async syncWithApi(apiClient) {
    if (!this.queue.length || !navigator.onLine) return 0;
    const itemsToProcess = [...this.queue];
    let syncedCount = 0;

    for (const item of itemsToProcess) {
      try {
        if (item.action === 'ADD_ITEM') {
          await apiClient.post('/cart', item.payload);
        } else if (item.action === 'SET_QTY') {
          await apiClient.patch(`/cart/${item.payload.productId}`, { quantity: item.payload.quantity });
        } else if (item.action === 'REMOVE_ITEM') {
          await apiClient.delete(`/cart/${item.payload.productId}`);
        }
        syncedCount++;
        this.queue = this.queue.filter((q) => q.id !== item.id);
        this._save();
      } catch (err) {
        // If server reports error other than network, remove corrupted entry
        if (err.status && err.status < 500) {
          this.queue = this.queue.filter((q) => q.id !== item.id);
          this._save();
        }
        break;
      }
    }

    return syncedCount;
  }

  _save() {
    storage.set(QUEUE_KEY, this.queue);
  }
}

export const offlineQueue = new OfflineQueue();
