/**
 * Configuration Management Routes
 * Provides endpoints for the Setup dashboard to manage Live Streaming configurations
 */

const express = require('express');
const router = express.Router();
const { Room, Recording } = require('../models');
const config = require('../config');
const logger = require('../utils/logger');
const liveConfig = require('../services/liveConfig');
const liveQueue = require('../services/liveQueue');

// Persisted config sections rendered by the admin ConfigSectionEditor
// ({ title, description, fields:[{name,label,type,value,options?}] }).
const SECTIONS = {
  limits: {
    title: 'Streaming Limits', description: 'Caps enforced by the room/stream APIs',
    fields: [
      { name: 'maxLiveRooms', label: 'Max concurrent live rooms', type: 'number' },
      { name: 'maxParticipantsPerRoom', label: 'Max participants per room', type: 'number' },
      { name: 'maxBitrateKbps', label: 'Max bitrate (kbps)', type: 'number' },
      { name: 'maxResolution', label: 'Max resolution', type: 'select', options: ['720p', '1080p', '4K'] },
      { name: 'maxStreamDurationMin', label: 'Max stream duration (min)', type: 'number' },
      { name: 'maxSimulcastDestinations', label: 'Max simulcast destinations', type: 'number' }
    ]
  },
  provider: {
    title: 'Streaming Provider', description: 'Ingest provider + SRS endpoints',
    fields: [
      { name: 'streamingProvider', label: 'Provider', type: 'select', options: ['srs', 'cloudflare'] },
      { name: 'srsRtmpUrl', label: 'SRS RTMP ingest URL', type: 'text' },
      { name: 'srsHlsBase', label: 'SRS HLS base URL', type: 'text' },
      { name: 'srsApiUrl', label: 'SRS API URL', type: 'text' }
    ]
  },
  recording: {
    title: 'Recording Pipeline', description: 'Recording defaults + retention',
    fields: [
      { name: 'recordingEnabled', label: 'Enable recording', type: 'checkbox' },
      { name: 'autoRecord', label: 'Auto-record streams', type: 'checkbox' },
      { name: 'format', label: 'Format', type: 'select', options: ['mp4', 'hls'] },
      { name: 'quality', label: 'Quality', type: 'select', options: ['source', '1080p', '720p'] },
      { name: 'retentionDays', label: 'Retention (days)', type: 'number' }
    ]
  },
  roompolicy: {
    title: 'Room Policy', description: 'Default join + publish policy',
    fields: [
      { name: 'defaultJoinPolicy', label: 'Default join policy', type: 'select', options: ['open', 'invite', 'request'] },
      { name: 'whoCanPublish', label: 'Who can publish', type: 'select', options: ['host', 'all'] },
      { name: 'allowGuests', label: 'Allow guests', type: 'checkbox' },
      { name: 'lockable', label: 'Rooms lockable', type: 'checkbox' }
    ]
  },
  moderation: {
    title: 'Moderation Settings', description: 'In-room moderation defaults',
    fields: [
      { name: 'profanityFilter', label: 'Profanity filter', type: 'checkbox' },
      { name: 'autoMuteOnJoin', label: 'Auto-mute on join', type: 'checkbox' },
      { name: 'requireApproval', label: 'Require approval to speak', type: 'checkbox' },
      { name: 'bannedWords', label: 'Banned words (comma-sep)', type: 'text' },
      { name: 'maxWarnings', label: 'Max warnings before removal', type: 'number' }
    ]
  }
};

async function buildSection(id) {
  const meta = SECTIONS[id];
  const values = await liveConfig.getSection(id);
  return { title: meta.title, description: meta.description, fields: meta.fields.map((f) => ({ ...f, value: values[f.name] })) };
}

// Live worker/queue depths for the admin Workers view.
router.get('/workers/stats', async (req, res) => {
  try {
    res.json({ success: true, queues: await liveQueue.stats() });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/:sectionId', async (req, res) => {
  const { sectionId } = req.params;

  try {
    let data;

    switch (sectionId) {
      case 'live-rooms':
        data = await getRoomsConfig();
        break;
      case 'live-recordings':
        data = await getRecordingsConfig();
        break;
      case 'live-settings':
        data = await getLiveSettings();
        break;
      default:
        if (SECTIONS[sectionId]) { data = await buildSection(sectionId); break; }
        return res.status(404).json({ success: false, error: 'Configuration section not found' });
    }

    res.json(data);
  } catch (error) {
    logger.error(`Error fetching config for ${sectionId}:`, error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/:sectionId', async (req, res) => {
  const { sectionId } = req.params;
  const configData = req.body;

  try {
    let result;

    switch (sectionId) {
      case 'live-settings':
        result = await updateLiveSettings(configData);
        break;
      default:
        if (SECTIONS[sectionId]) { result = await liveConfig.setSection(sectionId, configData); break; }
        return res.status(404).json({ success: false, error: 'Configuration section not found' });
    }

    res.json({ success: true, result });
  } catch (error) {
    logger.error(`Error updating config for ${sectionId}:`, error);
    res.status(500).json({ success: false, error: error.message });
  }
});

async function getRoomsConfig() {
  const rooms = await Room.findAll({ order: [['created_at', 'DESC']], limit: 50 });

  return {
    title: 'Stream Rooms',
    description: 'Manage live streaming rooms',
    actions: ['Create Room'],
    table: {
      headers: ['Name', 'Status', 'Participants', 'Created', 'Actions'],
      rows: rooms.map(r => [
        r.name,
        r.status,
        String(r.participant_count || 0),
        new Date(r.created_at).toLocaleDateString(),
        'View | Edit | End'
      ])
    }
  };
}

async function getRecordingsConfig() {
  const recordings = await Recording.findAll({ order: [['created_at', 'DESC']], limit: 50 });

  return {
    title: 'Recordings',
    description: 'Manage stream recordings',
    table: {
      headers: ['Title', 'Duration', 'Size', 'Created', 'Actions'],
      rows: recordings.map(r => [
        r.title,
        r.duration ? `${Math.floor(r.duration / 60)}m` : '-',
        r.file_size ? `${(r.file_size / 1024 / 1024).toFixed(2)} MB` : '-',
        new Date(r.created_at).toLocaleDateString(),
        'View | Download | Delete'
      ])
    }
  };
}

async function getLiveSettings() {
  return {
    title: 'Streaming Settings',
    description: 'Configure live streaming parameters',
    fields: [
      { name: 'maxBitrate', label: 'Max Bitrate (kbps)', type: 'number', value: config.streaming?.maxBitrate || 4000 },
      { name: 'maxResolution', label: 'Max Resolution', type: 'select', options: ['720p', '1080p', '4K'], value: config.streaming?.maxResolution || '1080p' },
      { name: 'recordingEnabled', label: 'Enable Recording', type: 'checkbox', value: config.streaming?.recordingEnabled !== false },
      { name: 'maxRoomSize', label: 'Max Room Participants', type: 'number', value: config.streaming?.maxRoomSize || 50 }
    ]
  };
}

async function updateLiveSettings(configData) {
  logger.info('Live streaming settings updated:', configData);
  if (configData.maxBitrate) config.streaming = { ...config.streaming, maxBitrate: parseInt(configData.maxBitrate) };
  if (configData.maxResolution) config.streaming = { ...config.streaming, maxResolution: configData.maxResolution };
  return { message: 'Live streaming settings updated successfully', config: configData };
}

module.exports = router;
