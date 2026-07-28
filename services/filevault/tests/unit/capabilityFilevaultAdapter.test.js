'use strict';

/**
 * FEAT-077 — FileVault/ShareLink capability adapter, exercised through the
 * façade (capabilityService) with the REAL shareService / fileService /
 * imageModerationService underneath, and the models + CA token service
 * mocked (the same pattern as fileAccessTokenClamp / roomMemberDownload).
 *
 * Pins:
 *  - grant: url/credential shapes identical to today's shareService output;
 *    provenance derived from the verified File row, never from opts (BUG-026);
 *    'file-access' stays read-only (TASK-056 clamp not reopened)
 *  - authorize: full fail-closed matrix — wrong/missing token, expired,
 *    exhausted, CA-revoked, permission-short, moderation-held — all the same
 *    CAP_NOT_FOUND; the ONE codified exception (CA unreachable ≠ deny for a
 *    locally-valid link); owner-minted grants survive a private-flip
 *  - revokeByResource: sweeps BOTH ShareLink rows (+ their CA tokens) AND
 *    standalone file-access tokens via the CA data-filtered sweep
 *  - listByResource: owner-only, descriptors for both kinds
 */

process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_dummy';

const mockFileFindOne = jest.fn();
const mockShareLinkCreate = jest.fn();
const mockShareLinkFindOne = jest.fn();
const mockShareLinkFindAll = jest.fn();
const mockModerationFindOne = jest.fn();
jest.mock('../../src/models', () => ({
  File: { findOne: (...a) => mockFileFindOne(...a), findAll: jest.fn() },
  ShareLink: {
    create: (...a) => mockShareLinkCreate(...a),
    findOne: (...a) => mockShareLinkFindOne(...a),
    findAll: (...a) => mockShareLinkFindAll(...a)
  },
  FileModeration: { findOne: (...a) => mockModerationFindOne(...a) },
  FileVersion: {},
  Directory: {},
  sequelize: { transaction: jest.fn() }
}));

jest.mock('../../src/storage', () => ({
  retrieve: jest.fn(),
  selectBackend: jest.fn(),
  store: jest.fn()
}));

const mockGenerateToken = jest.fn();
const mockValidateToken = jest.fn();
const mockRevokeToken = jest.fn();
const mockRevokeTokensByData = jest.fn();
const mockFindTokensByData = jest.fn();
jest.mock('../../../ca/services/token', () => ({
  generateToken: (...a) => mockGenerateToken(...a),
  validateToken: (...a) => mockValidateToken(...a),
  revokeToken: (...a) => mockRevokeToken(...a),
  revokeTokensByData: (...a) => mockRevokeTokensByData(...a),
  findTokensByData: (...a) => mockFindTokensByData(...a)
}));
jest.mock('../../../ca/services/platformSigning', () => ({
  getSigningCertificateId: jest.fn().mockResolvedValue('cert-1')
}));

const cap = require('../../src/services/capabilityService');

const FILE_ID = 'file-1';
const OWNER = 'owner-1';
const STRANGER = 'stranger-9';

function fileRow(overrides = {}) {
  return {
    id: FILE_ID,
    userId: OWNER,
    visibility: 'public',
    isDeleted: false,
    ...overrides
  };
}

function shareLinkRow(overrides = {}) {
  return {
    id: 'share-1',
    fileId: FILE_ID,
    userId: OWNER,
    tokenId: 'tok-1',
    permissions: { read: true, write: false, delete: false },
    expiresAt: null,
    maxUses: null,
    useCount: 0,
    isRevoked: false,
    createdAt: new Date('2026-07-01'),
    file: fileRow(),
    increment: jest.fn().mockResolvedValue(undefined),
    update: jest.fn().mockResolvedValue(undefined),
    ...overrides
  };
}

const CAP_DENIED = { name: 'CapabilityError', code: 'CAP_NOT_FOUND' };

beforeEach(() => {
  jest.clearAllMocks();
  mockValidateToken.mockResolvedValue({ valid: true, tokenData: { fileId: FILE_ID } });
  mockModerationFindOne.mockResolvedValue({ status: 'approved' });
});

