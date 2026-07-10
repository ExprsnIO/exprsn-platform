'use strict';

/**
 * BUG-024 — live room-collab files flow through FileVault (moderated), not local
 * disk. These route-level tests verify:
 *  - upload stores bytes via FileVault (mockFileService.uploadFile) and records a
 *    `vault` RoomFile pointing at the returned file id — never a disk write;
 *  - download serves via FileVault, so a held image (FILE_NOT_FOUND) 404s while a
 *    cleared file streams, and the requester id is threaded to the moderation
 *    gate;
 *  - room membership is enforced: a non-member is denied upload and download.
 *
 * mockFileService is mocked (the live suite never loads FileVault's real stack), and
 * the mockModels/auth/queue layers are stubbed so no Postgres/Redis is needed.
 */

const { Readable } = require('stream');

// ── model doubles ────────────────────────────────────────────────────────────
const mockModels = {
  Room: { findByPk: jest.fn() },
  RoomInvite: { findOne: jest.fn(), create: jest.fn(), findAll: jest.fn(), update: jest.fn() },
  RoomJoinRequest: { findOne: jest.fn(), findOrCreate: jest.fn(), findAll: jest.fn(), update: jest.fn(), findByPk: jest.fn() },
  RoomFile: { findAll: jest.fn(), findOne: jest.fn(), create: jest.fn() },
  Recording: { create: jest.fn(), update: jest.fn(), findAll: jest.fn() },
  Participant: { findOne: jest.fn() },
};
jest.mock('../src/models', () => mockModels);

// Auth: a bearer-less request is 401; otherwise req.user.id comes from a header.
jest.mock('../src/middleware/auth', () => ({
  requireAuth: (req, res, next) => {
    const uid = req.headers['x-test-user'];
    if (!uid) return res.status(401).json({ error: 'UNAUTHORIZED' });
    req.user = { id: uid };
    next();
  },
}));

jest.mock('../src/services/liveQueue', () => ({ enqueueRecording: jest.fn() }));
jest.mock('../src/services/liveConfig', () => ({ getSection: jest.fn() }));

// FileVault façade — the whole point of BUG-024.
const mockFileService = {
  uploadFile: jest.fn(),
  downloadFileStreamForMember: jest.fn(),
  servableFileIds: jest.fn(),
};
jest.mock('../../filevault/src/services/fileService', () => mockFileService);

const express = require('express');
const request = require('supertest');
const router = require('../src/routes/roomCollab');

const app = express();
app.use(express.json());
app.use('/api/rooms', router);

const ROOM_ID = 'room-1';
const HOST = 'host-1';
const MEMBER = 'member-2';
const NON_MEMBER = 'stranger-3';

function asMember() {
  mockModels.Participant.findOne.mockResolvedValue({ id: 'p1' });
  mockModels.RoomInvite.findOne.mockResolvedValue(null);
  mockModels.RoomJoinRequest.findOne.mockResolvedValue(null);
}
function asNonMember() {
  mockModels.Participant.findOne.mockResolvedValue(null);
  mockModels.RoomInvite.findOne.mockResolvedValue(null);
  mockModels.RoomJoinRequest.findOne.mockResolvedValue(null);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockModels.Room.findByPk.mockResolvedValue({ id: ROOM_ID, host_id: HOST });
});

