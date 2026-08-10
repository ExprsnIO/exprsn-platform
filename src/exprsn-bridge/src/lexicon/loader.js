/**
 * JSONLex Loader
 *
 * Loads and validates JSON Lexicon configuration files for dynamic routing.
 * Implements the Exprsn JSON Lexicon Specification v1.0
 */

const fs = require('fs').promises;
const path = require('path');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const logger = require('../config/logger');

// JSON Schema for lexicon validation
const lexiconSchema = {
  type: 'object',
  required: ['lexicon'],
  properties: {
    lexicon: {
      type: 'object',
      required: ['version', 'service', 'routes'],
      properties: {
        version: {
          type: 'string',
          pattern: '^\\d+\\.\\d+$'
        },
        service: {
          type: 'object',
          required: ['name', 'version'],
          properties: {
            name: { type: 'string' },
            version: { type: 'string' },
            description: { type: 'string' }
          }
        },
        routes: {
          type: 'array',
          items: {
            type: 'object',
            required: ['path', 'method', 'target'],
            properties: {
              path: { type: 'string' },
              method: {
                type: 'string',
                enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']
              },
              target: {
                type: 'object',
                required: ['service', 'path'],
                properties: {
                  service: { type: 'string' },
                  path: { type: 'string' },
                  timeout: { type: 'number' }
                }
              },
              auth: {
                type: 'object',
                properties: {
                  required: { type: 'boolean' },
                  permissions: {
                    type: 'object',
                    properties: {
                      read: { type: 'boolean' },
                      write: { type: 'boolean' },
                      delete: { type: 'boolean' },
                      update: { type: 'boolean' }
                    }
                  },
                  certificateBinding: { type: 'boolean' }
                }
              },
              rateLimit: {
                type: 'object',
                properties: {
                  windowMs: { type: 'number' },
                  max: { type: 'number' }
                }
              },
              middleware: {
                type: 'array',
                items: { type: 'string' }
              },
              description: { type: 'string' }
            }
          }
        },
        policies: {
          type: 'object',
          properties: {
            defaultAuth: { type: 'boolean' },
            defaultRateLimit: {
              type: 'object',
              properties: {
                windowMs: { type: 'number' },
                max: { type: 'number' }
              }
            },
            cors: {
              type: 'object',
              properties: {
                origin: {
                  oneOf: [
                    { type: 'string' },
                    { type: 'array', items: { type: 'string' } }
                  ]
                },
                credentials: { type: 'boolean' }
              }
            }
          }
        },
        middleware: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              type: { type: 'string' },
              config: { type: 'object' }
            }
          }
        }
      }
    }
  }
};

class LexiconLoader {
  constructor(options = {}) {
    this.options = {
      lexiconDir: options.lexiconDir || path.join(__dirname, '../config/lexicons'),
      watchForChanges: options.watchForChanges !== false,
      ...options
    };

    this.ajv = new Ajv({ allErrors: true, strict: false });
    addFormats(this.ajv);
    this.validate = this.ajv.compile(lexiconSchema);
    this.lexicons = new Map();
    this.watchers = new Map();
  }

  /**
   * Load a lexicon file
   * @param {string} filename - Lexicon filename
   * @returns {Promise<Object>} Parsed and validated lexicon
   */
  async loadLexicon(filename) {
    try {
      const filePath = path.join(this.options.lexiconDir, filename);
      logger.info(`Loading lexicon from ${filePath}`);

      const content = await fs.readFile(filePath, 'utf8');
      const lexicon = JSON.parse(content);

      // Validate against schema
      const valid = this.validate(lexicon);
      if (!valid) {
        throw new Error(`Invalid lexicon schema: ${JSON.stringify(this.validate.errors)}`);
      }

      // Store lexicon
      this.lexicons.set(filename, lexicon);

      // Set up file watcher if enabled
      if (this.options.watchForChanges) {
        this.watchLexicon(filename, filePath);
      }

      logger.info(`Successfully loaded lexicon: ${lexicon.lexicon.service.name} v${lexicon.lexicon.service.version}`);

      return lexicon;
    } catch (error) {
      logger.error(`Failed to load lexicon ${filename}:`, error);
      throw error;
    }
  }

