'use strict';

// Owner-facing assistant chat: full tool access + selected skills. Guarded on
// channel 'chat'; escalated replies land in the review queue.

const express = require('express');
const { asyncHandler } = require('@exprsn/shared');
const { ChatSession, ChatMessage } = require('../models');
const { newId } = require('../lib/ids');
const { assistantChatTurn } = require('../engine/jobs');
const { caRead, caWrite, isAdminReq } = require('../middleware/auth');

const router = express.Router();
const ID_RE = /^[\w-]+$/;

async function ownedSession(req, id, channel) {
  const session = await ChatSession.findByPk(id);
  if (!session || session.channel !== channel) return null;
  if (!isAdminReq(req) && session.userId !== req.userId) return null;
  return session;
}

router.post('/', caWrite, asyncHandler(async (req, res) => {
  const message = String(req.body.message ?? '').trim();
  if (!message) return res.status(400).json({ error: 'message required' });
  if (req.body.attachments) {
    // Data-library attachments were a source-service feature; the dataset
    // subsystem is a deliberate exclusion from the port (FEAT-021).
    return res.status(400).json({ error: 'attachments not supported' });
  }
  const sid = req.body.session_id || newId('asst');
  if (!ID_RE.test(sid)) return res.status(400).json({ error: 'bad session_id' });
  if (req.body.session_id && !(await ownedSession(req, sid, 'assistant'))) {
    return res.status(404).json({ error: 'not found' });
  }
  res.json(await assistantChatTurn(
    sid, message, req.body.model ?? null, req.body.skills ?? null, req.userId || null));
}));

router.get('/', caRead, asyncHandler(async (req, res) => {
  const where = { channel: 'assistant', ...(isAdminReq(req) ? {} : { userId: req.userId || null }) };
  const rows = await ChatSession.findAll({
    where, order: [['createdAt', 'DESC']], limit: 100,
    include: [{ model: ChatMessage, as: 'messages', attributes: ['content'], separate: true, order: [['createdAt', 'ASC']] }],
  });
  res.json({ sessions: rows.map((s) => ({
    id: s.id, created: s.createdAt, turns: s.messages.length,
    skills: s.skills ?? null, model: s.model ?? null,
    preview: s.messages.length ? String(s.messages[0].content).slice(0, 80) : '',
  })) });
}));

router.get('/:id', caRead, asyncHandler(async (req, res) => {
  const session = await ownedSession(req, req.params.id, 'assistant');
  if (!session) return res.status(404).json({ error: 'not found' });
  const messages = await ChatMessage.findAll({
    where: { sessionId: session.id }, order: [['createdAt', 'ASC'], ['id', 'ASC']],
  });
  res.json({ ...session.get({ plain: true }), messages });
}));

module.exports = router;