describe('grant', () => {
  test("kind 'link' preserves today's credential + shareUrl shape and derives provenance", async () => {
    mockFileFindOne.mockResolvedValue(fileRow({ visibility: 'private' }));
    mockGenerateToken.mockResolvedValue({ id: 'tok-1', expiresAt: null });
    mockShareLinkCreate.mockImplementation(async (attrs) => shareLinkRow({ ...attrs, id: 'share-1' }));

    const result = await cap.grant('file', FILE_ID, OWNER, {
      kind: 'link',
      // provenance-shaped junk in opts must be IGNORED (BUG-026)
      provenance: { mintedAsOwner: false, mintedBy: 'attacker' },
      maxUses: 3
    });

    expect(result.credential).toEqual({ shareLinkId: 'share-1', token: 'tok-1' });
    expect(result.url).toMatch(/\/filevault\/api\/share\/share-1\/download\?token=tok-1$/);
    expect(result.capability).toMatchObject({
      id: 'share-1',
      resourceType: 'file',
      resourceId: FILE_ID,
      backend: 'filevault-sharelink',
      kind: 'link',
      provenance: { mintedBy: OWNER, mintedAsOwner: true, mintedUnderVisibility: 'private' }
    });
  });

  test("kind 'file-access' mints read-only regardless of opts (TASK-056 clamp intact)", async () => {
    mockFileFindOne.mockResolvedValue(fileRow());
    mockGenerateToken.mockResolvedValue({ id: 'tok-fa', expiresAt: null });

    const result = await cap.grant('file', FILE_ID, OWNER, {
      kind: 'file-access',
      permissions: { read: true, write: true, delete: true }
    });

    expect(result.credential).toEqual({ token: 'tok-fa' });
    expect(result.url).toBe(`/filevault/api/share/file/${FILE_ID}/download?token=tok-fa`);
    expect(result.capability.permissions).toEqual({ read: true, write: false, delete: false });
    expect(mockGenerateToken).toHaveBeenCalledWith(
      expect.objectContaining({ permissions: { read: true, write: false, delete: false } }),
      OWNER,
      { isAdmin: true }
    );
  });

  test('a missing or non-owned resource denies with CAP_NOT_FOUND', async () => {
    mockFileFindOne.mockResolvedValue(null);
    await expect(cap.grant('file', FILE_ID, STRANGER, { kind: 'link' }))
      .rejects.toMatchObject(CAP_DENIED);
    expect(mockGenerateToken).not.toHaveBeenCalled();
  });

  test('an unknown kind denies with CAP_NOT_FOUND', async () => {
    mockFileFindOne.mockResolvedValue(fileRow());
    await expect(cap.grant('file', FILE_ID, OWNER, { kind: 'room-grant' }))
      .rejects.toMatchObject(CAP_DENIED);
  });
});

describe("authorize — 'link' path", () => {
  test('a valid link authorizes, consumes a use, and returns the verified file', async () => {
    const row = shareLinkRow();
    mockShareLinkFindOne.mockResolvedValue(row);

    const result = await cap.authorize('file', { shareLinkId: 'share-1', token: 'tok-1' }, {});

    expect(result.resource.id).toBe(FILE_ID);
    expect(result.capability).toMatchObject({ id: 'share-1', kind: 'link' });
    expect(row.increment).toHaveBeenCalledWith('useCount');
  });

  test.each([
    ['missing row', () => mockShareLinkFindOne.mockResolvedValue(null), 'tok-1'],
    ['wrong token (secret mismatch)', () => mockShareLinkFindOne.mockResolvedValue(shareLinkRow()), 'tok-WRONG'],
    ['no token at all', () => mockShareLinkFindOne.mockResolvedValue(shareLinkRow()), undefined],
    ['expired', () => mockShareLinkFindOne.mockResolvedValue(
      shareLinkRow({ expiresAt: new Date(Date.now() - 1000) })), 'tok-1'],
    ['exhausted (useCount >= maxUses)', () => mockShareLinkFindOne.mockResolvedValue(
      shareLinkRow({ maxUses: 2, useCount: 2 })), 'tok-1']
  ])('%s denies with CAP_NOT_FOUND', async (_label, setup, token) => {
    setup();
    await expect(cap.authorize('file', { shareLinkId: 'share-1', token }, {}))
      .rejects.toMatchObject(CAP_DENIED);
  });

  test('an explicit CA TOKEN_REVOKED verdict denies', async () => {
    mockShareLinkFindOne.mockResolvedValue(shareLinkRow());
    mockValidateToken.mockResolvedValue({ valid: false, error: 'TOKEN_REVOKED' });
    await expect(cap.authorize('file', { shareLinkId: 'share-1', token: 'tok-1' }, {}))
      .rejects.toMatchObject(CAP_DENIED);
  });

  test('CA UNREACHABLE does not kill a locally-valid link (the one codified exception)', async () => {
    const row = shareLinkRow();
    mockShareLinkFindOne.mockResolvedValue(row);
    mockValidateToken.mockRejectedValue(new Error('connect ECONNREFUSED'));

    const result = await cap.authorize('file', { shareLinkId: 'share-1', token: 'tok-1' }, {});
    expect(result.resource.id).toBe(FILE_ID);
    expect(row.increment).toHaveBeenCalled();
  });

  test('permission-short: requiring write on a read-only link denies', async () => {
    mockShareLinkFindOne.mockResolvedValue(shareLinkRow());
    await expect(cap.authorize('file', { shareLinkId: 'share-1', token: 'tok-1' },
      { requiredPermissions: { read: true, write: true } }))
      .rejects.toMatchObject(CAP_DENIED);
  });

  test('a held (pending) image denies for an anonymous requester — moderation gate', async () => {
    mockShareLinkFindOne.mockResolvedValue(shareLinkRow());
    mockModerationFindOne.mockResolvedValue({ status: 'pending' });
    await expect(cap.authorize('file', { shareLinkId: 'share-1', token: 'tok-1' }, {}))
      .rejects.toMatchObject(CAP_DENIED);
  });

  test('the uploader still sees their own held image (canServe exemption)', async () => {
    mockShareLinkFindOne.mockResolvedValue(shareLinkRow());
    mockModerationFindOne.mockResolvedValue({ status: 'pending' });
    const result = await cap.authorize('file', { shareLinkId: 'share-1', token: 'tok-1' },
      { requesterId: OWNER });
    expect(result.resource.id).toBe(FILE_ID);
  });

  test('owner-minted link SURVIVES the private-flip for an anonymous requester', async () => {
    mockShareLinkFindOne.mockResolvedValue(
      shareLinkRow({ file: fileRow({ visibility: 'private' }) }));
    const result = await cap.authorize('file', { shareLinkId: 'share-1', token: 'tok-1' }, {});
    expect(result.resource.visibility).toBe('private');
  });
});

