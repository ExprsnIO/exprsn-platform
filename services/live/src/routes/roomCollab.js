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
const { Room, RoomInvite, RoomJoinRequest, RoomFile, Recording, RecordingModeration } = require('../models');
const { requireAuth } = require('../middleware/auth');
const liveQueue = require('../services/liveQueue');
const recordingModeration = require('../services/recordingModeration');
const liveConfig = require('../services/liveConfig');
const logger = require('../utils/logger');
// In-process FileVault façade (same pattern as room.js → plugins/pluginHost).
// BUG-024: room-collab uploads flow through FileVault so they inherit the whole
// FEAT-031 image-moderation chokepoint (moderation row, hold-until-verdict,
// encrypted/non-image skip, escalation) instead of hitting local disk unchecked.
const fileService = require('../../../filevault/src/services/fileService');
// TASK-057 / FEAT-077: RoomFile grants are resolved/enforced through the ONE
// capability façade. The backend for 'roomFile' is live's own adapter
// (../services/roomFileCapabilityAdapter), registered from live's init(). The
// routes here dispatch and serialize; enforcement (membership + provenance +
// moderation) lives in the adapter — no second enforcement path.
const capability = require('../../../filevault/src/services/capabilityService');
const { ROOM_FILE } = capability.RESOURCE_TYPES;
const { isRoomMember } = require('../services/roomMembership');

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
    // TASK-057: the predicate itself lives in services/roomMembership so this
    // middleware and the RoomFile capability adapter enforce the identical rule.
    if (await isRoomMember(req.room, req.user.id)) return next();
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
    // TASK-057: the listing applies EXACTLY the download path's rule by asking
    // the capability façade per vault-backed row — one enforcement point, so a
    // row the download would 404 (held image / provenance-dead share, FEAT-031
    // + FEAT-061) is never enumerable here either (the BUG-020 leak shape).
    // Denials are filtered, not surfaced. Legacy `ephemeral` disk rows are out
    // of the façade and left as-is (pre-existing rows only).
    const visible = [];
    for (const f of files) {
      if (f.kind !== 'vault' || !f.file_id) {
        visible.push(f);
        continue;
      }
      try {
        await capability.authorize(ROOM_FILE, { roomFileId: f.id }, {
          requesterId: req.user.id,
          roomId: req.room.id
        });
        visible.push(f);
      } catch (_) { /* CAP_NOT_FOUND — not enumerable, fail closed */ }
    }
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

    // TASK-057: minting is capability.grant. The adapter preserves BUG-026
    // verbatim — it verifies the sharer can access the file via
    // fileService.getFile (same 404 whether missing or forbidden; never an
    // existence oracle) and derives shared_as_owner + all metadata from the
    // VERIFIED file, never the request body (FEAT-061 provenance).
    let credential;
    try {
      ({ credential } = await capability.grant(ROOM_FILE, fileId, req.user.id, {
        roomId: req.room.id,
        name
      }));
    } catch (e) {
      if (e.code === 'CAP_NOT_FOUND' && e.cause === 'FILE_NOT_FOUND') {
        return res.status(404).json({ error: 'FILE_NOT_FOUND' });
      }
      return res.status(500).json({ error: 'SHARE_FAILED', message: e.cause || e.message });
    }
    // Serialization only (today's response shape) — not an enforcement path.
    const file = await RoomFile.findByPk(credential.roomFileId);
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
    // TASK-057: the row-create is capability.grant. The uploader IS the owner —
    // uploadFile() created the file under req.user.id, so the adapter's
    // verified-file derivation yields shared_as_owner: true.
    const { credential } = await capability.grant(ROOM_FILE, vaultFile.id, req.user.id, {
      roomId: req.room.id,
      name: req.file.originalname
    });
    // Serialization only (today's response shape) — not an enforcement path.
    const file = await RoomFile.findByPk(credential.roomFileId);
    res.status(201).json({ success: true, file });
  } catch (e) { logger.error('room upload failed', { error: e.message }); res.status(500).json({ error: 'UPLOAD_FAILED', message: e.cause || e.message }); }
});
router.get('/:id/files/:fileId/download', requireAuth, loadRoom, requireRoomMember, async (req, res) => {
  const file = await RoomFile.findOne({ where: { id: req.params.fileId, room_id: req.room.id } });
  if (!file) return res.status(404).json({ error: 'NOT_FOUND' });

  // TASK-057: FileVault-backed rows are authorized through the capability
  // façade — the ONE enforcement point (row scope, membership via the shared
  // predicate, FEAT-061/BUG-027 provenance, FEAT-031 moderation). Every denial
  // is the same 404 as a missing file. After authorize, streaming follows the
  // share.js post-authorize precedent: downloadFileStream as the file's owner —
  // the capability, not ownership, is what authorized the requester.
  if (file.kind === 'vault' && file.file_id) {
    try {
      const { resource: vaultFile } = await capability.authorize(
        ROOM_FILE,
        { roomFileId: file.id },
        { requesterId: req.user.id, roomId: req.room.id }
      );
      const { stream } = await fileService.downloadFileStream(vaultFile.id, vaultFile.userId);
      res.setHeader('Content-Type', (vaultFile && vaultFile.mimetype) || file.mimetype || 'application/octet-stream');
      res.setHeader('Content-Disposition', `inline; filename="${file.name}"`);
      return stream.pipe(res);
    } catch (e) {
      if (e.code === 'CAP_NOT_FOUND' || e.message === 'FILE_NOT_FOUND') return res.status(404).json({ error: 'NOT_FOUND' });
      logger.error('room file download failed', { error: e.message });
      return res.status(500).json({ error: 'DOWNLOAD_FAILED' });
    }
  }

  // Legacy `ephemeral` rows written before BUG-024 still stream from disk. No
  // new rows of this kind are created. LEGACY / OUT-OF-FAÇADE: kept verbatim
  // behind the requireRoomMember gate (TASK-057); their revocation cleanup
  // lives in the RoomFile capability adapter.
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
  // URL-scope dispatch only (a row outside this room's URL stays today's 404) —
  // the actor check (host OR sharer), the row destroy, and the legacy-ephemeral
  // disk unlink all live in the capability adapter (TASK-057).
  const file = await RoomFile.findOne({ where: { id: req.params.fileId, room_id: req.room.id } });
  if (!file) return res.status(404).json({ error: 'NOT_FOUND' });
  try {
    await capability.revoke(ROOM_FILE, file.id, req.user.id);
  } catch (e) {
    // cause is route-compat mapping only: keep today's 403-vs-404 split.
    if (e.code === 'CAP_NOT_FOUND' && e.cause === 'FORBIDDEN') {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }
    return res.status(404).json({ error: 'NOT_FOUND' });
  }
  res.json({ success: true });
});

