/**
 * FEAT-077 — data-scoped token lookup + revocation (service layer only, no
 * route). FileVault's capability façade sweeps standalone 'file-access'
 * capability tokens — which have no local ShareLink row — via the tokenData
 * JSONB they were minted with ({ fileId, sharedBy, shareType }).
 *
 * Self-contained: the DB layer (../models) and the Redis cache (../utils/redis)
 * are mocked, same as cascade.test.js.
 */

const { Op } = require('sequelize');

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

const { Token, AuditLog } = require('../models');
const redisClient = require('../utils/redis');
const tokenService = require('../services/token');

const MATCH = { fileId: 'file-1', shareType: 'file-access' };

describe('findTokensByData', () => {
  beforeEach(() => jest.clearAllMocks());

  test('queries active tokens by JSONB containment on tokenData', async () => {
    Token.findAll.mockResolvedValue([{ id: 't1' }]);

    const result = await tokenService.findTokensByData(MATCH);

    expect(result).toEqual([{ id: 't1' }]);
    expect(Token.findAll).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        tokenData: { [Op.contains]: MATCH },
        status: 'active'
      }
    }));
  });

  test('status: null lifts the active-only filter', async () => {
    Token.findAll.mockResolvedValue([]);
    await tokenService.findTokensByData(MATCH, { status: null });
    expect(Token.findAll).toHaveBeenCalledWith(expect.objectContaining({
      where: { tokenData: { [Op.contains]: MATCH } }
    }));
  });

  test.each([
    ['undefined', undefined],
    ['empty object', {}],
    ['array', ['x']],
    ['string', 'fileId']
  ])('rejects a %s match (no accidental match-everything sweep)', async (_label, bad) => {
    await expect(tokenService.findTokensByData(bad))
      .rejects.toMatchObject({ code: 'DATA_MATCH_REQUIRED' });
    expect(Token.findAll).not.toHaveBeenCalled();
  });
});

describe('revokeTokensByData', () => {
  beforeEach(() => jest.clearAllMocks());

  test('revokes every matched active token, clears caches, audits, returns the count', async () => {
    Token.findAll.mockResolvedValue([{ id: 't1' }, { id: 't2' }]);
    Token.update.mockResolvedValue([2]);

    const count = await tokenService.revokeTokensByData(MATCH, 'resource-replaced', {
      revokedBy: 'user-1'
    });

    expect(count).toBe(2);
    expect(Token.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'revoked',
        revokedReason: 'resource-replaced',
        revokedBy: 'user-1'
      }),
      { where: { id: ['t1', 't2'], status: 'active' } }
    );
    expect(redisClient.del).toHaveBeenCalledWith('token:validation:t1');
    expect(redisClient.del).toHaveBeenCalledWith('token:validation:t2');
    expect(AuditLog.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'token.revoke.byData' }));
  });

  test('returns 0 and performs no update when nothing matches (success, not error)', async () => {
    Token.findAll.mockResolvedValue([]);
    const count = await tokenService.revokeTokensByData(MATCH);
    expect(count).toBe(0);
    expect(Token.update).not.toHaveBeenCalled();
    expect(redisClient.del).not.toHaveBeenCalled();
  });

  test('a Redis cache failure does not abort the revocation (rows are source of truth)', async () => {
    Token.findAll.mockResolvedValue([{ id: 't1' }]);
    Token.update.mockResolvedValue([1]);
    redisClient.del.mockRejectedValue(new Error('redis down'));

    await expect(tokenService.revokeTokensByData(MATCH)).resolves.toBe(1);
  });
});
