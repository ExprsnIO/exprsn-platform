'use strict';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * TASK-057 — RoomFile capability backend adapter (FEAT-077 remainder)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * The backend registered for the `roomFile` resource type of the capability
 * façade (`services/filevault/src/services/capabilityService`). Shape A, per
 * the architect contract (sprints/assessments/feat-077-shape-a-contract.md):
 * NO storage migration, NO DDL — the `room_files` ROW IS the capability.
 * Mint = create the row, revoke = destroy the row; there is no token, no
 * expiry, no use-count.
 *
 * Dependency direction is one-way (contract §1): this adapter lives in
 * services/live, uses live's own Sequelize models, and requires filevault's
 * services in-process — the same direction the pre-existing
 * roomCollab.js → fileService require established. Filevault requires nothing
 * from live; registration happens from live's init()
 * (services/live/src/index.js).
 *
 * Descriptor mapping (architect directive, 2026-07-28):
 *   id            = RoomFile row id        resourceType = 'roomFile'
 *   resourceId    = file_id                backend      = 'live-roomfile'
 *   kind          = 'room-grant'           permissions  = {read,-,-} constant
 *   provenance    = { mintedBy: user_id, mintedAsOwner: shared_as_owner,
 *                     mintedUnderVisibility: null (N/A — not persisted) }
 *   expiresAt/maxUses = null
 *
 * Enforcement (authorize) is the FULL gate in ONE place — the roomCollab
 * routes no longer carry a second enforcement path:
 *   row exists → row belongs to ctx.roomId → requester is a room member
 *   (the SAME predicate as the requireRoomMember middleware, via
 *   roomMembership.isRoomMember) → shareGrantAllows provenance predicate
 *   (FEAT-061/BUG-027: owner-minted survives a private-flip, non-owner-minted
 *   dies with the visibility it was minted under — lazily, at authorize time)
 *   → imageModeration.canServe (FEAT-031: a held image is denied exactly like
 *   a missing one). Returns the verified File row — no bytes; streaming stays
 *   in fileService (share.js post-authorize precedent).
 *
 * Mint preserves BUG-026 verbatim: the grantor's right to the file is
 * verified via fileService.getFile(fileId, grantorId); `shared_as_owner` and
 * all metadata derive from the VERIFIED file, never from caller input.
 *
 * Every denial is CapabilityError('CAP_NOT_FOUND') — missing, wrong-room,
 * non-member, provenance-dead and moderation-held are indistinguishable
 * (same-404 posture). `cause` is for logs and route-compat mapping only
 * (roomCollab's DELETE keeps today's 403-vs-404 split by mapping cause).
 *
 * Legacy `ephemeral` rows (pre-BUG-024 disk uploads) are OUT of the façade
 * for serving — roomCollab keeps its verbatim disk-stream branch behind the
 * membership gate — but their revocation (row destroy + disk unlink) lives
 * HERE, so deletion has one owner.
 */

const path = require('path');
const fs = require('fs');
const { Room, RoomFile } = require('../models');
const { isRoomMember } = require('./roomMembership');
const logger = require('../utils/logger');
// In-process filevault requires — same direction as roomCollab.js:22.
const fileService = require('../../../filevault/src/services/fileService');
const imageModeration = require('../../../filevault/src/services/imageModerationService');
const { File, FileModeration } = require('../../../filevault/src/models');
const CapabilityError = require('../../../filevault/src/services/capability/CapabilityError');

const BACKEND_NAME = 'live-roomfile';

// A room grant is read-only by construction — there is no write/delete surface
// on a shared room file, and never has been.
const READ_ONLY = Object.freeze({ read: true, write: false, delete: false });

// Legacy ephemeral storage root (pre-BUG-024 rows only; no new writes).
const UPLOAD_DIR = path.join(process.cwd(), 'data', 'room-files');

function deny(cause) {
  return new CapabilityError('CAP_NOT_FOUND', cause);
}

