'use strict';

/**
 * TASK-057 / FEAT-077 — the RoomFile capability backend, exercised THROUGH the
 * façade (filevault's capabilityService) with the REAL adapter, the REAL
 * fileService (getFile / shareGrantAllows) and the REAL imageModerationService
 * underneath — models and storage mocked (the roomMemberDownload /
 * capabilityFilevaultAdapter pattern).
 *
 * Pins (Shape-A contract + the architect's 2026-07-28 directives):
 *  - grant: BUG-026 verbatim — the grantor's access is verified via
 *    fileService.getFile; shared_as_owner + metadata derive from the VERIFIED
 *    file, never from opts; denial is one indistinguishable CAP_NOT_FOUND
 *  - authorize: full fail-closed gate in one place — row scope, membership
 *    (the SAME predicate as requireRoomMember), FEAT-061/BUG-027 provenance
 *    (owner-minted survives a private-flip, non-owner-minted dies), FEAT-031
 *    moderation hold; read-only by construction; no bytes returned
 *  - revoke: today's DELETE rule (host OR sharer), row destroy, legacy
 *    ephemeral disk unlink moved into the adapter
 *  - revokeByResource: destroys every RoomFile grant on the file; 0 is success
 *  - listByResource: owner-only descriptors, no secret material
 */

process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_dummy';

const path = require('path');
const fs = require('fs');

// ── live model doubles ───────────────────────────────────────────────────────
const mockLive = {
  Room: { findByPk: jest.fn() },
  RoomFile: { findByPk: jest.fn(), create: jest.fn(), findAll: jest.fn(), destroy: jest.fn() },
  Participant: { findOne: jest.fn() },
  RoomInvite: { findOne: jest.fn() },
  RoomJoinRequest: { findOne: jest.fn() }
};
jest.mock('../src/models', () => mockLive);

// ── filevault model/storage doubles (real fileService runs on top of these) ──
const mockFileFindOne = jest.fn();
jest.mock('../../filevault/src/models', () => ({
  File: { findOne: (...a) => mockFileFindOne(...a), findAll: jest.fn() },
  FileVersion: {},
  Directory: {},
  FileModeration: { findOne: jest.fn() },
  ShareLink: {},
  sequelize: { transaction: jest.fn() }
}));
jest.mock('../../filevault/src/storage', () => ({
  retrieve: jest.fn(),
  selectBackend: jest.fn(),
  store: jest.fn()
}));

// Stub the FileVault ShareLink adapter so the façade's self-registration for
// 'file' doesn't pull shareService/CA — it has its own suite in filevault.
jest.mock('../../filevault/src/services/capability/filevaultShareLinkAdapter', () => ({
  backendName: 'filevault-sharelink',
  mint: jest.fn(),
  authorize: jest.fn(),
  revoke: jest.fn(),
  revokeByResource: jest.fn(),
  listByResource: jest.fn()
}));

const OWNER = 'owner-1';
const SHARER = 'sharer-2';
const MEMBER = 'member-3';
const HOST = 'host-9';
const ROOM_ID = 'room-1';

function room(over = {}) {
  return { id: ROOM_ID, host_id: HOST, ...over };
}

function vaultFile(over = {}) {
  return {
    id: 'vf-1',
    userId: OWNER,
    name: 'real.png',
    mimetype: 'image/png',
    size: 4242,
    visibility: 'public',
    isDeleted: false,
    moderation: { status: 'approved' },
    ...over
  };
}

function grantRow(over = {}) {
  return {
    id: 'rf-1',
    room_id: ROOM_ID,
    user_id: SHARER,
    kind: 'vault',
    file_id: 'vf-1',
    name: 'real.png',
    shared_as_owner: false,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    destroy: jest.fn().mockResolvedValue(undefined),
    ...over
  };
}

function asMember() {
  mockLive.Participant.findOne.mockResolvedValue({ id: 'p1' });
  mockLive.RoomInvite.findOne.mockResolvedValue(null);
  mockLive.RoomJoinRequest.findOne.mockResolvedValue(null);
}
function asNonMember() {
  mockLive.Participant.findOne.mockResolvedValue(null);
  mockLive.RoomInvite.findOne.mockResolvedValue(null);
  mockLive.RoomJoinRequest.findOne.mockResolvedValue(null);
}

