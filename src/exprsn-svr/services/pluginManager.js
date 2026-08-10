/**
 * ═══════════════════════════════════════════════════════════
 * Plugin Manager
 * Manages plugin lifecycle and execution
 * ═══════════════════════════════════════════════════════════
 */

const fs = require('fs').promises;
const path = require('path');
const Plugin = require('../models/Plugin');
const logger = require('../utils/logger');
const EventEmitter = require('events');

class PluginManager extends EventEmitter {
  constructor() {
    super();
    this.loadedPlugins = new Map();
    this.pluginInstances = new Map();
    this.hooks = new Map();
    this.pluginsDir = path.join(__dirname, '../plugins/registry');
  }

  /**
   * Initialize plugin manager
   */
  async initialize() {
    try {
      logger.info('Initializing plugin manager...');

      // Ensure plugins directory exists
      await fs.mkdir(this.pluginsDir, { recursive: true });

      // Load enabled plugins from database
      const enabledPlugins = await Plugin.findAll({
        where: { enabled: true }
      });

      for (const plugin of enabledPlugins) {
        try {
          await this.loadPlugin(plugin);
        } catch (error) {
          logger.error(`Failed to load plugin ${plugin.name}:`, error);
          await plugin.setError(error);
        }
      }

      logger.info(`Plugin manager initialized with ${this.loadedPlugins.size} plugins`);
      this.emit('initialized');
    } catch (error) {
      logger.error('Failed to initialize plugin manager:', error);
      throw error;
    }
  }

  /**
   * Load a plugin
   */
  async loadPlugin(plugin) {
    try {
      const pluginPath = path.join(this.pluginsDir, plugin.name, plugin.mainFile);

      // Check if file exists
      try {
        await fs.access(pluginPath);
      } catch {
        throw new Error(`Plugin file not found: ${pluginPath}`);
      }

      // Require the plugin module
      const PluginClass = require(pluginPath);

      // Instantiate plugin with config
      const instance = new PluginClass({
        config: plugin.defaultConfig,
        metadata: plugin.metadata
      });

      // Call plugin's init method if exists
      if (typeof instance.init === 'function') {
        await instance.init();
      }

      // Register plugin hooks
      if (plugin.hooks && typeof instance.registerHooks === 'function') {
        instance.registerHooks(this);
      }

      // Store loaded plugin
      this.loadedPlugins.set(plugin.name, plugin);
      this.pluginInstances.set(plugin.name, instance);

      // Update plugin status
      plugin.status = 'active';
      await plugin.save();

      logger.info(`Plugin loaded: ${plugin.name} v${plugin.version}`);
      this.emit('plugin:loaded', plugin);

      return instance;
    } catch (error) {
      logger.error(`Failed to load plugin ${plugin.name}:`, error);
      throw error;
    }
  }

  /**
   * Unload a plugin
   */
  async unloadPlugin(pluginName) {
    const instance = this.pluginInstances.get(pluginName);
    if (!instance) {
      throw new Error(`Plugin ${pluginName} is not loaded`);
    }

    // Call plugin's destroy method if exists
    if (typeof instance.destroy === 'function') {
      await instance.destroy();
    }

    // Remove from maps
    this.loadedPlugins.delete(pluginName);
    this.pluginInstances.delete(pluginName);

    // Clear require cache
    const plugin = await Plugin.findOne({ where: { name: pluginName } });
    if (plugin) {
      const pluginPath = path.join(this.pluginsDir, pluginName, plugin.mainFile);
      delete require.cache[require.resolve(pluginPath)];
    }

    logger.info(`Plugin unloaded: ${pluginName}`);
    this.emit('plugin:unloaded', pluginName);
  }

  /**
   * Install a plugin from package
   */
  async installPlugin(pluginPackage, userId) {
    try {
      // Validate plugin package
      this.validatePluginPackage(pluginPackage);

      // Check if plugin already exists
      const existing = await Plugin.findOne({
        where: { name: pluginPackage.name }
      });

      if (existing) {
        throw new Error(`Plugin ${pluginPackage.name} is already installed`);
      }

      // Create plugin directory
      const pluginDir = path.join(this.pluginsDir, pluginPackage.name);
      await fs.mkdir(pluginDir, { recursive: true });

      // Write plugin files
      if (pluginPackage.files) {
        for (const [filename, content] of Object.entries(pluginPackage.files)) {
          const filePath = path.join(pluginDir, filename);
          await fs.mkdir(path.dirname(filePath), { recursive: true });
          await fs.writeFile(filePath, content, 'utf8');
        }
      }

      // Create plugin record in database
      const plugin = await Plugin.create({
        name: pluginPackage.name,
        displayName: pluginPackage.displayName,
        description: pluginPackage.description,
        version: pluginPackage.version,
        author: pluginPackage.author,
        authorEmail: pluginPackage.authorEmail,
        license: pluginPackage.license,
        homepage: pluginPackage.homepage,
        repository: pluginPackage.repository,
        type: pluginPackage.type,
        category: pluginPackage.category,
        tags: pluginPackage.tags || [],
        mainFile: pluginPackage.mainFile,
        configSchema: pluginPackage.configSchema || {},
        defaultConfig: pluginPackage.defaultConfig || {},
        dependencies: pluginPackage.dependencies || {},
        permissionsRequired: pluginPackage.permissionsRequired || [],
        hooks: pluginPackage.hooks || {},
        installedAt: new Date(),
        installedBy: userId,
        metadata: pluginPackage.metadata || {}
      });

      logger.info(`Plugin installed: ${plugin.name} v${plugin.version}`);
      this.emit('plugin:installed', plugin);

      return plugin;
    } catch (error) {
      logger.error('Failed to install plugin:', error);
      throw error;
    }
  }

