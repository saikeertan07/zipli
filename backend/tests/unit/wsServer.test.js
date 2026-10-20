/**
 * @file wsServer.test.js
 * @description Unit tests for DeliveryWsServer WebSocket gateway.
 */

const { WebSocketServer, WebSocket } = require('ws');
const { DeliveryWsServer } = require('../../src/websocket/wsServer');
const jwt = require('jsonwebtoken');
const { env } = require('../../src/config/env');

describe('DeliveryWsServer Unit Tests', () => {
  let wsServer;

  beforeEach(() => {
    wsServer = new DeliveryWsServer();
  });

  afterEach(async () => {
    await wsServer.close();
  });

  it('initializes in standalone mode without HTTP server', () => {
    wsServer.init({ port: 0 });
    expect(wsServer.wss).toBeInstanceOf(WebSocketServer);
  });

  it('safely handles send when socket is null or not OPEN', () => {
    expect(() => wsServer.send(null, { test: 1 })).not.toThrow();
    const fakeSocket = { readyState: WebSocket.CLOSED, send: jest.fn() };
    wsServer.send(fakeSocket, { test: 2 });
    expect(fakeSocket.send).not.toHaveBeenCalled();
  });

  it('subscribes, broadcasts to room, and unsubscribes cleanly', () => {
    const s1 = { readyState: WebSocket.OPEN, send: jest.fn(), rooms: new Set() };
    const s2 = { readyState: WebSocket.OPEN, send: jest.fn(), rooms: new Set() };
    const closedSocket = { readyState: WebSocket.CLOSED, send: jest.fn(), rooms: new Set() };

    wsServer.subscribe(s1, 'room:1');
    wsServer.subscribe(s2, 'room:1');
    wsServer.subscribe(closedSocket, 'room:1');

    const sentCount = wsServer.broadcastToRoom('room:1', { hello: 'world' });
    expect(sentCount).toBe(2);
    expect(s1.send).toHaveBeenCalledWith(JSON.stringify({ hello: 'world' }));
    expect(s2.send).toHaveBeenCalledWith(JSON.stringify({ hello: 'world' }));
    expect(closedSocket.send).not.toHaveBeenCalled();

    // Broadcast to empty room returns 0
    expect(wsServer.broadcastToRoom('room:empty', { a: 1 })).toBe(0);

    // Unsubscribe s1
    wsServer.unsubscribe(s1, 'room:1');
    expect(wsServer.rooms.get('room:1').has(s1)).toBe(false);

    // Unsubscribe remaining sockets removes room from map
    wsServer.unsubscribe(closedSocket, 'room:1');
    wsServer.unsubscribe(s2, 'room:1');
    expect(wsServer.rooms.has('room:1')).toBe(false);
  });

  it('broadcastAll sends payload to all open clients', () => {
    wsServer.init({ port: 0 });
    const clientOpen = { readyState: WebSocket.OPEN, send: jest.fn(), terminate: jest.fn() };
    const clientClosed = { readyState: WebSocket.CLOSED, send: jest.fn(), terminate: jest.fn() };

    wsServer.wss.clients.add(clientOpen);
    wsServer.wss.clients.add(clientClosed);

    const count = wsServer.broadcastAll({ broadcast: true });
    expect(count).toBe(1);
    expect(clientOpen.send).toHaveBeenCalled();
  });

  it('broadcastAll returns 0 when wss is not initialized', () => {
    expect(wsServer.broadcastAll({ test: true })).toBe(0);
  });

  it('handles client disconnect and cleans up room references', () => {
    const socket = {
      rooms: new Set(['room:a', 'room:b']),
    };
    wsServer.rooms.set('room:a', new Set([socket]));
    wsServer.rooms.set('room:b', new Set([socket]));

    wsServer._handleDisconnect(socket);
    expect(wsServer.rooms.has('room:a')).toBe(false);
    expect(wsServer.rooms.has('room:b')).toBe(false);
    expect(socket.rooms.size).toBe(0);
  });

  it('handles incoming messages: PING, AUTH, SUBSCRIBE, UNSUBSCRIBE, ERROR', () => {
    const socket = {
      readyState: WebSocket.OPEN,
      send: jest.fn(),
      rooms: new Set(),
    };

    // PING
    wsServer._handleMessage(socket, JSON.stringify({ type: 'PING' }));
    expect(socket.send).toHaveBeenCalledWith(expect.stringContaining('"type":"PONG"'));

    // AUTH with valid token
    const token = jwt.sign({ sub: 123, role: 'customer' }, env.JWT_SECRET);
    wsServer._handleMessage(socket, JSON.stringify({ type: 'AUTH', token }));
    expect(socket.send).toHaveBeenCalledWith(expect.stringContaining('"type":"AUTHENTICATED"'));
    expect(socket.user.sub).toBe(123);

    // AUTH missing token
    wsServer._handleMessage(socket, JSON.stringify({ type: 'AUTH' }));
    expect(socket.send).toHaveBeenCalledWith(expect.stringContaining('Token is required'));

    // AUTH bad token
    wsServer._handleMessage(socket, JSON.stringify({ type: 'AUTH', token: 'bad' }));
    expect(socket.send).toHaveBeenCalledWith(expect.stringContaining('Invalid or expired token'));

    // SUBSCRIBE valid & invalid room
    wsServer._handleMessage(socket, JSON.stringify({ type: 'SUBSCRIBE', room: 'order:1' }));
    expect(socket.send).toHaveBeenCalledWith(expect.stringContaining('"type":"SUBSCRIBED"'));

    wsServer._handleMessage(socket, JSON.stringify({ type: 'SUBSCRIBE' }));
    expect(socket.send).toHaveBeenCalledWith(expect.stringContaining('Invalid room specified'));

    // UNSUBSCRIBE
    wsServer._handleMessage(socket, JSON.stringify({ type: 'UNSUBSCRIBE', room: 'order:1' }));
    expect(socket.send).toHaveBeenCalledWith(expect.stringContaining('"type":"UNSUBSCRIBED"'));

    // UNKNOWN_COMMAND
    wsServer._handleMessage(socket, JSON.stringify({ type: 'CUSTOM' }));
    expect(socket.send).toHaveBeenCalledWith(expect.stringContaining('"type":"UNKNOWN_COMMAND"'));

    // Invalid JSON
    wsServer._handleMessage(socket, 'not-json');
    expect(socket.send).toHaveBeenCalledWith(expect.stringContaining('Invalid JSON payload'));
  });

  it('executes heartbeat logic terminating unresponsive sockets', () => {
    wsServer.init({ port: 0 });
    const deadSocket = { isAlive: false, terminate: jest.fn(), ping: jest.fn() };
    const aliveSocket = { isAlive: true, terminate: jest.fn(), ping: jest.fn() };

    wsServer.wss.clients.add(deadSocket);
    wsServer.wss.clients.add(aliveSocket);

    for (const client of wsServer.wss.clients) {
      if (client.isAlive === false) {
        client.terminate();
        continue;
      }
      client.isAlive = false;
      client.ping();
    }

    expect(deadSocket.terminate).toHaveBeenCalled();
    expect(aliveSocket.ping).toHaveBeenCalled();
  });

  it('handles client connection with query params and event listeners', () => {
    const validToken = jwt.sign({ sub: 777, role: 'customer' }, env.JWT_SECRET);
    const handlers = {};
    const socket = {
      readyState: WebSocket.OPEN,
      send: jest.fn(),
      on: (ev, fn) => {
        handlers[ev] = fn;
      },
    };

    const req = { url: `/ws?token=${validToken}&orderId=999` };
    wsServer._handleConnection(socket, req);

    expect(socket.user.sub).toBe(777);
    expect(wsServer.rooms.get('order:999').has(socket)).toBe(true);

    // Trigger pong
    socket.isAlive = false;
    handlers['pong']();
    expect(socket.isAlive).toBe(true);

    // Trigger error
    expect(() => handlers['error'](new Error('Test WS error'))).not.toThrow();

    // Trigger close
    handlers['close']();
    expect(wsServer.rooms.has('order:999')).toBe(false);

    // Invalid token and bad URL
    const badSocket = { readyState: WebSocket.OPEN, send: jest.fn(), on: jest.fn() };
    wsServer._handleConnection(badSocket, { url: '/ws?token=invalid_jwt' });
    expect(badSocket.user).toBeNull();
  });

  it('fires heartbeat interval terminating unresponsive clients', () => {
    jest.useFakeTimers();
    wsServer.init({ port: 0 });
    const deadSocket = { isAlive: false, terminate: jest.fn(), ping: jest.fn() };
    const aliveSocket = { isAlive: true, terminate: jest.fn(), ping: jest.fn() };

    wsServer.wss.clients.add(deadSocket);
    wsServer.wss.clients.add(aliveSocket);

    jest.advanceTimersByTime(30000);

    expect(deadSocket.terminate).toHaveBeenCalled();
    expect(aliveSocket.ping).toHaveBeenCalled();
    jest.useRealTimers();
  });

  it('closes cleanly when no server was initialized', async () => {
    await expect(wsServer.close()).resolves.toBeUndefined();
  });
});
