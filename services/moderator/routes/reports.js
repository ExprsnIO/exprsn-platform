/**
 * ═══════════════════════════════════════════════════════════
 * Reports Routes
 * API endpoints for user reports
 * ═══════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
// Use the schema-aware Sequelize model (configured with schema: 'moderator').
// The raw-pg ../models Report queries unqualified `reports`, which resolves to
// public.reports and doesn't exist under the consolidated schema-per-module DB.
const { Report } = require('../models/sequelize-index');
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
 * GET /api/reports
 * List reports with optional status filter + pagination.
 * Query params: status, limit (default 50, max 200), offset (default 0).
 * Uses the raw-pg Report model (same as the other handlers here); rows are
 * mapped to camelCase to match the admin console / rest of the API surface.
 */
router.get('/', async (req, res) => {
  try {
    const { status } = req.query;
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const offset = parseInt(req.query.offset, 10) || 0;

    const where = status ? { status } : undefined;

    // Sequelize instances serialize to the model's camelCase attributes, so no
    // manual row mapping is needed (unlike the raw-pg layer).
    const { rows, count } = await Report.findAndCountAll({
      where,
      order: [['createdAt', 'DESC']],
      limit,
      offset
    });

    res.json({
      success: true,
      reports: rows,
      pagination: {
        limit,
        offset,
        total: count,
        hasMore: count > offset + rows.length
      }
    });
  } catch (error) {
    logger.error('List reports error', { error: error.message });
    res.status(500).json({
      error: 'FETCH_FAILED',
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

    await report.update({
      status: 'resolved',
      resolvedBy,
      resolvedAt: Date.now(),
      resolutionNotes,
      ...(actionTaken ? { actionTaken } : {})
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
