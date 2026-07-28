'use strict';

// Guarded customer-service channels: chat and email drafting. Inputs AND
// outputs are screened; escalations hold the reply and create a review.

const express = require('express');
const { asyncHandler } = require('@exprsn/shared');
const { ChatSession, ChatMessage } = require('../models');
const { newId } = require('../lib/ids');
const { csChatTurn, csEmail } = require('../engine/jobs');
const { caRead, caWrite, isAdminReq } = require('../middleware/auth');
const { clampLimit, decodeCursor, fetchKeysetPage } = require('../lib/keysetPagination');

const router = express.Router();
const ID_RE = /^[\w-]+$/;

// TASK-063: same defaults/caps as the assistant channel (chat.js) — see its
// comment for why the sessions cap is unchanged (100) but the messages cap
// is new (200, replacing a previously unbounded fetch).
const SESSIONS_LIMIT = { max: 100, def: 100 };
const MESSAGES_LIMIT = { max: 200, def: 200 };

async function ownedSession(req, id) {
  const session = await ChatSession.findByPk(id);
  if (!session || session.channel !== 'cs') return null;
  if (!isAdminReq(req) && session.userId !== req.userId) return null;
  return session;
}

router.post('/chat', caWrite, asyncHandler(async (req, res) => {
  const message = String(req.body.message ?? '').trim();
  if (!message) return res.status(400).json({ error: 'message required' });
  const sid = req.body.session_id || newId('chat');
  if (!ID_RE.test(sid)) return res.status(400).json({ error: 'bad session_id' });
  if (req.body.session_id && !(await ownedSession(req, sid))) {
    return res.status(404).json({ error: 'not found' });
  }
  res.json(await csChatTurn(sid, message, req.userId || null));
}));

router.get('/chat', caRead, asyncHandler(async (req, res) => {
  const where = { channel: 'cs', ...(isAdminReq(req) ? {} : { userId: req.userId || null }) };
  const limit = clampLimit(req.query.limit, SESSIONS_LIMIT);
  const cursor = decodeCursor(req.query.cursor);
  const { rows, nextCursor } = await fetchKeysetPage({
    cursor, limit, direction: 'desc', baseWhere: where,
    order: [['createdAt', 'DESC'], ['id', 'DESC']],
    findAll: (pageWhere, order, pageLimit) => ChatSession.findAll({
      where: pageWhere, order, limit: pageLimit,
      include: [{ model: ChatMessage, as: 'messages', attributes: ['id'], separate: true }],
    }),
  });
  res.json({
    chats: rows.map((s) => ({
      id: s.id, created: s.createdAt, turns: s.messages.length,
    })),
    nextCursor,
  });
}));

router.get('/chat/:id', caRead, asyncHandler(async (req, res) => {
  const session = await ownedSession(req, req.params.id);
  if (!session) return res.status(404).json({ error: 'not found' });
  const limit = clampLimit(req.query.limit, MESSAGES_LIMIT);
  const cursor = decodeCursor(req.query.cursor);
  const { rows: messages, nextCursor } = await fetchKeysetPage({
    cursor, limit, direction: 'asc', baseWhere: { sessionId: session.id },
    order: [['createdAt', 'ASC'], ['id', 'ASC']],
    findAll: (pageWhere, order, pageLimit) => ChatMessage.findAll({
      where: pageWhere, order, limit: pageLimit,
    }),
  });
  res.json({ ...session.get({ plain: true }), messages, nextCursor });
}));

router.post('/email', caWrite, asyncHandler(async (req, res) => {
  const missing = ['from', 'subject', 'body'].filter((k) => !req.body[k]);
  if (missing.length) {
    return res.status(400).json({ error: `missing: ${missing.join(', ')}` });
  }
  res.json(await csEmail(req.body.from, req.body.subject, req.body.body, req.userId || null));
}));

module.exports = router;
