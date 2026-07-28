'use strict';

/**
 * TASK-055 — revoke the minted capability token (+ reap the superseded
 * FileVault file) when an avatar/cover display image is replaced or removed.
 */

process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_dummy';

const mockRevokeByResource = jest.fn();
jest.mock('../../src/services/capabilityService', () => ({
  revokeByResource: (...a) => mockRevokeByResource(...a)
}));

const mockDeleteFile = jest.fn();
jest.mock('../../src/services/fileService', () => ({
  deleteFile: (...a) => mockDeleteFile(...a)
}));

const { extractFileId, reapDisplayImage } = require('../../src/services/displayImageService');

const OLD_URL = '/filevault/api/share/file/file-1/download?token=tok-1';
const OWNER = 'user-1';

beforeEach(() => {
  jest.clearAllMocks();
  mockRevokeByResource.mockResolvedValue({ revoked: 1 });
  mockDeleteFile.mockResolvedValue(true);
});

describe('extractFileId', () => {
  test('extracts the file id from a tokened display URL', () => {
    expect(extractFileId(OLD_URL)).toBe('file-1');
  });

  test('extracts the file id when there is no query string', () => {
    expect(extractFileId('/filevault/api/share/file/file-2/download')).toBe('file-2');
  });

  test('returns null for a non-FileVault (external) URL', () => {
    expect(extractFileId('https://example.com/avatar.png')).toBeNull();
  });

  test('returns null for empty/undefined/null values', () => {
    expect(extractFileId('')).toBeNull();
    expect(extractFileId(null)).toBeNull();
    expect(extractFileId(undefined)).toBeNull();
  });
});

describe('reapDisplayImage', () => {
  test('revokes the capability and reaps the file when the URL is replaced', async () => {
    await reapDisplayImage(OLD_URL, '/filevault/api/share/file/file-2/download?token=tok-2', OWNER);

    expect(mockRevokeByResource).toHaveBeenCalledWith('file', 'file-1', { reason: 'display-image-replaced' });
    expect(mockDeleteFile).toHaveBeenCalledWith('file-1', OWNER);
  });

  test('revokes the capability and reaps the file when the image is removed', async () => {
    await reapDisplayImage(OLD_URL, '', OWNER);

    expect(mockRevokeByResource).toHaveBeenCalledWith('file', 'file-1', { reason: 'display-image-replaced' });
    expect(mockDeleteFile).toHaveBeenCalledWith('file-1', OWNER);
  });

  test('is a no-op when the value is unchanged', async () => {
    await reapDisplayImage(OLD_URL, OLD_URL, OWNER);

    expect(mockRevokeByResource).not.toHaveBeenCalled();
    expect(mockDeleteFile).not.toHaveBeenCalled();
  });

  test('is a no-op when there was no previous value', async () => {
    await reapDisplayImage('', OLD_URL, OWNER);
    await reapDisplayImage(null, OLD_URL, OWNER);

    expect(mockRevokeByResource).not.toHaveBeenCalled();
    expect(mockDeleteFile).not.toHaveBeenCalled();
  });

  test('is a no-op when the old value is an external (non-FileVault) URL', async () => {
    await reapDisplayImage('https://example.com/avatar.png', '', OWNER);

    expect(mockRevokeByResource).not.toHaveBeenCalled();
    expect(mockDeleteFile).not.toHaveBeenCalled();
  });

  test('a revoke failure does not throw, and the reap is still attempted', async () => {
    mockRevokeByResource.mockRejectedValue(new Error('CA down'));

    await expect(reapDisplayImage(OLD_URL, '', OWNER)).resolves.toBeUndefined();
    expect(mockDeleteFile).toHaveBeenCalledWith('file-1', OWNER);
  });

  test('a reap (delete) failure does not throw', async () => {
    mockDeleteFile.mockRejectedValue(new Error('FILE_NOT_FOUND'));

    await expect(reapDisplayImage(OLD_URL, '', OWNER)).resolves.toBeUndefined();
  });
});
