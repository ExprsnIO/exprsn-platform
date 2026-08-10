/**
 * ═══════════════════════════════════════════════════════════
 * Git Pull Requests API Routes
 * PR management with CI/CD integration
 * ═══════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const GitPullRequestService = require('../services/GitPullRequestService');
const logger = require('../../utils/logger');

/**
 * Create pull request
 * POST /api/git/repositories/:repoId/pulls
 */
router.post('/:repoId/pulls', async (req, res) => {
  try {
    const { title, body, sourceBranch, targetBranch, reviewers, assignees, labels, isDraft } = req.body;

    if (!title || !sourceBranch || !targetBranch) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Title, source branch, and target branch are required'
      });
    }

    const createdBy = req.user?.id || req.body.createdBy;

    const pr = await GitPullRequestService.createPullRequest(req.params.repoId, {
      title,
      body,
      sourceBranch,
      targetBranch,
      reviewers,
      assignees,
      labels,
      isDraft,
      createdBy
    });

    res.status(201).json({
      success: true,
      data: pr
    });
  } catch (error) {
    logger.error('Failed to create pull request:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

/**
 * List pull requests
 * GET /api/git/repositories/:repoId/pulls
 */
router.get('/:repoId/pulls', async (req, res) => {
  try {
    const { state, createdBy, reviewStatus, ciStatus, limit, offset } = req.query;

    const result = await GitPullRequestService.listPullRequests(req.params.repoId, {
      state,
      createdBy,
      reviewStatus,
      ciStatus,
      limit: parseInt(limit) || 50,
      offset: parseInt(offset) || 0
    });

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error('Failed to list pull requests:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

/**
 * Get pull request
 * GET /api/git/repositories/:repoId/pulls/:prNumber
 */
router.get('/:repoId/pulls/:prNumber', async (req, res) => {
  try {
    const pr = await GitPullRequestService.getPullRequest(req.params.repoId, parseInt(req.params.prNumber));

    if (!pr) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'Pull request not found'
      });
    }

    res.json({
      success: true,
      data: pr
    });
  } catch (error) {
    logger.error('Failed to get pull request:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

/**
 * Update pull request
 * PATCH /api/git/repositories/:repoId/pulls/:prNumber
 */
router.patch('/:repoId/pulls/:prNumber', async (req, res) => {
  try {
    const updates = req.body;

    const pr = await GitPullRequestService.updatePullRequest(
      req.params.repoId,
      parseInt(req.params.prNumber),
      updates
    );

    res.json({
      success: true,
      data: pr
    });
  } catch (error) {
    logger.error('Failed to update pull request:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

/**
 * Merge pull request
 * POST /api/git/repositories/:repoId/pulls/:prNumber/merge
 */
router.post('/:repoId/pulls/:prNumber/merge', async (req, res) => {
  try {
    const { mergeMethod } = req.body;
    const mergedBy = req.user?.id || req.body.mergedBy;

    const pr = await GitPullRequestService.mergePullRequest(
      req.params.repoId,
      parseInt(req.params.prNumber),
      { mergedBy, mergeMethod }
    );

    res.json({
      success: true,
      data: pr
    });
  } catch (error) {
    logger.error('Failed to merge pull request:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

/**
 * Close pull request
 * POST /api/git/repositories/:repoId/pulls/:prNumber/close
 */
router.post('/:repoId/pulls/:prNumber/close', async (req, res) => {
  try {
    const userId = req.user?.id || req.body.userId;

    const pr = await GitPullRequestService.closePullRequest(
      req.params.repoId,
      parseInt(req.params.prNumber),
      userId
    );

    res.json({
      success: true,
      data: pr
    });
  } catch (error) {
    logger.error('Failed to close pull request:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

/**
 * Mark as ready for review
 * POST /api/git/repositories/:repoId/pulls/:prNumber/ready
 */
router.post('/:repoId/pulls/:prNumber/ready', async (req, res) => {
  try {
    const pr = await GitPullRequestService.markReadyForReview(req.params.repoId, parseInt(req.params.prNumber));

    res.json({
      success: true,
      data: pr
    });
  } catch (error) {
    logger.error('Failed to mark as ready for review:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

/**
 * Request review
 * POST /api/git/repositories/:repoId/pulls/:prNumber/reviewers
 */
router.post('/:repoId/pulls/:prNumber/reviewers', async (req, res) => {
  try {
    const { reviewerIds } = req.body;

    if (!reviewerIds || !Array.isArray(reviewerIds)) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Reviewer IDs array is required'
      });
    }

    const pr = await GitPullRequestService.requestReview(
      req.params.repoId,
      parseInt(req.params.prNumber),
      reviewerIds
    );

    res.json({
      success: true,
      data: pr
    });
  } catch (error) {
    logger.error('Failed to request review:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

/**
 * Update CI status (internal)
 * POST /api/git/pull-requests/:prId/ci-status
 */
router.post('/pull-requests/:prId/ci-status', async (req, res) => {
  try {
    const { status, pipelineRunId } = req.body;

    await GitPullRequestService.updateCIStatus(req.params.prId, {
      status,
      pipelineRunId
    });

    res.json({
      success: true,
      message: 'CI status updated'
    });
  } catch (error) {
    logger.error('Failed to update CI status:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

/**
 * Get PR statistics
 * GET /api/git/repositories/:repoId/pulls-stats
 */
router.get('/:repoId/pulls-stats', async (req, res) => {
  try {
    const stats = await GitPullRequestService.getPRStats(req.params.repoId);

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    logger.error('Failed to get PR stats:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

module.exports = router;