describe("authorize — 'file-access' path", () => {
  test('a valid token scoped to the file authorizes read', async () => {
    mockFileFindOne.mockResolvedValue(fileRow());
    const result = await cap.authorize('file', { token: 'tok-fa' },
      { resourceId: FILE_ID, requesterId: STRANGER });
    expect(result.resource.id).toBe(FILE_ID);
    expect(result.capability).toMatchObject({
      id: 'tok-fa',
      kind: 'file-access',
      permissions: { read: true, write: false, delete: false },
      provenance: { mintedBy: OWNER, mintedAsOwner: true }
    });
  });

  test('missing ctx.resourceId denies', async () => {
    await expect(cap.authorize('file', { token: 'tok-fa' }, {}))
      .rejects.toMatchObject(CAP_DENIED);
  });

  test('requiring write denies without even reaching the CA (read-only by construction)', async () => {
    await expect(cap.authorize('file', { token: 'tok-fa' },
      { resourceId: FILE_ID, requiredPermissions: { read: true, write: true } }))
      .rejects.toMatchObject(CAP_DENIED);
    expect(mockValidateToken).not.toHaveBeenCalled();
  });

  test('a token scoped to a DIFFERENT file denies', async () => {
    mockValidateToken.mockResolvedValue({ valid: true, tokenData: { fileId: 'other-file' } });
    await expect(cap.authorize('file', { token: 'tok-fa' }, { resourceId: FILE_ID }))
      .rejects.toMatchObject(CAP_DENIED);
  });

  test('an invalid/revoked token denies', async () => {
    mockValidateToken.mockResolvedValue({ valid: false, error: 'TOKEN_REVOKED' });
    await expect(cap.authorize('file', { token: 'tok-fa' }, { resourceId: FILE_ID }))
      .rejects.toMatchObject(CAP_DENIED);
  });
});

describe('revoke', () => {
  test('a ShareLink id takes the existing revokeShareLink path (row + CA token)', async () => {
    const row = shareLinkRow();
    mockShareLinkFindOne.mockResolvedValue(row);
    mockRevokeToken.mockResolvedValue({});

    await expect(cap.revoke('file', 'share-1', OWNER)).resolves.toBe(true);
    expect(row.update).toHaveBeenCalledWith(
      expect.objectContaining({ isRevoked: true }));
    expect(mockRevokeToken).toHaveBeenCalledWith(
      'tok-1', 'Share link revoked', null, { isAdmin: true });
  });

  test('a standalone file-access token id is verified as ours, then revoked actor-checked', async () => {
    mockShareLinkFindOne.mockResolvedValue(null); // not a ShareLink
    mockValidateToken.mockResolvedValue({
      valid: true, tokenData: { fileId: FILE_ID, shareType: 'file-access' }
    });
    mockRevokeToken.mockResolvedValue({});

    await expect(cap.revoke('file', 'tok-fa', OWNER)).resolves.toBe(true);
    expect(mockRevokeToken).toHaveBeenCalledWith('tok-fa', 'Capability revoked', OWNER);
  });

  test('an arbitrary CA token that is NOT a file-access capability cannot be revoked here', async () => {
    mockShareLinkFindOne.mockResolvedValue(null);
    mockValidateToken.mockResolvedValue({
      valid: true, tokenData: { fileId: FILE_ID, shareType: 'link' }
    });
    await expect(cap.revoke('file', 'tok-1', OWNER)).rejects.toMatchObject(CAP_DENIED);
    expect(mockRevokeToken).not.toHaveBeenCalled();
  });

  test("an unauthorized actor's CA denial maps to the same CAP_NOT_FOUND", async () => {
    mockShareLinkFindOne.mockResolvedValue(null);
    mockValidateToken.mockResolvedValue({
      valid: true, tokenData: { fileId: FILE_ID, shareType: 'file-access' }
    });
    const err = new Error('not yours');
    err.code = 'REVOKE_NOT_AUTHORIZED';
    mockRevokeToken.mockRejectedValue(err);
    await expect(cap.revoke('file', 'tok-fa', STRANGER)).rejects.toMatchObject(CAP_DENIED);
  });
});

