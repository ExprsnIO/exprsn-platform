'use strict';

/**
 * BUG-024 — FileVault gating helpers used by live room-collab.
 *
 * Live room files now flow through FileVault, so downloads for a room member
 * who is NOT the uploader must still obey the FEAT-031 gate: a held
 * (pending/rejected) image is not served to them, but a cleared one is, and the
 * uploader always sees their own. These tests exercise the real
 * imageModerationService (canServe) through the two consolidated helpers.
 */

process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_dummy';

const mockFileFindOne = jest.fn();
const mockFileFindAll = jest.fn();
jest.mock('../../src/models', () => ({
  File: { findOne: (...a) => mockFileFindOne(...a), findAll: (...a) => mockFileFindAll(...a) },
  FileVersion: {},
  Directory: {},
  FileModeration: {},
  sequelize: { transaction: jest.fn() },
}));

const mockRetrieve = jest.fn();
jest.mock('../../src/storage', () => ({
  retrieve: (...a) => mockRetrieve(...a),
  selectBackend: jest.fn(),
  store: jest.fn(),
}));

const fileService = require('../../src/services/fileService');

const UPLOADER = 'uploader-1';
const MEMBER = 'member-2';

function imageFile(status, { userId = UPLOADER } = {}) {
  return {
    id: 'file-1',
    userId,
    mimetype: 'image/png',
    storageKey: 'k1',
    storageBackend: 'local',
    moderation: status ? { status } : null,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRetrieve.mockResolvedValue(Buffer.from('bytes'));
});

describe('downloadFileStreamForMember (FEAT-031 gate)', () => {
  test('a CLEARED (approved) image IS served to a non-uploader member', async () => {
    mockFileFindOne.mockResolvedValue(imageFile('approved'));
    const { stream, file } = await fileService.downloadFileStreamForMember('file-1', MEMBER);
    expect(file.id).toBe('file-1');
    expect(mockRetrieve).toHaveBeenCalledWith('k1', 'local');
    // stream is a readable of the retrieved bytes
    const chunks = [];
    for await (const c of stream) chunks.push(c);
    expect(Buffer.concat(chunks).toString()).toBe('bytes');
  });

  test('a HELD (pending) image is NOT served to another member — 404-shaped', async () => {
    mockFileFindOne.mockResolvedValue(imageFile('pending'));
    await expect(fileService.downloadFileStreamForMember('file-1', MEMBER))
      .rejects.toThrow('FILE_NOT_FOUND');
    expect(mockRetrieve).not.toHaveBeenCalled();
  });

  test('a REJECTED image is NOT served to another member', async () => {
    mockFileFindOne.mockResolvedValue(imageFile('rejected'));
    await expect(fileService.downloadFileStreamForMember('file-1', MEMBER))
      .rejects.toThrow('FILE_NOT_FOUND');
  });

  test('the UPLOADER still sees their own held image', async () => {
    mockFileFindOne.mockResolvedValue(imageFile('pending', { userId: UPLOADER }));
    const { file } = await fileService.downloadFileStreamForMember('file-1', UPLOADER);
    expect(file.id).toBe('file-1');
    expect(mockRetrieve).toHaveBeenCalled();
  });

  test('a missing file is FILE_NOT_FOUND', async () => {
    mockFileFindOne.mockResolvedValue(null);
    await expect(fileService.downloadFileStreamForMember('nope', MEMBER))
      .rejects.toThrow('FILE_NOT_FOUND');
  });
});

describe('servableFileIds (listing gate)', () => {
  test('omits held images for a non-uploader, keeps cleared + non-image', async () => {
    mockFileFindAll.mockResolvedValue([
      { id: 'a', userId: UPLOADER, mimetype: 'image/png', moderation: { status: 'approved' } },
      { id: 'b', userId: UPLOADER, mimetype: 'image/png', moderation: { status: 'pending' } },
      { id: 'c', userId: UPLOADER, mimetype: 'application/pdf', moderation: { status: 'skipped' } },
    ]);
    const set = await fileService.servableFileIds(['a', 'b', 'c'], MEMBER);
    expect(set.has('a')).toBe(true);
    expect(set.has('b')).toBe(false); // held image, hidden from non-uploader
    expect(set.has('c')).toBe(true);
  });

  test('the uploader sees their own held image in a listing', async () => {
    mockFileFindAll.mockResolvedValue([
      { id: 'b', userId: UPLOADER, mimetype: 'image/png', moderation: { status: 'pending' } },
    ]);
    const set = await fileService.servableFileIds(['b'], UPLOADER);
    expect(set.has('b')).toBe(true);
  });

  test('empty input short-circuits without a query', async () => {
    const set = await fileService.servableFileIds([], MEMBER);
    expect(set.size).toBe(0);
    expect(mockFileFindAll).not.toHaveBeenCalled();
  });
});

