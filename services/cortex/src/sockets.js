'use strict';

/**
 * ═══════════════════════════════════════════════════════════
 * `/cortex` Socket.IO namespace (FEAT-090).
 *
 * The second streaming transport alongside SSE. SSE is the simpler one and the
 * SPA can consume it with plain `fetch`; the namespace exists because CANCEL
 * semantics live cleanly here — a socket has a back-channel, so an explicit
 * `chat:cancel` needs no second HTTP request and no server-side request
 * registry, and a dropped connection is a first-class event rather than a
 * half-written response.
 *
 *   client → server   chat:send    { message, session_id?, model?, skills? }
 *                     chat:cancel
 *   server → client   chat:start   { session_id }
 *                     chat:token   { text }      — SCREENED text only
 *                     chat:reset   {}            — drop everything streamed
 *                     chat:done    { …turn result }
 *                     chat:error   { error, message }
 *                     chat:cancelled {}
 *
 * `chat:token` carries screened prefixes, never raw model output — see
 * `engine/streamGuard.js` for why. `chat:reset` means the provisional text is
 * superseded and must be cleared; the authoritative reply is always in
 * `chat:done`, so a client that renders only `chat:done` is still correct.
 *
 * Auth is the platform's standard CA-token socket middleware — the same one the
 * gateway runs on `/_admin`. An unauthenticated handshake never reaches a
 * handler.
 * ═══════════════════════════════════════════════════════════
 */

const { createLogger } = require('@exprsn/shared');
const { authenticateSocket } = require('@exprsn/shared/middleware/socketAuth');
const config = require('./config');

const logger = createLogger('exprsn-cortex');

const NAMESPACE = '/cortex';
const ID_RE = /^[\w-]+$/;

function registerSockets(io) {
  const nsp = io.of(NAMESPACE);

  // CA bearer required on the handshake. Generating costs real GPU time, so the
  // namespace asks for 'write' — matching POST /api/v1/chat, which is the exact
  // operation it performs.
  nsp.use(authenticateSocket({ requiredPermissions: ['write'] }));

  // Flag gate, applied AFTER auth so a disabled module doesn't become an
  // unauthenticated probe for whether cortex exists.
  nsp.use((socket, next) => {
    if (!config.features.cortexEnabled) return next(new Error('CORTEX_DISABLED'));
    return next();
  });

  nsp.on('connection', (socket) => {
    // Required lazily: engine/jobs pulls in models + queues, and this file is
    // loaded at gateway boot even when the module ships dark.
    // eslint-disable-next-line global-require
    const { assistantChatTurn } = require('./engine/jobs');
    // eslint-disable-next-line global-require
    const { newId } = require('./lib/ids');

    let controller = null;

    socket.on('chat:send', async (payload = {}) => {
      const message = String(payload.message ?? '').trim();
      if (!message) {
        socket.emit('chat:error', { error: 'BAD_REQUEST', message: 'message required' });
        return;
      }
      if (controller) {
        // One generation per socket. The router keeps a single model resident,
        // so allowing concurrent sends per client would just queue on the
        // semaphore while making cancel ambiguous.
        socket.emit('chat:error', { error: 'BUSY', message: 'a generation is already in progress' });
        return;
      }
      const sid = payload.session_id || newId('asst');
      if (!ID_RE.test(sid)) {
        socket.emit('chat:error', { error: 'BAD_REQUEST', message: 'bad session_id' });
        return;
      }
      controller = new AbortController();
      const ctl = controller;
      try {
        socket.emit('chat:start', { session_id: sid });
        const result = await assistantChatTurn(
          sid, message, payload.model ?? null, payload.skills ?? null, socket.userId || null,
          {
            signal: ctl.signal,
            abort: () => ctl.abort(),
            onChunk: (text) => socket.emit('chat:token', { text }),
            onReset: () => socket.emit('chat:reset', {}),
          },
        );
        socket.emit('chat:done', result);
      } catch (err) {
        if (ctl.signal.aborted) socket.emit('chat:cancelled', {});
        else {
          logger.warn('cortex socket chat failed', { error: err.message });
          socket.emit('chat:error', {
            error: err.errorCode || err.code || 'INTERNAL_ERROR',
            message: err.message,
          });
        }
      } finally {
        if (controller === ctl) controller = null;
      }
    });

    socket.on('chat:cancel', () => {
      if (controller) controller.abort();
    });

    socket.on('disconnect', () => {
      // Same rule as the SSE path: a gone client must not keep a local
      // generation (and its semaphore slot) alive.
      if (controller) controller.abort();
    });
  });

  logger.info(`Cortex Socket.IO namespace registered: ${NAMESPACE}`);
  return nsp;
}

module.exports = { registerSockets, NAMESPACE };
