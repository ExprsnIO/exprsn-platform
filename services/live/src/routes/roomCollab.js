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
const { Room, RoomInvite, RoomJoinRequest, RoomFile, Recording } = require('../models');
const { requireAuth } = require('../middleware/auth');
const liveQueue = require('../services/liveQueue');
const liveConfig = require('../services/liveConfig');
const logger = require('../utils/logger');

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

// ── room files (vault share + ephemeral upload) ──────────────────────────────
router.get('/:id/files', requireAuth, loadRoom, async (req, res) => {
  const files = await RoomFile.findAll({ where: { room_id: req.room.id }, order: [['created_at', 'DESC']] });
  res.json({ success: true, files });
});
router.post('/:id/files/share', requireAuth, loadRoom, async (req, res) => {
  try {
    const { fileId, name, mimetype, size } = req.body;
    if (!fileId || !name) return res.status(400).json({ error: 'FILE_REQUIRED' });
    const file = await RoomFile.create({
      room_id: req.room.id, user_id: req.user.id, kind: 'vault',
      file_id: fileId, name, mimetype: mimetype || null, size: size || null
    });
    res.status(201).json({ success: true, file });
  } catch (e) { res.status(500).json({ error: 'SHARE_FAILED', message: e.message }); }
});
router.post('/:id/files/upload', requireAuth, loadRoom, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'NO_FILE' });
    const dir = path.join(UPLOAD_DIR, req.room.id);
    fs.mkdirSync(dir, { recursive: true });
    const key = `${Date.now()}-${req.file.originalname}`.replace(/[^\w.\-]+/g, '_');
    fs.writeFileSync(path.join(dir, key), req.file.buffer);
    const file = await RoomFile.create({
      room_id: req.room.id, user_id: req.user.id, kind: 'ephemeral',
      storage_key: key, name: req.file.originalname, mimetype: req.file.mimetype, size: req.file.size
    });
    res.status(201).json({ success: true, file });
  } catch (e) { logger.error('room upload failed', { error: e.message }); res.status(500).json({ error: 'UPLOAD_FAILED', message: e.message }); }
});
router.get('/:id/files/:fileId/download', requireAuth, loadRoom, async (req, res) => {
  const file = await RoomFile.findOne({ where: { id: req.params.fileId, room_id: req.room.id } });
  if (!file || file.kind !== 'ephemeral') return res.status(404).json({ error: 'NOT_FOUND' });
  const p = path.join(UPLOAD_DIR, req.room.id, file.storage_key);
  if (!fs.existsSync(p)) return res.status(404).json({ error: 'GONE' });
  res.setHeader('Content-Type', file.mimetype || 'application/octet-stream');
  res.setHeader('Content-Disposition', `inline; filename="${file.name}"`);
  fs.createReadStream(p).pipe(res);
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
