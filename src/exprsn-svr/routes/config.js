/**
 * Configuration Management Routes
 * Provides endpoints for the Setup dashboard to manage SVR configurations
 */

const express = require('express');
const router = express.Router();
const { Page } = require('../models');
const config = require('../config');
const logger = require('../utils/logger');

router.get('/:sectionId', async (req, res) => {
  const { sectionId } = req.params;

  try {
    let data;

    switch (sectionId) {
      case 'svr-pages':
        data = await getPagesConfig();
        break;
      case 'svr-templates':
        data = await getTemplatesConfig();
        break;
      case 'svr-settings':
        data = await getSVRSettings();
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
      case 'svr-settings':
        result = await updateSVRSettings(configData);
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

async function getPagesConfig() {
  const pages = await Page.findAll({ order: [['updated_at', 'DESC']], limit: 50 });

  return {
    title: 'Page Management',
    description: 'Manage dynamic server-rendered pages',
    actions: ['Create Page', 'Import Pages'],
    table: {
      headers: ['Path', 'Title', 'Status', 'Updated', 'Actions'],
      rows: pages.map(p => [
        p.path,
        p.title,
        p.is_published ? 'Published' : 'Draft',
        new Date(p.updated_at).toLocaleDateString(),
        'View | Edit | Delete'
      ])
    }
  };
}

async function getTemplatesConfig() {
  return {
    title: 'Template Management',
    description: 'Manage EJS templates',
    actions: ['Create Template', 'Import Template']
  };
}

async function getSVRSettings() {
  return {
    title: 'SVR Settings',
    description: 'Configure server rendering settings',
    fields: [
      { name: 'enableCaching', label: 'Enable Caching', type: 'checkbox', value: config.cache?.enabled !== false },
      { name: 'cacheTime', label: 'Cache Time (seconds)', type: 'number', value: config.cache?.ttl || 300 },
      { name: 'enableCompression', label: 'Enable Compression', type: 'checkbox', value: config.compression?.enabled !== false },
      { name: 'enableSocketIO', label: 'Enable Socket.IO', type: 'checkbox', value: config.socketio?.enabled !== false }
    ]
  };
}

async function updateSVRSettings(configData) {
  logger.info('SVR settings updated:', configData);
  if (configData.cacheTime) config.cache = { ...config.cache, ttl: parseInt(configData.cacheTime) };
  return { message: 'SVR settings updated successfully', config: configData };
}

module.exports = router;
