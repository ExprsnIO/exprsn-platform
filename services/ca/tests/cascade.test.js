/**
 * Focused test for the cert→token revocation cascade (security-critical).
 *
 * Self-contained: the DB layer (../models) and the Redis cache (../utils/redis)
 * are mocked, so this runs without live Postgres/Redis.
 */

jest.mock('../models', () => ({
  Token: { findAll: jest.fn(), update: jest.fn() },
  Certificate: {},
  AuditLog: { log: jest.fn().mockResolvedValue(undefined) }
}));

jest.mock('../utils/redis', () => ({
  del: jest.fn().mockResolvedValue(1),
  get: jest.fn(),
  set: jest.fn()
}));

const { Token } = require('../models');
const redisClient = require('../utils/redis');
const tokenService = require('../services/token');

describe('cert→token revocation cascade', () => {
  beforeEach(() => jest.clearAllMocks());

  test('revokes all active tokens for the certificate and clears their caches', async () => {
    const certificateId = 'cert-1';
    Token.findAll.mockResolvedValue([{ id: 't1' }, { id: 't2' }]);
    Token.update.mockResolvedValue([2]);

    const count = await tokenService.revokeTokensByCertificateId(certificateId, 'certificate_revoked');

    expect(count).toBe(2);
    expect(Token.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ where: { certificateId, status: 'active' } })
    );
    expect(Token.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'revoked', revokedReason: 'certificate_revoked' }),
      { where: { certificateId, status: 'active' } }
    );
    expect(redisClient.del).toHaveBeenCalledWith('token:validation:t1');
    expect(redisClient.del).toHaveBeenCalledWith('token:validation:t2');
  });

  test('returns 0 and performs no bulk update when there are no active tokens', async () => {
    Token.findAll.mockResolvedValue([]);

    const count = await tokenService.revokeTokensByCertificateId('cert-empty');

    expect(count).toBe(0);
    expect(Token.update).not.toHaveBeenCalled();
    expect(redisClient.del).not.toHaveBeenCalled();
  });

  test('defaults the reason to certificate_revoked', async () => {
    Token.findAll.mockResolvedValue([{ id: 't9' }]);
    Token.update.mockResolvedValue([1]);

    await tokenService.revokeTokensByCertificateId('cert-2');

    expect(Token.update).toHaveBeenCalledWith(
      expect.objectContaining({ revokedReason: 'certificate_revoked' }),
      expect.anything()
    );
  });
});
