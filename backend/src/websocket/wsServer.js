/**
 * @file wsServer.js
 * @description Native WebSocket server for real-time delivery tracking, room-based pub/sub,
 * JWT authentication, and connection heartbeat.
 */

const { WebSocketServer, WebSocket } = require('ws');
const jwt = require('jsonwebtoken');

const { env } = require('../config/env');
const logger = require('../utils/logger');

class DeliveryWsServer {
  constructor() {
    this.wss = null;
    this.rooms = new Map(); // roomName -> Set<WebSocket>
    this.heartbeatInterval = null;
  }

  /**
   * Initializes WebSocket server attached to an HTTP server or on custom port/options.
   * @param {import('http').Server|Object} serverOrOptions
   * @returns {DeliveryWsServer}
   */
  init(serverOrOptions) {
    const isServer =
      serverOrOptions && typeof serverOrOptions.on === 'function' && !serverOrOptions.noServer;
    const wssOptions = isServer
      ? { server: serverOrOptions, path: '/ws' }
      : { ...(serverOrOptions || { noServer: true }) };

    this.wss = new WebSocketServer(wssOptions);

    this.wss.on('connection', (socket, req) => {
      this._handleConnection(socket, req);
    });

    // Start 30s heartbeat check
    this.heartbeatInterval = setInterval(() => {
      if (!this.wss) return;
      for (const client of this.wss.clients) {
        if (client.isAlive === false) {
          client.terminate();
          continue;
        }
        client.isAlive = false;
        client.ping();
      }
    }, 30000);

    // Unref heartbeat so it doesn't prevent Node process from terminating during tests
    if (this.heartbeatInterval.unref) {
      this.heartbeatInterval.unref();
    }

    logger.info('WebSocket delivery tracking gateway initialized');
    return this;
  }

  /**
   * Internal connection lifecycle handler.
   * @param {WebSocket} socket
   * @param {import('http').IncomingMessage} [req]
   * @private
   */
  _handleConnection(socket, req) {
    socket.isAlive = true;
    socket.rooms = new Set();
    socket.user = null;

    socket.on('pong', () => {
      socket.isAlive = true;
    });

    // Parse query params if available
    if (req && req.url) {
      try {
        const parsed = new URL(req.url, 'http://localhost');
        const token = parsed.searchParams.get('token');
        if (token) {
          try {
            socket.user = jwt.verify(token, env.JWT_SECRET);
          } catch (_err) {
            // Invalid token in query string
          }
        }
        // Auto-subscribe to order room if requested in query param ?orderId=123
        const autoOrder = parsed.searchParams.get('orderId');
        if (autoOrder) {
          this.subscribe(socket, `order:${autoOrder}`);
        }
      } catch (_e) {
        // Ignored URL parsing error
      }
    }

    socket.on('message', (raw) => {
      this._handleMessage(socket, raw);
    });

    socket.on('close', () => {
      this._handleDisconnect(socket);
    });

    socket.on('error', (err) => {
      logger.warn('WebSocket client error', { error: err.message });
    });

    // Send connection greeting
    this.send(socket, {
      type: 'CONNECTED',
      message: 'Connected to Zipli Real-Time Delivery Tracking Gateway',
      authenticated: Boolean(socket.user),
    });
  }

