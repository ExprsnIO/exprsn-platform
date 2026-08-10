/**
 * ═══════════════════════════════════════════════════════════
 * Git Issues API Routes
 * Issue tracking with workflow integration
 * ═══════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const GitIssueService = require('../services/GitIssueService');
const logger = require('../../utils/logger');

/**
 * Create issue
 * POST /api/git/repositories/:repoId/issues
 */
router.post('/:repoId/issues', async (req, res) => {
  try {
    const { title, body, priority, issueType, labels, assignees, milestoneId, dueDate } = req.body;

    if (!title) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Title is required'
      });
    }

    const createdBy = req.user?.id || req.body.createdBy;

    const issue = await GitIssueService.createIssue(req.params.repoId, {
      title,
      body,
      priority,
      issueType,
      labels,
      assignees,
      milestoneId,
      dueDate,
      createdBy
    });

    res.status(201).json({
      success: true,
      data: issue
    });
  } catch (error) {
    logger.error('Failed to create issue:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

/**
 * List issues
 * GET /api/git/repositories/:repoId/issues
 */
router.get('/:repoId/issues', async (req, res) => {
  try {
    const { state, priority, issueType, labels, assignees, createdBy, limit, offset } = req.query;

    const result = await GitIssueService.listIssues(req.params.repoId, {
      state,
      priority,
      issueType,
      labels: labels ? labels.split(',') : undefined,
      assignees: assignees ? assignees.split(',') : undefined,
      createdBy,
      limit: parseInt(limit) || 50,
      offset: parseInt(offset) || 0
    });

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error('Failed to list issues:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

/**
 * Get issue by number
 * GET /api/git/repositories/:repoId/issues/:issueNumber
 */
router.get('/:repoId/issues/:issueNumber', async (req, res) => {
  try {
    const issue = await GitIssueService.getIssue(req.params.repoId, parseInt(req.params.issueNumber));

    if (!issue) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'Issue not found'
      });
    }

    res.json({
      success: true,
      data: issue
    });
  } catch (error) {
    logger.error('Failed to get issue:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

/**
 * Update issue
 * PATCH /api/git/repositories/:repoId/issues/:issueNumber
 */
router.patch('/:repoId/issues/:issueNumber', async (req, res) => {
  try {
    const updates = req.body;

    const issue = await GitIssueService.updateIssue(
      req.params.repoId,
      parseInt(req.params.issueNumber),
      updates
    );

    res.json({
      success: true,
      data: issue
    });
  } catch (error) {
    logger.error('Failed to update issue:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

/**
 * Close issue
 * POST /api/git/repositories/:repoId/issues/:issueNumber/close
 */
router.post('/:repoId/issues/:issueNumber/close', async (req, res) => {
  try {
    const { state } = req.body;
    const closedBy = req.user?.id || req.body.closedBy;

    const issue = await GitIssueService.closeIssue(
      req.params.repoId,
      parseInt(req.params.issueNumber),
      { closedBy, state: state || 'closed' }
    );

    res.json({
      success: true,
      data: issue
    });
  } catch (error) {
    logger.error('Failed to close issue:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

/**
 * Reopen issue
 * POST /api/git/repositories/:repoId/issues/:issueNumber/reopen
 */
router.post('/:repoId/issues/:issueNumber/reopen', async (req, res) => {
  try {
    const issue = await GitIssueService.reopenIssue(req.params.repoId, parseInt(req.params.issueNumber));

    res.json({
      success: true,
      data: issue
    });
  } catch (error) {
    logger.error('Failed to reopen issue:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

/**
 * Add label
 * POST /api/git/repositories/:repoId/issues/:issueNumber/labels
 */
router.post('/:repoId/issues/:issueNumber/labels', async (req, res) => {
  try {
    const { label } = req.body;

    if (!label) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Label is required'
      });
    }

    const issue = await GitIssueService.addLabel(req.params.repoId, parseInt(req.params.issueNumber), label);

    res.json({
      success: true,
      data: issue
    });
  } catch (error) {
    logger.error('Failed to add label:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

/**
 * Remove label
 * DELETE /api/git/repositories/:repoId/issues/:issueNumber/labels/:label
 */
router.delete('/:repoId/issues/:issueNumber/labels/:label', async (req, res) => {
  try {
    const issue = await GitIssueService.removeLabel(
      req.params.repoId,
      parseInt(req.params.issueNumber),
      req.params.label
    );

    res.json({
      success: true,
      data: issue
    });
  } catch (error) {
    logger.error('Failed to remove label:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

/**
 * Assign user
 * POST /api/git/repositories/:repoId/issues/:issueNumber/assignees
 */
router.post('/:repoId/issues/:issueNumber/assignees', async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'User ID is required'
      });
    }

    const issue = await GitIssueService.assignUser(req.params.repoId, parseInt(req.params.issueNumber), userId);

    res.json({
      success: true,
      data: issue
    });
  } catch (error) {
    logger.error('Failed to assign user:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

/**
 * Unassign user
 * DELETE /api/git/repositories/:repoId/issues/:issueNumber/assignees/:userId
 */
router.delete('/:repoId/issues/:issueNumber/assignees/:userId', async (req, res) => {
  try {
    const issue = await GitIssueService.unassignUser(
      req.params.repoId,
      parseInt(req.params.issueNumber),
      req.params.userId
    );

    res.json({
      success: true,
      data: issue
    });
  } catch (error) {
    logger.error('Failed to unassign user:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

/**
 * Get issue statistics
 * GET /api/git/repositories/:repoId/issues/stats
 */
router.get('/:repoId/issues-stats', async (req, res) => {
  try {
    const stats = await GitIssueService.getIssueStats(req.params.repoId);

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    logger.error('Failed to get issue stats:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

module.exports = router;
