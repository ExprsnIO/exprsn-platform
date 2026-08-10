/**
 * ═══════════════════════════════════════════════════════════
 * Plugin Management Routes
 * Handles plugin creation, installation, marketplace, and management
 * ═══════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const PluginScaffolder = require('../services/PluginScaffolder');
const logger = require('../../utils/logger');

// Configure multer for file uploads
const upload = multer({
  dest: path.join(__dirname, '../../temp'),
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB max
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/zip' || file.mimetype === 'application/x-zip-compressed') {
      cb(null, true);
    } else {
      cb(new Error('Only .zip files are allowed'));
    }
  }
});

/**
 * Generate a new plugin based on wizard configuration
 * POST /api/plugins/generate
 */
router.post('/generate', async (req, res) => {
  try {
    const config = req.body;

    // Validate required fields
    if (!config.basic || !config.basic.name) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Plugin name is required'
      });
    }

    // Validate plugin name format (alphanumeric, hyphens, underscores)
    const nameRegex = /^[a-z0-9-_]+$/;
    if (!nameRegex.test(config.basic.name)) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Plugin name must contain only lowercase letters, numbers, hyphens, and underscores'
      });
    }

    logger.info('Generating plugin', { name: config.basic.name, user: req.user?.id });

    // Generate plugin using scaffolder
    const result = await PluginScaffolder.generatePlugin(config);

    // Emit Socket.IO event for real-time updates
    if (req.app.get('io')) {
      req.app.get('io').emit('plugin:generated', {
        name: config.basic.name,
        path: result.path,
        timestamp: Date.now()
      });
    }

    res.json({
      success: true,
      data: result,
      message: `Plugin "${config.basic.name}" generated successfully`
    });
  } catch (error) {
    logger.error('Plugin generation failed', {
      error: error.message,
      stack: error.stack,
      user: req.user?.id
    });

    res.status(500).json({
      success: false,
      error: 'GENERATION_ERROR',
      message: error.message
    });
  }
});

/**
 * Get list of installed plugins
 * GET /api/plugins
 */
router.get('/', async (req, res) => {
  try {
    const pluginsDir = path.join(__dirname, '../../plugins');

    // Check if plugins directory exists
    try {
      await fs.access(pluginsDir);
    } catch {
      // Directory doesn't exist yet
      return res.json({
        success: true,
        data: {
          plugins: [],
          total: 0
        }
      });
    }

    // Read plugins directory
    const entries = await fs.readdir(pluginsDir, { withFileTypes: true });
    const pluginDirs = entries.filter(e => e.isDirectory());

    const plugins = [];

    for (const dir of pluginDirs) {
      const pluginPath = path.join(pluginsDir, dir.name);
      const packageJsonPath = path.join(pluginPath, 'package.json');

      try {
        const packageData = await fs.readFile(packageJsonPath, 'utf8');
        const packageJson = JSON.parse(packageData);

        if (packageJson.exprsn && packageJson.exprsn.plugin) {
          plugins.push({
            id: packageJson.name,
            name: packageJson.name,
            displayName: packageJson.exprsn.displayName || packageJson.name,
            version: packageJson.version,
            description: packageJson.description,
            author: packageJson.author,
            license: packageJson.license,
            keywords: packageJson.keywords || [],
            category: packageJson.exprsn.category || 'general',
            type: packageJson.exprsn.type || 'custom',
            path: pluginPath,
            compatibility: packageJson.exprsn.compatibility,
            hooks: packageJson.exprsn.hooks || [],
            enabled: packageJson.exprsn.enabled !== false, // Default to enabled
            installed: true,
            updatedAt: (await fs.stat(pluginPath)).mtime
          });
        }
      } catch (error) {
        logger.warn('Failed to read plugin metadata', {
          plugin: dir.name,
          error: error.message
        });
      }
    }

    res.json({
      success: true,
      data: {
        plugins,
        total: plugins.length
      }
    });
  } catch (error) {
    logger.error('Failed to list plugins', {
      error: error.message,
      stack: error.stack
    });

    res.status(500).json({
      success: false,
      error: 'LIST_ERROR',
      message: error.message
    });
  }
});

/**
 * Get marketplace plugins
 * GET /api/plugins/marketplace
 */