/** CapabilityDescriptor for a RoomFile row (contract §2). */
function descriptor(row) {
  return {
    id: row.id,
    resourceType: 'roomFile',
    resourceId: row.file_id ? String(row.file_id) : null,
    backend: BACKEND_NAME,
    kind: 'room-grant',
    permissions: { ...READ_ONLY },
    provenance: {
      mintedBy: String(row.user_id),
      mintedAsOwner: row.shared_as_owner === true,
      mintedUnderVisibility: null // N/A — not persisted on the row (contract allows null)
    },
    expiresAt: null,
    maxUses: null,
    useCount: 0,
    revoked: false, // a destroyed row simply doesn't exist — the row IS the capability
    createdAt: row.createdAt || row.created_at || null
  };
}

module.exports = {
  backendName: BACKEND_NAME,

  /**
   * Mint a room grant: backs POST /:id/files/share AND the post-upload
   * row-create. BUG-026 verbatim — verify the grantor can access the file via
   * fileService.getFile (private-visibility owner check + moderation gate,
   * with the uploader's own-image exemption), then derive shared_as_owner and
   * metadata from the VERIFIED file, never the body.
   *
   * Room membership of the grantor is enforced by the route's
   * requireRoomMember middleware (its placement is untouched per the
   * directive); this method is platform-internal beyond that.
   *
   * @param {string} resourceId  FileVault file id
   * @param {string} grantorId
   * @param {object} opts        { roomId, name? } — nothing provenance-shaped
   *                             is read from here (BUG-026)
   * @returns {Promise<{capability, credential: {roomFileId}}>} — no url: a
   *   room grant is not a link; it is exercised bearer-authed inside the room.
   */
  async mint(resourceId, grantorId, opts = {}) {
    if (!opts.roomId) {
      throw deny('ROOM_REQUIRED');
    }

    let vaultFile;
    try {
      vaultFile = await fileService.getFile(resourceId, grantorId);
    } catch (err) {
      // Same denial whether the file is missing or the grantor can't see it —
      // never confirm existence of a file the grantor can't access (BUG-026).
      throw deny('FILE_NOT_FOUND');
    }

    // FEAT-061 provenance, derived from the VERIFIED file: was the grantor the
    // owner at mint time? Owner-minted grants survive a later private-flip.
    const sharedAsOwner = String(vaultFile.userId) === String(grantorId);

    const row = await RoomFile.create({
      room_id: opts.roomId,
      user_id: grantorId,
      kind: 'vault',
      file_id: vaultFile.id,
      name: opts.name || vaultFile.name,
      mimetype: vaultFile.mimetype || null,
      size: vaultFile.size || null,
      shared_as_owner: sharedAsOwner
    });

    return {
      capability: descriptor(row),
      credential: { roomFileId: row.id }
    };
  },

  /**
   * Resolve + enforce in one call — the whole gate, in order:
   * row exists → row is in ctx.roomId → requester is a room member (shared
   * predicate with the middleware) → shareGrantAllows provenance → moderation
   * canServe. Returns the verified File row + the RoomFile row; NO bytes —
   * the caller streams via fileService (share.js post-authorize precedent).
   *
   * @param {object} credential { roomFileId }
   * @param {object} ctx        { requesterId, roomId, requiredPermissions? }
   */
  async authorize(credential, ctx = {}) {
    if (!credential || !credential.roomFileId) {
      throw deny('CREDENTIAL_REQUIRED');
    }
    if (!ctx.requesterId || !ctx.roomId) {
      // Room grants are never anonymous: they are exercised bearer-authed
      // inside a room. Missing context fails closed.
      throw deny('CONTEXT_REQUIRED');
    }
    const required = ctx.requiredPermissions || { read: true };
    if (required.write || required.delete) {
      throw deny('PERMISSION_SHORT'); // room grants are read-only by construction
    }

    const row = await RoomFile.findByPk(credential.roomFileId);
    if (!row) {
      throw deny('NOT_FOUND');
    }
    if (String(row.room_id) !== String(ctx.roomId)) {
      throw deny('ROOM_MISMATCH');
    }
    if (row.kind !== 'vault' || !row.file_id) {
      // Legacy `ephemeral` rows are out of the façade for serving — roomCollab
      // streams them from disk behind the membership gate.
      throw deny('NOT_VAULT_BACKED');
    }

    const room = await Room.findByPk(row.room_id);
    if (!room) {
      throw deny('ROOM_NOT_FOUND');
    }
    if (!(await isRoomMember(room, ctx.requesterId))) {
      throw deny('NOT_A_MEMBER');
    }

    const file = await File.findOne({
      where: { id: row.file_id, isDeleted: false },
      include: [{ model: FileModeration, as: 'moderation' }]
    });
    if (!file) {
      throw deny('FILE_NOT_FOUND');
    }

    // FEAT-061 / BUG-027 — the lazy provenance predicate: a non-owner's share
    // of a then-public file dies the moment the owner flips it private; an
    // owner's share of their own file survives.
    if (!fileService.shareGrantAllows(file, ctx.requesterId, row.shared_as_owner === true)) {
      throw deny('PROVENANCE_DEAD');
    }

    // FEAT-031 — a held (pending/rejected/failed) image is served to no one
    // but its uploader, and denies exactly like a missing capability.
    if (!imageModeration.canServe(file, file.moderation, ctx.requesterId)) {
      throw deny('MODERATION_HELD');
    }

    return { resource: file, capability: descriptor(row), roomFile: row };
  },

  /**
   * Revoke one room grant, actor-checked with today's DELETE rule verbatim:
   * the room host OR the sharer may revoke. Destroys the row (the row IS the
   * capability). Legacy `ephemeral` rows: the disk unlink moves in here so
   * deletion has one owner.
   *
   * cause is route-mapping material only: 'FORBIDDEN' keeps today's 403 for a
   * non-actor; everything else maps to today's 404.
   */
  async revoke(capabilityId, actorId) {
    const row = await RoomFile.findByPk(capabilityId);
    if (!row) {
      throw deny('NOT_FOUND');
    }
    const room = await Room.findByPk(row.room_id);
    if (!room) {
      throw deny('NOT_FOUND');
    }
    const actorIsHost = String(room.host_id) === String(actorId);
    if (!actorIsHost && String(row.user_id) !== String(actorId)) {
      throw deny('FORBIDDEN');
    }

    if (row.kind === 'ephemeral' && row.storage_key) {
      try {
        fs.unlinkSync(path.join(UPLOAD_DIR, String(row.room_id), row.storage_key));
      } catch (_) { /* already gone */ }
    }

    await row.destroy();
    return true;
  },

  /**
   * The "resource replaced/deleted" hammer: destroy ALL RoomFile grants
   * pointing at this FileVault file — all rooms, all provenance
   * (owner-minted included). {revoked: 0} is success, not an error.
   * Platform-internal: callers are responsible for owner verification.
   */
  async revokeByResource(resourceId, opts = {}) {
    const revoked = await RoomFile.destroy({ where: { file_id: resourceId } });
    logger.info(`Room-file capabilities revoked by resource: file ${resourceId}`, {
      revoked,
      reason: opts.reason || 'resource-revoked'
    });
    return { revoked };
  },

  /**
   * Owner's management view of live room grants on a file — owner-only
   * (verified via fileService.getFile + an explicit ownership check),
   * descriptors only, minimal.
   */
  async listByResource(resourceId, requesterId) {
    let file;
    try {
      file = await fileService.getFile(resourceId, requesterId);
    } catch (err) {
      throw deny('FILE_NOT_FOUND');
    }
    if (String(file.userId) !== String(requesterId)) {
      // getFile admits non-owners to public files; the management view is
      // owner-only. Same denial as a missing resource.
      throw deny('FILE_NOT_FOUND');
    }

    const rows = await RoomFile.findAll({
      where: { file_id: resourceId, kind: 'vault' },
      order: [['created_at', 'DESC']]
    });
    return rows.map(descriptor);
  }
};
