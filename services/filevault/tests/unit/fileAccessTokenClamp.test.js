'use strict';

/**
 * TASK-056 — `createFileAccessToken` must clamp `shareType:'file-access'` mints
 * to {read:true, write:false, delete:false} server-side, regardless of what the
 * caller passes in `options.permissions`. Before this fix the request body's
 * permissions were spread over the read-only default, letting an owner mint a
 * persistent write/delete capability token via
 * POST /filevault/api/share/files/:id/access-token.
 */

process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_dummy';

const mockFileFindOne = jest.fn();
jest.mock('../../src/models', () => ({
  File: { findOne: (...a) => mockFileFindOne(...a) },
  ShareLink: {},
}));

const mockGenerateToken = jest.fn();
jest.mock('../../../ca/services/token', () => ({
  generateToken: (...a) => mockGenerateToken(...a),
}));
jest.mock('../../../ca/services/platformSigning', () => ({
  getSigningCertificateId: jest.fn().mockResolvedValue('cert-1'),
}));

const shareService = require('../../src/services/shareService');

const FILE_ID = 'file-1';
const USER_ID = 'user-1';

beforeEach(() => {
  jest.clearAllMocks();
  mockFileFindOne.mockResolvedValue({ id: FILE_ID, userId: USER_ID, isDeleted: false });
  mockGenerateToken.mockResolvedValue({ id: 'token-1', expiresAt: null });
});

describe('createFileAccessToken (TASK-056 clamp)', () => {
  test('a caller trying to mint write/delete gets clamped to read-only', async () => {
    const result = await shareService.createFileAccessToken(FILE_ID, USER_ID, {
      permissions: { read: true, write: true, delete: true },
    });

    expect(result.permissions).toEqual({ read: true, write: false, delete: false });
    expect(mockGenerateToken).toHaveBeenCalledWith(
      expect.objectContaining({
        permissions: { read: true, write: false, delete: false },
      }),
      USER_ID,
      { isAdmin: true }
    );
  });

  test('no permissions passed still mints read-only', async () => {
    const result = await shareService.createFileAccessToken(FILE_ID, USER_ID, {});
    expect(result.permissions).toEqual({ read: true, write: false, delete: false });
  });

  test('read:false in the request body is also ignored — read stays forced true', async () => {
    const result = await shareService.createFileAccessToken(FILE_ID, USER_ID, {
      permissions: { read: false, write: true },
    });
    expect(result.permissions).toEqual({ read: true, write: false, delete: false });
  });
});
