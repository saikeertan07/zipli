const { getLiveness, getReadiness } = require('../../src/controllers/health.controller');
const db = require('../../src/config/db');

describe('Health Liveness and Readiness Probes unit tests', () => {
  it('getLiveness returns 200 with UP status and process pid/uptime', () => {
    const req = {};
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    getLiveness(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'UP',
        uptime: expect.any(Number),
        pid: expect.any(Number),
      })
    );
  });

  it('getReadiness returns 200 READY when database is healthy', async () => {
    const req = {};
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    await getReadiness(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'READY',
        services: expect.objectContaining({ database: 'UP' }),
      })
    );
  });

  it('getReadiness returns 503 NOT_READY when database query fails', async () => {
    const req = {};
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    const querySpy = jest
      .spyOn(db, 'query')
      .mockRejectedValueOnce(new Error('Connection timed out'));

    await getReadiness(req, res);
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'NOT_READY',
        services: expect.objectContaining({ database: 'DOWN' }),
      })
    );

    querySpy.mockRestore();
  });
});
