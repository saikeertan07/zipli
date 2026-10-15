const { query, pool, getPoolStats } = require('../../src/config/db');
const logger = require('../../src/utils/logger');

describe('Database Connection Pool Tuning & Slow Query Logger', () => {
  it('logs slow queries when execution duration exceeds SLOW_QUERY_THRESHOLD_MS', async () => {
    const warnSpy = jest.spyOn(logger, 'warn');
    // pg_sleep(0.22) pauses for 220ms which exceeds the 200ms threshold
    await query('SELECT pg_sleep(0.22)');

    expect(warnSpy).toHaveBeenCalledWith(
      'Slow PostgreSQL Query detected',
      expect.objectContaining({
        duration: expect.any(Number),
      })
    );
    warnSpy.mockRestore();
  });

  it('logs query failures and rethrows error', async () => {
    const errorSpy = jest.spyOn(logger, 'error');
    await expect(query('SELECT * FROM non_existent_table_99999')).rejects.toThrow();

    expect(errorSpy).toHaveBeenCalledWith(
      'PostgreSQL query execution failed',
      expect.objectContaining({
        error: expect.any(String),
      })
    );
    errorSpy.mockRestore();
  });

  it('returns connection pool statistics', () => {
    const stats = getPoolStats();
    expect(stats.max).toBe(25);
    expect(stats.total).toBeDefined();
    expect(stats.idle).toBeDefined();
  });

  it('logs errors on idle PostgreSQL clients via pool error event', () => {
    const errorSpy = jest.spyOn(logger, 'error');
    pool.emit('error', new Error('Idle client dropped'));
    expect(errorSpy).toHaveBeenCalledWith(
      'Unexpected error on idle PostgreSQL client',
      expect.objectContaining({ error: 'Idle client dropped' })
    );
    errorSpy.mockRestore();
  });

  it('pricingService rejects invalid product ID', async () => {
    const pricingService = require('../../src/services/pricing.service');
    await expect(pricingService.calculateDynamicProductPrice(null)).rejects.toThrow(
      /Valid product ID is required/
    );
  });

  it('deliveryIntelligenceController rejects missing start or target', async () => {
    const deliveryIntelligenceController = require('../../src/controllers/deliveryIntelligence.controller');
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    await deliveryIntelligenceController.calculateRoute({ body: {} }, res);
    expect(res.status).toHaveBeenCalledWith(400);

    await deliveryIntelligenceController.matchOrders({ body: {} }, res);
    expect(res.status).toHaveBeenCalledWith(400);

    await deliveryIntelligenceController.optimizeBatch({ body: {} }, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});