let capability;

beforeEach(() => {
  jest.clearAllMocks();
  jest.resetModules(); // fresh façade registry per test
  capability = require('../../filevault/src/services/capabilityService');
  // What live's init() does (services/live/src/index.js), minus the boot noise.
  capability.registerBackend(
    capability.RESOURCE_TYPES.ROOM_FILE,
    require('../src/services/roomFileCapabilityAdapter')
  );
  mockLive.Room.findByPk.mockResolvedValue(room());
});

async function expectDenial(promise, cause) {
  const err = await promise.then(
    () => { throw new Error('expected a denial'); },
    (e) => e
  );
  expect(err.code).toBe('CAP_NOT_FOUND');
  if (cause) expect(err.cause).toBe(cause);
  return err;
}

// ── grant ────────────────────────────────────────────────────────────────────

describe('grant (mint) — BUG-026 verbatim, provenance from the VERIFIED file', () => {
  test('owner-grant: shared_as_owner derived true; metadata from the verified file; credential is {roomFileId} with NO url', async () => {
    mockFileFindOne.mockResolvedValue(vaultFile()); // getFile's read
    mockLive.RoomFile.create.mockImplementation(async (v) => grantRow({ ...v, id: 'rf-new' }));

    const result = await capability.grant('roomFile', 'vf-1', OWNER, {
      roomId: ROOM_ID,
      name: 'display-name',
      // spoof attempts — the adapter must read NOTHING provenance/metadata-shaped from opts
      shared_as_owner: false,
      mimetype: 'application/x-evil',
      size: 1
    });

    const created = mockLive.RoomFile.create.mock.calls[0][0];
    expect(created).toMatchObject({
      room_id: ROOM_ID,
      user_id: OWNER,
      kind: 'vault',
      file_id: 'vf-1',
      name: 'display-name',       // opts.name is the one legitimate opt
      mimetype: 'image/png',      // verified, not the spoofed value
      size: 4242,                 // verified, not the spoofed value
      shared_as_owner: true       // derived: grantor IS the owner
    });
    expect(result.credential).toEqual({ roomFileId: 'rf-new' });
    expect(result.url).toBeUndefined(); // room grants are not links
    expect(result.capability).toMatchObject({
      id: 'rf-new',
      resourceType: 'roomFile',
      resourceId: 'vf-1',
      backend: 'live-roomfile',
      kind: 'room-grant',
      permissions: { read: true, write: false, delete: false },
      provenance: { mintedBy: OWNER, mintedAsOwner: true, mintedUnderVisibility: null },
      expiresAt: null,
      maxUses: null
    });
  });

  test('non-owner grant of an accessible (public) file: shared_as_owner derived false', async () => {
    mockFileFindOne.mockResolvedValue(vaultFile()); // owned by OWNER, public
    mockLive.RoomFile.create.mockImplementation(async (v) => grantRow({ ...v, id: 'rf-2' }));

    const result = await capability.grant('roomFile', 'vf-1', SHARER, { roomId: ROOM_ID });

    expect(mockLive.RoomFile.create.mock.calls[0][0].shared_as_owner).toBe(false);
    expect(result.capability.provenance).toEqual({
      mintedBy: SHARER, mintedAsOwner: false, mintedUnderVisibility: null
    });
    // name falls back to the VERIFIED file's name when opts.name is absent
    expect(mockLive.RoomFile.create.mock.calls[0][0].name).toBe('real.png');
  });

  test('THE BUG-026 CASE: granting a file the grantor cannot access is denied, no row created', async () => {
    // real getFile: private + not the requester => INSUFFICIENT_PERMISSIONS
    mockFileFindOne.mockResolvedValue(vaultFile({ visibility: 'private' }));
    await expectDenial(
      capability.grant('roomFile', 'vf-1', SHARER, { roomId: ROOM_ID }),
      'FILE_NOT_FOUND'
    );
    expect(mockLive.RoomFile.create).not.toHaveBeenCalled();
  });

  test('a missing file is the SAME denial — no existence oracle', async () => {
    mockFileFindOne.mockResolvedValue(null);
    await expectDenial(
      capability.grant('roomFile', 'nope', SHARER, { roomId: ROOM_ID }),
      'FILE_NOT_FOUND'
    );
  });

  test('a held image cannot be granted by a non-uploader (getFile moderation gate), same denial', async () => {
    mockFileFindOne.mockResolvedValue(vaultFile({ moderation: { status: 'pending' } }));
    await expectDenial(
      capability.grant('roomFile', 'vf-1', SHARER, { roomId: ROOM_ID }),
      'FILE_NOT_FOUND'
    );
  });

  test('missing roomId fails closed before touching the file', async () => {
    await expectDenial(capability.grant('roomFile', 'vf-1', OWNER, {}), 'ROOM_REQUIRED');
    expect(mockFileFindOne).not.toHaveBeenCalled();
  });
});

