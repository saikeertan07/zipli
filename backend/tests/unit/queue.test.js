const { InMemoryJobQueue, queueService } = require('../../src/services/queue.service');

describe('Job Queue with Exponential Backoff, Jitter, and Dead Letter Queue (DLQ)', () => {
  describe('InMemoryJobQueue unit tests', () => {
    let queue;

    beforeEach(() => {
      queue = new InMemoryJobQueue('test_queue');
    });

    it('enqueues and executes a successful job', async () => {
      const handler = jest.fn().mockResolvedValue({ processed: true });
      queue.process('test_job', handler);

      const job = await queue.add('test_job', { value: 123 });
      expect(job.id).toBeDefined();

      // Wait for tick
      await new Promise((r) => setTimeout(r, 20));

      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ data: { value: 123 } }));
      const counts = queue.getJobCounts();
      expect(counts.completed).toBe(1);
      expect(counts.failed).toBe(0);
      expect(counts.active).toBe(0);
    });

    it('moves failed job to Dead Letter Queue (DLQ) after max attempts are exhausted', async () => {
      const failingHandler = jest.fn().mockRejectedValue(new Error('Persistent external failure'));
      queue.process('failing_job', failingHandler);

      // 2 max attempts with rapid backoff
      await queue.add(
        'failing_job',
        { msg: 'will fail' },
        { attempts: 2, backoff: { type: 'exponential', delay: 10, jitter: false } }
      );

      // Wait for attempts to complete (10ms backoff + tick)
      await new Promise((r) => setTimeout(r, 60));

      const counts = queue.getJobCounts();
      expect(counts.dlq).toBe(1);
      expect(counts.failed).toBe(1);

      const dlqJobs = queue.getJobs('dlq');
      expect(dlqJobs).toHaveLength(1);
      expect(dlqJobs[0].error).toContain('Persistent external failure');
    });

    it('allows retrying a dead-letter job from the DLQ', async () => {
      let fail = true;
      const handler = jest.fn().mockImplementation(() => {
        if (fail) throw new Error('Temporary failure');
        return { recovered: true };
      });

      queue.process('flaky_job', handler);

      await queue.add('flaky_job', {}, { attempts: 1 });
      await new Promise((r) => setTimeout(r, 30));

      expect(queue.getJobCounts().dlq).toBe(1);

      // Now fix the downstream issue and retry the job
      fail = false;
      const deadJobId = queue.getJobs('dlq')[0].id;
      const retried = queue.retryJob(deadJobId);

      expect(retried.status).toBe('waiting');
      expect(queue.getJobCounts().dlq).toBe(0);

      await new Promise((r) => setTimeout(r, 30));
      expect(queue.getJobCounts().completed).toBe(1);
    });

    it('throws when attempting to retry a non-existent DLQ job ID', () => {
      expect(() => queue.retryJob('missing_id_999')).toThrow(/not found in Dead Letter Queue/);
    });

    it('cleans completed and failed jobs', async () => {
      const handler = jest.fn().mockResolvedValue(true);
      queue.process('clean_job', handler);
      await queue.add('clean_job', {});
      await new Promise((r) => setTimeout(r, 20));

      expect(queue.getJobs('completed')).toHaveLength(1);
      const res = queue.clean(-1000); // Cleans all
      expect(res.cleaned).toBe(true);
      expect(queue.getJobs('completed')).toHaveLength(0);
    });

    it('handles delayed jobs and jobs without registered handler', async () => {
      const job = await queue.add('delayed_job', {}, { delay: 10 });
      expect(job.status).toBe('delayed');

      await queue.add('unhandled_job', {});
      await new Promise((r) => setTimeout(r, 30));

      expect(queue.getJobs('failed').some((j) => j.name === 'unhandled_job')).toBe(true);
      expect(queue.getJobs('waiting')).toBeDefined();
      expect(queue.getJobs('active')).toBeDefined();
    });
  });

  describe('QueueService integration & dashboard stats', () => {
    it('initializes default system queues and handlers', () => {
      const stats = queueService.getDashboardStats();
      expect(stats.zipli_system).toBeDefined();
      expect(stats.zipli_system.waiting).toBeDefined();
      expect(stats.zipli_system.dlq).toBeDefined();
    });

    it('dispatches background jobs via dispatch()', async () => {
      const job = await queueService.dispatch('rebuild_search_index', {});
      expect(job.name).toBe('rebuild_search_index');

      await queueService.dispatch('recompute_recommendations', {});
      await queueService.dispatch('forecast_refresh', { productId: 1 });
      await queueService.dispatch('expire_stale_carts', {});
      await queueService.dispatch('send_notification', {
        userId: 1,
        title: 'Q Notif',
        body: 'Msg',
        channels: [],
      });

      await new Promise((r) => setTimeout(r, 40));
    });

    it('clears all queues via clearAll()', () => {
      queueService.clearAll();
      const stats = queueService.getDashboardStats();
      expect(stats.zipli_system.waiting).toBe(0);
      expect(stats.zipli_system.active).toBe(0);
    });

    afterAll(() => {
      queueService.clearAll();
    });
  });
});
