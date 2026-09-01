const Redis = require('ioredis');
const { env } = require('./env');
const logger = require('../utils/logger');

let redisClient = null;
let pubClient = null;
let subClient = null;
let isConnected = false;

/**
 * Pure in-memory fallback store for environments without a live Redis instance.
 */
class InMemoryRedisAdapter {
  constructor() {
    this.store = new Map();
    this.ttls = new Map();
    this.subscribers = new Map();
    this.status = 'ready';
  }

  async get(key) {
    if (this._isExpired(key)) {
      this.del(key);
      return null;
    }
    const val = this.store.get(key);
    return val !== undefined ? val : null;
  }

  async set(key, value, ...args) {
    const isNx = args.some((a) => typeof a === 'string' && a.toUpperCase() === 'NX');
    const isXx = args.some((a) => typeof a === 'string' && a.toUpperCase() === 'XX');
    const exists = !this._isExpired(key) && this.store.has(key);

    if (isNx && exists) {
      return null;
    }
    if (isXx && !exists) {
      return null;
    }

    this.store.set(key, String(value));

    for (let i = 0; i < args.length; i++) {
      const arg = typeof args[i] === 'string' ? args[i].toUpperCase() : '';
      if (arg === 'EX' && typeof args[i + 1] === 'number') {
        this.ttls.set(key, Date.now() + args[i + 1] * 1000);
      } else if (arg === 'PX' && typeof args[i + 1] === 'number') {
        this.ttls.set(key, Date.now() + args[i + 1]);
      }
    }

    return 'OK';
  }

  async del(...keys) {
    let deleted = 0;
    for (const key of keys) {
      if (this.store.delete(key)) deleted++;
      this.ttls.delete(key);
    }
    return deleted;
  }

  async incrby(key, increment = 1) {
    const current = parseInt(await this.get(key), 10) || 0;
    const updated = current + Number(increment);
    this.store.set(key, String(updated));
    return updated;
  }

  async incr(key) {
    return this.incrby(key, 1);
  }

  async expire(key, seconds) {
    if (this.store.has(key)) {
      this.ttls.set(key, Date.now() + seconds * 1000);
      return 1;
    }
    return 0;
  }

  async publish(channel, message) {
    const handlers = this.subscribers.get(channel) || [];
    for (const handler of handlers) {
      try {
        handler(message, channel);
      } catch (err) {
        logger.error('InMemoryRedisAdapter subscriber error', { error: err.message });
      }
    }
    return handlers.length;
  }

  async subscribe(channel, handler) {
    if (!this.subscribers.has(channel)) {
      this.subscribers.set(channel, []);
    }
    this.subscribers.get(channel).push(handler);
    return 1;
  }

  async unsubscribe(channel, handler) {
    if (!this.subscribers.has(channel)) return 0;
    if (!handler) {
      this.subscribers.delete(channel);
      return 1;
    }
    const list = this.subscribers.get(channel).filter((h) => h !== handler);
    this.subscribers.set(channel, list);
    return 1;
  }

  async ping() {
    return 'PONG';
  }

  async flushall() {
    this.store.clear();
    this.ttls.clear();
    return 'OK';
  }

  async quit() {
    this.status = 'end';
    return 'OK';
  }

  disconnect() {
    this.status = 'end';
  }

  _isExpired(key) {
    const expiresAt = this.ttls.get(key);
    return expiresAt !== undefined && expiresAt <= Date.now();
  }
}

/**
 * Initializes or returns the shared Redis client.
 */
function getRedisClient() {
  if (redisClient) return redisClient;

  const redisUrl = env.REDIS_URL;
  if (!redisUrl) {
    redisClient = new InMemoryRedisAdapter();
    return redisClient;
  }

  try {
    redisClient = new Redis(redisUrl, {
      maxRetriesPerRequest: 1,
      retryStrategy(times) {
        if (times > 2) return null; // stop retrying to prevent connection hang
        return Math.min(times * 100, 1000);
      },
      lazyConnect: true,
      enableOfflineQueue: false,
    });

    redisClient.on('connect', () => {
      isConnected = true;
      logger.info('Connected to Redis server');
    });

    redisClient.on('error', (err) => {
      isConnected = false;
      logger.warn('Redis connection issue, fallback active', { message: err.message });
    });

    // Attempt initial connect without blocking startup
    redisClient.connect().catch(() => {
      isConnected = false;
    });
  } catch (err) {
    logger.warn('Failed to construct Redis client, using in-memory adapter', {
      message: err.message,
    });
    redisClient = new InMemoryRedisAdapter();
  }

  return redisClient;
}

/**
 * Creates Pub and Sub client pair for SSE and multi-instance fan-out.
 */
function getPubSubClients() {
  if (pubClient && subClient) {
    return { pubClient, subClient };
  }

  const client = getRedisClient();
  if (client instanceof InMemoryRedisAdapter) {
    pubClient = client;
    subClient = client;
    return { pubClient, subClient };
  }

  const redisUrl = env.REDIS_URL;
  try {
    pubClient = new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 1 });
    subClient = new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 1 });
    pubClient.connect().catch(() => {});
    subClient.connect().catch(() => {});
  } catch {
    pubClient = new InMemoryRedisAdapter();
    subClient = pubClient;
  }

  return { pubClient, subClient };
}

function isRedisReady() {
  if (!redisClient) return false;
  if (redisClient instanceof InMemoryRedisAdapter) return true;
  return isConnected && redisClient.status === 'ready';
}

async function closeRedis() {
  if (redisClient) {
    await redisClient.quit().catch(() => redisClient.disconnect());
    redisClient = null;
  }
  if (pubClient && !(pubClient instanceof InMemoryRedisAdapter)) {
    await pubClient.quit().catch(() => pubClient.disconnect());
    pubClient = null;
  }
  if (subClient && !(subClient instanceof InMemoryRedisAdapter)) {
    await subClient.quit().catch(() => subClient.disconnect());
    subClient = null;
  }
  isConnected = false;
}

module.exports = {
  getRedisClient,
  getPubSubClients,
  isRedisReady,
  closeRedis,
  InMemoryRedisAdapter,
};
