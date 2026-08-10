/**
 * ═══════════════════════════════════════════════════════════
 * Base Plugin Class
 * All plugins should extend this base class
 * ═══════════════════════════════════════════════════════════
 */

class BasePlugin {
  constructor(options = {}) {
    this.config = options.config || {};
    this.metadata = options.metadata || {};
    this.initialized = false;
  }

  /**
   * Initialize plugin
   * Override this method to perform setup tasks
   */
  async init() {
    this.initialized = true;
  }

  /**
   * Destroy plugin
   * Override this method to perform cleanup tasks
   */
  async destroy() {
    this.initialized = false;
  }

  /**
   * Register hooks
   * Override this method to register event hooks
   * @param {PluginManager} manager - Plugin manager instance
   */
  registerHooks(manager) {
    // Override in subclass
  }

  /**
   * Get plugin configuration
   */
  getConfig(key, defaultValue = null) {
    return this.config[key] !== undefined ? this.config[key] : defaultValue;
  }

  /**
   * Set plugin configuration
   */
  setConfig(key, value) {
    this.config[key] = value;
  }

  /**
   * Get plugin metadata
   */
  getMetadata(key, defaultValue = null) {
    return this.metadata[key] !== undefined ? this.metadata[key] : defaultValue;
  }

  /**
   * Validate required configuration
   */
  validateConfig(required = []) {
    for (const key of required) {
      if (this.config[key] === undefined) {
        throw new Error(`Missing required configuration: ${key}`);
      }
    }
    return true;
  }
}

module.exports = BasePlugin;
