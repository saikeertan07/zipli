const {
  getQueueStats,
  getQueueJobs,
  retryDeadLetterJob,
  dispatchManualJob,
} = require('../../src/controllers/queue.controller');
const { queueService } = require('../../src/services/queue.service');

describe('Queue Controller unit tests', () => {
  it('returns queue dashboard statistics', async () => {
    const req = {};
    const res = {
      json: jest.fn(),
    };
    await getQueueStats(req, res);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'success',
        data: expect.any(Object),
      })
    );
  });

  it('lists queue jobs for a given queue', async () => {
    const req = {
      params: { queueName: 'zipli_system' },
      query: { status: 'waiting' },
    };
    const res = {
      json: jest.fn(),
    };
    await getQueueJobs(req, res);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'success',
        results: expect.any(Number),
        data: { jobs: expect.any(Array) },
      })
    );
  });

  it('retries a dead-letter job from DLQ', async () => {
    const queue = queueService.getQueue('zipli_system');
    // Seed a job in DLQ
    const dlqJob = {
      id: 'test_dlq_job_1',
      name: 'send_notification',
      data: {},
      attemptsMade: 3,
      status: 'failed',
    };
    queue.dlq.push(dlqJob);

    const req = {
      params: { queueName: 'zipli_system', jobId: 'test_dlq_job_1' },
    };
    const res = {
      json: jest.fn(),
    };

    await retryDeadLetterJob(req, res);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'success',
        message: expect.stringContaining('re-queued'),
      })
    );
  });

  it('dispatches a manual job', async () => {
    const req = {
      body: {
        jobName: 'release_held_stock',
        data: {},
      },
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    await dispatchManualJob(req, res);
    expect(res.status).toHaveBeenCalledWith(202);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'success',
        message: expect.stringContaining('queued'),
      })
    );
  });

  it('throws 400 when dispatching without jobName', async () => {
    const req = { body: {} };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();

    await dispatchManualJob(req, res, next);
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'jobName is required', statusCode: 400 })
    );
  });
});
