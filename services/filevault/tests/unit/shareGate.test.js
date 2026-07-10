'use strict';

/**
 * BUG-020 — the share-link METADATA endpoint must not disclose a held image.
 *
 * The `/download` variants gate on moderation state, but `GET /share/:id`
 * returned the file's name/size/mimetype regardless, so a share-link holder
 * could learn a held (`pending`/`rejected`/`failed`) image exists and what it is
 * called, even though its bytes and thumbnail are correctly withheld. A held
 * image must 404 exactly like a missing one — everywhere.
 */

process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_dummy';

const mockGetShareLink = jest.fn();
jest.mock('../../src/services/shareService', () => ({
  getShareLink: mockGetShareLink,
  accessSharedFile: jest.fn(),
  accessFileByToken: jest.fn(),
}));
jest.mock('../../src/services/fileService', () => ({
  downloadFileStream: jest.fn(),
}));

const mockFindOne = jest.fn();
jest.mock('../../src/models', () => ({
  FileModeration: { findOne: (...a) => mockFindOne(...a) },
}));

// Real imageModerationService so isServableToOthers is the actual logic.
const express = require('express');
const request = require('supertest');
const router = require('../../src/routes/share');

const app = express();
app.use(express.json());
app.use('/api/share', router);

const SHARE_ID = '11111111-1111-4111-8111-111111111111';
const shareLink = { file: { id: 'f1', name: 'secret.png', size: 1234, mimetype: 'image/png' } };

beforeEach(() => jest.clearAllMocks());

describe('GET /api/share/:shareLinkId (metadata)', () => {
  test('a held (pending) image 404s — its name/size are not disclosed', async () => {
    mockGetShareLink.mockResolvedValue(shareLink);
    mockFindOne.mockResolvedValue({ status: 'pending' });

    const res = await request(app).get(`/api/share/${SHARE_ID}?token=t`);
    expect(res.status).toBe(404);
    expect(JSON.stringify(res.body)).not.toContain('secret.png');
  });

  test('a rejected image 404s too', async () => {
    mockGetShareLink.mockResolvedValue(shareLink);
    mockFindOne.mockResolvedValue({ status: 'rejected' });
    const res = await request(app).get(`/api/share/${SHARE_ID}?token=t`);
    expect(res.status).toBe(404);
  });

  test('an approved image returns its metadata', async () => {
    mockGetShareLink.mockResolvedValue(shareLink);
    mockFindOne.mockResolvedValue({ status: 'approved' });
    const res = await request(app).get(`/api/share/${SHARE_ID}?token=t`);
    expect(res.status).toBe(200);
    expect(res.body.file.name).toBe('secret.png');
  });

  test('a non-image (no moderation row) is unaffected', async () => {
    mockGetShareLink.mockResolvedValue({ file: { id: 'f2', name: 'doc.pdf', mimetype: 'application/pdf' } });
    mockFindOne.mockResolvedValue(null); // no row => servable
    const res = await request(app).get(`/api/share/${SHARE_ID}?token=t`);
    expect(res.status).toBe(200);
  });
});
