const { queueService } = require('../services/queue.service');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');

// GET /api/admin/queues
const getQueueStats = asyncHandler(async (req, res) => {
  const stats = queueService.getDashboardStats();
  res.json({
    status: 'success',
    data: stats,
  });
});

// GET /api/admin/queues/:queueName/jobs
const getQueueJobs = asyncHandler(async (req, res) => {
  const { queueName } = req.params;
  const { status = 'all' } = req.query;
  const queue = queueService.getQueue(queueName);
  const jobs = queue.getJobs(status);

  res.json({
    status: 'success',
    results: jobs.length,
    data: { jobs },
  });
});

// POST /api/admin/queues/:queueName/retry/:jobId
const retryDeadLetterJob = asyncHandler(async (req, res) => {
  const { queueName, jobId } = req.params;
  const queue = queueService.getQueue(queueName);
  const retriedJob = queue.retryJob(jobId);

  res.json({
    status: 'success',
    message: `Job ${jobId} re-queued successfully`,
    data: { job: retriedJob },
  });
});

// POST /api/admin/queues/dispatch
const dispatchManualJob = asyncHandler(async (req, res) => {
  const { jobName, data = {}, options = {} } = req.body;
  if (!jobName) {
    throw new AppError('jobName is required', 400);
  }

  const job = await queueService.dispatch(jobName, data, options);
  res.status(202).json({
    status: 'success',
    message: `Job ${jobName} queued`,
    data: { job },
  });
});

module.exports = {
  getQueueStats,
  getQueueJobs,
  retryDeadLetterJob,
  dispatchManualJob,
};
