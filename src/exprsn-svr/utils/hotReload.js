/**
 * ═══════════════════════════════════════════════════════════
 * Hot Reload System
 * Dynamic reloading of routes, views, Socket.IO handlers, and plugins
 * ═══════════════════════════════════════════════════════════
 */

const fs = require('fs');
const path = require('path');
const chokidar = require('chokidar');
const logger = require('./logger');

class HotReloadManager {
  constructor() {
    this.watchers = new Map();
    this.routeCache = new Map();
    this.socketHandlerCache = new Map();
    this.pluginCache = new Map();
    this.app = null;
    this.io = null;
  }

  /**
   * Initialize hot reloading system
   */
  initialize(app, io) {
    this.app = app;
    this.io = io;

    if (process.env.NODE_ENV !== 'development') {
      logger.info('Hot reload disabled in production');
      return;
    }

    logger.info('Initializing hot reload system...');

    // Watch routes
    this.watchRoutes();

    // Watch views
    this.watchViews();

    // Watch Socket.IO handlers
    this.watchSocketHandlers();

    // Watch plugins
    this.watchPlugins();

    logger.info('Hot reload system initialized');
  }

  /**
   * Watch route files for changes
   */
  watchRoutes() {
    const routePaths = [
      path.join(__dirname, '../routes/**/*.js'),
      path.join(__dirname, '../lowcode/routes/**/*.js'),
      path.join(__dirname, '../workflow/routes/**/*.js'),
    ];

    const watcher = chokidar.watch(routePaths, {
      ignoreInitial: true,
      persistent: true,
      awaitWriteFinish: {
        stabilityThreshold: 300,
        pollInterval: 100
      }
    });

    watcher.on('change', (filePath) => {
      this.reloadRoute(filePath);
    });

    watcher.on('add', (filePath) => {
      logger.info('New route file detected', { filePath });
      this.reloadRoute(filePath);
    });

    watcher.on('unlink', (filePath) => {
      logger.info('Route file deleted', { filePath });
      this.unloadRoute(filePath);
    });

    this.watchers.set('routes', watcher);
    logger.info('Watching routes for hot reload');
  }

  /**
   * Watch view/template files for changes
   */
  watchViews() {
    const viewPaths = [
      path.join(__dirname, '../views/**/*.ejs'),
      path.join(__dirname, '../lowcode/views/**/*.ejs'),
      path.join(__dirname, '../workflow/views/**/*.ejs'),
    ];

    const watcher = chokidar.watch(viewPaths, {
      ignoreInitial: true,
      persistent: true,
      awaitWriteFinish: {
        stabilityThreshold: 300,
        pollInterval: 100
      }
    });

    watcher.on('change', (filePath) => {
      this.reloadView(filePath);
    });

    watcher.on('add', (filePath) => {
      logger.info('New view file detected', { filePath });
    });

    this.watchers.set('views', watcher);
    logger.info('Watching views for hot reload');
  }

  /**
   * Watch Socket.IO handler files for changes
   */
  watchSocketHandlers() {
    const socketPaths = [
      path.join(__dirname, '../sockets/**/*.js'),
      path.join(__dirname, '../lowcode/sockets/**/*.js'),
      path.join(__dirname, '../lowcode/socketHandlers.js'),
    ];

    const watcher = chokidar.watch(socketPaths, {
      ignoreInitial: true,
      persistent: true,
      awaitWriteFinish: {
        stabilityThreshold: 300,
        pollInterval: 100
      }
    });

    watcher.on('change', (filePath) => {
      this.reloadSocketHandler(filePath);
    });

    this.watchers.set('sockets', watcher);
    logger.info('Watching Socket.IO handlers for hot reload');
  }

  /**
   * Watch plugin files for changes
   */
  watchPlugins() {
    const pluginPaths = [
      path.join(__dirname, '../plugins/**/*.js'),
      path.join(__dirname, '../lowcode/plugins/**/*.js'),
    ];

    const watcher = chokidar.watch(pluginPaths, {
      ignoreInitial: true,
      persistent: true,
      awaitWriteFinish: {
        stabilityThreshold: 300,
        pollInterval: 100
      }
    });

    watcher.on('change', (filePath) => {
      this.reloadPlugin(filePath);
    });

    watcher.on('add', (filePath) => {
      logger.info('New plugin file detected', { filePath });
      this.reloadPlugin(filePath);
    });

    watcher.on('unlink', (filePath) => {
      logger.info('Plugin file deleted', { filePath });
      this.unloadPlugin(filePath);
    });

    this.watchers.set('plugins', watcher);
    logger.info('Watching plugins for hot reload');
  }