// ── authorize ────────────────────────────────────────────────────────────────

describe('authorize — the whole gate in one place, fail closed', () => {
  test('a member reads an approved, public grant: verified File row returned, no bytes', async () => {
    asMember();
    mockLive.RoomFile.findByPk.mockResolvedValue(grantRow());
    mockFileFindOne.mockResolvedValue(vaultFile());

    const { resource, capability: descriptor, roomFile } = await capability.authorize(
      'roomFile', { roomFileId: 'rf-1' }, { requesterId: MEMBER, roomId: ROOM_ID }
    );

    expect(resource.id).toBe('vf-1');
    expect(roomFile.id).toBe('rf-1');
    expect(descriptor).toMatchObject({
      id: 'rf-1',
      backend: 'live-roomfile',
      kind: 'room-grant',
      permissions: { read: true, write: false, delete: false }
    });
  });

  test('missing row is denied', async () => {
    asMember();
    mockLive.RoomFile.findByPk.mockResolvedValue(null);
    await expectDenial(
      capability.authorize('roomFile', { roomFileId: 'nope' }, { requesterId: MEMBER, roomId: ROOM_ID }),
      'NOT_FOUND'
    );
  });

  test("a grant from ANOTHER room is denied under this room's ctx (row scope)", async () => {
    asMember();
    mockLive.RoomFile.findByPk.mockResolvedValue(grantRow({ room_id: 'other-room' }));
    await expectDenial(
      capability.authorize('roomFile', { roomFileId: 'rf-1' }, { requesterId: MEMBER, roomId: ROOM_ID }),
      'ROOM_MISMATCH'
    );
  });

  test('a NON-member is denied — same predicate as requireRoomMember — and the file is never read', async () => {
    asNonMember();
    mockLive.RoomFile.findByPk.mockResolvedValue(grantRow());
    await expectDenial(
      capability.authorize('roomFile', { roomFileId: 'rf-1' }, { requesterId: 'stranger-7', roomId: ROOM_ID }),
      'NOT_A_MEMBER'
    );
    expect(mockFileFindOne).not.toHaveBeenCalled();
  });

  test('the HOST is a member without any participant/invite row', async () => {
    asNonMember(); // no membership rows — host_id alone must carry it
    mockLive.RoomFile.findByPk.mockResolvedValue(grantRow());
    mockFileFindOne.mockResolvedValue(vaultFile());
    const { resource } = await capability.authorize(
      'roomFile', { roomFileId: 'rf-1' }, { requesterId: HOST, roomId: ROOM_ID }
    );
    expect(resource.id).toBe('vf-1');
  });

  // FEAT-061 / BUG-027 — the provenance matrix, both ways (real shareGrantAllows).
  test('PROVENANCE: an owner-minted grant SURVIVES the private-flip', async () => {
    asMember();
    mockLive.RoomFile.findByPk.mockResolvedValue(grantRow({ user_id: OWNER, shared_as_owner: true }));
    mockFileFindOne.mockResolvedValue(vaultFile({ visibility: 'private' }));
    const { resource } = await capability.authorize(
      'roomFile', { roomFileId: 'rf-1' }, { requesterId: MEMBER, roomId: ROOM_ID }
    );
    expect(resource.id).toBe('vf-1');
  });

  test('PROVENANCE: a non-owner-minted grant DIES with the visibility it was minted under', async () => {
    asMember();
    mockLive.RoomFile.findByPk.mockResolvedValue(grantRow({ shared_as_owner: false }));
    mockFileFindOne.mockResolvedValue(vaultFile({ visibility: 'private' }));
    await expectDenial(
      capability.authorize('roomFile', { roomFileId: 'rf-1' }, { requesterId: MEMBER, roomId: ROOM_ID }),
      'PROVENANCE_DEAD'
    );
  });

  test('the file OWNER may always read their own private file, dead grant or not', async () => {
    asMember();
    mockLive.RoomFile.findByPk.mockResolvedValue(grantRow({ shared_as_owner: false }));
    mockFileFindOne.mockResolvedValue(vaultFile({ visibility: 'private' }));
    const { resource } = await capability.authorize(
      'roomFile', { roomFileId: 'rf-1' }, { requesterId: OWNER, roomId: ROOM_ID }
    );
    expect(resource.id).toBe('vf-1');
  });

  // FEAT-031 — moderation hold.
  test('a HELD image is denied to a non-uploader member, exactly like a missing capability', async () => {
    asMember();
    mockLive.RoomFile.findByPk.mockResolvedValue(grantRow());
    mockFileFindOne.mockResolvedValue(vaultFile({ moderation: { status: 'pending' } }));
    await expectDenial(
      capability.authorize('roomFile', { roomFileId: 'rf-1' }, { requesterId: MEMBER, roomId: ROOM_ID }),
      'MODERATION_HELD'
    );
  });

  test('the uploader still sees their own held image (canServe own-image exemption)', async () => {
    asMember();
    mockLive.RoomFile.findByPk.mockResolvedValue(grantRow({ user_id: OWNER, shared_as_owner: true }));
    mockFileFindOne.mockResolvedValue(vaultFile({ moderation: { status: 'pending' } }));
    const { resource } = await capability.authorize(
      'roomFile', { roomFileId: 'rf-1' }, { requesterId: OWNER, roomId: ROOM_ID }
    );
    expect(resource.id).toBe('vf-1');
  });

  test('a deleted/missing FileVault file is denied', async () => {
    asMember();
    mockLive.RoomFile.findByPk.mockResolvedValue(grantRow());
    mockFileFindOne.mockResolvedValue(null);
    await expectDenial(
      capability.authorize('roomFile', { roomFileId: 'rf-1' }, { requesterId: MEMBER, roomId: ROOM_ID }),
      'FILE_NOT_FOUND'
    );
  });

  test('legacy ephemeral rows are OUT of the façade (denied here; roomCollab serves them)', async () => {
    asMember();
    mockLive.RoomFile.findByPk.mockResolvedValue(grantRow({ kind: 'ephemeral', file_id: null, storage_key: 'k1' }));
    await expectDenial(
      capability.authorize('roomFile', { roomFileId: 'rf-1' }, { requesterId: MEMBER, roomId: ROOM_ID }),
      'NOT_VAULT_BACKED'
    );
  });

  test('room grants are read-only by construction — asking for write is permission-short', async () => {
    asMember();
    await expectDenial(
      capability.authorize('roomFile', { roomFileId: 'rf-1' }, {
        requesterId: MEMBER, roomId: ROOM_ID, requiredPermissions: { read: true, write: true }
      }),
      'PERMISSION_SHORT'
    );
  });

  test('missing requester/room context fails closed (room grants are never anonymous)', async () => {
    await expectDenial(
      capability.authorize('roomFile', { roomFileId: 'rf-1' }, { roomId: ROOM_ID }),
      'CONTEXT_REQUIRED'
    );
    await expectDenial(
      capability.authorize('roomFile', { roomFileId: 'rf-1' }, { requesterId: MEMBER }),
      'CONTEXT_REQUIRED'
    );
  });
});

