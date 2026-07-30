'use strict';

/**
 * ═══════════════════════════════════════════════════════════
 * Server-Sent Events helper (FEAT-090) — the platform's first SSE surface.
 *
 * Getting bytes to actually leave the process incrementally takes more than
 * writing to `res`; there are three buffering layers between the handler and
 * the browser, and every one of them will happily hold a whole response:
 *
 *  1. **The gateway's `compression()` middleware.** It is mounted app-wide in
 *     `src/gateway.js`, and `text/event-stream` is `compressible`, so by
 *     default every frame goes into a gzip buffer and the client sees nothing
 *     until the stream ends. Solved at the source: gateway `compression()` now
 *     carries a filter that skips `text/event-stream` (the fix belongs there,
 *     not here, so any future SSE route inherits it). `Cache-Control:
 *     no-transform` is sent too as belt-and-braces against intermediaries.
 *  2. **nginx**, which buffers proxied responses by default. `X-Accel-Buffering:
 *     no` turns that off for this response only.
 *  3. **Node's own socket.** `flushHeaders()` gets the response head out before
 *     the first token exists, so the client's EventSource/fetch resolves
 *     immediately rather than at first byte of body.
 *
 * Frames are `event:`/`data:` pairs with JSON payloads. Multi-line payloads are
 * impossible here because JSON.stringify escapes newlines — which is exactly
 * why the payload is always JSON, never raw text.
 * ═══════════════════════════════════════════════════════════
 */

// Comment frames double as keep-alive: they are valid SSE, ignored by every
// client, and stop an idle proxy from reaping the connection while a slow local
// model thinks. Local generations regularly exceed common 60s idle timeouts.
const HEARTBEAT_MS = 15000;

/**
 * Put `res` into SSE mode and return a small writer.
 *
 * The writer never throws on a dead socket: a client that navigated away is the
 * normal way one of these ends, not an error to propagate into the turn logic.
 */
function openSSE(req, res, { heartbeatMs = HEARTBEAT_MS } = {}) {
  res.status(200);
  res.set({
    'Content-Type': 'text/event-stream; charset=utf-8',
    // no-transform tells intermediaries not to re-encode (i.e. not to gzip);
    // no-cache/no-store keep it out of every cache on the way.
    'Cache-Control': 'no-cache, no-store, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();

  let closed = false;
  const heartbeat = setInterval(() => {
    if (!closed) {
      try {
        res.write(': ping\n\n');
      } catch { /* socket gone; `close` will clean up */ }
    }
  }, heartbeatMs);
  // Never let the keep-alive timer hold the process open (BUG-055/061 posture).
  if (typeof heartbeat.unref === 'function') heartbeat.unref();

  function cleanup() {
    if (closed) return;
    closed = true;
    clearInterval(heartbeat);
  }

  // Liveness is tracked on the RESPONSE, never on the request. `req`'s 'close'
  // fires as soon as the request stream is done being read — which for a POST
  // with a body is immediately, long before the client goes anywhere. Wiring
  // cleanup to `req` marks the stream dead on the first token and the response
  // never ends. `res`'s 'close' is the real signal: it fires when the
  // connection goes away or the response finishes.
  res.on('close', cleanup);

  return {
    /** Write one named event with a JSON payload. No-op once closed. */
    send(event, data) {
      if (closed) return;
      try {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data ?? {})}\n\n`);
      } catch {
        cleanup();
      }
    },
    /** Terminal frame + end the response. */
    close(event, data) {
      if (closed) return;
      try {
        if (event) res.write(`event: ${event}\ndata: ${JSON.stringify(data ?? {})}\n\n`);
        res.end();
      } catch { /* already gone */ }
      cleanup();
    },
    get closed() {
      return closed;
    },
    /**
     * Fires when the CLIENT goes away (tab closed, navigation, network drop) —
     * and only then. `writableEnded` distinguishes a real disconnect from our
     * own `close()`, which also emits 'close' on the response.
     */
    onClientGone(fn) {
      res.on('close', () => {
        if (!res.writableEnded) fn();
      });
    },
  };
}

module.exports = { openSSE, HEARTBEAT_MS };
