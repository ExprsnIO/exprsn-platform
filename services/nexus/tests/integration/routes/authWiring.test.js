/**
 * Regression test for the auth-middleware wiring bug.
 *
 * `requireToken`/`optionalToken` in src/middleware/tokenAuth.js are FACTORIES:
 * `requireToken(options)` returns the actual `(req, res, next)` middleware.
 * Several routers used to pass them as BARE references (`requireToken,`
 * instead of `requireToken(),`). When Express receives the factory as
 * middleware it invokes it as `requireToken(req, res, next)` — `options`
 * becomes the request, the returned middleware is discarded, and `next()` is
 * never called. The result: protected routes are unauthenticated AND hang
 * until the socket times out.
 *
 * Unlike the other route suites, this test does NOT mock tokenAuth — it
 * exercises the real middleware so a regression to bare references is caught.
 * A protected endpoint hit without a bearer must return 401 promptly; a hang
 * (factory not invoked) trips the per-test timeout instead.
 *
 * See API_SURFACE.md "Nexus module" notes.
 */
// Neutralize require-time side effects in some routers' dependency graphs so
// the routers can be mounted in isolation. These are unrelated to auth wiring:
//   - eventReminderService builds a Bull queue at require time (needs real Redis)
//   - @exprsn/shared eagerly constructs a Stripe client (needs an API key)
process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_dummy';
jest.mock('bull', () => jest.fn().mockImplementation(() => ({
  process: jest.fn(),
  add: jest.fn().mockResolvedValue({}),
  on: jest.fn(),
  close: jest.fn().mockResolvedValue(undefined),
})));

const request = require('supertest');
const express = require('express');

// Real tokenAuth — the whole point of this test. ioredis is already mocked
// globally in tests/setup.js, and Sequelize does not connect until
// authenticate(), so requiring the routers is side-effect free here.

const PROTECTED_ENDPOINTS = [
  { name: 'events', mount: '/api/events', router: '../../../src/routes/events', method: 'post', path: '/' },
  { name: 'moderation', mount: '/api/moderation', router: '../../../src/routes/moderation', method: 'post', path: '/flags' },
  { name: 'recommendations', mount: '/api/recommendations', router: '../../../src/routes/recommendations', method: 'get', path: '/' },
  { name: 'governance', mount: '/api/governance', router: '../../../src/routes/governance', method: 'post', path: '/proposals' },
  { name: 'subgroups', mount: '/api/subgroups', router: '../../../src/routes/subgroups', method: 'post', path: '/' },
  { name: 'trending', mount: '/api/trending', router: '../../../src/routes/trending', method: 'post', path: '/update' },
];

describe('Auth middleware wiring (regression: bare requireToken factory)', () => {
  function buildApp(mount, routerPath) {
    const app = express();
    app.use(express.json());
    app.use(mount, require(routerPath));
    return app;
  }

  describe.each(PROTECTED_ENDPOINTS)('$name router', ({ mount, router, method, path }) => {
    it(`${'returns 401 (not a hang) for a protected route without a bearer token'}`, async () => {
      const app = buildApp(mount, router);
      const res = await request(app)[method](`${mount}${path === '/' ? '' : path}`).send({});
      // requireToken() short-circuits with 401 before any handler/service runs.
      // If the factory were passed bare, next() would never fire and this
      // would time out instead of returning a response.
      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('error');
    });
  });

  it('requireToken/optionalToken are factories that return middleware', () => {
    const { requireToken, optionalToken } = require('../../../src/middleware/tokenAuth');
    expect(typeof requireToken).toBe('function');
    expect(typeof optionalToken).toBe('function');
    // The factory takes options; the middleware it returns takes (req,res,next).
    expect(requireToken().length).toBe(3);
    expect(optionalToken().length).toBe(3);
  });
});
