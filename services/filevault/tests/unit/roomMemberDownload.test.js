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