// ── recording controls ───────────────────────────────────────────────────────
router.post('/:id/recording/start', requireAuth, loadRoom, requireHost, async (req, res) => {
  try {
    const rec = await liveConfig.getSection('recording');
    if (!rec.recordingEnabled) return res.status(403).json({ error: 'RECORDING_DISABLED' });
    const provider = await liveConfig.getSection('provider');
    const quality = req.body.quality || rec.quality || 'source';
    const format = rec.format || 'mp4';
    // Decide the output path up front so the row records WHERE the bytes will land
    // (worker:live muxes to this path, then finalizes the row — TASK-041).
    const outputPath = path.join(UPLOAD_DIR, req.room.id, `recording-${Date.now()}.${format}`);
    // BUG-032: the row MUST persist. Previously this wrote camelCase attrs the
    // model doesn't define, omitted the NOT-NULL user_id, and set status
    // 'recording' (outside the processing|ready|failed|deleted enum) — so the
    // insert threw and `.catch(()=>null)` swallowed it, leaving recordingId null
    // and no row for the worker to finalize. There is no 'recording' enum value;
    // 'processing' is the active state until worker:live sets 'ready'.
    const recording = await Recording.create({
      room_id: req.room.id,
      user_id: req.user.id, // NOT NULL — the host who started the recording
      title: `${req.room.name || 'Room'} recording`,
      status: 'processing',
      format,
      started_at: new Date(),
      storage_url: outputPath,
    });
    await liveQueue.enqueueRecording({
      roomId: req.room.id, recordingId: recording.id,
      inputUrl: `${provider.srsHlsBase}/${req.room.room_code}.m3u8`,
      outputPath,
      format, quality
    });
    res.status(202).json({ success: true, recording });
  } catch (e) { logger.error('recording start failed', { error: e.message }); res.status(500).json({ error: 'RECORDING_FAILED', message: e.message }); }
});
router.post('/:id/recording/stop', requireAuth, loadRoom, requireHost, async (req, res) => {
  // Finalization (status 'ready' + storage_url/size/duration) is owned by
  // worker:live when the ffmpeg mux exits (TASK-041). This endpoint only
  // acknowledges the host's stop request — the recording ends when the broadcast
  // (SRS HLS input) does. (Previously wrote an invalid 'completed' enum against a
  // non-existent 'recording' status — a swallowed no-op; BUG-032.)
  res.json({ success: true });
});
router.get('/:id/recordings', requireAuth, loadRoom, async (req, res) => {
  const recordings = await Recording.findAll({
    where: { room_id: req.room.id },
    include: [{ model: RecordingModeration, as: 'moderation', required: false }],
    order: [['created_at', 'DESC']], limit: 50
  }).catch(() => []);
  // FEAT-074 visibility gate: the host sees everything (incl. held/pending);
  // everyone else sees only recordings whose moderation says they're servable.
  const host = isHost(req.room, req.user.id);
  const visible = recordings
    .filter((r) => host || recordingModeration.isServable(r.moderation))
    .map((r) => {
      const json = r.toJSON();
      json.moderationStatus = r.moderation ? r.moderation.status : null;
      delete json.moderation;
      return json;
    });
  res.json({ success: true, recordings: visible });
});

module.exports = router;