// ── revoke ───────────────────────────────────────────────────────────────────

describe("revoke — today's DELETE rule (host OR sharer), row destroy", () => {
  test('the HOST may revoke any grant in their room', async () => {
    const row = grantRow();
    mockLive.RoomFile.findByPk.mockResolvedValue(row);
    await expect(capability.revoke('roomFile', 'rf-1', HOST)).resolves.toBe(true);
    expect(row.destroy).toHaveBeenCalled();
  });

  test('the SHARER may revoke their own grant', async () => {
    const row = grantRow({ user_id: SHARER });
    mockLive.RoomFile.findByPk.mockResolvedValue(row);
    await expect(capability.revoke('roomFile', 'rf-1', SHARER)).resolves.toBe(true);
    expect(row.destroy).toHaveBeenCalled();
  });

  test('any other member is FORBIDDEN (cause preserved for route mapping), row intact', async () => {
    const row = grantRow({ user_id: SHARER });
    mockLive.RoomFile.findByPk.mockResolvedValue(row);
    await expectDenial(capability.revoke('roomFile', 'rf-1', MEMBER), 'FORBIDDEN');
    expect(row.destroy).not.toHaveBeenCalled();
  });

  test('a missing grant is NOT_FOUND', async () => {
    mockLive.RoomFile.findByPk.mockResolvedValue(null);
    await expectDenial(capability.revoke('roomFile', 'nope', HOST), 'NOT_FOUND');
  });

  test('legacy ephemeral revoke: disk unlink moved INTO the adapter', async () => {
    const unlink = jest.spyOn(fs, 'unlinkSync').mockImplementation(() => {});
    try {
      const row = grantRow({ kind: 'ephemeral', file_id: null, storage_key: 'blob-1', user_id: SHARER });
      mockLive.RoomFile.findByPk.mockResolvedValue(row);
      await expect(capability.revoke('roomFile', 'rf-1', SHARER)).resolves.toBe(true);
      expect(unlink).toHaveBeenCalledWith(
        path.join(process.cwd(), 'data', 'room-files', ROOM_ID, 'blob-1')
      );
      expect(row.destroy).toHaveBeenCalled();
    } finally {
      unlink.mockRestore();
    }
  });
});