router.get('/marketplace', async (req, res) => {
  try {
    // Mock marketplace data for now
    // In production, this would fetch from a real marketplace API
    const marketplacePlugins = [
      {
        id: 'stripe-payments',
        name: 'stripe-payments',
        displayName: 'Stripe Payments',
        version: '2.1.0',
        description: 'Accept payments with Stripe. Supports credit cards, subscriptions, and invoicing.',
        author: 'Exprsn Team',
        category: 'integration',
        type: 'official',
        price: 0,
        pricing: 'free',
        downloads: 15420,
        rating: 4.8,
        installed: false,
        enabled: false
      },
      {
        id: 'advanced-charts',
        name: 'advanced-charts',
        displayName: 'Advanced Charts Pro',
        version: '3.0.2',
        description: 'Beautiful, interactive charts and visualizations. Includes 20+ chart types.',
        author: 'Chart Studio',
        category: 'dashboard',
        type: 'premium',
        price: 49.99,
        pricing: 'one-time',
        downloads: 8932,
        rating: 4.9,
        installed: false,
        enabled: false
      },
      {
        id: 'pdf-generator',
        name: 'pdf-generator',
        displayName: 'PDF Generator',
        version: '1.5.3',
        description: 'Generate professional PDFs from your data with customizable templates.',
        author: 'DocGen Inc',
        category: 'data',
        type: 'community',
        price: 0,
        pricing: 'free',
        downloads: 12856,
        rating: 4.6,
        installed: false,
        enabled: false
      },
      {
        id: 'email-templates',
        name: 'email-templates',
        displayName: 'Email Templates Pro',
        version: '2.3.1',
        description: 'Drag-and-drop email template builder with 50+ pre-built templates.',
        author: 'MailCraft',
        category: 'form',
        type: 'premium',
        price: 29.99,
        pricing: 'monthly',
        downloads: 6724,
        rating: 4.7,
        installed: false,
        enabled: false
      },
      {
        id: 'oauth-connector',
        name: 'oauth-connector',
        displayName: 'OAuth2 Connector',
        version: '1.8.0',
        description: 'Connect to any OAuth2 provider. Includes Google, GitHub, Microsoft, and more.',
        author: 'Exprsn Team',
        category: 'authentication',
        type: 'official',
        price: 0,
        pricing: 'free',
        downloads: 21043,
        rating: 4.9,
        installed: false,
        enabled: false
      },
      {
        id: 'data-tables-pro',
        name: 'data-tables-pro',
        displayName: 'Data Tables Pro',
        version: '4.1.2',
        description: 'Advanced data tables with sorting, filtering, export, and inline editing.',
        author: 'DataViz Co',
        category: 'grid',
        type: 'premium',
        price: 79.99,
        pricing: 'one-time',
        downloads: 9456,
        rating: 4.8,
        installed: false,
        enabled: false
      }
    ];

    res.json({
      success: true,
      data: marketplacePlugins
    });
  } catch (error) {
    logger.error('Failed to load marketplace', {
      error: error.message,
      stack: error.stack
    });

    res.status(500).json({
      success: false,
      error: 'MARKETPLACE_ERROR',
      message: error.message
    });
  }
});

/**
 * Install a plugin from marketplace
 * POST /api/plugins/install
 */
router.post('/install', async (req, res) => {
  try {
    const { pluginId } = req.body;

    if (!pluginId) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Plugin ID is required'
      });
    }

    logger.info('Installing plugin', { pluginId, user: req.user?.id });

    // In production, this would download and install the plugin
    // For now, we'll simulate success
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Emit Socket.IO event
    if (req.app.get('io')) {
      req.app.get('io').emit('plugin:installed', {
        pluginId,
        timestamp: Date.now()
      });
    }

    res.json({
      success: true,
      message: `Plugin "${pluginId}" installed successfully`
    });
  } catch (error) {
    logger.error('Plugin installation failed', {
      error: error.message,
      stack: error.stack
    });

    res.status(500).json({
      success: false,
      error: 'INSTALL_ERROR',
      message: error.message
    });
  }
});

/**
 * Purchase a premium plugin
 * POST /api/plugins/purchase
 */
router.post('/purchase', async (req, res) => {
  try {
    const { pluginId, amount, currency } = req.body;

    if (!pluginId || !amount) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Plugin ID and amount are required'
      });
    }

    logger.info('Processing plugin purchase', {
      pluginId,
      amount,
      currency,
      user: req.user?.id
    });

    // In production, this would integrate with exprsn-payments
    // and process the actual payment
    // For now, we'll simulate success
    await new Promise(resolve => setTimeout(resolve, 1500));

    const transactionId = 'txn_' + Math.random().toString(36).substr(2, 9);

    res.json({
      success: true,
      data: {
        transactionId,
        pluginId,
        amount,
        currency: currency || 'USD',
        status: 'completed'
      },
      message: 'Purchase completed successfully'
    });
  } catch (error) {
    logger.error('Plugin purchase failed', {
      error: error.message,
      stack: error.stack
    });

    res.status(500).json({
      success: false,
      error: 'PURCHASE_ERROR',
      message: error.message
    });
  }
});

