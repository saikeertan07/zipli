const { catalogSearchService } = require('./catalogSearch.service');
const { stockReservationService } = require('./stockReservation.service');
const { query } = require('../config/db');
const logger = require('../utils/logger');
const AppError = require('../utils/AppError');

/**
 * Pure In-Memory Job Queue with exponential backoff, jitter, and Dead-Letter Queue (DLQ).
 * Can back BullMQ when Redis is available or act as standalone queue.
 */
class InMemoryJobQueue {
  constructor(name) {
    this.name = name;
    this.waiting = [];
    this.active = new Map();
    this.completed = [];
    this.failed = [];
    this.dlq = [];
    this.handlers = new Map();
    this.isProcessing = false;
    this.jobCounter = 0;
  }

  process(jobName, handler) {
    this.handlers.set(jobName, handler);
  }

  async add(jobName, data, options = {}) {
    const isTest = process.env.NODE_ENV === 'test';
    const defaultDelay = isTest ? 10 : 1000;
    const {
      attempts = 3,
      backoff = { type: 'exponential', delay: defaultDelay },
      delay = 0,
    } = options;

    const job = {
      id: `${this.name}_${++this.jobCounter}_${Date.now()}`,
      name: jobName,
      data,
      attemptsMade: 0,
      maxAttempts: attempts,
      backoff,
      delay,
      timestamp: Date.now(),
      status: delay > 0 ? 'delayed' : 'waiting',
      error: null,
    };

    if (delay > 0) {
      setTimeout(() => {
        job.status = 'waiting';
        this.waiting.push(job);
        this._tick();
      }, delay).unref();
    } else {
      this.waiting.push(job);
      setImmediate(() => this._tick());
    }

    return job;
  }

  async _tick() {
    if (this.isProcessing || this.waiting.length === 0) return;
    this.isProcessing = true;

    while (this.waiting.length > 0) {
      const job = this.waiting.shift();
      const handler = this.handlers.get(job.name);

      if (!handler) {
        job.status = 'failed';
        job.error = `No handler registered for job type: ${job.name}`;
        this.failed.push(job);
        this.dlq.push(job);
        continue;
      }

      job.status = 'active';
      this.active.set(job.id, job);
      job.attemptsMade++;

      try {
        job.result = await handler(job);
        job.status = 'completed';
        this.active.delete(job.id);
        this.completed.push(job);
        if (this.completed.length > 200) this.completed.shift();
      } catch (err) {
        this.active.delete(job.id);
        job.error = err.message;

        if (job.attemptsMade < job.maxAttempts) {
          // Calculate exponential backoff with proportional jitter
          const baseDelay = (job.backoff && job.backoff.delay) || 1000;
          const exponential = baseDelay * Math.pow(2, job.attemptsMade - 1);
          const maxJitter =
            job.backoff && job.backoff.jitter === false ? 0 : Math.min(50, baseDelay);
          const jitter = maxJitter > 0 ? Math.floor(Math.random() * maxJitter) : 0;
          const retryDelay = exponential + jitter;

          job.status = 'delayed';
          logger.warn(`Job ${job.id} failed, retrying in ${retryDelay}ms`, { error: err.message });

          setTimeout(() => {
            job.status = 'waiting';
            this.waiting.push(job);
            this._tick();
          }, retryDelay).unref();
        } else {
          // Max attempts exhausted -> Move to Dead Letter Queue (DLQ)
          job.status = 'failed';
          this.failed.push(job);
          this.dlq.push(job);
          logger.error(`Job ${job.id} moved to DLQ after ${job.attemptsMade} attempts`, {
            error: err.message,
          });
        }
      }
    }

    this.isProcessing = false;
  }

  getJobCounts() {
    return {
      waiting: this.waiting.length,
      active: this.active.size,
      completed: this.completed.length,
      failed: this.failed.length,
      dlq: this.dlq.length,
    };
  }

