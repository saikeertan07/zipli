/**
 * @file conversationStore.js
 * @description Server-side conversation store for Zipli AI Gateway (P0).
 * Stores conversation turns in Redis with 1-hour TTL, falling back to an in-memory LRU map.
 * Generates cryptographically secure conversation IDs (UUIDv4).
 */

const crypto = require('crypto');
const { getRedisClient } = require('../config/redis');
const logger = require('../utils/logger');

const IN_MEMORY_CONVERSATIONS = new Map();
const IN_MEMORY_METADATA = new Map();
const MAX_TURNS = 10;
const TTL_SECONDS = 3600; // 1 hour

class ConversationStore {
  /**
   * Generates a cryptographically secure conversation ID.
   * @returns {string} e.g. "conv_3b9e4a6a-7b3c-4e89-a212-..."
   */
  generateId() {
    return `conv_${crypto.randomUUID()}`;
  }

  /**
   * Retrieves conversation history by ID.
   * @param {string} conversationId
   * @returns {Promise<Array<{role: 'user'|'assistant', content: string, timestamp: string}>>}
   */
  async getHistory(conversationId) {
    if (!conversationId) return [];

    try {
      const redis = getRedisClient();
      if (redis) {
        const raw = await redis.get(`ai:conv:${conversationId}`);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) return parsed;
        }
      }
    } catch (err) {
      logger.warn('Failed to read conversation from Redis, checking in-memory fallback', {
        error: err.message,
      });
    }

    const mem = IN_MEMORY_CONVERSATIONS.get(conversationId);
    return mem ? mem.turns : [];
  }

  /**
   * Appends turns to an existing or new conversation and saves with TTL.
   * @param {string} conversationId
   * @param {Array<{role: 'user'|'assistant', content: string}>} newTurns
   * @returns {Promise<string>} conversationId
   */
  async appendTurns(conversationId, newTurns) {
    const id = conversationId || this.generateId();
    const existing = await this.getHistory(id);

    const merged = [...existing, ...newTurns].slice(-MAX_TURNS);

    try {
      const redis = getRedisClient();
      if (redis) {
        await redis.set(`ai:conv:${id}`, JSON.stringify(merged), 'EX', TTL_SECONDS);
        return id;
      }
    } catch (err) {
      logger.warn('Failed to write conversation to Redis, using in-memory store', {
        error: err.message,
      });
    }

    // In-memory fallback
    if (IN_MEMORY_CONVERSATIONS.size > 2000) {
      const oldest = IN_MEMORY_CONVERSATIONS.keys().next().value;
      IN_MEMORY_CONVERSATIONS.delete(oldest);
    }

    IN_MEMORY_CONVERSATIONS.set(id, {
      turns: merged,
      expiresAt: Date.now() + TTL_SECONDS * 1000,
    });

    return id;
  }

  /**
   * Records execution metadata for an assistant turn keyed by messageId.
   *
   * @param {string} messageId
   * @param {Object} metadata
   * @param {string} [metadata.conversationId]
   * @param {string} [metadata.provider]
   * @param {number} [metadata.latencyMs]
   * @param {number} [metadata.tokensUsed]
   * @param {Array<string>} [metadata.toolNames]
   */
  async recordMessageMetadata(messageId, metadata) {
    if (!messageId) return;

    try {
      const redis = getRedisClient();
      if (redis) {
        await redis.set(`ai:msg:${messageId}`, JSON.stringify(metadata), 'EX', TTL_SECONDS);
        return;
      }
    } catch (err) {
      logger.warn('Failed to record message metadata in Redis', { error: err.message });
    }

    if (IN_MEMORY_METADATA.size > 2000) {
      const oldest = IN_MEMORY_METADATA.keys().next().value;
      IN_MEMORY_METADATA.delete(oldest);
    }
    IN_MEMORY_METADATA.set(messageId, {
      ...metadata,
      expiresAt: Date.now() + TTL_SECONDS * 1000,
    });
  }

  /**
   * Retrieves turn metadata by messageId.
   *
   * @param {string} messageId
   * @returns {Promise<Object|null>}
   */
  async getMessageMetadata(messageId) {
    if (!messageId) return null;

    try {
      const redis = getRedisClient();
      if (redis) {
        const raw = await redis.get(`ai:msg:${messageId}`);
        if (raw) return JSON.parse(raw);
      }
    } catch (err) {
      logger.warn('Failed to get message metadata from Redis', { error: err.message });
    }

    const mem = IN_MEMORY_METADATA.get(messageId);
    return mem || null;
  }

  /**
   * Clears all in-memory conversations (for testing).
   */
  clear() {
    IN_MEMORY_CONVERSATIONS.clear();
    IN_MEMORY_METADATA.clear();
  }
}

const conversationStore = new ConversationStore();

module.exports = {
  ConversationStore,
  conversationStore,
  MAX_TURNS,
  TTL_SECONDS,
};