// ── revokeByResource ─────────────────────────────────────────────────────────

describe('revokeByResource — the "resource replaced/deleted" hammer', () => {
  test('destroys EVERY RoomFile grant on the file (all rooms, all provenance)', async () => {
    mockLive.RoomFile.destroy.mockResolvedValue(3);
    await expect(capability.revokeByResource('roomFile', 'vf-1', { reason: 'resource-replaced' }))
      .resolves.toEqual({ revoked: 3 });
    expect(mockLive.RoomFile.destroy).toHaveBeenCalledWith({ where: { file_id: 'vf-1' } });
  });

  test('{revoked: 0} is success, not an error', async () => {
    mockLive.RoomFile.destroy.mockResolvedValue(0);
    await expect(capability.revokeByResource('roomFile', 'vf-1'))
      .resolves.toEqual({ revoked: 0 });
  });
});

// ── listByResource ───────────────────────────────────────────────────────────

describe('listByResource — owner-only descriptors, minimal', () => {
  test('the owner sees descriptors for every room grant on their file', async () => {
    mockFileFindOne.mockResolvedValue(vaultFile()); // getFile for OWNER
    mockLive.RoomFile.findAll.mockResolvedValue([
      grantRow({ id: 'rf-1', user_id: OWNER, shared_as_owner: true }),
      grantRow({ id: 'rf-2', user_id: SHARER, shared_as_owner: false, room_id: 'room-2' })
    ]);

    const list = await capability.listByResource('roomFile', 'vf-1', OWNER);

    expect(list).toHaveLength(2);
    expect(list[0]).toMatchObject({
      id: 'rf-1', backend: 'live-roomfile', kind: 'room-grant',
      provenance: { mintedBy: OWNER, mintedAsOwner: true, mintedUnderVisibility: null }
    });
    expect(list[1].provenance.mintedAsOwner).toBe(false);
    // descriptors only — no row internals / secret material
    expect(list[0].storage_key).toBeUndefined();
    expect(mockLive.RoomFile.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ where: { file_id: 'vf-1', kind: 'vault' } })
    );
  });

  test('a NON-owner (even of a public file) gets the same denial as a missing file', async () => {
    mockFileFindOne.mockResolvedValue(vaultFile()); // public — getFile admits SHARER
    await expectDenial(capability.listByResource('roomFile', 'vf-1', SHARER), 'FILE_NOT_FOUND');
    expect(mockLive.RoomFile.findAll).not.toHaveBeenCalled();
  });

  test('a missing file is the same denial', async () => {
    mockFileFindOne.mockResolvedValue(null);
    await expectDenial(capability.listByResource('roomFile', 'nope', OWNER), 'FILE_NOT_FOUND');
  });
});