  getJobs(status = 'all') {
    switch (status) {
      case 'waiting':
        return [...this.waiting];
      case 'active':
        return Array.from(this.active.values());
      case 'completed':
        return [...this.completed];
      case 'failed':
        return [...this.failed];
      case 'dlq':
        return [...this.dlq];
      default:
        return [
          ...this.waiting,
          ...Array.from(this.active.values()),
          ...this.completed,
          ...this.failed,
        ];
    }
  }

  retryJob(jobId) {
    const idx = this.dlq.findIndex((j) => j.id === jobId);
    if (idx === -1) {
      throw new AppError(`Job ${jobId} not found in Dead Letter Queue`, 404);
    }
    const [job] = this.dlq.splice(idx, 1);
    job.attemptsMade = 0;
    job.status = 'waiting';
    job.error = null;
    this.waiting.push(job);
    setImmediate(() => this._tick());
    return job;
  }

  clean(graceMs = 0) {
    const now = Date.now();
    this.completed = this.completed.filter((j) => now - j.timestamp < graceMs);
    this.failed = this.failed.filter((j) => now - j.timestamp < graceMs);
    return { cleaned: true };
  }

  clear() {
    this.waiting = [];
    this.active.clear();
    this.completed = [];
    this.failed = [];
    this.dlq = [];
  }
}

class QueueService {
  constructor() {
    this.queues = new Map();
    this._initializeDefaultQueues();
  }

  getQueue(name) {
    if (!this.queues.has(name)) {
      this.queues.set(name, new InMemoryJobQueue(name));
    }
    return this.queues.get(name);
  }

  _initializeDefaultQueues() {
    const systemQueue = this.getQueue('zipli_system');

    // 1. send_notification job
    systemQueue.process('send_notification', async (job) => {
      const { notificationService } = require('./notification.service');
      return await notificationService.sendNotification(job.data);
    });

    // 2. rebuild_search_index job
    systemQueue.process('rebuild_search_index', async () => {
      logger.info('Executing background search index rebuild job');
      return await catalogSearchService.init();
    });

    // 3. recompute_recommendations job
    systemQueue.process('recompute_recommendations', async () => {
      logger.info('Executing background recommendations recomputation');
      const { recommendationService } = require('./recommendation.service');
      if (typeof recommendationService.warmCache === 'function') {
        return await recommendationService.warmCache();
      }
      return { recomputed: true };
    });

    // 4. forecast_refresh job
    systemQueue.process('forecast_refresh', async (job) => {
      logger.info('Executing background inventory forecast refresh');
      const productId = job.data && job.data.productId;
      if (productId) {
        const inventoryService = require('./inventory.service');
        if (typeof inventoryService.calculateReorderForecast === 'function') {
          return await inventoryService.calculateReorderForecast(productId);
        }
      }
      return { refreshed: true };
    });

    // 5. expire_stale_carts job
    systemQueue.process('expire_stale_carts', async () => {
      logger.info('Executing expire_stale_carts job');
      const res = await query(
        `DELETE FROM cart_items
         WHERE created_at < NOW() - INTERVAL '24 hours'
         RETURNING id`
      );
      return { expiredCartsCount: res.rowCount };
    });

    // 6. release_held_stock job
    systemQueue.process('release_held_stock', async () => {
      logger.info('Executing release_held_stock job');
      const count = await stockReservationService.releaseExpiredReservations();
      return { releasedReservationsCount: count };
    });
  }

  /**
   * Dispatches a job to the system queue with retry policies and backoff.
   */
  async dispatch(jobName, data = {}, options = {}) {
    const queue = this.getQueue('zipli_system');
    return await queue.add(jobName, data, options);
  }

  /**
   * Retrieves status across all queues for admin dashboard.
   */
  getDashboardStats() {
    const stats = {};
    for (const [name, q] of this.queues.entries()) {
      stats[name] = q.getJobCounts();
    }
    return stats;
  }

  /**
   * Clears all jobs in memory across all queues.
   */
  clearAll() {
    for (const q of this.queues.values()) {
      if (typeof q.clear === 'function') q.clear();
    }
  }
}

const queueService = new QueueService();

module.exports = {
  QueueService,
  queueService,
  InMemoryJobQueue,
};
