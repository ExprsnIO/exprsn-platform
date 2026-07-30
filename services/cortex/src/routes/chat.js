'use strict';

// Owner-facing assistant chat: full tool access + selected skills. Guarded on
// channel 'chat'; escalated replies land in the review queue.

const express = require('express');
const { asyncHandler } = require('@exprsn/shared');
const { ChatSession, ChatMessage } = require('../models');
const { newId } = require('../lib/ids');
const { assistantChatTurn } = require('../engine/jobs');
const { caRead, caWrite, isAdminReq } = require('../middleware/auth');
const { clampLimit, decodeCursor, fetchKeysetPage, createdAtUsAttribute } = require('../lib/keysetPagination');
const { openSSE } = require('../lib/sse');
const { toClientError } = require('../lib/clientError');
const { createLogger } = require('@exprsn/shared');

const logger = createLogger('exprsn-cortex');
const router = express.Router();
const ID_RE = /^[\w-]+$/;

// TASK-063: session-list default/cap unchanged from the pre-pagination limit
// (100) so an unqualified `GET /` keeps its existing behavior; message
// history previously had NO cap at all (full transcript every time), so 200
// is a new, generous default rather than a lowered one.
const SESSIONS_LIMIT = { max: 100, def: 100 };
const MESSAGES_LIMIT = { max: 200, def: 200 };

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
  const turn = (stream) => assistantChatTurn(
    sid, message, req.body.model ?? null, req.body.skills ?? null, req.userId || null, stream);

  // FEAT-090 — streaming is OPT-IN. Without `stream:true` this route behaves
  // byte-identically to before: same JSON body, same status, same everything.
  if (req.body.stream !== true) return res.json(await turn(null));

  const sse = openSSE(req, res);
  const ctl = new AbortController();
  // A closed tab must not keep a local generation (and its semaphore slot)
  // running for minutes.
  sse.onClientGone(() => ctl.abort());
  sse.send('start', { session_id: sid });
  try {
    const result = await turn({
      signal: ctl.signal,
      abort: () => ctl.abort(),
      onChunk: (text) => sse.send('token', { text }),
      // Everything streamed so far is superseded — the client must clear its
      // provisional buffer. The authoritative reply always arrives in `done`.
      onReset: () => sse.send('reset', {}),
    });
    sse.close('done', result);
  } catch (err) {
    if (ctl.signal.aborted) return sse.close('cancelled', {});
    // BUG-068: the headers already went out as 200, so this never reaches the
    // module error handler — build the payload through the shared helper so the
    // production redaction and the correlation id match the buffered route.
    sse.close('error', toClientError(err, logger, { path: req.path, transport: 'sse' }));
  }
}));

router.get('/', caRead, asyncHandler(async (req, res) => {
  const where = { channel: 'assistant', ...(isAdminReq(req) ? {} : { userId: req.userId || null }) };
  const limit = clampLimit(req.query.limit, SESSIONS_LIMIT);
  const cursor = decodeCursor(req.query.cursor);
  const { rows, nextCursor } = await fetchKeysetPage({
    cursor, limit, direction: 'desc', baseWhere: where,
    // BUG-067: `seekWhere` builds an escaped literal, so it needs the
    // connection's escaper. Required, not optional, by design.
    escape: (v) => ChatSession.sequelize.escape(v),
    findAll: (pageWhere, order, pageLimit) => ChatSession.findAll({
      where: pageWhere, order, limit: pageLimit,
      attributes: { include: [createdAtUsAttribute()] },
      include: [{ model: ChatMessage, as: 'messages', attributes: ['content'], separate: true, order: [['createdAt', 'ASC']] }],
    }),
  });
  res.json({
    sessions: rows.map((s) => ({
      id: s.id, created: s.createdAt, turns: s.messages.length,
      skills: s.skills ?? null, model: s.model ?? null,
      preview: s.messages.length ? String(s.messages[0].content).slice(0, 80) : '',
    })),
    nextCursor,
  });
}));

router.get('/:id', caRead, asyncHandler(async (req, res) => {
  const session = await ownedSession(req, req.params.id, 'assistant');
  if (!session) return res.status(404).json({ error: 'not found' });
  const limit = clampLimit(req.query.limit, MESSAGES_LIMIT);
  const cursor = decodeCursor(req.query.cursor);
  const { rows: messages, nextCursor } = await fetchKeysetPage({
    cursor, limit, direction: 'asc', baseWhere: { sessionId: session.id },
    escape: (v) => ChatMessage.sequelize.escape(v),
    findAll: (pageWhere, order, pageLimit) => ChatMessage.findAll({
      where: pageWhere, order, limit: pageLimit,
      attributes: { include: [createdAtUsAttribute()] },
    }),
  });
  res.json({ ...session.get({ plain: true }), messages, nextCursor });
}));

module.exports = router;
