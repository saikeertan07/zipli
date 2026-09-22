const { pool } = require('../config/db');
const logger = require('../utils/logger');

class OutboxRelayService {
  constructor() {
    this.subscribers = new Set();
    this.pollInterval = null;
    this.isProcessing = false;
  }

  /**
   * Registers an event subscriber (e.g. SSE Hub, NotificationService, Audit Log).
   * @param {Function} handler - async (event) => void
   */
  subscribe(handler) {
    if (typeof handler === 'function') {
      this.subscribers.add(handler);
    }
  }

  unsubscribe(handler) {
    this.subscribers.delete(handler);
  }

  /**
   * Inserts an outbox event inside an existing database transaction client.
   *
   * @param {Object} dbClient - PostgreSQL transaction client
   * @param {Object} event
   * @param {string} event.aggregateType - 'order' | 'stock' | 'user'
   * @param {string|number} event.aggregateId - Aggregate entity ID
   * @param {string} event.eventType - 'order_placed' | 'order_status_changed' | etc.
   * @param {Object} [event.payload={}] - Event payload data
   * @returns {Promise<Object>}
   */
  async recordEvent(dbClient, { aggregateType, aggregateId, eventType, payload = {} }) {
    if (!dbClient || typeof dbClient.query !== 'function') {
      throw new Error('A transactional dbClient is required to record outbox events');
    }

    const res = await dbClient.query(
      `INSERT INTO outbox_events
         (aggregate_type, aggregate_id, event_type, payload, status, created_at)
       VALUES
         ($1, $2, $3, $4, 'PENDING', NOW())
       RETURNING id, aggregate_type, aggregate_id, event_type, payload, status, created_at`,
      [aggregateType, String(aggregateId), eventType, JSON.stringify(payload)]
    );

    return res.rows[0];
  }

  /**
   * Scans and relays pending outbox events reliably with SKIP LOCKED.
   * @param {number} [limit=50]
   * @returns {Promise<Array>} Array of successfully published events
   */
  async processPendingEvents(limit = 50) {
    if (this.isProcessing) return [];
    this.isProcessing = true;

    const client = await pool.connect();
    const published = [];

    try {
      await client.query('BEGIN');

      const res = await client.query(
        `SELECT id, aggregate_type, aggregate_id, event_type, payload, retry_count
         FROM outbox_events
         WHERE status = 'PENDING'
         ORDER BY created_at ASC
         LIMIT $1
         FOR UPDATE SKIP LOCKED`,
        [limit]
      );

      for (const row of res.rows) {
        try {
          const event = {
            id: row.id,
            aggregateType: row.aggregate_type,
            aggregateId: row.aggregate_id,
            eventType: row.event_type,
            payload: typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload,
          };

          // Broadcast to all registered in-process subscribers
          for (const sub of this.subscribers) {
            try {
              await sub(event);
            } catch (err) {
              logger.warn('Error in outbox subscriber', { error: err.message, eventId: row.id });
            }
          }

          // Mark event as PUBLISHED
          await client.query(
            `UPDATE outbox_events
             SET status = 'PUBLISHED', published_at = NOW()
             WHERE id = $1`,
            [row.id]
          );

          published.push(event);
        } catch (err) {
          await client.query(
            `UPDATE outbox_events
             SET retry_count = retry_count + 1,
                 error_message = $2,
                 status = CASE WHEN retry_count + 1 >= 5 THEN 'FAILED' ELSE 'PENDING' END
             WHERE id = $1`,
            [row.id, err.message]
          );
        }
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      logger.error('Outbox relay processing error', { error: err.message });
    } finally {
      client.release();
      this.isProcessing = false;
    }

    return published;
  }

  /**
   * Starts a background relay polling timer.
   * @param {number} [intervalMs=5000]
   */
  startRelay(intervalMs = 5000) {
    if (this.pollInterval) return;
    this.pollInterval = setInterval(() => {
      this.processPendingEvents().catch(() => {});
    }, intervalMs);
    // Don't prevent process from exiting
    if (this.pollInterval.unref) this.pollInterval.unref();
  }

  /**
   * Stops the background relay.
   */
  stopRelay() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }
}

const outboxRelayService = new OutboxRelayService();

module.exports = {
  OutboxRelayService,
  outboxRelayService,
};