  /**
   * Reload a route file
   */
  reloadRoute(filePath) {
    try {
      // Clear require cache
      this.clearRequireCache(filePath);

      // Determine route mount path
      const mountPath = this.getRouteMountPath(filePath);

      if (!mountPath) {
        logger.warn('Could not determine mount path for route', { filePath });
        return;
      }

      // Remove old route handlers
      this.removeRouteHandlers(mountPath);

      // Reload route module
      const routeModule = require(filePath);

      // Re-mount route
      this.app.use(mountPath, routeModule);

      logger.info('Route reloaded successfully', {
        filePath: path.relative(process.cwd(), filePath),
        mountPath
      });

      // Emit reload event to connected clients
      if (this.io) {
        this.io.emit('route:reloaded', {
          path: mountPath,
          timestamp: Date.now()
        });
      }
    } catch (error) {
      logger.error('Failed to reload route', {
        filePath: path.relative(process.cwd(), filePath),
        error: error.message,
        stack: error.stack
      });

      // Emit error to clients
      if (this.io) {
        this.io.emit('route:reload:error', {
          filePath: path.relative(process.cwd(), filePath),
          error: error.message
        });
      }
    }
  }

  /**
   * Reload a view/template file
   */
  reloadView(filePath) {
    try {
      // EJS caches templates, clear the cache
      if (this.app && this.app.render) {
        // Express doesn't expose EJS cache directly, but we can work around it
        // by touching the app's cache settings
        const viewName = path.relative(this.app.get('views'), filePath);

        logger.info('View file changed', {
          filePath: path.relative(process.cwd(), filePath),
          viewName
        });

        // Emit reload event to connected clients
        if (this.io) {
          this.io.emit('view:reloaded', {
            view: viewName,
            timestamp: Date.now()
          });
        }

        // Notify clients to refresh
        if (this.io) {
          this.io.emit('client:refresh', {
            reason: 'view_updated',
            view: viewName
          });
        }
      }
    } catch (error) {
      logger.error('Failed to reload view', {
        filePath: path.relative(process.cwd(), filePath),
        error: error.message
      });
    }
  }

  /**
   * Reload Socket.IO handlers
   */
  reloadSocketHandler(filePath) {
    try {
      // Clear require cache
      this.clearRequireCache(filePath);

      logger.info('Socket.IO handler changed', {
        filePath: path.relative(process.cwd(), filePath)
      });

      // For Socket.IO handlers, we need to disconnect and reconnect clients
      // or implement a more sophisticated reload mechanism

      if (this.io) {
        // Emit reload notification
        this.io.emit('socket:handler:reloaded', {
          handler: path.basename(filePath, '.js'),
          timestamp: Date.now(),
          message: 'Socket.IO handler reloaded. Reconnection recommended.'
        });

        logger.info('Socket.IO handler reload notification sent to clients');
      }
    } catch (error) {
      logger.error('Failed to reload Socket.IO handler', {
        filePath: path.relative(process.cwd(), filePath),
        error: error.message
      });
    }
  }

  /**
   * Reload a plugin
   */
  async reloadPlugin(filePath) {
    try {
      // Clear require cache
      this.clearRequireCache(filePath);

      const pluginManager = require('../services/pluginManager');

      // Get plugin name from file path
      const pluginName = path.basename(filePath, '.js');

      // Unload plugin if it exists
      if (this.pluginCache.has(pluginName)) {
        await pluginManager.unloadPlugin(pluginName);
        this.pluginCache.delete(pluginName);
      }

      // Reload plugin
      const plugin = require(filePath);

      if (plugin && typeof plugin.initialize === 'function') {
        await pluginManager.loadPlugin(pluginName, plugin);
        this.pluginCache.set(pluginName, plugin);

        logger.info('Plugin reloaded successfully', {
          plugin: pluginName,
          filePath: path.relative(process.cwd(), filePath)
        });

        // Emit reload event
        if (this.io) {
          this.io.emit('plugin:reloaded', {
            plugin: pluginName,
            timestamp: Date.now()
          });
        }
      }
    } catch (error) {
      logger.error('Failed to reload plugin', {
        filePath: path.relative(process.cwd(), filePath),
        error: error.message,
        stack: error.stack
      });

      if (this.io) {
        this.io.emit('plugin:reload:error', {
          filePath: path.relative(process.cwd(), filePath),
          error: error.message
        });
      }
    }
  }