describe('revokeByResource — the TASK-055 hammer', () => {
  test('sweeps ShareLink rows (+ their CA tokens) AND standalone file-access tokens', async () => {
    const rowA = shareLinkRow({ id: 'share-A', tokenId: 'tok-A' });
    const rowB = shareLinkRow({ id: 'share-B', tokenId: 'tok-B' });
    mockShareLinkFindAll.mockResolvedValue([rowA, rowB]);
    mockRevokeToken.mockResolvedValue({});
    mockRevokeTokensByData.mockResolvedValue(3);

    const result = await cap.revokeByResource('file', FILE_ID, { reason: 'resource-replaced' });

    expect(result).toEqual({ revoked: 5 });
    expect(rowA.update).toHaveBeenCalledWith(expect.objectContaining({ isRevoked: true }));
    expect(rowB.update).toHaveBeenCalledWith(expect.objectContaining({ isRevoked: true }));
    expect(mockRevokeToken).toHaveBeenCalledWith('tok-A', 'resource-replaced', null, { isAdmin: true });
    expect(mockRevokeToken).toHaveBeenCalledWith('tok-B', 'resource-replaced', null, { isAdmin: true });
    expect(mockRevokeTokensByData).toHaveBeenCalledWith(
      { fileId: FILE_ID, shareType: 'file-access' },
      'resource-replaced',
      expect.any(Object)
    );
  });

  test('zero outstanding capabilities is success, not an error', async () => {
    mockShareLinkFindAll.mockResolvedValue([]);
    mockRevokeTokensByData.mockResolvedValue(0);
    await expect(cap.revokeByResource('file', FILE_ID)).resolves.toEqual({ revoked: 0 });
  });

  test('a per-row CA revoke failure is best-effort — the sweep still completes', async () => {
    const row = shareLinkRow({ id: 'share-A', tokenId: 'tok-A' });
    mockShareLinkFindAll.mockResolvedValue([row]);
    mockRevokeToken.mockRejectedValue(new Error('CA hiccup'));
    mockRevokeTokensByData.mockResolvedValue(1);

    const result = await cap.revokeByResource('file', FILE_ID);
    expect(result).toEqual({ revoked: 2 });
    expect(row.update).toHaveBeenCalled();
  });
});

describe('listByResource', () => {
  test('a non-owner (or missing file) gets CAP_NOT_FOUND, indistinguishable', async () => {
    mockFileFindOne.mockResolvedValue(null);
    await expect(cap.listByResource('file', FILE_ID, STRANGER))
      .rejects.toMatchObject(CAP_DENIED);
  });

  test('the owner sees descriptors for BOTH kinds — and no secret material fields', async () => {
    mockFileFindOne.mockResolvedValue(fileRow());
    mockShareLinkFindAll.mockResolvedValue([shareLinkRow()]);
    mockFindTokensByData.mockResolvedValue([{
      id: 'tok-fa',
      userId: OWNER,
      tokenData: { fileId: FILE_ID, sharedBy: OWNER, shareType: 'file-access' },
      permissions: { read: true, write: false, delete: false },
      expiresAt: null,
      useCount: 2,
      status: 'active',
      createdAt: new Date('2026-07-02')
    }]);

    const list = await cap.listByResource('file', FILE_ID, OWNER);

    expect(list).toHaveLength(2);
    expect(list[0]).toMatchObject({ kind: 'link', id: 'share-1', backend: 'filevault-sharelink' });
    expect(list[1]).toMatchObject({
      kind: 'file-access',
      id: 'tok-fa',
      useCount: 2,
      provenance: { mintedBy: OWNER, mintedAsOwner: true }
    });
    for (const descriptor of list) {
      expect(descriptor).not.toHaveProperty('token');
      expect(descriptor).not.toHaveProperty('credential');
      expect(descriptor).not.toHaveProperty('url');
    }
    expect(mockFindTokensByData).toHaveBeenCalledWith(
      { fileId: FILE_ID, shareType: 'file-access' });
  });
});
