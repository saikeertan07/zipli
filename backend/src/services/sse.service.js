const jwt = require('jsonwebtoken');
const { env } = require('../config/env');
const { getPubSubClients } = require('../config/redis');
const logger = require('../utils/logger');

const REDIS_SSE_CHANNEL = 'zipli:sse_events';

class SSEHub {
  constructor() {
    this.clientsByUser = new Map(); // Map<number, Set<Response>>
    this.allClients = new Set(); // Set<Response>
    this.clientBuffers = new WeakMap(); // WeakMap<Response, Array<string>>
    this.heartbeatTimer = null;
    this.pubClient = null;
    this.subClient = null;
    this.isSubscribed = false;

    this._setupPubSub();
    this._startHeartbeat();
  }

  _setupPubSub() {
    try {
      const { pubClient, subClient } = getPubSubClients();
      this.pubClient = pubClient;
      this.subClient = subClient;

      if (this.subClient && typeof this.subClient.subscribe === 'function') {
        this.subClient.subscribe(REDIS_SSE_CHANNEL, (message) => {
          this._handleRemoteMessage(message);
        });
        this.isSubscribed = true;
      }
    } catch (err) {
      logger.warn('Failed to bind Redis pub/sub for SSE hub', { error: err.message });
    }
  }

  _handleRemoteMessage(message) {
    try {
      const payload = typeof message === 'string' ? JSON.parse(message) : message;
      if (!payload || typeof payload !== 'object') return;
      const { targetUserId, eventName, data } = payload;
      this._dispatchLocal(targetUserId, eventName, data);
    } catch (err) {
      logger.warn('Error parsing remote SSE pubsub message', { error: err.message });
    }
  }

  _startHeartbeat(intervalMs = 15000) {
    if (this.heartbeatTimer) return;
    this.heartbeatTimer = setInterval(() => {
      for (const res of this.allClients) {
        if (!res.writableEnded && res.writable) {
          res.write(':keep-alive\n\n');
        }
      }
    }, intervalMs);
    if (this.heartbeatTimer.unref) this.heartbeatTimer.unref();
  }

  stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * Express middleware/handler for SSE endpoint connection with authentication.
   */
  handleConnection(req, res) {
    // 1. Authenticate connection
    let token = req.query.token;
    if (!token && req.headers.authorization) {
      const parts = req.headers.authorization.split(' ');
      if (parts.length === 2 && parts[0] === 'Bearer') {
        token = parts[1];
      }
    }
    if (!token && req.cookies && req.cookies.token) {
      token = req.cookies.token;
    }

    if (!token) {
      return res.status(401).json({
        status: 'error',
        message:
          'Authentication required to establish SSE stream. Provide ?token= query parameter or Bearer header.',
      });
    }

    let user;
    try {
      user = jwt.verify(token, env.JWT_SECRET);
    } catch {
      return res.status(401).json({
        status: 'error',
        message: 'Invalid or expired SSE authentication token.',
      });
    }

    const userId = Number(user.id || user.userId || user.sub);

    // 2. Set SSE Headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    // Backpressure buffer queue
    this.clientBuffers.set(res, []);

    res.on('drain', () => {
      const buffer = this.clientBuffers.get(res);
      if (buffer && buffer.length > 0) {
        while (buffer.length > 0) {
          const msg = buffer.shift();
          const ok = res.write(msg);
          if (!ok) break;
        }
      }
    });

    // 3. Register client in user map and global set
    this.allClients.add(res);
    if (!this.clientsByUser.has(userId)) {
      this.clientsByUser.set(userId, new Set());
    }
    this.clientsByUser.get(userId).add(res);

    // 4. Send initial handshake
    this._writeMessage(res, 'connected', {
      userId,
      connectedAt: new Date().toISOString(),
      channels: [`user:${userId}`, 'broadcast'],
    });

    // 5. Cleanup on disconnect
    const cleanup = () => {
      this.allClients.delete(res);
      const userSet = this.clientsByUser.get(userId);
      if (userSet) {
        userSet.delete(res);
        if (userSet.size === 0) {
          this.clientsByUser.delete(userId);
        }
      }
      this.clientBuffers.delete(res);
    };

    req.on('close', cleanup);
    res.on('finish', cleanup);
  }

  /**
   * Dispatches an event locally to connected clients with backpressure buffering.
   */
  _dispatchLocal(targetUserId, eventName, data) {
    const formattedData = typeof data === 'object' ? JSON.stringify(data) : String(data);
    const message = `event: ${eventName}\ndata: ${formattedData}\n\n`;

    if (targetUserId) {
      const userClients = this.clientsByUser.get(Number(targetUserId));
      if (userClients) {
        for (const res of userClients) {
          this._safeWrite(res, message);
        }
      }
    } else {
      // Global broadcast
      for (const res of this.allClients) {
        this._safeWrite(res, message);
      }
    }
  }

  _safeWrite(res, message) {
    if (res.writableEnded || !res.writable) return;

    const buffer = this.clientBuffers.get(res);
    if (buffer && buffer.length > 0) {
      buffer.push(message);
      return;
    }

    const canContinue = res.write(message);
    if (!canContinue && buffer) {
      buffer.push(message);
    }
  }

  _writeMessage(res, eventName, data) {
    const formattedData = typeof data === 'object' ? JSON.stringify(data) : String(data);
    res.write(`event: ${eventName}\ndata: ${formattedData}\n\n`);
  }

  /**
   * Broadcasts or sends targeted event across all cluster instances via Redis Pub/Sub.
   *
   * @param {Object} options
   * @param {number|null} [options.targetUserId=null] - Specific user ID or null for broadcast
   * @param {string} options.eventName - Name of the SSE event
   * @param {*} options.data - Payload object
   */
  async emit(options) {
    const { targetUserId = null, eventName, data } = options;

    // Send locally
    this._dispatchLocal(targetUserId, eventName, data);

    // Publish to Redis for multi-instance fan-out
    if (this.pubClient && typeof this.pubClient.publish === 'function') {
      try {
        const payload = JSON.stringify({ targetUserId, eventName, data });
        await this.pubClient.publish(REDIS_SSE_CHANNEL, payload);
      } catch (err) {
        logger.warn('Failed to publish SSE event to Redis', { error: err.message });
      }
    }
  }

  getConnectionStats() {
    return {
      totalConnections: this.allClients.size,
      authenticatedUsers: this.clientsByUser.size,
    };
  }

  closeAll() {
    this.stopHeartbeat();
    for (const res of this.allClients) {
      try {
        res.end();
      } catch {}
    }
    this.allClients.clear();
    this.clientsByUser.clear();
  }
}

const sseHub = new SSEHub();

module.exports = {
  SSEHub,
  sseHub,
  REDIS_SSE_CHANNEL,
};