  /**
   * Load all lexicon files from directory
   * @returns {Promise<Map>} Map of filename to lexicon
   */
  async loadAllLexicons() {
    try {
      // Ensure lexicon directory exists
      await fs.mkdir(this.options.lexiconDir, { recursive: true });

      const files = await fs.readdir(this.options.lexiconDir);
      const lexiconFiles = files.filter(f => f.endsWith('.json'));

      logger.info(`Found ${lexiconFiles.length} lexicon files`);

      for (const file of lexiconFiles) {
        try {
          await this.loadLexicon(file);
        } catch (error) {
          logger.error(`Failed to load lexicon ${file}, skipping:`, error.message);
        }
      }

      return this.lexicons;
    } catch (error) {
      logger.error('Failed to load lexicons:', error);
      throw error;
    }
  }

  /**
   * Watch lexicon file for changes and hot-reload
   * @param {string} filename - Lexicon filename
   * @param {string} filePath - Full file path
   */
  watchLexicon(filename, filePath) {
    if (this.watchers.has(filename)) {
      return; // Already watching
    }

    try {
      const watcher = fs.watch(filePath, async (eventType) => {
        if (eventType === 'change') {
          logger.info(`Lexicon ${filename} changed, reloading...`);
          try {
            await this.loadLexicon(filename);
            this.emit('lexiconReloaded', filename);
          } catch (error) {
            logger.error(`Failed to reload lexicon ${filename}:`, error.message);
          }
        }
      });

      this.watchers.set(filename, watcher);
      logger.debug(`Watching ${filename} for changes`);
    } catch (error) {
      logger.warn(`Could not watch ${filename}:`, error.message);
    }
  }

  /**
   * Get a loaded lexicon
   * @param {string} filename - Lexicon filename
   * @returns {Object|null} Lexicon or null if not found
   */
  getLexicon(filename) {
    return this.lexicons.get(filename) || null;
  }

  /**
   * Get all loaded lexicons
   * @returns {Map} Map of filename to lexicon
   */
  getAllLexicons() {
    return this.lexicons;
  }

  /**
   * Get all routes from all loaded lexicons
   * @returns {Array} Array of route definitions with source info
   */
  getAllRoutes() {
    const routes = [];

    for (const [filename, lexicon] of this.lexicons) {
      for (const route of lexicon.lexicon.routes) {
        routes.push({
          ...route,
          _source: {
            filename,
            service: lexicon.lexicon.service.name
          }
        });
      }
    }

    return routes;
  }

  /**
   * Reload a specific lexicon
   * @param {string} filename - Lexicon filename
   * @returns {Promise<Object>} Reloaded lexicon
   */
  async reloadLexicon(filename) {
    logger.info(`Manually reloading lexicon ${filename}`);
    return this.loadLexicon(filename);
  }

  /**
   * Reload all lexicons
   * @returns {Promise<Map>} Map of filename to lexicon
   */
  async reloadAll() {
    logger.info('Reloading all lexicons');
    this.lexicons.clear();
    return this.loadAllLexicons();
  }

  /**
   * Stop watching all files
   */
  stopWatching() {
    for (const [filename, watcher] of this.watchers) {
      watcher.close();
      logger.debug(`Stopped watching ${filename}`);
    }
    this.watchers.clear();
  }

  /**
   * Event emitter functionality
   */
  on(event, callback) {
    if (!this.listeners) this.listeners = {};
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(callback);
  }

  emit(event, ...args) {
    if (!this.listeners || !this.listeners[event]) return;
    for (const callback of this.listeners[event]) {
      callback(...args);
    }
  }
}

module.exports = LexiconLoader;