  /**
   * Unload a route
   */
  unloadRoute(filePath) {
    try {
      const mountPath = this.getRouteMountPath(filePath);

      if (mountPath) {
        this.removeRouteHandlers(mountPath);
        logger.info('Route unloaded', {
          filePath: path.relative(process.cwd(), filePath),
          mountPath
        });
      }

      this.clearRequireCache(filePath);
    } catch (error) {
      logger.error('Failed to unload route', {
        filePath: path.relative(process.cwd(), filePath),
        error: error.message
      });
    }
  }

  /**
   * Unload a plugin
   */
  async unloadPlugin(filePath) {
    try {
      const pluginName = path.basename(filePath, '.js');

      if (this.pluginCache.has(pluginName)) {
        const pluginManager = require('../services/pluginManager');
        await pluginManager.unloadPlugin(pluginName);
        this.pluginCache.delete(pluginName);

        logger.info('Plugin unloaded', { plugin: pluginName });

        if (this.io) {
          this.io.emit('plugin:unloaded', {
            plugin: pluginName,
            timestamp: Date.now()
          });
        }
      }

      this.clearRequireCache(filePath);
    } catch (error) {
      logger.error('Failed to unload plugin', {
        filePath: path.relative(process.cwd(), filePath),
        error: error.message
      });
    }
  }

  /**
   * Clear require cache for a module and its dependencies
   */
  clearRequireCache(modulePath) {
    try {
      const resolvedPath = require.resolve(modulePath);

      // Delete from cache
      delete require.cache[resolvedPath];

      // Also clear any modules that depend on this one
      Object.keys(require.cache).forEach((key) => {
        if (require.cache[key] && require.cache[key].children) {
          const childIndex = require.cache[key].children.findIndex(
            (child) => child.id === resolvedPath
          );

          if (childIndex !== -1) {
            require.cache[key].children.splice(childIndex, 1);
          }
        }
      });
    } catch (error) {
      // Module might not be in cache yet
      logger.debug('Could not clear cache for module', {
        modulePath,
        error: error.message
      });
    }
  }

  /**
   * Get mount path for a route based on file location
   */
  getRouteMountPath(filePath) {
    const relativePath = path.relative(process.cwd(), filePath);

    // Main routes
    if (relativePath.includes('routes/pages')) return '/pages';
    if (relativePath.includes('routes/editor')) return '/editor';
    if (relativePath.includes('routes/api') && !relativePath.includes('lowcode')) return '/api';
    if (relativePath.includes('routes/templates')) return '/api/templates';
    if (relativePath.includes('routes/components')) return '/api/components';
    if (relativePath.includes('routes/assets')) return '/api/assets';
    if (relativePath.includes('routes/analytics')) return '/api/analytics';
    if (relativePath.includes('routes/markdown')) return '/api/markdown';
    if (relativePath.includes('routes/plugins')) return '/api/plugins';
    if (relativePath.includes('routes/decisionTables')) return '/api/decision-tables';

    // Low-Code routes
    if (relativePath.includes('lowcode/routes')) return '/lowcode';

    // Workflow routes
    if (relativePath.includes('workflow/routes')) return '/workflow';

    // Forge routes
    if (relativePath.includes('routes/forge')) return '/forge';

    // Setup routes
    if (relativePath.includes('routes/setup')) return '/setup';

    return null;
  }

  /**
   * Remove route handlers for a specific path
   */
  removeRouteHandlers(mountPath) {
    if (!this.app || !this.app._router) return;

    // Find and remove the route layer
    const stack = this.app._router.stack;

    for (let i = stack.length - 1; i >= 0; i--) {
      const layer = stack[i];

      if (layer.route) {
        // Route layer
        if (layer.route.path === mountPath) {
          stack.splice(i, 1);
        }
      } else if (layer.name === 'router' && layer.regexp) {
        // Router middleware layer
        const pathMatch = mountPath.replace(/\//g, '\\/');
        if (layer.regexp.toString().includes(pathMatch)) {
          stack.splice(i, 1);
        }
      }
    }
  }

  /**
   * Shutdown hot reload system
   */
  shutdown() {
    logger.info('Shutting down hot reload system...');

    this.watchers.forEach((watcher, name) => {
      watcher.close();
      logger.info(`Closed ${name} watcher`);
    });

    this.watchers.clear();
    this.routeCache.clear();
    this.socketHandlerCache.clear();
    this.pluginCache.clear();

    logger.info('Hot reload system shut down');
  }

  /**
   * Get hot reload statistics
   */
  getStats() {
    return {
      watchers: Array.from(this.watchers.keys()),
      routesCached: this.routeCache.size,
      socketHandlersCached: this.socketHandlerCache.size,
      pluginsCached: this.pluginCache.size,
      enabled: process.env.NODE_ENV === 'development'
    };
  }
}

// Export singleton instance
module.exports = new HotReloadManager();
