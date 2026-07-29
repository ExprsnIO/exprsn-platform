'use strict';

/**
 * BUG-068 — production redaction must be identical on all three transports.
 *
 * The defect was not "the streaming paths forgot an env check"; it was that the
 * rule lived in one transport's handler, so the other two could silently
 * diverge. These tests pin the rule itself AND the agreement between transports,
 * because the agreement is the property that actually broke.
 */

process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_dummy';

const config = require('../../src/config');
const {
  toClientError, shouldRedact, statusOf, GENERIC_MESSAGE,
} = require('../../src/lib/clientError');

const UPSTREAM = "chat(no-such-model) -> 404: {\"error\":{\"message\":\"model not found\"}}";

const REAL_ENV = config.env;
afterEach(() => { config.env = REAL_ENV; });

function err(message, extra = {}) {
  return Object.assign(new Error(message), extra);
}

describe('statusOf', () => {
  it('reads statusCode, then status, then defaults to 500', () => {
    expect(statusOf(err('x', { statusCode: 503 }))).toBe(503);
    expect(statusOf(err('x', { status: 400 }))).toBe(400);
    expect(statusOf(err('x'))).toBe(500);
  });
});

describe('shouldRedact — production 5xx only', () => {
  it.each([
    ['production', 500, true],
    ['production', 503, true],
    ['production', 400, false],
    ['production', 404, false],
    ['development', 500, false],
    ['test', 500, false],
  ])('%s / %i → redact=%s', (env, status, expected) => {
    config.env = env;
    expect(shouldRedact(err('boom', { statusCode: status }))).toBe(expected);
  });
});

describe('toClientError', () => {
  it('withholds an upstream 5xx message in production', () => {
    config.env = 'production';
    const out = toClientError(err(UPSTREAM, { code: 'LLM_UNAVAILABLE' }), null);
    expect(out.message).toBe(GENERIC_MESSAGE);
    expect(out.message).not.toContain('no-such-model');
    expect(out.error).toBe('LLM_UNAVAILABLE');
  });

  it('keeps the real message in development — the detail is the point there', () => {
    config.env = 'development';
    expect(toClientError(err(UPSTREAM), null).message).toBe(UPSTREAM);
  });

  it('keeps a 4xx message even in production — the caller needs to know why', () => {
    config.env = 'production';
    expect(toClientError(err('bad session_id', { statusCode: 400 }), null).message)
      .toBe('bad session_id');
  });

  it('always logs the REAL message server-side, even when redacting', () => {
    config.env = 'production';
    const logger = { error: jest.fn() };
    const out = toClientError(err(UPSTREAM), logger, { transport: 'sse' });
    expect(out.message).toBe(GENERIC_MESSAGE);
    const [, logged] = logger.error.mock.calls[0];
    expect(logged.error).toBe(UPSTREAM);          // full detail retained
    expect(logged.transport).toBe('sse');          // context threaded through
    expect(logged.correlationId).toBe(out.correlationId);
  });

  it('issues a fresh correlation id per call so a redacted error stays diagnosable', () => {
    const a = toClientError(err('x'), null);
    const b = toClientError(err('x'), null);
    expect(a.correlationId).toMatch(/^[0-9a-f-]{36}$/);
    expect(a.correlationId).not.toBe(b.correlationId);
  });

  it('falls back to INTERNAL_ERROR and a generic message for a shapeless error', () => {
    const out = toClientError(err(''), null);
    expect(out.error).toBe('INTERNAL_ERROR');
    expect(out.message).toBe(GENERIC_MESSAGE);
  });
});

describe('cross-transport agreement — the property that actually broke', () => {
  it('produces a byte-identical payload shape for every transport', () => {
    config.env = 'production';
    const e = err(UPSTREAM, { code: 'LLM_UNAVAILABLE' });
    const buffered = toClientError(e, null, { path: '/chat' });
    const sse = toClientError(e, null, { transport: 'sse' });
    const socket = toClientError(e, null, { transport: 'socket' });

    for (const out of [buffered, sse, socket]) {
      expect(Object.keys(out).sort()).toEqual(['correlationId', 'error', 'message']);
      expect(out.error).toBe('LLM_UNAVAILABLE');
      expect(out.message).toBe(GENERIC_MESSAGE);
    }
  });

  it('no transport can leak upstream detail that another redacts', () => {
    config.env = 'production';
    const e = err(UPSTREAM);
    for (const ctx of [{ path: '/chat' }, { transport: 'sse' }, { transport: 'socket' }]) {
      expect(toClientError(e, null, ctx).message).not.toContain('no-such-model');
    }
  });
});
