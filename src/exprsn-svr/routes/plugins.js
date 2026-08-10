/**
 * ═══════════════════════════════════════════════════════════
 * Plugin Routes
 * API endpoints for plugin management
 * ═══════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const Plugin = require('../models/Plugin');
const pluginManager = require('../services/pluginManager');
const { requireCAToken } = require('../middleware/caAuth');
const { asyncHandler } = require('../middleware/errorHandler');
const { smartCache } = require('../middleware/cache');
const logger = require('../utils/logger');

// Apply authentication to all plugin routes
router.use(requireCAToken({ requiredPermissions: { read: true } }));

/**
 * GET /plugins - List all plugins
 */
router.get('/', smartCache('plugins', { ttl: 300 }), asyncHandler(async (req, res) => {
  const { type, status, enabled, search } = req.query;

  const where = {};
  if (type) where.type = type;
  if (status) where.status = status;
  if (enabled !== undefined) where.enabled = enabled === 'true';

  // Search by name or description
  if (search) {
    const { Op } = require('sequelize');
    where[Op.or] = [
      { name: { [Op.iLike]: `%${search}%` } },
      { displayName: { [Op.iLike]: `%${search}%` } },
      { description: { [Op.iLike]: `%${search}%` } }
    ];
  }

  const plugins = await Plugin.findAll({
    where,
    order: [['displayName', 'ASC']]
  });

  res.json({
    success: true,
    data: plugins.map(p => p.toSafeJSON())
  });
}));

/**
 * GET /plugins/:id - Get plugin details
 */
router.get('/:id', smartCache('plugins', { ttl: 300 }), asyncHandler(async (req, res) => {
  const plugin = await Plugin.findByPk(req.params.id);

  if (!plugin) {
    return res.status(404).json({
      success: false,
      error: 'Plugin not found'
    });
  }

  res.json({
    success: true,
    data: plugin.toSafeJSON()
  });
}));

/**
 * POST /plugins - Install a new plugin
 */
router.post('/', requireCAToken({ requiredPermissions: { write: true } }), asyncHandler(async (req, res) => {
  const plugin = await pluginManager.installPlugin(req.body, req.user.id);

  res.status(201).json({
    success: true,
    data: plugin.toSafeJSON(),
    message: 'Plugin installed successfully'
  });
}));

/**
 * POST /plugins/:id/enable - Enable a plugin
 */
router.post('/:id/enable', requireCAToken({ requiredPermissions: { write: true } }), asyncHandler(async (req, res) => {
  const plugin = await Plugin.findByPk(req.params.id);

  if (!plugin) {
    return res.status(404).json({
      success: false,
      error: 'Plugin not found'
    });
  }

  await pluginManager.enablePlugin(plugin.name);

  res.json({
    success: true,
    data: plugin.toSafeJSON(),
    message: 'Plugin enabled successfully'
  });
}));

/**
 * POST /plugins/:id/disable - Disable a plugin
 */
router.post('/:id/disable', requireCAToken({ requiredPermissions: { write: true } }), asyncHandler(async (req, res) => {
  const plugin = await Plugin.findByPk(req.params.id);

  if (!plugin) {
    return res.status(404).json({
      success: false,
      error: 'Plugin not found'
    });
  }

  await pluginManager.disablePlugin(plugin.name);

  res.json({
    success: true,
    data: plugin.toSafeJSON(),
    message: 'Plugin disabled successfully'
  });
}));

/**
 * DELETE /plugins/:id - Uninstall a plugin
 */
router.delete('/:id', requireCAToken({ requiredPermissions: { delete: true } }), asyncHandler(async (req, res) => {
  const plugin = await Plugin.findByPk(req.params.id);

  if (!plugin) {
    return res.status(404).json({
      success: false,
      error: 'Plugin not found'
    });
  }

  await pluginManager.uninstallPlugin(plugin.name);

  res.json({
    success: true,
    message: 'Plugin uninstalled successfully'
  });
}));

/**
 * PUT /plugins/:id/config - Update plugin configuration
 */
router.put('/:id/config', requireCAToken({ requiredPermissions: { write: true } }), asyncHandler(async (req, res) => {
  const plugin = await Plugin.findByPk(req.params.id);

  if (!plugin) {
    return res.status(404).json({
      success: false,
      error: 'Plugin not found'
    });
  }

  // Update config
  plugin.defaultConfig = { ...plugin.defaultConfig, ...req.body };
  plugin.updatedBy = req.user.id;
  await plugin.save();

  // Reload plugin if it's active
  if (plugin.enabled) {
    await pluginManager.unloadPlugin(plugin.name);
    await pluginManager.loadPlugin(plugin);
  }

  res.json({
    success: true,
    data: plugin.toSafeJSON(),
    message: 'Plugin configuration updated successfully'
  });
}));

/**
 * GET /plugins/types - Get available plugin types
 */
router.get('/meta/types', asyncHandler(async (req, res) => {
  res.json({
    success: true,
    data: {
      types: ['component', 'service', 'middleware', 'theme', 'integration', 'workflow-step']
    }
  });
}));

/**
 * GET /plugins/loaded - Get currently loaded plugins
 */
router.get('/meta/loaded', asyncHandler(async (req, res) => {
  const loaded = pluginManager.getLoadedPlugins();

  res.json({
    success: true,
    data: loaded.map(p => p.toSafeJSON())
  });
}));

module.exports = router;
