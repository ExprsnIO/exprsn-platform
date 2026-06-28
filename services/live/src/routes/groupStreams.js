/**
 * Group Stream Routes (Phase 5 — host live events for groups)
 *
 * Group-scoped live streams. "Go live for the group" is an owner/admin action,
 * so creation requires group admin (requireGroupMembership('admin')); listing a
 * group's streams requires plain membership. Authorization against the nexus
 * group model is resolved by the shared requireGroupMembership guard, which runs
 * AFTER requireAuth has stamped req.user.id.
 *
 * Mounted at /api/groups, so the public paths are:
 *   POST /live/api/groups/:groupId/streams
 *   GET  /live/api/groups/:groupId/streams
 *
 * Start/stop/update/delete of a group stream are handled by the existing
 * /api/streams/:id routes, which detect a non-null group_id and require group
 * admin instead of personal ownership (see routes/streams.js).
 */

const express = require('express');
const router = express.Router();
const Joi = require('joi');
const { requireGroupMembership } = require('@exprsn/shared');
const streamService = require('../services/stream');
const { requireAuth } = require('../middleware/auth');
const { validateBody, validateQuery, validateParams, schemas } = require('../middleware/validation');
const logger = require('../utils/logger');

const groupIdParams = Joi.object({ groupId: schemas.uuid });

/**
 * POST /api/groups/:groupId/streams - Create a stream owned by the group.
 * Group admin/owner only. user_id still records the host (the acting user).
 */
router.post('/:groupId/streams',
  requireAuth,
  validateParams(groupIdParams),
  validateBody(schemas.createStream),
  requireGroupMembership('admin'),
  async (req, res) => {
    try {
      const stream = await streamService.createStream(
        { ...req.body, groupId: req.params.groupId },
        req.user.id
      );

      logger.info('Group stream created via API', {
        streamId: stream.id,
        groupId: req.params.groupId,
        userId: req.user.id
      });

      res.status(201).json({
        success: true,
        stream
      });
    } catch (error) {
      logger.error('Failed to create group stream:', error);
      res.status(500).json({
        error: 'CREATE_FAILED',
        message: error.message || 'Failed to create stream'
      });
    }
  }
);

/**
 * GET /api/groups/:groupId/streams - List a group's streams. Members only.
 */
router.get('/:groupId/streams',
  requireAuth,
  validateParams(groupIdParams),
  validateQuery(schemas.listGroupStreams),
  requireGroupMembership(),
  async (req, res) => {
    try {
      const result = await streamService.listStreams({
        ...req.query,
        groupId: req.params.groupId
      });

      res.json({
        success: true,
        ...result
      });
    } catch (error) {
      logger.error('Failed to list group streams:', error);
      res.status(500).json({
        error: 'LIST_FAILED',
        message: 'Failed to list streams'
      });
    }
  }
);

module.exports = router;
