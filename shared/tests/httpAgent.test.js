/**
 * Internal HTTPS agent must VERIFY TLS in production (SP-4 / R2).
 *
 * Loopback service-to-service calls reuse this agent. Outside production it
 * accepts the dev self-signed cert; in production it must reject an untrusted
 * chain. The agent is memoized, so each case re-requires the module fresh.
 */

describe('getInternalHttpsAgent', () => {
  const saved = process.env.NODE_ENV;
  afterEach(() => { process.env.NODE_ENV = saved; });

  it('verifies TLS (rejectUnauthorized=true) in production', () => {
    jest.resetModules();
    process.env.NODE_ENV = 'production';
    // eslint-disable-next-line global-require
    const { getInternalHttpsAgent } = require('../utils/httpAgent');
    expect(getInternalHttpsAgent().options.rejectUnauthorized).toBe(true);
  });

  it('relaxes verification outside production', () => {
    jest.resetModules();
    process.env.NODE_ENV = 'development';
    // eslint-disable-next-line global-require
    const { getInternalHttpsAgent } = require('../utils/httpAgent');
    expect(getInternalHttpsAgent().options.rejectUnauthorized).toBe(false);
  });
});
