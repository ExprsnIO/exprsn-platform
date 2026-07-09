'use strict';

const express = require('express');
const { asyncHandler } = require('@exprsn/shared');
const { AgentTask } = require('../models');
const { newId } = require('../lib/ids');
const { queueTask } = require('../engine/jobs');
const { caRead, caWrite, isAdminReq } = require('../middleware/auth');

const router = express.Router();

router.post('/', caWrite, asyncHandler(async (req, res) => {
  const goal = String(req.body.goal ?? '').trim();
  if (!goal) return res.status(400).json({ error: 'goal required' });
  const task = await AgentTask.create({
    id: newId('task'),
    goal,
    model: req.body.model ?? null,
    status: 'queued',
    tools: req.body.tools ?? null,
    skills: req.body.skills ?? null,
    userId: req.userId || null,
  });
  await queueTask(task.id);
  res.status(202).json({ id: task.id, status: task.status });
}));

router.get('/', caRead, asyncHandler(async (req, res) => {
  const where = isAdminReq(req) ? {} : { userId: req.userId || null };
  const rows = await AgentTask.findAll({
    where, order: [['createdAt', 'DESC']], limit: 200,
    attributes: ['id', 'status', 'goal', 'createdAt', 'finishedAt'],
  });
  res.json({ tasks: rows });
}));

router.get('/:id', caRead, asyncHandler(async (req, res) => {
  const task = await AgentTask.findByPk(req.params.id);
  if (!task || (!isAdminReq(req) && task.userId !== req.userId)) {
    return res.status(404).json({ error: 'not found' });
  }
  res.json(task);
}));

module.exports = router;
