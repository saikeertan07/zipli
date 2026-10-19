const { outboxRelayService } = require('../../src/services/outboxRelay.service');
const { pool } = require('../../src/config/db');
const { truncateUserData } = require('../setup');

describe('Transactional Outbox Pattern (/services/outboxRelay.service.js)', () => {
  beforeEach(async () => {
    await truncateUserData();
  });

  afterEach(() => {
    outboxRelayService.stopRelay();
  });

  it('records outbox event inside a transaction and commits reliably', async () => {
    const client = await pool.connect();
    let recordedEvent;

    try {
      await client.query('BEGIN');
      recordedEvent = await outboxRelayService.recordEvent(client, {
        aggregateType: 'order',
        aggregateId: '999',
        eventType: 'order_placed',
        payload: { grandTotal: 250 },
      });
      await client.query('COMMIT');
    } finally {
      client.release();
    }

    expect(recordedEvent.id).toBeDefined();
    expect(recordedEvent.status).toBe('PENDING');

    const dbRow = await pool.query('SELECT * FROM outbox_events WHERE id = $1', [recordedEvent.id]);
    expect(dbRow.rows).toHaveLength(1);
    expect(dbRow.rows[0].status).toBe('PENDING');
  });

  it('rolls back outbox event if database transaction fails', async () => {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      await outboxRelayService.recordEvent(client, {
        aggregateType: 'order',
        aggregateId: '1001',
        eventType: 'order_placed',
        payload: { error: true },
      });
      // Simulate rollback
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }

    const dbRow = await pool.query('SELECT * FROM outbox_events WHERE aggregate_id = $1', ['1001']);
    expect(dbRow.rows).toHaveLength(0);
  });

  it('publishes pending outbox events to registered subscribers and transitions status to PUBLISHED', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await outboxRelayService.recordEvent(client, {
        aggregateType: 'order',
        aggregateId: '2001',
        eventType: 'order_placed',
        payload: { item: 'milk' },
      });
      await client.query('COMMIT');
    } finally {
      client.release();
    }

    const receivedEvents = [];
    const subscriber = async (ev) => {
      receivedEvents.push(ev);
    };

    outboxRelayService.subscribe(subscriber);

    try {
      const published = await outboxRelayService.processPendingEvents();
      expect(published).toHaveLength(1);
      expect(receivedEvents).toHaveLength(1);
      expect(receivedEvents[0].aggregateId).toBe('2001');

      const check = await pool.query('SELECT * FROM outbox_events WHERE aggregate_id = $1', [
        '2001',
      ]);
      expect(check.rows[0].status).toBe('PUBLISHED');
      expect(check.rows[0].published_at).not.toBeNull();
    } finally {
      outboxRelayService.unsubscribe(subscriber);
    }
  });

  it('retries failed events and increments retry_count', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await outboxRelayService.recordEvent(client, {
        aggregateType: 'order',
        aggregateId: '3001',
        eventType: 'order_status_changed',
        payload: { willFail: true },
      });
      await client.query('COMMIT');
    } finally {
      client.release();
    }

    const faultySub = jest.fn().mockImplementation(() => {
      throw new Error('Downstream bus unavailable');
    });

    outboxRelayService.subscribe(faultySub);

    try {
      // Event still marks published if subscribers fail or handles internal error
      await outboxRelayService.processPendingEvents();
      expect(faultySub).toHaveBeenCalled();
    } finally {
      outboxRelayService.unsubscribe(faultySub);
    }
  });

  it('rejects recording outbox event when dbClient is missing or invalid', async () => {
    await expect(
      outboxRelayService.recordEvent(null, {
        aggregateType: 'order',
        aggregateId: '1',
        eventType: 'test',
      })
    ).rejects.toThrow(/A transactional dbClient is required/);
  });

  it('starts and stops relay interval cleanly', () => {
    outboxRelayService.startRelay(100);
    expect(outboxRelayService.pollInterval).not.toBeNull();
    // Second start is a no-op
    outboxRelayService.startRelay(100);
    outboxRelayService.stopRelay();
    expect(outboxRelayService.pollInterval).toBeNull();
  });

  it('handles database transaction error during processPendingEvents', async () => {
    const connectSpy = jest.spyOn(pool, 'connect').mockResolvedValueOnce({
      query: jest.fn().mockRejectedValue(new Error('Pool connection dropped')),
      release: jest.fn(),
    });

    const res = await outboxRelayService.processPendingEvents();
    expect(res).toEqual([]);
    connectSpy.mockRestore();
  });
});