  /**
   * Internal message dispatcher.
   * @param {WebSocket} socket
   * @param {string|Buffer} raw
   * @private
   */
  _handleMessage(socket, raw) {
    try {
      const msg = JSON.parse(raw.toString());
      const type = (msg && msg.type) || '';

      switch (type) {
        case 'PING': {
          this.send(socket, { type: 'PONG', timestamp: Date.now() });
          break;
        }

        case 'AUTH': {
          if (!msg.token) {
            this.send(socket, { type: 'AUTH_ERROR', message: 'Token is required' });
            return;
          }
          try {
            const payload = jwt.verify(msg.token, env.JWT_SECRET);
            socket.user = payload;
            this.send(socket, {
              type: 'AUTHENTICATED',
              userId: payload.sub,
              role: payload.role,
            });
          } catch (_err) {
            this.send(socket, { type: 'AUTH_ERROR', message: 'Invalid or expired token' });
          }
          break;
        }

        case 'SUBSCRIBE': {
          const room = msg.room;
          if (!room || typeof room !== 'string') {
            this.send(socket, { type: 'ERROR', message: 'Invalid room specified' });
            return;
          }
          this.subscribe(socket, room);
          this.send(socket, { type: 'SUBSCRIBED', room });
          break;
        }

        case 'UNSUBSCRIBE': {
          const room = msg.room;
          if (room) {
            this.unsubscribe(socket, room);
            this.send(socket, { type: 'UNSUBSCRIBED', room });
          }
          break;
        }

        default: {
          this.send(socket, { type: 'UNKNOWN_COMMAND', command: type });
          break;
        }
      }
    } catch (_err) {
      this.send(socket, { type: 'ERROR', message: 'Invalid JSON payload' });
    }
  }

  /**
   * Subscribes a socket to a named room.
   * @param {WebSocket} socket
   * @param {string} room
   */
  subscribe(socket, room) {
    if (!this.rooms.has(room)) {
      this.rooms.set(room, new Set());
    }
    this.rooms.get(room).add(socket);
    socket.rooms.add(room);
  }

  /**
   * Unsubscribes a socket from a room.
   * @param {WebSocket} socket
   * @param {string} room
   */
  unsubscribe(socket, room) {
    const roomSet = this.rooms.get(room);
    if (roomSet) {
      roomSet.delete(socket);
      if (roomSet.size === 0) {
        this.rooms.delete(room);
      }
    }
    socket.rooms.delete(room);
  }

  /**
   * Cleans up room subscriptions when a client disconnects.
   * @param {WebSocket} socket
   * @private
   */
  _handleDisconnect(socket) {
    if (socket.rooms) {
      for (const room of socket.rooms) {
        const roomSet = this.rooms.get(room);
        if (roomSet) {
          roomSet.delete(socket);
          if (roomSet.size === 0) {
            this.rooms.delete(room);
          }
        }
      }
      socket.rooms.clear();
    }
  }

  /**
   * Sends JSON message to a single socket safely.
   * @param {WebSocket} socket
   * @param {Object} data
   */
  send(socket, data) {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(data));
    }
  }

  /**
   * Broadcasts data to all sockets subscribed to a specific room.
   * @param {string} room
   * @param {Object} data
   * @returns {number} Count of sockets messaged
   */
  broadcastToRoom(room, data) {
    const roomSet = this.rooms.get(room);
    if (!roomSet || roomSet.size === 0) return 0;

    const payload = JSON.stringify(data);
    let count = 0;
    for (const socket of roomSet) {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(payload);
        count++;
      }
    }
    return count;
  }

  /**
   * Broadcasts to all connected clients.
   * @param {Object} data
   * @returns {number}
   */
  broadcastAll(data) {
    if (!this.wss) return 0;
    const payload = JSON.stringify(data);
    let count = 0;
    for (const client of this.wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
        count++;
      }
    }
    return count;
  }

  /**
   * Closes the server and releases all resources.
   * @returns {Promise<void>}
   */
  close() {
    return new Promise((resolve) => {
      if (this.heartbeatInterval) {
        clearInterval(this.heartbeatInterval);
        this.heartbeatInterval = null;
      }
      if (this.wss) {
        for (const client of this.wss.clients) {
          if (typeof client.terminate === 'function') {
            client.terminate();
          }
        }
        this.wss.close(() => {
          this.rooms.clear();
          this.wss = null;
          resolve();
        });
      } else {
        this.rooms.clear();
        resolve();
      }
    });
  }
}

const wsGateway = new DeliveryWsServer();

module.exports = {
  DeliveryWsServer,
  wsGateway,
};
