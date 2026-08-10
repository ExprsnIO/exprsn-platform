/**
 * Configuration Management Routes
 * Provides endpoints for the Setup dashboard to manage Live Streaming configurations
 */

const express = require('express');
const router = express.Router();
const { Room, Recording } = require('../models');
const config = require('../config');
const logger = require('../utils/logger');

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