describe('POST /:id/files/upload — routes through FileVault', () => {
  test('a member upload creates a FileVault-backed (vault) RoomFile, no disk write', async () => {
    asMember();
    mockFileService.uploadFile.mockResolvedValue({ id: 'vault-file-9' });
    mockModels.RoomFile.create.mockImplementation(async (row) => ({ ...row, id: 'rf-1' }));

    const res = await request(app)
      .post(`/api/rooms/${ROOM_ID}/files/upload`)
      .set('x-test-user', MEMBER)
      .attach('file', Buffer.from('PNGDATA'), 'pic.png');

    expect(res.status).toBe(201);
    // bytes went to FileVault (which creates the moderation row + enqueues)
    expect(mockFileService.uploadFile).toHaveBeenCalledTimes(1);
    const arg = mockFileService.uploadFile.mock.calls[0][0];
    expect(arg.userId).toBe(MEMBER);
    expect(Buffer.isBuffer(arg.buffer)).toBe(true);
    expect(arg.metadata).toMatchObject({ source: 'live-room', roomId: ROOM_ID });
    // RoomFile row is a vault reference to the returned file id
    expect(mockModels.RoomFile.create).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'vault', file_id: 'vault-file-9', room_id: ROOM_ID })
    );
    expect(res.body.file.file_id).toBe('vault-file-9');
  });

  test('a non-member cannot upload (403) and FileVault is never touched', async () => {
    asNonMember();
    const res = await request(app)
      .post(`/api/rooms/${ROOM_ID}/files/upload`)
      .set('x-test-user', NON_MEMBER)
      .attach('file', Buffer.from('x'), 'pic.png');

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('NOT_A_MEMBER');
    expect(mockFileService.uploadFile).not.toHaveBeenCalled();
  });

  test('unauthenticated upload is 401', async () => {
    const res = await request(app)
      .post(`/api/rooms/${ROOM_ID}/files/upload`)
      .attach('file', Buffer.from('x'), 'pic.png');
    expect(res.status).toBe(401);
  });
});

describe('GET /:id/files/:fileId/download — served via FileVault, moderation-gated', () => {
  test('a CLEARED file streams to a room member (requester id threaded to the gate)', async () => {
    asMember();
    mockModels.RoomFile.findOne.mockResolvedValue({ id: 'rf-1', room_id: ROOM_ID, kind: 'vault', file_id: 'vault-file-9', name: 'pic.png', mimetype: 'image/png' });
    mockFileService.downloadFileStreamForMember.mockResolvedValue({
      stream: Readable.from(Buffer.from('CLEARBYTES')),
      file: { mimetype: 'image/png' },
    });

    const res = await request(app)
      .get(`/api/rooms/${ROOM_ID}/files/rf-1/download`)
      .buffer(true)
      .set('x-test-user', MEMBER);

    expect(res.status).toBe(200);
    expect(Buffer.from(res.body).toString()).toBe('CLEARBYTES');
    // FileVault gate was asked on behalf of THIS member (not the uploader)
    expect(mockFileService.downloadFileStreamForMember).toHaveBeenCalledWith('vault-file-9', MEMBER);
  });

  test('a HELD image is NOT served to another member — 404', async () => {
    asMember();
    mockModels.RoomFile.findOne.mockResolvedValue({ id: 'rf-1', room_id: ROOM_ID, kind: 'vault', file_id: 'vault-file-9', name: 'pic.png' });
    mockFileService.downloadFileStreamForMember.mockRejectedValue(new Error('FILE_NOT_FOUND'));

    const res = await request(app)
      .get(`/api/rooms/${ROOM_ID}/files/rf-1/download`)
      .set('x-test-user', MEMBER);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NOT_FOUND');
  });

  test('a non-member is denied download (403), gate never consulted', async () => {
    asNonMember();
    const res = await request(app)
      .get(`/api/rooms/${ROOM_ID}/files/rf-1/download`)
      .set('x-test-user', NON_MEMBER);

    expect(res.status).toBe(403);
    expect(mockFileService.downloadFileStreamForMember).not.toHaveBeenCalled();
  });
});

describe('GET /:id/files — held images not enumerable to non-uploaders', () => {
  test('held vault image is filtered out of the listing', async () => {
    asMember();
    mockModels.RoomFile.findAll.mockResolvedValue([
      { id: 'rf-a', kind: 'vault', file_id: 'fa' },
      { id: 'rf-b', kind: 'vault', file_id: 'fb' }, // held → hidden
      { id: 'rf-c', kind: 'ephemeral', storage_key: 'k' }, // legacy, always shown
    ]);
    mockFileService.servableFileIds.mockResolvedValue(new Set(['fa']));

    const res = await request(app)
      .get(`/api/rooms/${ROOM_ID}/files`)
      .set('x-test-user', MEMBER);

    expect(res.status).toBe(200);
    const ids = res.body.files.map((f) => f.id);
    expect(ids).toContain('rf-a');
    expect(ids).not.toContain('rf-b');
    expect(ids).toContain('rf-c');
    expect(mockFileService.servableFileIds).toHaveBeenCalledWith(['fa', 'fb'], MEMBER);
  });
});