/**
 * Upload a plugin package
 * POST /api/plugins/upload
 */
router.post('/upload', upload.single('plugin'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Plugin file is required'
      });
    }

    logger.info('Uploading plugin', {
      filename: req.file.originalname,
      size: req.file.size,
      user: req.user?.id
    });

    // Extract and install the plugin
    const AdmZip = require('adm-zip');
    const zip = new AdmZip(req.file.path);
    const pluginsDir = path.join(__dirname, '../../plugins');

    // Extract package.json to validate
    const packageEntry = zip.getEntry('package.json');
    if (!packageEntry) {
      // Clean up temp file
      await fs.unlink(req.file.path);

      return res.status(400).json({
        success: false,
        error: 'INVALID_PLUGIN',
        message: 'Plugin package must contain package.json'
      });
    }

    const packageJson = JSON.parse(packageEntry.getData().toString('utf8'));

    if (!packageJson.exprsn || !packageJson.exprsn.plugin) {
      // Clean up temp file
      await fs.unlink(req.file.path);

      return res.status(400).json({
        success: false,
        error: 'INVALID_PLUGIN',
        message: 'Invalid plugin package: missing exprsn.plugin configuration'
      });
    }

    // Create plugins directory if it doesn't exist
    await fs.mkdir(pluginsDir, { recursive: true });

    // Extract to plugins directory
    const pluginDir = path.join(pluginsDir, packageJson.name);
    zip.extractAllTo(pluginDir, true);

    // Clean up temp file
    await fs.unlink(req.file.path);

    logger.info('Plugin uploaded successfully', {
      name: packageJson.name,
      version: packageJson.version
    });

    // Emit Socket.IO event
    if (req.app.get('io')) {
      req.app.get('io').emit('plugin:installed', {
        name: packageJson.name,
        timestamp: Date.now()
      });
    }

    res.json({
      success: true,
      data: {
        name: packageJson.name,
        version: packageJson.version,
        path: pluginDir
      },
      message: 'Plugin uploaded successfully'
    });
  } catch (error) {
    // Clean up temp file on error
    if (req.file && req.file.path) {
      try {
        await fs.unlink(req.file.path);
      } catch (unlinkError) {
        logger.error('Failed to cleanup temp file', { error: unlinkError.message });
      }
    }

    logger.error('Plugin upload failed', {
      error: error.message,
      stack: error.stack
    });

    res.status(500).json({
      success: false,
      error: 'UPLOAD_ERROR',
      message: error.message
    });
  }
});

/**
 * Enable a plugin
 * POST /api/plugins/:name/enable
 */
router.post('/:name/enable', async (req, res) => {
  try {
    const { name } = req.params;
    const pluginPath = path.join(__dirname, '../../plugins', name);
    const packageJsonPath = path.join(pluginPath, 'package.json');

    // Check if plugin exists
    try {
      await fs.access(pluginPath);
    } catch {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: `Plugin "${name}" not found`
      });
    }

    // Update package.json to mark as enabled
    const packageData = await fs.readFile(packageJsonPath, 'utf8');
    const packageJson = JSON.parse(packageData);

    packageJson.exprsn = packageJson.exprsn || {};
    packageJson.exprsn.enabled = true;

    await fs.writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2), 'utf8');

    logger.info('Plugin enabled', { name, user: req.user?.id });

    // Emit Socket.IO event
    if (req.app.get('io')) {
      req.app.get('io').emit('plugin:enabled', {
        name,
        timestamp: Date.now()
      });
    }

    res.json({
      success: true,
      message: `Plugin "${name}" enabled successfully`
    });
  } catch (error) {
    logger.error('Failed to enable plugin', {
      plugin: req.params.name,
      error: error.message,
      stack: error.stack
    });

    res.status(500).json({
      success: false,
      error: 'ENABLE_ERROR',
      message: error.message
    });
  }
});

/**
 * Disable a plugin
 * POST /api/plugins/:name/disable
 */
