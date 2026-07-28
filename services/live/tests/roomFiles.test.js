'use strict';

/**
 * BUG-024 / TASK-057 — live room-collab file routes.
 *
 * Since TASK-057, RoomFile grants are resolved and enforced through the ONE
 * capability façade (filevault's capabilityService, 'roomFile' backend =
 * live's roomFileCapabilityAdapter — which has its own façade-level suite,
 * roomFileCapability.test.js). These route-level tests pin the ROUTE contract:
 *  - upload stores bytes via FileVault (BUG-024 chokepoint untouched) and the
 *    row-create is capability.grant — never a disk write;
 *  - share mints via capability.grant (BUG-026 lives in the adapter) and a
 *    denial maps to today's 404 FILE_NOT_FOUND;
 *  - download is capability.authorize then a post-authorize owner stream
 *    (share.js precedent) — a denial maps to today's 404 NOT_FOUND;
 *  - the listing loops capability.authorize per vault row (no second
 *    enforcement path — servableFileIds is NOT called from here);
 *  - delete is capability.revoke with today's 403/404 mapping;
 *  - room membership middleware still gates every file route (403
 *    NOT_A_MEMBER) and bearer-less requests are 401.
 *
 * The façade + fileService are mocked (the live route suite never loads
 * FileVault's real stack); response shapes are asserted unchanged.
 */

process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_dummy';

const { Readable } = require('stream');

