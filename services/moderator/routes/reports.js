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
const requireUser = require('../src/middleware/requireUser');
const requireAdmin = require('../src/middleware/requireAdmin');

/**
 * POST /api/reports
 * Submit a content report (any authenticated user). The reporter identity is
 * bound to the validated token (req.userId) — a client-supplied `reportedBy`
 * in the body is ignored (BUG-010 / SPIKE-001).
 */
router.post('/', requireUser, async (req, res) => {
  try {
    const {
      contentType,
      contentId,
      sourceService,
      reason,
      details
    } = req.body;

    // Actor is the authenticated caller, never a body field.
    const reportedBy = req.userId;

    if (!contentType || !contentId || !sourceService || !reason) {
      return res.status(400).json({
        error: 'INVALID_REQUEST',
        message: 'Missing required fields'
      });
    }

    // Double-report guard (FEAT-010): a user may not report the same item twice.
    // App-level pre-check on the full content identity (reporter + where the
    // content lives + what it is + which item). This is the lower-risk choice
    // vs. a DB UNIQUE constraint, which would be an ALTER on the existing
    // moderator.reports table that the sync `db:migrate` does NOT apply (that
    // would need the migration up() run directly — a dba concern). Returns a
    // clean, idempotent 409 (never a 500) so the client can show "already
    // reported". Note: a narrow race window remains under concurrent duplicate
    // submits; acceptable for this slice and the natural home for a future
    // unique-index hardening.
    const existing = await Report.findOne({
      where: { reportedBy, sourceService, contentType, contentId }
    });
    if (existing) {
      return res.status(409).json({
        error: 'ALREADY_REPORTED',
        message: 'You have already reported this item',
        report: {
          id: existing.id,
          status: existing.status
        }
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
router.get('/', requireAdmin, async (req, res) => {
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
router.get('/:id', requireAdmin, async (req, res) => {
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
router.put('/:id/resolve', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { resolutionNotes, actionTaken } = req.body;

    // Resolver identity is the authenticated admin (requireAdmin sets req.userId),
    // never a client-supplied body field (BUG-010 audit-integrity fix).
    const resolvedBy = req.userId;

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