/**
 * FEAT-061 / BUG-027 — a share does not outlive the visibility it was granted under,
 * unless the OWNER is the one who shared it.
 *
 * The old code skipped the visibility check on this path entirely, deliberately: it was
 * the only way to keep "owner shares their own private file into a room" working. The
 * cost was BUG-027 — a NON-owner's share of a then-public file kept serving after the
 * owner flipped it private. Per-share provenance (`sharedAsOwner`) lets both hold.
 */
function privateFile({ userId = UPLOADER, status = 'approved', mimetype = 'image/png' } = {}) {
  return {
    id: 'file-1',
    userId,
    visibility: 'private',
    mimetype,
    storageKey: 'k1',
    storageBackend: 'local',
    moderation: status ? { status } : null,
  };
}

describe('downloadFileStreamForMember (FEAT-061 share-grant gate / BUG-027)', () => {
  test('OWNER-shared private file IS still served to a member after the private-flip', async () => {
    mockFileFindOne.mockResolvedValue(privateFile());
    const { file } = await fileService.downloadFileStreamForMember('file-1', MEMBER, {
      sharedAsOwner: true,
    });
    expect(file.id).toBe('file-1');
    expect(mockRetrieve).toHaveBeenCalled();
  });

  test('NON-owner-shared file STOPS being served once it is private (the BUG-027 fix)', async () => {
    mockFileFindOne.mockResolvedValue(privateFile());
    await expect(
      fileService.downloadFileStreamForMember('file-1', MEMBER, { sharedAsOwner: false })
    ).rejects.toThrow('FILE_NOT_FOUND');
    expect(mockRetrieve).not.toHaveBeenCalled();
  });

  test('a non-private file is unaffected by provenance', async () => {
    mockFileFindOne.mockResolvedValue(imageFile('approved')); // no visibility => not private
    const { file } = await fileService.downloadFileStreamForMember('file-1', MEMBER, {
      sharedAsOwner: false,
    });
    expect(file.id).toBe('file-1');
  });

  test('the owner may always read their own private file, share or no share', async () => {
    mockFileFindOne.mockResolvedValue(privateFile({ userId: UPLOADER }));
    const { file } = await fileService.downloadFileStreamForMember('file-1', UPLOADER, {
      sharedAsOwner: false,
    });
    expect(file.id).toBe('file-1');
  });

  test('omitting the options FAILS CLOSED on a private file', async () => {
    mockFileFindOne.mockResolvedValue(privateFile());
    await expect(fileService.downloadFileStreamForMember('file-1', MEMBER))
      .rejects.toThrow('FILE_NOT_FOUND');
  });

  test('the moderation gate still applies to an owner-shared private file', async () => {
    // Both gates must hold — a share grant does not buy past FEAT-031.
    mockFileFindOne.mockResolvedValue(privateFile({ status: 'pending' }));
    await expect(
      fileService.downloadFileStreamForMember('file-1', MEMBER, { sharedAsOwner: true })
    ).rejects.toThrow('FILE_NOT_FOUND');
  });
});

describe('servableFileIds (FEAT-061 — the listing must not leak what the download denies)', () => {
  test('a private non-owner-shared file is NOT enumerable; an owner-shared one is', async () => {
    mockFileFindAll.mockResolvedValue([
      { id: 'owned', userId: UPLOADER, visibility: 'private', mimetype: 'image/png', moderation: { status: 'approved' } },
      { id: 'lapsed', userId: UPLOADER, visibility: 'private', mimetype: 'image/png', moderation: { status: 'approved' } },
    ]);
    const set = await fileService.servableFileIds(['owned', 'lapsed'], MEMBER, {
      ownerSharedIds: new Set(['owned']),
    });
    expect(set.has('owned')).toBe(true);
    // Would otherwise leak name/size/existence while its bytes 404 — the BUG-020 shape.
    expect(set.has('lapsed')).toBe(false);
  });

  test('without a provenance set, private files FAIL CLOSED in a listing', async () => {
    mockFileFindAll.mockResolvedValue([
      { id: 'p', userId: UPLOADER, visibility: 'private', mimetype: 'image/png', moderation: { status: 'approved' } },
    ]);
    const set = await fileService.servableFileIds(['p'], MEMBER);
    expect(set.has('p')).toBe(false);
  });
});
