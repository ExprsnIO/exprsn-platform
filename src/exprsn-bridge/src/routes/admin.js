/**
 * Admin Routes
 *
 * Administrative endpoints for managing the Bridge service and lexicons.
 */

const express = require('express');
const router = express.Router();
const { validateCAToken, requirePermissions } = require('@exprsn/shared');
const logger = require('../config/logger');

/**
 * Reload all lexicons
 * Requires admin permissions
 */
router.post('/lexicons/reload',
  validateCAToken,
  requirePermissions({ update: true }),
  async (req, res) => {
    try {
      // Get lexicon loader from app locals (set during startup)
      const lexiconLoader = req.app.locals.lexiconLoader;

      if (!lexiconLoader) {
        return res.status(500).json({
          success: false,
          error: 'LEXICON_LOADER_NOT_AVAILABLE',
          message: 'Lexicon loader not initialized'
        });
      }

      logger.info('Reloading all lexicons', { userId: req.user?.id });
      await lexiconLoader.reloadAll();

      const lexicons = lexiconLoader.getAllLexicons();

      res.json({
        success: true,
        message: 'Lexicons reloaded successfully',
        data: {
          count: lexicons.size,
          lexicons: Array.from(lexicons.values()).map(l => ({
            service: l.lexicon.service.name,
            version: l.lexicon.service.version,
            routes: l.lexicon.routes.length
          }))
        }
      });

      logger.warn('Note: Lexicon reload does not update active routes. Restart server for route changes to take effect.');
    } catch (error) {
      logger.error('Failed to reload lexicons:', error);
      res.status(500).json({
        success: false,
        error: 'RELOAD_FAILED',
        message: 'Failed to reload lexicons',
        details: error.message
      });
    }
  }
);

/**
 * Get all loaded lexicons
 */
router.get('/lexicons',
  validateCAToken,
  requirePermissions({ read: true }),
  (req, res) => {
    try {
      const lexiconLoader = req.app.locals.lexiconLoader;

      if (!lexiconLoader) {
        return res.status(500).json({
          success: false,
          error: 'LEXICON_LOADER_NOT_AVAILABLE'
        });
      }

      const lexicons = lexiconLoader.getAllLexicons();
      const routes = lexiconLoader.getAllRoutes();

      res.json({
        success: true,
        data: {
          lexicons: Array.from(lexicons.values()).map(l => ({
            service: l.lexicon.service.name,
            version: l.lexicon.service.version,
            description: l.lexicon.service.description,
            routes: l.lexicon.routes.length,
            policies: l.lexicon.policies || {}
          })),
          totalRoutes: routes.length,
          routesByService: routes.reduce((acc, route) => {
            const service = route._source.service;
            acc[service] = (acc[service] || 0) + 1;
            return acc;
          }, {})
        }
      });
    } catch (error) {
      logger.error('Failed to get lexicons:', error);
      res.status(500).json({
        success: false,
        error: 'FETCH_FAILED',
        message: 'Failed to fetch lexicons'
      });
    }
  }
);

/**
 * Get all routes from all lexicons
 */
router.get('/routes',
  validateCAToken,
  requirePermissions({ read: true }),
  (req, res) => {
    try {
      const lexiconLoader = req.app.locals.lexiconLoader;

      if (!lexiconLoader) {
        return res.status(500).json({
          success: false,
          error: 'LEXICON_LOADER_NOT_AVAILABLE'
        });
      }

      const routes = lexiconLoader.getAllRoutes();

      // Filter routes by service if specified
      const serviceFilter = req.query.service;
      const filteredRoutes = serviceFilter
        ? routes.filter(r => r._source.service === serviceFilter)
        : routes;

      res.json({
        success: true,
        data: {
          routes: filteredRoutes.map(r => ({
            path: r.path,
            method: r.method,
            service: r._source.service,
            target: r.target,
            auth: r.auth,
            rateLimit: r.rateLimit,
            description: r.description
          })),
          count: filteredRoutes.length
        }
      });
    } catch (error) {
      logger.error('Failed to get routes:', error);
      res.status(500).json({
        success: false,
        error: 'FETCH_FAILED',
        message: 'Failed to fetch routes'
      });
    }
  }
);

/**
 * Get Bridge statistics
 */
router.get('/stats',
  validateCAToken,
  requirePermissions({ read: true }),
  (req, res) => {
    try {
      const lexiconLoader = req.app.locals.lexiconLoader;
      const lexicons = lexiconLoader ? lexiconLoader.getAllLexicons() : new Map();
      const routes = lexiconLoader ? lexiconLoader.getAllRoutes() : [];

      res.json({
        success: true,
        data: {
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          environment: process.env.NODE_ENV || 'development',
          version: '1.0.0',
          lexicons: {
            loaded: lexicons.size,
            totalRoutes: routes.length
          },
          services: Object.keys(require('../config').services).length,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      logger.error('Failed to get stats:', error);
      res.status(500).json({
        success: false,
        error: 'FETCH_FAILED',
        message: 'Failed to fetch statistics'
      });
    }
  }
);

module.exports = router;