router.post('/:name/disable', async (req, res) => {
  try {
    const { name } = req.params;
    const pluginPath = path.join(__dirname, '../../plugins', name);
    const packageJsonPath = path.join(pluginPath, 'package.json');

    // Check if plugin exists
    try {
      await fs.access(pluginPath);
    } catch {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: `Plugin "${name}" not found`
      });
    }

    // Update package.json to mark as disabled
    const packageData = await fs.readFile(packageJsonPath, 'utf8');
    const packageJson = JSON.parse(packageData);

    packageJson.exprsn = packageJson.exprsn || {};
    packageJson.exprsn.enabled = false;

    await fs.writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2), 'utf8');

    logger.info('Plugin disabled', { name, user: req.user?.id });

    // Emit Socket.IO event
    if (req.app.get('io')) {
      req.app.get('io').emit('plugin:disabled', {
        name,
        timestamp: Date.now()
      });
    }

    res.json({
      success: true,
      message: `Plugin "${name}" disabled successfully`
    });
  } catch (error) {
    logger.error('Failed to disable plugin', {
      plugin: req.params.name,
      error: error.message,
      stack: error.stack
    });

    res.status(500).json({
      success: false,
      error: 'DISABLE_ERROR',
      message: error.message
    });
  }
});

/**
 * Get plugin details by name
 * GET /api/plugins/:name
 */
router.get('/:name', async (req, res) => {
  try {
    const { name } = req.params;

    const pluginPath = path.join(__dirname, '../../plugins', name);
    const packageJsonPath = path.join(pluginPath, 'package.json');

    // Check if plugin exists
    try {
      await fs.access(pluginPath);
    } catch {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: `Plugin "${name}" not found`
      });
    }

    // Read package.json
    const packageData = await fs.readFile(packageJsonPath, 'utf8');
    const packageJson = JSON.parse(packageData);

    // Read README if it exists
    let readme = null;
    try {
      readme = await fs.readFile(path.join(pluginPath, 'README.md'), 'utf8');
    } catch {
      // README doesn't exist
    }

    // Get plugin structure
    const structure = await getDirectoryStructure(pluginPath);

    res.json({
      success: true,
      data: {
        name: packageJson.name,
        displayName: packageJson.exprsn?.displayName || packageJson.name,
        version: packageJson.version,
        description: packageJson.description,
        author: packageJson.author,
        license: packageJson.license,
        keywords: packageJson.keywords || [],
        dependencies: packageJson.dependencies || {},
        exprsn: packageJson.exprsn || {},
        readme,
        structure,
        path: pluginPath
      }
    });
  } catch (error) {
    logger.error('Failed to get plugin details', {
      plugin: req.params.name,
      error: error.message,
      stack: error.stack
    });

    res.status(500).json({
      success: false,
      error: 'FETCH_ERROR',
      message: error.message
    });
  }
});

/**
 * Delete a plugin
 * DELETE /api/plugins/:name
 */
router.delete('/:name', async (req, res) => {
  try {
    const { name } = req.params;

    const pluginPath = path.join(__dirname, '../../plugins', name);

    // Check if plugin exists
    try {
      await fs.access(pluginPath);
    } catch {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: `Plugin "${name}" not found`
      });
    }

    // Recursively delete plugin directory
    await fs.rm(pluginPath, { recursive: true, force: true });

    logger.info('Plugin deleted', { name, user: req.user?.id });

    // Emit Socket.IO event
    if (req.app.get('io')) {
      req.app.get('io').emit('plugin:deleted', {
        name,
        timestamp: Date.now()
      });
    }

    res.json({
      success: true,
      message: `Plugin "${name}" deleted successfully`
    });
  } catch (error) {
    logger.error('Failed to delete plugin', {
      plugin: req.params.name,
      error: error.message,
      stack: error.stack
    });

    res.status(500).json({
      success: false,
      error: 'DELETE_ERROR',
      message: error.message
    });
  }
});

/**
 * Helper: Get directory structure recursively
 */
async function getDirectoryStructure(dirPath, relativePath = '') {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const structure = [];

  for (const entry of entries) {
    const entryPath = path.join(dirPath, entry.name);
    const relPath = path.join(relativePath, entry.name);

    if (entry.isDirectory()) {
      // Skip node_modules
      if (entry.name === 'node_modules') continue;

      structure.push({
        type: 'directory',
        name: entry.name,
        path: relPath,
        children: await getDirectoryStructure(entryPath, relPath)
      });
    } else {
      const stats = await fs.stat(entryPath);
      structure.push({
        type: 'file',
        name: entry.name,
        path: relPath,
        size: stats.size
      });
    }
  }

  return structure;
}

module.exports = router;
