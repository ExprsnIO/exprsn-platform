/**
 * Room collaboration routes — invites, request-to-join, room files (FileVault
 * share + ephemeral upload), and recording controls. Mounted under /api/rooms,
 * after the core room routes (paths here don't overlap those).
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const router = express.Router();
const { Room, RoomInvite, RoomJoinRequest, RoomFile, Recording, Participant } = require('../models');
const { requireAuth } = require('../middleware/auth');
const liveQueue = require('../services/liveQueue');
const liveConfig = require('../services/liveConfig');
const logger = require('../utils/logger');
// In-process FileVault façade (same pattern as room.js → plugins/pluginHost).
// BUG-024: room-collab uploads flow through FileVault so they inherit the whole
// FEAT-031 image-moderation chokepoint (moderation row, hold-until-verdict,
// encrypted/non-image skip, escalation) instead of hitting local disk unchecked.
const fileService = require('../../../filevault/src/services/fileService');

// Retained only for (a) recording output paths and (b) reading any pre-existing
// legacy `ephemeral` rows still on disk. New uploads never write here.
const UPLOAD_DIR = path.join(process.cwd(), 'data', 'room-files');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });

async function loadRoom(req, res, next) {
  const room = await Room.findByPk(req.params.id);
  if (!room) return res.status(404).json({ error: 'ROOM_NOT_FOUND' });
  req.room = room;
  next();
}
function isHost(room, userId) { return String(room.host_id) === String(userId); }
function requireHost(req, res, next) {
  if (!isHost(req.room, req.user.id)) return res.status(403).json({ error: 'FORBIDDEN', message: 'Host only' });
  next();
}

/**
 * Room-scoped access control for room files. A member is the host, an active
 * participant, an invitee (pending/accepted), or an approved join-requester —
 * the same signals the join flow honors. Non-members are denied so room files
 * are never enumerable or fetchable outside the room. Must run after loadRoom.
 */
async function requireRoomMember(req, res, next) {
  try {
    const uid = req.user.id;
    if (isHost(req.room, uid)) return next();
    const [participant, invite, joinReq] = await Promise.all([
      Participant.findOne({ where: { room_id: req.room.id, user_id: uid } }),
      RoomInvite.findOne({ where: { room_id: req.room.id, invitee_id: uid, status: ['pending', 'accepted'] } }),
      RoomJoinRequest.findOne({ where: { room_id: req.room.id, user_id: uid, status: 'approved' } })
    ]);
    if (participant || invite || joinReq) return next();
    return res.status(403).json({ error: 'NOT_A_MEMBER', message: 'Room membership required' });
  } catch (e) {
    logger.error('room membership check failed', { error: e.message });
    return res.status(500).json({ error: 'MEMBERSHIP_CHECK_FAILED' });
  }
}

// ── invites ─────────────────────────────────────────────────────────────────
router.post('/:id/invites', requireAuth, loadRoom, requireHost, async (req, res) => {
  try {
    const inviteeId = req.body.inviteeId;
    if (!inviteeId) return res.status(400).json({ error: 'INVITEE_REQUIRED' });
    const invite = await RoomInvite.create({ room_id: req.room.id, inviter_id: req.user.id, invitee_id: inviteeId });
    res.status(201).json({ success: true, invite });
  } catch (e) { logger.error('invite failed', { error: e.message }); res.status(500).json({ error: 'INVITE_FAILED', message: e.message }); }
});
router.get('/:id/invites', requireAuth, loadRoom, requireHost, async (req, res) => {
  const invites = await RoomInvite.findAll({ where: { room_id: req.room.id }, order: [['created_at', 'DESC']] });
  res.json({ success: true, invites });
});
router.delete('/:id/invites/:inviteId', requireAuth, loadRoom, requireHost, async (req, res) => {
  await RoomInvite.update({ status: 'revoked' }, { where: { id: req.params.inviteId, room_id: req.room.id } });
  res.json({ success: true });
});

// ── request to join ───────────────────────────────────────────────────────────
router.post('/:id/join-requests', requireAuth, loadRoom, async (req, res) => {
  try {
    const [reqRow] = await RoomJoinRequest.findOrCreate({
      where: { room_id: req.room.id, user_id: req.user.id, status: 'pending' },
      defaults: { room_id: req.room.id, user_id: req.user.id }
    });
    res.status(201).json({ success: true, request: reqRow });
  } catch (e) { res.status(500).json({ error: 'REQUEST_FAILED', message: e.message }); }
});
router.get('/:id/join-requests', requireAuth, loadRoom, requireHost, async (req, res) => {
  const requests = await RoomJoinRequest.findAll({ where: { room_id: req.room.id, status: 'pending' }, order: [['created_at', 'DESC']] });
  res.json({ success: true, requests });
});
router.post('/:id/join-requests/:reqId/:decision(approve|deny)', requireAuth, loadRoom, requireHost, async (req, res) => {
  const status = req.params.decision === 'approve' ? 'approved' : 'denied';
  await RoomJoinRequest.update({ status }, { where: { id: req.params.reqId, room_id: req.room.id } });
  const request = await RoomJoinRequest.findByPk(req.params.reqId);
  res.json({ success: true, request });
});

