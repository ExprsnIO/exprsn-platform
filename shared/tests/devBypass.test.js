/**
 * DEV_BYPASS must be FAIL-CLOSED (SP-3 / R4).
 *
 * The dev auth bypass injects an admin identity, so it is security-critical that
 * it can NEVER engage outside development — regardless of headers, loopback
 * origin, or a valid secret. These tests lock that contract: production (and any
 * non-development env) is inert, and even in development every condition
 * (opt-in, >=32-char secret, loopback, matching header) is required.
 */

const path = require('path');

const {
  shouldBypass,
  bypassCA,
  bypassAuth,
} = require(path.join(__dirname, '..', 'middleware', 'devBypass'));

const SECRET = 'a'.repeat(48); // >= 32 chars
const loopbackReq = (overrides = {}) => ({
  ip: '127.0.0.1',
  path: '/x',
  method: 'GET',
  headers: { 'x-dev-bypass-secret': SECRET },
  ...overrides,
});

describe('DEV_BYPASS fail-closed', () => {
  const saved = {};
  beforeEach(() => {
    saved.NODE_ENV = process.env.NODE_ENV;
    saved.DEV_BYPASS = process.env.DEV_BYPASS;
    saved.DEV_BYPASS_SECRET = process.env.DEV_BYPASS_SECRET;
    // Default: a fully-configured, otherwise-valid bypass setup.
    process.env.DEV_BYPASS = 'true';
    process.env.DEV_BYPASS_SECRET = SECRET;
  });
  afterEach(() => {
    process.env.NODE_ENV = saved.NODE_ENV;
    process.env.DEV_BYPASS = saved.DEV_BYPASS;
    process.env.DEV_BYPASS_SECRET = saved.DEV_BYPASS_SECRET;
  });

  describe('non-development environments are always inert', () => {
    it.each(['production', 'staging', 'test', undefined])(
      'NODE_ENV=%s → no bypass even with valid secret + loopback + header',
      (env) => {
        if (env === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = env;
        expect(shouldBypass(loopbackReq())).toBe(false);
      }
    );

    it('bypassCA / bypassAuth inject NOTHING in production', () => {
      process.env.NODE_ENV = 'production';
      const reqA = loopbackReq();
      bypassCA(reqA, {}, () => {});
      expect(reqA.caToken).toBeUndefined();

      const reqB = loopbackReq();
      bypassAuth(reqB, {}, () => {});
      expect(reqB.user).toBeUndefined();
    });
  });

  describe('in development, every condition is still required', () => {
    beforeEach(() => { process.env.NODE_ENV = 'development'; });

    it('engages only when all conditions hold', () => {
      expect(shouldBypass(loopbackReq())).toBe(true);
    });

    it('is inert without explicit opt-in (DEV_BYPASS!=true)', () => {
      process.env.DEV_BYPASS = 'false';
      expect(shouldBypass(loopbackReq())).toBe(false);
    });

    it('is inert with a too-short secret (<32 chars)', () => {
      process.env.DEV_BYPASS_SECRET = 'short';
      expect(shouldBypass(loopbackReq({ headers: { 'x-dev-bypass-secret': 'short' } }))).toBe(false);
    });

    it('is inert from a non-loopback origin', () => {
      expect(shouldBypass(loopbackReq({ ip: '10.0.0.5' }))).toBe(false);
    });

    it('is inert with a wrong/missing header secret', () => {
      expect(shouldBypass(loopbackReq({ headers: { 'x-dev-bypass-secret': 'nope' } }))).toBe(false);
      expect(shouldBypass(loopbackReq({ headers: {} }))).toBe(false);
    });

    it('injects an identity only on a real bypass', () => {
      const req = loopbackReq();
      let nexted = false;
      bypassAuth(req, {}, () => { nexted = true; });
      expect(nexted).toBe(true);
      expect(req.user && req.user.bypass).toBe(true);
      expect(req.isAuthenticated()).toBe(true);
    });
  });
});