// ── model doubles ────────────────────────────────────────────────────────────
const mockModels = {
  Room: { findByPk: jest.fn() },
  RoomInvite: { findOne: jest.fn(), create: jest.fn(), findAll: jest.fn(), update: jest.fn() },
  RoomJoinRequest: { findOne: jest.fn(), findOrCreate: jest.fn(), findAll: jest.fn(), update: jest.fn(), findByPk: jest.fn() },
  RoomFile: { findAll: jest.fn(), findOne: jest.fn(), create: jest.fn(), findByPk: jest.fn() },
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

// FileVault fileService — the BUG-024 byte chokepoint + post-authorize stream.
const mockFileService = {
  uploadFile: jest.fn(),
  downloadFileStream: jest.fn(),
  servableFileIds: jest.fn(), // must stay UNCALLED — no second enforcement path
};
jest.mock('../../filevault/src/services/fileService', () => mockFileService);

// The capability façade (TASK-057) — the one enforcement point.
function capDenial(cause) {
  return Object.assign(new Error('CAP_NOT_FOUND'), { code: 'CAP_NOT_FOUND', cause });
}
const mockCapability = {
  RESOURCE_TYPES: { FILE: 'file', ROOM_FILE: 'roomFile', ALBUM: 'album' },
  grant: jest.fn(),
  authorize: jest.fn(),
  revoke: jest.fn(),
  revokeByResource: jest.fn(),
  listByResource: jest.fn(),
};
jest.mock('../../filevault/src/services/capabilityService', () => mockCapability);

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
const OWNER = 'owner-9';

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

describe('POST /:id/files/upload — bytes via FileVault, row-create via capability.grant', () => {
  test('a member upload stores bytes through FileVault and mints a room grant, no disk write', async () => {
    asMember();
    mockFileService.uploadFile.mockResolvedValue({ id: 'vault-file-9' });
    mockCapability.grant.mockResolvedValue({
      capability: { id: 'rf-1' },
      credential: { roomFileId: 'rf-1' },
    });
    mockModels.RoomFile.findByPk.mockResolvedValue({
      id: 'rf-1', room_id: ROOM_ID, kind: 'vault', file_id: 'vault-file-9', name: 'pic.png',
    });

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
    // the row-create is the capability mint against the UPLOADED file id
    expect(mockCapability.grant).toHaveBeenCalledWith(
      'roomFile', 'vault-file-9', MEMBER, { roomId: ROOM_ID, name: 'pic.png' }
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
    expect(mockCapability.grant).not.toHaveBeenCalled();
  });

  test('unauthenticated upload is 401', async () => {
    const res = await request(app)
      .post(`/api/rooms/${ROOM_ID}/files/upload`)
      .attach('file', Buffer.from('x'), 'pic.png');
    expect(res.status).toBe(401);
  });
});

describe('POST /:id/files/share — mint via capability.grant (BUG-026 in the adapter)', () => {
  test('sharing mints a grant for THIS member and returns the created row', async () => {
    asMember();
    mockCapability.grant.mockResolvedValue({
      capability: { id: 'rf-9' },
      credential: { roomFileId: 'rf-9' },
    });
    mockModels.RoomFile.findByPk.mockResolvedValue({
      id: 'rf-9', room_id: ROOM_ID, kind: 'vault', file_id: 'vault-file-9',
      name: 'display', mimetype: 'application/pdf', size: 4242,
    });

    const res = await request(app)
      .post(`/api/rooms/${ROOM_ID}/files/share`)
      // spoofed metadata is ignored: only fileId + name reach the façade — the
      // adapter derives everything else from the VERIFIED file (BUG-026)
      .send({ fileId: 'vault-file-9', name: 'display', mimetype: 'image/png', size: 1, shared_as_owner: true })
      .set('x-test-user', MEMBER);

    expect(res.status).toBe(201);
    expect(mockCapability.grant).toHaveBeenCalledWith(
      'roomFile', 'vault-file-9', MEMBER, { roomId: ROOM_ID, name: 'display' }
    );
    expect(res.body.file.id).toBe('rf-9');
  });

  // THE VULNERABILITY (BUG-026): an attacker shares a victim's private file
  // UUID into their own room. The adapter's denial must surface as today's 404.
  test('a capability denial is 404 FILE_NOT_FOUND and no row is fetched', async () => {
    asMember();
    mockCapability.grant.mockRejectedValue(capDenial('FILE_NOT_FOUND'));

    const res = await request(app)
      .post(`/api/rooms/${ROOM_ID}/files/share`)
      .send({ fileId: 'victims-private-uuid', name: 'x' })
      .set('x-test-user', MEMBER);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('FILE_NOT_FOUND');
    expect(mockModels.RoomFile.findByPk).not.toHaveBeenCalled();
  });

  test('a non-member cannot share at all (403, façade never consulted)', async () => {
    asNonMember();
    const res = await request(app)
      .post(`/api/rooms/${ROOM_ID}/files/share`)
      .send({ fileId: 'vault-file-9', name: 'x' })
      .set('x-test-user', NON_MEMBER);
    expect(res.status).toBe(403);
    expect(mockCapability.grant).not.toHaveBeenCalled();
  });

  test('missing fileId is a 400', async () => {
    asMember();
    const res = await request(app)
      .post(`/api/rooms/${ROOM_ID}/files/share`)
      .send({ name: 'x' })
      .set('x-test-user', MEMBER);
    expect(res.status).toBe(400);
  });
});

describe('GET /:id/files/:fileId/download — capability.authorize, then owner stream', () => {
  test('an authorized member streams the bytes via the post-authorize owner path', async () => {
    asMember();
    mockModels.RoomFile.findOne.mockResolvedValue({
      id: 'rf-1', room_id: ROOM_ID, kind: 'vault', file_id: 'vault-file-9',
      name: 'pic.png', mimetype: 'image/png', shared_as_owner: true,
    });
    mockCapability.authorize.mockResolvedValue({
      resource: { id: 'vault-file-9', userId: OWNER, mimetype: 'image/png' },
      capability: { id: 'rf-1' },
    });
    mockFileService.downloadFileStream.mockResolvedValue({
      stream: Readable.from(Buffer.from('CLEARBYTES')),
      file: { mimetype: 'image/png' },
    });

    const res = await request(app)
      .get(`/api/rooms/${ROOM_ID}/files/rf-1/download`)
      .buffer(true)
      .set('x-test-user', MEMBER);

    expect(res.status).toBe(200);
    expect(Buffer.from(res.body).toString()).toBe('CLEARBYTES');
    // enforcement went through the façade for THIS member in THIS room…
    expect(mockCapability.authorize).toHaveBeenCalledWith(
      'roomFile', { roomFileId: 'rf-1' }, { requesterId: MEMBER, roomId: ROOM_ID }
    );
    // …and the stream is the share.js post-authorize precedent: as the owner.
    expect(mockFileService.downloadFileStream).toHaveBeenCalledWith('vault-file-9', OWNER);
  });

  test('a capability denial (held image / dead share / anything) is todays 404 NOT_FOUND', async () => {
    asMember();
    mockModels.RoomFile.findOne.mockResolvedValue({
      id: 'rf-1', room_id: ROOM_ID, kind: 'vault', file_id: 'vault-file-9', name: 'pic.png',
    });
    mockCapability.authorize.mockRejectedValue(capDenial('MODERATION_HELD'));

    const res = await request(app)
      .get(`/api/rooms/${ROOM_ID}/files/rf-1/download`)
      .set('x-test-user', MEMBER);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NOT_FOUND');
    expect(mockFileService.downloadFileStream).not.toHaveBeenCalled();
  });

  test('a non-member is denied download (403), façade never consulted', async () => {
    asNonMember();
    const res = await request(app)
      .get(`/api/rooms/${ROOM_ID}/files/rf-1/download`)
      .set('x-test-user', NON_MEMBER);

    expect(res.status).toBe(403);
    expect(mockCapability.authorize).not.toHaveBeenCalled();
  });
});

describe('GET /:id/files — the listing asks the façade per row (no second path)', () => {
  test('a row the façade denies is filtered out; legacy ephemeral rows pass through', async () => {
    asMember();
    mockModels.RoomFile.findAll.mockResolvedValue([
      { id: 'rf-a', kind: 'vault', file_id: 'fa', shared_as_owner: true },
      { id: 'rf-b', kind: 'vault', file_id: 'fb' }, // held/dead → hidden
      { id: 'rf-c', kind: 'ephemeral', storage_key: 'k' }, // legacy, always shown
    ]);
    mockCapability.authorize.mockImplementation(async (_type, credential) => {
      if (credential.roomFileId === 'rf-b') throw capDenial('MODERATION_HELD');
      return { resource: { id: 'fa' }, capability: { id: credential.roomFileId } };
    });

    const res = await request(app)
      .get(`/api/rooms/${ROOM_ID}/files`)
      .set('x-test-user', MEMBER);

    expect(res.status).toBe(200);
    const ids = res.body.files.map((f) => f.id);
    expect(ids).toContain('rf-a');
    expect(ids).not.toContain('rf-b'); // the download would 404 it, so the listing hides it
    expect(ids).toContain('rf-c');
    // one authorize per vault-backed row, threaded with requester + room ctx
    expect(mockCapability.authorize).toHaveBeenCalledTimes(2);
    expect(mockCapability.authorize).toHaveBeenCalledWith(
      'roomFile', { roomFileId: 'rf-a' }, { requesterId: MEMBER, roomId: ROOM_ID }
    );
    // and NO second enforcement path
    expect(mockFileService.servableFileIds).not.toHaveBeenCalled();
  });

  test('a non-member cannot list (403)', async () => {
    asNonMember();
    const res = await request(app)
      .get(`/api/rooms/${ROOM_ID}/files`)
      .set('x-test-user', NON_MEMBER);
    expect(res.status).toBe(403);
    expect(mockCapability.authorize).not.toHaveBeenCalled();
  });
});

describe('DELETE /:id/files/:fileId — capability.revoke with todays 403/404 mapping', () => {
  test('the actor-checked revoke goes through the façade and succeeds', async () => {
    mockModels.RoomFile.findOne.mockResolvedValue({ id: 'rf-1', room_id: ROOM_ID, user_id: MEMBER });
    mockCapability.revoke.mockResolvedValue(true);

    const res = await request(app)
      .delete(`/api/rooms/${ROOM_ID}/files/rf-1`)
      .set('x-test-user', HOST);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
    expect(mockCapability.revoke).toHaveBeenCalledWith('roomFile', 'rf-1', HOST);
  });

  test('a FORBIDDEN cause maps to todays 403', async () => {
    mockModels.RoomFile.findOne.mockResolvedValue({ id: 'rf-1', room_id: ROOM_ID, user_id: MEMBER });
    mockCapability.revoke.mockRejectedValue(capDenial('FORBIDDEN'));

    const res = await request(app)
      .delete(`/api/rooms/${ROOM_ID}/files/rf-1`)
      .set('x-test-user', NON_MEMBER);

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('FORBIDDEN');
  });

  test('a row outside this rooms URL scope is todays 404, façade never consulted', async () => {
    mockModels.RoomFile.findOne.mockResolvedValue(null); // scoped where: {id, room_id}
    const res = await request(app)
      .delete(`/api/rooms/${ROOM_ID}/files/rf-other-room`)
      .set('x-test-user', HOST);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NOT_FOUND');
    expect(mockCapability.revoke).not.toHaveBeenCalled();
  });

  test('any other revoke denial maps to todays 404', async () => {
    mockModels.RoomFile.findOne.mockResolvedValue({ id: 'rf-1', room_id: ROOM_ID, user_id: MEMBER });
    mockCapability.revoke.mockRejectedValue(capDenial('NOT_FOUND'));
    const res = await request(app)
      .delete(`/api/rooms/${ROOM_ID}/files/rf-1`)
      .set('x-test-user', HOST);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NOT_FOUND');
  });
});