// ── room files (all FileVault-backed via `vault` refs + legacy `ephemeral`) ───
router.get('/:id/files', requireAuth, loadRoom, requireRoomMember, async (req, res) => {
  try {
    const files = await RoomFile.findAll({ where: { room_id: req.room.id }, order: [['created_at', 'DESC']] });
    // FEAT-031: a held image must not be enumerable to a non-uploader. Every
    // FileVault-backed row (`vault`) is filtered through the moderation gate;
    // legacy `ephemeral` disk rows have no FileVault moderation state and are
    // left as-is (pre-existing rows only — no new ones are created).
    const vaultIds = files.filter((f) => f.kind === 'vault' && f.file_id).map((f) => String(f.file_id));
    // FEAT-061: the listing applies the SAME grant rule as the download path. Without
    // the provenance set, a file whose share died on a private-flip would still be
    // listed — leaking its name, size, and existence while its bytes 404.
    const ownerSharedIds = new Set(
      files.filter((f) => f.kind === 'vault' && f.file_id && f.shared_as_owner).map((f) => String(f.file_id))
    );
    const servable = await fileService.servableFileIds(vaultIds, req.user.id, { ownerSharedIds });
    const visible = files.filter((f) => {
      if (f.kind === 'vault' && f.file_id) return servable.has(String(f.file_id));
      return true;
    });
    res.json({ success: true, files: visible });
  } catch (e) {
    logger.error('room file list failed', { error: e.message });
    res.status(500).json({ error: 'LIST_FAILED', message: e.message });
  }
});
router.post('/:id/files/share', requireAuth, loadRoom, requireRoomMember, async (req, res) => {
  try {
    const { fileId, name } = req.body;
    if (!fileId) return res.status(400).json({ error: 'FILE_REQUIRED' });

    // BUG-026: the sharer MUST be able to access the file they are sharing in.
    // Without this, an attacker could share a victim's private FileVault file by
    // UUID into a room they control, then download it via the member-download
    // route (which deliberately skips the ownership check, trusting that the
    // share was legitimate). getFile() enforces the private-visibility owner
    // check AND the moderation gate and throws if the caller can't access it.
    // Metadata comes from the VERIFIED file, never the request body (no spoofing).
    let vaultFile;
    try {
      vaultFile = await fileService.getFile(fileId, req.user.id);
    } catch (e) {
      // Same 404 whether the file is missing or the caller isn't allowed to see
      // it — never confirm existence of a file the caller can't access.
      return res.status(404).json({ error: 'FILE_NOT_FOUND' });
    }

    // FEAT-061: record the capability's provenance. A share is only ever as strong as
    // the visibility it was minted under — UNLESS the owner is the one who shared it,
    // in which case a later private-flip must not revoke the room's access (that is the
    // flow the download path's visibility-skip was built to protect). Deriving this from
    // the VERIFIED file, never the request body.
    const sharedAsOwner = String(vaultFile.userId) === String(req.user.id);

    const file = await RoomFile.create({
      room_id: req.room.id, user_id: req.user.id, kind: 'vault',
      file_id: vaultFile.id, name: name || vaultFile.name,
      mimetype: vaultFile.mimetype || null, size: vaultFile.size || null,
      shared_as_owner: sharedAsOwner
    });
    res.status(201).json({ success: true, file });
  } catch (e) { res.status(500).json({ error: 'SHARE_FAILED', message: e.message }); }
});
// BUG-024: uploads no longer touch local disk. The bytes go through FileVault's
// moderated upload — creating the moderation row in the upload transaction,
// enqueuing the Bull vision pass, and inheriting hold-until-verdict visibility,
// encrypted-skip, non-image-skip, and human escalation for free. We store a
// `vault` RoomFile row pointing at the FileVault file id; the download route
// serves it back through FileVault, gated by moderation status.
router.post('/:id/files/upload', requireAuth, loadRoom, requireRoomMember, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'NO_FILE' });
    // A live room is not a nexus group, so use the personal uploadFile() with
    // room-scoped path/metadata for attribution. Moderation wiring is identical
    // on both paths.
    const vaultFile = await fileService.uploadFile({
      userId: req.user.id,
      buffer: req.file.buffer,
      filename: req.file.originalname,
      mimetype: req.file.mimetype,
      path: `/live-rooms/${req.room.id}/${req.file.originalname}`,
      metadata: { source: 'live-room', roomId: String(req.room.id) }
    });
    const file = await RoomFile.create({
      room_id: req.room.id, user_id: req.user.id, kind: 'vault',
      file_id: vaultFile.id, name: req.file.originalname,
      mimetype: req.file.mimetype, size: req.file.size,
      // The uploader IS the owner — uploadFile() created the file under req.user.id.
      shared_as_owner: true
    });
    res.status(201).json({ success: true, file });
  } catch (e) { logger.error('room upload failed', { error: e.message }); res.status(500).json({ error: 'UPLOAD_FAILED', message: e.message }); }
});
router.get('/:id/files/:fileId/download', requireAuth, loadRoom, requireRoomMember, async (req, res) => {
  const file = await RoomFile.findOne({ where: { id: req.params.fileId, room_id: req.room.id } });
  if (!file) return res.status(404).json({ error: 'NOT_FOUND' });

  // FileVault-backed rows: stream via FileVault. Room membership authorizes the
  // requester (verified above); the FEAT-031 gate still applies to them as a
  // non-uploader, so a held (pending/rejected) image 404s exactly like a
  // missing file and is never served.
  //
  // FEAT-061 / BUG-027: room membership is no longer sufficient on its own. The share
  // carries provenance — a non-owner's share of a then-public file stops serving the
  // moment the owner flips it private, while an owner's share of their own file
  // survives. Passing `shared_as_owner` is what lets FileVault tell the two apart.
  if (file.kind === 'vault' && file.file_id) {
    try {
      const { stream, file: vaultFile } = await fileService.downloadFileStreamForMember(
        file.file_id,
        req.user.id,
        { sharedAsOwner: file.shared_as_owner === true }
      );
      res.setHeader('Content-Type', (vaultFile && vaultFile.mimetype) || file.mimetype || 'application/octet-stream');
      res.setHeader('Content-Disposition', `inline; filename="${file.name}"`);
      return stream.pipe(res);
    } catch (e) {
      if (e.message === 'FILE_NOT_FOUND') return res.status(404).json({ error: 'NOT_FOUND' });
      logger.error('room file download failed', { error: e.message });
      return res.status(500).json({ error: 'DOWNLOAD_FAILED' });
    }
  }

  // Legacy `ephemeral` rows written before BUG-024 still stream from disk. No
  // new rows of this kind are created.
  if (file.kind === 'ephemeral' && file.storage_key) {
    const p = path.join(UPLOAD_DIR, req.room.id, file.storage_key);
    if (!fs.existsSync(p)) return res.status(404).json({ error: 'GONE' });
    res.setHeader('Content-Type', file.mimetype || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${file.name}"`);
    return fs.createReadStream(p).pipe(res);
  }

  return res.status(404).json({ error: 'NOT_FOUND' });
});
router.delete('/:id/files/:fileId', requireAuth, loadRoom, async (req, res) => {
  const file = await RoomFile.findOne({ where: { id: req.params.fileId, room_id: req.room.id } });
  if (!file) return res.status(404).json({ error: 'NOT_FOUND' });
  if (!isHost(req.room, req.user.id) && String(file.user_id) !== String(req.user.id)) {
    return res.status(403).json({ error: 'FORBIDDEN' });
  }
  if (file.kind === 'ephemeral' && file.storage_key) {
    try { fs.unlinkSync(path.join(UPLOAD_DIR, req.room.id, file.storage_key)); } catch (_) { /* gone */ }
  }
  await file.destroy();
  res.json({ success: true });
});

// ── recording controls ───────────────────────────────────────────────────────
router.post('/:id/recording/start', requireAuth, loadRoom, requireHost, async (req, res) => {
  try {
    const rec = await liveConfig.getSection('recording');
    if (!rec.recordingEnabled) return res.status(403).json({ error: 'RECORDING_DISABLED' });
    const provider = await liveConfig.getSection('provider');
    const quality = req.body.quality || rec.quality || 'source';
    const recording = await Recording.create({
      room_id: req.room.id, title: `${req.room.name || 'Room'} recording`, status: 'recording', format: rec.format || 'mp4'
    }).catch(() => null);
    await liveQueue.enqueueRecording({
      roomId: req.room.id, recordingId: recording ? recording.id : null,
      inputUrl: `${provider.srsHlsBase}/${req.room.room_code}.m3u8`,
      outputPath: path.join(UPLOAD_DIR, req.room.id, `recording-${Date.now()}.${rec.format || 'mp4'}`),
      format: rec.format || 'mp4', quality
    });
    res.status(202).json({ success: true, recording: recording || { status: 'queued' } });
  } catch (e) { logger.error('recording start failed', { error: e.message }); res.status(500).json({ error: 'RECORDING_FAILED', message: e.message }); }
});
router.post('/:id/recording/stop', requireAuth, loadRoom, requireHost, async (req, res) => {
  await Recording.update({ status: 'completed' }, { where: { room_id: req.room.id, status: 'recording' } }).catch(() => {});
  res.json({ success: true });
});
router.get('/:id/recordings', requireAuth, loadRoom, async (req, res) => {
  const recordings = await Recording.findAll({ where: { room_id: req.room.id }, order: [['created_at', 'DESC']], limit: 50 }).catch(() => []);
  res.json({ success: true, recordings });
});

module.exports = router;
