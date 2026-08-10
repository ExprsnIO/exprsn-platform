/**
 * ═══════════════════════════════════════════════════════════
 * Reports Routes
 * API endpoints for user reports
 * ═══════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const { Report } = require('../models');
const logger = require('../src/utils/logger');

/**
 * POST /api/reports
 * Submit a content report
 */
router.post('/', async (req, res) => {
  try {
    const {
      contentType,
      contentId,
      sourceService,
      reportedBy,
      reason,
      details
    } = req.body;

    if (!contentType || !contentId || !sourceService || !reportedBy || !reason) {
      return res.status(400).json({
        error: 'INVALID_REQUEST',
        message: 'Missing required fields'
      });
    }

    const report = await Report.create({
      contentType,
      contentId,
      sourceService,
      reportedBy,
      reason,
      details,
      status: 'open'
    });

    res.json({
      success: true,
      report: {
        id: report.id,
        status: report.status
      }
    });
  } catch (error) {
    logger.error('Create report error', { error: error.message });
    res.status(500).json({
      error: 'REPORT_FAILED',
      message: error.message
    });
  }
});

/**
 * GET /api/reports/:id
 * Get report details
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const report = await Report.findByPk(id);

    if (!report) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: 'Report not found'
      });
    }

    res.json({
      success: true,
      report
    });
  } catch (error) {
    logger.error('Get report error', { error: error.message });
    res.status(500).json({
      error: 'FETCH_FAILED',
      message: error.message
    });
  }
});

/**
 * PUT /api/reports/:id/resolve
 * Resolve a report
 */
router.put('/:id/resolve', async (req, res) => {
  try {
    const { id } = req.params;
    const { resolvedBy, resolutionNotes, actionTaken } = req.body;

    if (!resolvedBy) {
      return res.status(400).json({
        error: 'INVALID_REQUEST',
        message: 'resolvedBy is required'
      });
    }

    const report = await Report.findByPk(id);

    if (!report) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: 'Report not found'
      });
    }

    await Report.update(id, {
      status: 'resolved',
      resolved_by: resolvedBy,
      resolved_at: Date.now(),
      resolution_notes: resolutionNotes,
      action_taken: actionTaken
    });

    res.json({
      success: true,
      message: 'Report resolved'
    });
  } catch (error) {
    logger.error('Resolve report error', { error: error.message });
    res.status(500).json({
      error: 'RESOLVE_FAILED',
      message: error.message
    });
  }
});

module.exports = router;
