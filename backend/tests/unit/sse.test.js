const jwt = require('jsonwebtoken');
const { SSEHub } = require('../../src/services/sse.service');
const { env } = require('../../src/config/env');

describe('SSE Hub with Auth on Connect & Backpressure Handling', () => {
  let hub;

  beforeEach(() => {
    hub = new SSEHub();
  });

  afterEach(() => {
    hub.closeAll();
  });

  it('rejects connection with 401 when token is missing', () => {
    const req = { query: {}, headers: {} };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    hub.handleConnection(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('Authentication required') })
    );
  });

  it('rejects connection with 401 when token is invalid', () => {
    const req = { query: { token: 'invalid_jwt_token' }, headers: {} };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    hub.handleConnection(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('accepts valid JWT, sets SSE headers, and streams handshake event', () => {
    const validToken = jwt.sign({ id: 42, role: 'customer' }, env.JWT_SECRET);
    const req = {
      query: { token: validToken },
      headers: {},
      on: jest.fn(),
    };
    const res = {
      writeHead: jest.fn(),
      write: jest.fn().mockReturnValue(true),
      on: jest.fn(),
      writable: true,
      writableEnded: false,
    };

    hub.handleConnection(req, res);

    expect(res.writeHead).toHaveBeenCalledWith(
      200,
      expect.objectContaining({
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      })
    );

    expect(res.write).toHaveBeenCalledWith(expect.stringContaining('event: connected'));
    expect(hub.getConnectionStats().totalConnections).toBe(1);
    expect(hub.getConnectionStats().authenticatedUsers).toBe(1);
  });

  it('routes user-targeted events specifically to that user connection', async () => {
    const tokenUser1 = jwt.sign({ id: 101 }, env.JWT_SECRET);
    const tokenUser2 = jwt.sign({ id: 102 }, env.JWT_SECRET);

    const client1 = {
      writeHead: jest.fn(),
      write: jest.fn().mockReturnValue(true),
      on: jest.fn(),
      writable: true,
      writableEnded: false,
    };
    const client2 = {
      writeHead: jest.fn(),
      write: jest.fn().mockReturnValue(true),
      on: jest.fn(),
      writable: true,
      writableEnded: false,
    };

    hub.handleConnection({ query: { token: tokenUser1 }, headers: {}, on: jest.fn() }, client1);
    hub.handleConnection({ query: { token: tokenUser2 }, headers: {}, on: jest.fn() }, client2);

    client1.write.mockClear();
    client2.write.mockClear();

    // Emit event targeted only to User 101
    await hub.emit({
      targetUserId: 101,
      eventName: 'order_status',
      data: { status: 'out_for_delivery' },
    });

    expect(client1.write).toHaveBeenCalledWith(expect.stringContaining('event: order_status'));
    expect(client2.write).not.toHaveBeenCalledWith(expect.stringContaining('event: order_status'));
  });

  it('authenticates via Bearer Authorization header', () => {
    const validToken = jwt.sign({ id: 50 }, env.JWT_SECRET);
    const req = {
      query: {},
      headers: { authorization: `Bearer ${validToken}` },
      on: jest.fn(),
    };
    const res = {
      writeHead: jest.fn(),
      write: jest.fn().mockReturnValue(true),
      on: jest.fn(),
      writable: true,
      writableEnded: false,
    };

    hub.handleConnection(req, res);
    expect(res.writeHead).toHaveBeenCalledWith(200, expect.any(Object));
  });

  it('authenticates via cookies.token', () => {
    const validToken = jwt.sign({ id: 60 }, env.JWT_SECRET);
    const req = {
      query: {},
      headers: {},
      cookies: { token: validToken },
      on: jest.fn(),
    };
    const res = {
      writeHead: jest.fn(),
      write: jest.fn().mockReturnValue(true),
      on: jest.fn(),
      writable: true,
      writableEnded: false,
    };

    hub.handleConnection(req, res);
    expect(res.writeHead).toHaveBeenCalledWith(200, expect.any(Object));
  });

  it('broadcasts event globally when targetUserId is null', async () => {
    const token = jwt.sign({ id: 70 }, env.JWT_SECRET);
    const client = {
      writeHead: jest.fn(),
      write: jest.fn().mockReturnValue(true),
      on: jest.fn(),
      writable: true,
      writableEnded: false,
    };
    hub.handleConnection({ query: { token }, headers: {}, on: jest.fn() }, client);
    client.write.mockClear();

    await hub.emit({
      targetUserId: null,
      eventName: 'announcement',
      data: { msg: 'Store wide sale!' },
    });

    expect(client.write).toHaveBeenCalledWith(expect.stringContaining('event: announcement'));
  });

  it('handles remote pubsub messages cleanly', () => {
    const spy = jest.spyOn(hub, '_dispatchLocal');
    hub._handleRemoteMessage(
      JSON.stringify({ targetUserId: 10, eventName: 'test_remote', data: { ok: true } })
    );
    expect(spy).toHaveBeenCalledWith(10, 'test_remote', { ok: true });

    // Handle invalid JSON gracefully
    hub._handleRemoteMessage('invalid json string');
  });

  it('stops heartbeat and closes all connections', () => {
    const client = {
      writeHead: jest.fn(),
      write: jest.fn(),
      end: jest.fn(),
      on: jest.fn(),
      writable: true,
      writableEnded: false,
    };
    hub.allClients.add(client);
    hub.stopHeartbeat();
    hub.closeAll();
    expect(client.end).toHaveBeenCalled();
  });

  it('triggers heartbeat ping and handles publish failure gracefully', async () => {
    const client = {
      writeHead: jest.fn(),
      write: jest.fn().mockReturnValue(true),
      writable: true,
      writableEnded: false,
    };
    hub.allClients.add(client);

    // Stop existing timer and run interval manually
    hub.stopHeartbeat();
    hub._startHeartbeat(10);
    await new Promise((r) => setTimeout(r, 25));
    hub.stopHeartbeat();

    expect(client.write).toHaveBeenCalledWith(':keep-alive\n\n');

    // Simulate pubClient.publish throwing
    hub.pubClient = {
      publish: jest.fn().mockRejectedValue(new Error('Redis offline')),
    };
    await hub.emit({ eventName: 'safe_fail', data: {} });
  });

  it('handles backpressure and flushes buffer upon drain event', () => {
    const token = jwt.sign({ id: 200 }, env.JWT_SECRET);
    let drainCallback;

    const res = {
      writeHead: jest.fn(),
      write: jest.fn(),
      on: jest.fn().mockImplementation((event, cb) => {
        if (event === 'drain') drainCallback = cb;
      }),
      writable: true,
      writableEnded: false,
    };

    hub.handleConnection({ query: { token }, headers: {}, on: jest.fn() }, res);

    // 1st write returns false -> message is buffered
    res.write.mockReturnValueOnce(false);
    hub._dispatchLocal(200, 'heavy_load_event', { chunk: 1 });

    // 2nd write: buffer is not empty -> pushes directly to buffer
    hub._dispatchLocal(200, 'heavy_load_event', { chunk: 2 });

    // Drain event fires -> buffer is emptied
    res.write.mockReturnValue(true);
    drainCallback();

    expect(res.write).toHaveBeenCalledWith(expect.stringContaining('heavy_load_event'));
  });

  it('safely handles null, invalid JSON, or non-object remote pubsub messages without crashing', () => {
    expect(() => {
      hub._handleRemoteMessage('null');
      hub._handleRemoteMessage(null);
      hub._handleRemoteMessage('undefined');
      hub._handleRemoteMessage('invalid json string');
      hub._handleRemoteMessage(42);
      hub._handleRemoteMessage(true);
    }).not.toThrow();
  });
});
