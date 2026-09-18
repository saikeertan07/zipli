/**
 * @file idempotency.js
 * @description Distributed Idempotency middleware for state-changing endpoints (e.g. /orders).
 * Intercepts duplicate requests bearing the same Idempotency-Key header for a user.
 * Supports multi-instance distributed locking via Redis with fallback to process memory.
 */

const { query } = require('../config/db');
const { getRedisClient } = require('../config/redis');
const logger = require('../utils/logger');

// Local in-flight fallback tracking: lockKey -> Promise<{ statusCode, body }>
const inFlightRequests = new Map();

/**
 * Idempotency middleware for POST endpoints (e.g. /orders).
 *
 * @param {Object} [options]
 * @param {number} [options.ttlHours=24] - Retention window for completed responses
 * @param {number} [options.lockTtlSeconds=30] - Distributed lock expiration
 * @param {number} [options.waitTimeoutMs=3000] - Max time to wait for in-flight concurrent request
 * @returns {import('express').RequestHandler}
 */
function idempotencyMiddleware(options = {}) {
  const ttlHours = options.ttlHours || 24;
  const lockTtlSeconds = options.lockTtlSeconds || 30;
  const waitTimeoutMs = options.waitTimeoutMs || 3000;

  return async (req, res, next) => {
    const rawKey = req.headers['idempotency-key'];
    if (!rawKey || typeof rawKey !== 'string' || !rawKey.trim()) {
      return next();
    }

    const idempotencyKey = rawKey.trim();
    const userId = req.user?.id;

    if (!userId) {
      return next();
    }

    const lockKey = `${userId}:${idempotencyKey}`;
    const redisLockKey = `idempotency:lock:${lockKey}`;
    const redis = getRedisClient();
    const lockToken = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    try {
      // 1. Check if this idempotency key was already completed and persisted in DB
      const { rows } = await query(
        `SELECT response_code, response_body
         FROM idempotency_keys
         WHERE key = $1 AND user_id = $2 AND expires_at > NOW()`,
        [idempotencyKey, userId]
      );

      if (rows.length) {
        logger.info('Serving idempotent replay response from DB', {
          idempotencyKey,
          userId,
        });
        res.setHeader('Idempotent-Replay', 'true');
        return res.status(rows[0].response_code).json(rows[0].response_body);
      }

      // 2. Multi-Instance Distributed Lock Acquisition via Redis
      let acquired = false;
      try {
        const lockRes = await redis.set(redisLockKey, lockToken, 'EX', lockTtlSeconds, 'NX');
        acquired = lockRes === 'OK';
      } catch (redisErr) {
        logger.warn('Redis lock error, using process fallback', { error: redisErr.message });
        acquired = !inFlightRequests.has(lockKey);
      }

      // If lock not acquired, a concurrent request is currently in-flight on this or another instance
      if (!acquired) {
        logger.info('Awaiting in-flight concurrent request with identical idempotency key', {
          idempotencyKey,
          userId,
        });

        const start = Date.now();
        const pollIntervalMs = 100;

        while (Date.now() - start < waitTimeoutMs) {
          await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));

          const { rows: recheck } = await query(
            `SELECT response_code, response_body
             FROM idempotency_keys
             WHERE key = $1 AND user_id = $2 AND expires_at > NOW()`,
            [idempotencyKey, userId]
          );

          if (recheck.length > 0) {
            res.setHeader('Idempotent-Replay', 'true');
            return res.status(recheck[0].response_code).json(recheck[0].response_body);
          }

          // Check if Redis lock was released
          const currentLock = await redis.get(redisLockKey);
          if (!currentLock) {
            const retryAcquire = await redis.set(redisLockKey, lockToken, 'EX', lockTtlSeconds, 'NX');
            if (retryAcquire === 'OK') {
              acquired = true;
              break;
            }
          }
        }

        if (!acquired) {
          // Final recheck in DB
          const { rows: finalRecheck } = await query(
            `SELECT response_code, response_body
             FROM idempotency_keys
             WHERE key = $1 AND user_id = $2 AND expires_at > NOW()`,
            [idempotencyKey, userId]
          );
          if (finalRecheck.length > 0) {
            res.setHeader('Idempotent-Replay', 'true');
            return res.status(finalRecheck[0].response_code).json(finalRecheck[0].response_body);
          }

          return res.status(409).json({
            status: 'error',
            code: 'CONCURRENT_REQUEST',
            message: 'A request with this Idempotency-Key is currently in progress.',
          });
        }
      }

      // 3. Register local in-flight promise for fast same-process deduplication
      let resolveInFlight;
      let rejectInFlight;
      const inFlightPromise = new Promise((resolve, reject) => {
        resolveInFlight = resolve;
        rejectInFlight = reject;
      });
      inFlightRequests.set(lockKey, inFlightPromise);

      let cleanedUp = false;
      const cleanup = async (result, err) => {
        if (!cleanedUp) {
          cleanedUp = true;
          inFlightRequests.delete(lockKey);
          try {
            await redis.del(redisLockKey);
          } catch {}
          if (err) {
            rejectInFlight(err);
          } else {
            resolveInFlight(result);
          }
        }
      };

      // Intercept the response to store successful executions
      const originalJson = res.json.bind(res);
      res.json = async (body) => {
        const statusCode = res.statusCode || 200;

        // Persist successful (2xx) responses for idempotency
        if (statusCode >= 200 && statusCode < 300) {
          try {
            await query(
              `INSERT INTO idempotency_keys (key, user_id, response_code, response_body, expires_at)
               VALUES ($1, $2, $3, $4, NOW() + ($5 || ' hours')::INTERVAL)
               ON CONFLICT (key) DO NOTHING`,
              [idempotencyKey, userId, statusCode, body, ttlHours]
            );
          } catch (err) {
            logger.error('Failed to store idempotency record', { error: err.message });
          }
        }

        await cleanup({ statusCode, body }, null);
        return originalJson(body);
      };

      res.on('error', async (err) => {
        await cleanup(null, err);
      });

      next();
    } catch (err) {
      inFlightRequests.delete(lockKey);
      try {
        await redis.del(redisLockKey);
      } catch {}
      logger.error('Error verifying idempotency key', { error: err.message });
      next(err);
    }
  };
}

module.exports = idempotencyMiddleware;