  /**
   * Uninstall a plugin
   */
  async uninstallPlugin(pluginName) {
    const plugin = await Plugin.findOne({ where: { name: pluginName } });
    if (!plugin) {
      throw new Error(`Plugin ${pluginName} not found`);
    }

    // Unload if loaded
    if (this.loadedPlugins.has(pluginName)) {
      await this.unloadPlugin(pluginName);
    }

    // Remove plugin directory
    const pluginDir = path.join(this.pluginsDir, pluginName);
    try {
      await fs.rm(pluginDir, { recursive: true, force: true });
    } catch (error) {
      logger.warn(`Failed to remove plugin directory: ${error.message}`);
    }

    // Delete from database
    await plugin.destroy();

    logger.info(`Plugin uninstalled: ${pluginName}`);
    this.emit('plugin:uninstalled', pluginName);
  }

  /**
   * Enable a plugin
   */
  async enablePlugin(pluginName) {
    const plugin = await Plugin.findOne({ where: { name: pluginName } });
    if (!plugin) {
      throw new Error(`Plugin ${pluginName} not found`);
    }

    if (plugin.enabled) {
      throw new Error(`Plugin ${pluginName} is already enabled`);
    }

    // Load the plugin
    await this.loadPlugin(plugin);

    // Enable in database
    await plugin.activate();

    logger.info(`Plugin enabled: ${pluginName}`);
    this.emit('plugin:enabled', plugin);

    return plugin;
  }

  /**
   * Disable a plugin
   */
  async disablePlugin(pluginName) {
    const plugin = await Plugin.findOne({ where: { name: pluginName } });
    if (!plugin) {
      throw new Error(`Plugin ${pluginName} not found`);
    }

    if (!plugin.enabled) {
      throw new Error(`Plugin ${pluginName} is already disabled`);
    }

    // Unload the plugin
    if (this.loadedPlugins.has(pluginName)) {
      await this.unloadPlugin(pluginName);
    }

    // Disable in database
    await plugin.deactivate();

    logger.info(`Plugin disabled: ${pluginName}`);
    this.emit('plugin:disabled', plugin);

    return plugin;
  }

  /**
   * Register a hook
   */
  registerHook(hookName, callback, priority = 10) {
    if (!this.hooks.has(hookName)) {
      this.hooks.set(hookName, []);
    }

    this.hooks.get(hookName).push({ callback, priority });

    // Sort by priority (lower priority executes first)
    this.hooks.get(hookName).sort((a, b) => a.priority - b.priority);

    logger.debug(`Hook registered: ${hookName}`);
  }

  /**
   * Execute a hook
   */
  async executeHook(hookName, ...args) {
    const hooks = this.hooks.get(hookName);
    if (!hooks || hooks.length === 0) {
      return args;
    }

    let result = args;

    for (const { callback } of hooks) {
      try {
        result = await callback(...result);
        if (!Array.isArray(result)) {
          result = [result];
        }
      } catch (error) {
        logger.error(`Hook execution error (${hookName}):`, error);
      }
    }

    return result.length === 1 ? result[0] : result;
  }

  /**
   * Get plugin instance
   */
  getPlugin(pluginName) {
    return this.pluginInstances.get(pluginName);
  }

  /**
   * Get all loaded plugins
   */
  getLoadedPlugins() {
    return Array.from(this.loadedPlugins.values());
  }

  /**
   * Validate plugin package
   */
  validatePluginPackage(pkg) {
    const required = ['name', 'displayName', 'version', 'type', 'mainFile'];

    for (const field of required) {
      if (!pkg[field]) {
        throw new Error(`Missing required field: ${field}`);
      }
    }

    // Validate version format
    if (!/^\d+\.\d+\.\d+$/.test(pkg.version)) {
      throw new Error('Invalid version format. Use semantic versioning (e.g., 1.0.0)');
    }

    // Validate type
    const validTypes = ['component', 'service', 'middleware', 'theme', 'integration', 'workflow-step'];
    if (!validTypes.includes(pkg.type)) {
      throw new Error(`Invalid plugin type. Must be one of: ${validTypes.join(', ')}`);
    }

    return true;
  }

  /**
   * Shutdown plugin manager
   */
  async shutdown() {
    logger.info('Shutting down plugin manager...');

    // Unload all plugins
    for (const pluginName of this.loadedPlugins.keys()) {
      try {
        await this.unloadPlugin(pluginName);
      } catch (error) {
        logger.error(`Failed to unload plugin ${pluginName}:`, error);
      }
    }

    this.emit('shutdown');
  }
}

// Export singleton instance
module.exports = new PluginManager();
