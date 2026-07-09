'use strict';

// Human-review queue for escalated content. Admin-only in both directions:
// pending reviews contain blocked/held drafts, and resolving one can release
// content to a customer channel.

const express = require('express');
const { asyncHandler } = require('@exprsn/shared');
const { Review } = require('../models');
const { resolveReview } = require('../engine/jobs');
const { caRead, caWrite, requireCortexAdmin } = require('../middleware/auth');

const router = express.Router();

router.get('/', caRead, requireCortexAdmin, asyncHandler(async (_req, res) => {
  const rows = await Review.findAll({
    where: { status: 'pending' }, order: [['createdAt', 'ASC']],
  });
  res.json({ reviews: rows });
}));

router.post('/:id', caWrite, requireCortexAdmin, asyncHandler(async (req, res) => {
  const review = await Review.findByPk(req.params.id);
  if (!review) return res.status(404).json({ error: 'not found' });
  if (review.status !== 'pending') {
    return res.status(409).json({ error: 'already resolved' });
  }
  const { action, note } = req.body || {};
  if (action !== 'approve' && action !== 'reject') {
    return res.status(400).json({ error: 'action: approve|reject' });
  }
  res.json(await resolveReview(review, action, note, req.userId || null));
}));

module.exports = router;
