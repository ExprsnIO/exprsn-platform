'use strict';

const express = require('express');
const { asyncHandler } = require('@exprsn/shared');
const { OutboxEntry } = require('../models');
const { caRead, isAdminReq } = require('../middleware/auth');

const router = express.Router();

router.get('/', caRead, asyncHandler(async (req, res) => {
  const where = isAdminReq(req) ? {} : { userId: req.userId || null };
  const rows = await OutboxEntry.findAll({
    where, order: [['createdAt', 'DESC']], limit: 200,
    attributes: ['id', 'status', 'subject', 'toAddress', 'createdAt'],
  });
  res.json({ outbox: rows });
}));

router.get('/:id', caRead, asyncHandler(async (req, res) => {
  const entry = await OutboxEntry.findByPk(req.params.id);
  if (!entry || (!isAdminReq(req) && entry.userId !== req.userId)) {
    return res.status(404).json({ error: 'not found' });
  }
  res.json(entry);
}));

module.exports = router;
