/**
 * ═══════════════════════════════════════════════════════════
 * Job Management Routes
 * Monitor and manage background jobs
 * ═══════════════════════════════════════════════════════════
 */

const express = require('express');
const { asyncHandler, AppError, requireAdmin } = require('@exprsn/shared');
const { requireToken } = require('../middleware/auth');
const {
  queues,
  getQueueStats,
  getAllQueueStats,
  pauseQueue,
  resumeQueue,
  cleanQueue
} = require('../config/queue');

const router = express.Router();

// All job routes require authentication and admin role
router.use(requireToken({ requiredPermissions: { read: true }, resourcePrefix: '/jobs' }));
router.use(requireAdmin());

/**
 * GET /api/jobs/stats
 * Get statistics for all queues
 */
router.get('/stats', asyncHandler(async (req, res) => {
  const stats = await getAllQueueStats();

  res.json({
    success: true,
    stats,
    timestamp: Date.now()
  });
}));

/**
 * GET /api/jobs/stats/:queueName
 * Get statistics for specific queue
 */
router.get('/stats/:queueName', asyncHandler(async (req, res) => {
  const { queueName } = req.params;

  if (!queues[queueName]) {
    throw new AppError('Queue not found', 404, 'QUEUE_NOT_FOUND');
  }

  const stats = await getQueueStats(queueName);

  res.json({
    success: true,
    queue: stats,
    timestamp: Date.now()
  });
}));

/**
 * GET /api/jobs/:queueName/jobs
 * Get jobs from a queue
 */
router.get('/:queueName/jobs', asyncHandler(async (req, res) => {
  const { queueName } = req.params;
  const { status = 'waiting', limit = 20 } = req.query;

  const queue = queues[queueName];
  if (!queue) {
    throw new AppError('Queue not found', 404, 'QUEUE_NOT_FOUND');
  }

  let jobs = [];

  switch (status) {
    case 'waiting':
      jobs = await queue.getWaiting(0, limit - 1);
      break;
    case 'active':
      jobs = await queue.getActive(0, limit - 1);
      break;
    case 'completed':
      jobs = await queue.getCompleted(0, limit - 1);
      break;
    case 'failed':
      jobs = await queue.getFailed(0, limit - 1);
      break;
    case 'delayed':
      jobs = await queue.getDelayed(0, limit - 1);
      break;
    default:
      throw new AppError('Invalid status', 400, 'INVALID_STATUS');
  }

  // Format jobs for response
  const formattedJobs = jobs.map(job => ({
    id: job.id,
    name: job.name,
    data: job.data,
    timestamp: job.timestamp,
    processedOn: job.processedOn,
    finishedOn: job.finishedOn,
    attemptsMade: job.attemptsMade,
    failedReason: job.failedReason,
    stacktrace: job.stacktrace
  }));

  res.json({
    success: true,
    queue: queueName,
    status,
    jobs: formattedJobs,
    count: formattedJobs.length
  });
}));

/**
 * GET /api/jobs/:queueName/job/:jobId
 * Get specific job details
 */
router.get('/:queueName/job/:jobId', asyncHandler(async (req, res) => {
  const { queueName, jobId } = req.params;

  const queue = queues[queueName];
  if (!queue) {
    throw new AppError('Queue not found', 404, 'QUEUE_NOT_FOUND');
  }

  const job = await queue.getJob(jobId);

  if (!job) {
    throw new AppError('Job not found', 404, 'JOB_NOT_FOUND');
  }

  res.json({
    success: true,
    job: {
      id: job.id,
      name: job.name,
      data: job.data,
      timestamp: job.timestamp,
      processedOn: job.processedOn,
      finishedOn: job.finishedOn,
      attemptsMade: job.attemptsMade,
      failedReason: job.failedReason,
      stacktrace: job.stacktrace,
      returnvalue: job.returnvalue
    }
  });
}));

/**
 * POST /api/jobs/:queueName/pause
 * Pause a queue
 */
router.post('/:queueName/pause', asyncHandler(async (req, res) => {
  const { queueName } = req.params;

  await pauseQueue(queueName);

  res.json({
    success: true,
    message: `Queue ${queueName} paused`,
    queue: queueName
  });
}));

/**
 * POST /api/jobs/:queueName/resume
 * Resume a paused queue
 */
router.post('/:queueName/resume', asyncHandler(async (req, res) => {
  const { queueName } = req.params;

  await resumeQueue(queueName);

  res.json({
    success: true,
    message: `Queue ${queueName} resumed`,
    queue: queueName
  });
}));

/**
 * POST /api/jobs/:queueName/clean
 * Clean completed/failed jobs from queue
 */
router.post('/:queueName/clean', asyncHandler(async (req, res) => {
  const { queueName } = req.params;
  const { grace = 3600000 } = req.body; // Default 1 hour

  await cleanQueue(queueName, grace);

  res.json({
    success: true,
    message: `Queue ${queueName} cleaned`,
    queue: queueName,
    grace
  });
}));

/**
 * POST /api/jobs/:queueName/job/:jobId/retry
 * Retry a failed job
 */
router.post('/:queueName/job/:jobId/retry', asyncHandler(async (req, res) => {
  const { queueName, jobId } = req.params;

  const queue = queues[queueName];
  if (!queue) {
    throw new AppError('Queue not found', 404, 'QUEUE_NOT_FOUND');
  }

  const job = await queue.getJob(jobId);

  if (!job) {
    throw new AppError('Job not found', 404, 'JOB_NOT_FOUND');
  }

  await job.retry();

  res.json({
    success: true,
    message: 'Job queued for retry',
    jobId
  });
}));

/**
 * DELETE /api/jobs/:queueName/job/:jobId
 * Remove a job from queue
 */
router.delete('/:queueName/job/:jobId', asyncHandler(async (req, res) => {
  const { queueName, jobId } = req.params;

  const queue = queues[queueName];
  if (!queue) {
    throw new AppError('Queue not found', 404, 'QUEUE_NOT_FOUND');
  }

  const job = await queue.getJob(jobId);

  if (!job) {
    throw new AppError('Job not found', 404, 'JOB_NOT_FOUND');
  }

  await job.remove();

  res.json({
    success: true,
    message: 'Job removed',
    jobId
  });
}));

module.exports = router;
