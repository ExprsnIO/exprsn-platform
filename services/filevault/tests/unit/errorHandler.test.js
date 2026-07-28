'use strict';

/**
 * BUG-058 — filevault's error handler must not leak raw internal error
 * messages in ANY environment, and must always return a correlationId
 * (matching the posture of shared/middleware/errorHandler.js and the gateway
 * central error handler). Known operational error codes (errorMap keys) are
 * still safe to echo back verbatim.
 */

process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_dummy';

function buildRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

function buildReq() {
  return { path: '/api/files/123', method: 'GET', userId: 'user-1' };
}

describe('filevault errorHandler (BUG-058)', () => {
  let originalEnv;

  beforeEach(() => {
    jest.resetModules();
    originalEnv = process.env.NODE_ENV;
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  test('a known operational error code is echoed back with its mapped status + correlationId', () => {
    process.env.NODE_ENV = 'production';
    const { errorHandler } = require('../../src/middleware/errorHandler');
    const req = buildReq();
    const res = buildRes();

    errorHandler(new Error('FILE_NOT_FOUND'), req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(404);
    const body = res.json.mock.calls[0][0];
    expect(body.error).toBe('FILE_NOT_FOUND');
    expect(body.message).toBe('The requested file was not found');
    expect(typeof body.correlationId).toBe('string');
    expect(body.correlationId.length).toBeGreaterThan(0);
    expect(body.stack).toBeUndefined();
    expect(body.details).toBeUndefined();
  });

  test('an unmapped internal error message is NEVER leaked, even outside development', () => {
    process.env.NODE_ENV = 'production';
    const { errorHandler } = require('../../src/middleware/errorHandler');
    const req = buildReq();
    const res = buildRes();

    errorHandler(new Error('relation "file_versions" does not exist'), req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(500);
    const body = res.json.mock.calls[0][0];
    expect(body.error).toBe('INTERNAL_SERVER_ERROR');
    expect(body.message).toBe('An unexpected error occurred');
    expect(JSON.stringify(body)).not.toMatch(/file_versions/);
    expect(typeof body.correlationId).toBe('string');
    expect(body.stack).toBeUndefined();
    expect(body.details).toBeUndefined();
  });

  test('development env still dev-gates stack/details on an unmapped error, but never leaks the raw message as `error`/`message`', () => {
    process.env.NODE_ENV = 'development';
    const { errorHandler } = require('../../src/middleware/errorHandler');
    const req = buildReq();
    const res = buildRes();

    errorHandler(new Error('some raw internal failure'), req, res, jest.fn());

    const body = res.json.mock.calls[0][0];
    expect(body.error).toBe('INTERNAL_SERVER_ERROR');
    expect(body.message).toBe('An unexpected error occurred');
    expect(body.stack).toBeDefined();
    expect(body.details).toBeDefined();
    expect(typeof body.correlationId).toBe('string');
  });
});
