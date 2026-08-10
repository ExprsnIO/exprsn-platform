/**
 * Lexicon Middleware
 *
 * Creates Express routes dynamically from JSON Lexicon definitions.
 * Implements the Exprsn JSON Lexicon Specification v1.0
 */

const { createProxyMiddleware } = require('http-proxy-middleware');
const rateLimit = require('express-rate-limit');
const { createAuthMiddleware } = require('./auth');
const { createPermissionMiddleware } = require('./permissions');
const { createValidationMiddleware } = require('./validation');
const logger = require('../config/logger');

/**
 * Create Express routes from lexicon definition
 * @param {Object} app - Express app instance
 * @param {Object} lexicon - Parsed lexicon configuration
 * @param {Object} options - Additional options
 */
function applyLexicon(app, lexicon, options = {}) {
  const lexiconDef = lexicon.lexicon;

  logger.info(`Applying lexicon: ${lexiconDef.service.name} v${lexiconDef.service.version}`);

  // Apply global policies if defined
  if (lexiconDef.policies) {
    applyPolicies(app, lexiconDef.policies);
  }

  // Apply global middleware if defined
  if (lexiconDef.middleware) {
    applyGlobalMiddleware(app, lexiconDef.middleware);
  }

  // Create routes
  for (const route of lexiconDef.routes) {
    createRoute(app, route, lexiconDef, options);
  }

  logger.info(`Created ${lexiconDef.routes.length} routes from lexicon`);
}

/**
 * Apply global policies
 * @param {Object} app - Express app instance
 * @param {Object} policies - Policy configuration
 */
function applyPolicies(app, policies) {
  // Apply CORS if defined
  if (policies.cors) {
    logger.debug('Applying CORS policy from lexicon');
    // Note: CORS should already be configured, this is for reference
  }

  // Apply default rate limit if defined
  if (policies.defaultRateLimit) {
    const limiter = rateLimit({
      windowMs: policies.defaultRateLimit.windowMs || 15 * 60 * 1000,
      max: policies.defaultRateLimit.max || 1000,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: 'Rate limit exceeded' }
    });

    app.use(limiter);
    logger.debug('Applied default rate limit from lexicon');
  }
}

/**
 * Apply global middleware
 * @param {Object} app - Express app instance
 * @param {Array} middlewareList - Middleware configuration array
 */
function applyGlobalMiddleware(app, middlewareList) {
  for (const mw of middlewareList) {
    logger.debug(`Applying global middleware: ${mw.name}`);
    // Custom middleware would be loaded here
    // For now, we log it
  }
}

/**
 * Create a single route from lexicon definition
 * @param {Object} app - Express app instance
 * @param {Object} route - Route configuration
 * @param {Object} lexiconDef - Full lexicon definition
 * @param {Object} options - Additional options
 */
function createRoute(app, route, lexiconDef, options) {
  const method = route.method.toLowerCase();
  const middlewareChain = [];

  logger.debug(`Creating route: ${route.method} ${route.path}`);

  // 1. Add route-specific rate limiting
  if (route.rateLimit) {
    const limiter = rateLimit({
      windowMs: route.rateLimit.windowMs || 15 * 60 * 1000,
      max: route.rateLimit.max || 100,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: 'Route rate limit exceeded' },
      keyGenerator: (req) => {
        // Use token ID if available, otherwise IP
        return req.token?.id || req.ip;
      }
    });

    middlewareChain.push(limiter);
  }

  // 2. Add authentication middleware
  if (route.auth) {
    middlewareChain.push(createAuthMiddleware(route.auth));
  }

  // 3. Add permission middleware
  if (route.auth && route.auth.permissions) {
    middlewareChain.push(createPermissionMiddleware(route.auth.permissions));
  }

  // 4. Add validation middleware
  if (route.validation) {
    middlewareChain.push(createValidationMiddleware(route.validation));
  }

  // 5. Add custom middleware if defined
  if (route.middleware && Array.isArray(route.middleware)) {
    for (const mwName of route.middleware) {
      // Custom middleware would be loaded here
      logger.debug(`Would load custom middleware: ${mwName}`);
    }
  }

  // 6. Add proxy middleware for backend service
  if (route.target) {
    const proxyMiddleware = createProxyForTarget(route.target, route);
    middlewareChain.push(proxyMiddleware);
  }

  // Register the route with Express
  app[method](route.path, ...middlewareChain);

  logger.info(`Registered ${route.method} ${route.path} -> ${route.target?.service}${route.target?.path}`);
}

/**
 * Create proxy middleware for a target service
 * @param {Object} target - Target configuration
 * @param {Object} route - Route configuration
 * @returns {Function} Proxy middleware
 */
function createProxyForTarget(target, route) {
  const targetUrl = getServiceUrl(target.service);

  if (!targetUrl) {
    logger.error(`No URL configured for service: ${target.service}`);
    return (req, res) => {
      res.status(503).json({
        error: 'SERVICE_UNAVAILABLE',
        message: `Service ${target.service} not configured`
      });
    };
  }

  return createProxyMiddleware({
    target: targetUrl,
    changeOrigin: true,
    pathRewrite: (path) => {
      // Rewrite path according to target.path
      return target.path;
    },
    timeout: target.timeout || 30000,
    onProxyReq: (proxyReq, req, res) => {
      // Forward authentication headers
      if (req.headers.authorization) {
        proxyReq.setHeader('Authorization', req.headers.authorization);
      }

      // Add X-Forwarded headers
      proxyReq.setHeader('X-Forwarded-For', req.ip);
      proxyReq.setHeader('X-Forwarded-Proto', req.protocol);
      proxyReq.setHeader('X-Forwarded-Host', req.get('host'));

      // Add token info if available
      if (req.token) {
        proxyReq.setHeader('X-Token-Id', req.token.id);
        proxyReq.setHeader('X-User-Id', req.token.userId);
      }

      logger.debug(`Proxying ${req.method} ${req.path} to ${targetUrl}${target.path}`);
    },
    onProxyRes: (proxyRes, req, res) => {
      logger.debug(`Response from ${target.service}: ${proxyRes.statusCode}`);
    },
    onError: (err, req, res) => {
      logger.error(`Proxy error for ${target.service}:`, err);
      res.status(502).json({
        error: 'BAD_GATEWAY',
        message: `Failed to reach service: ${target.service}`,
        service: target.service
      });
    }
  });
}

/**
 * Get service URL from environment or configuration
 * @param {string} serviceName - Service name
 * @returns {string|null} Service URL or null
 */
function getServiceUrl(serviceName) {
  const envVar = `${serviceName.toUpperCase().replace(/-/g, '_')}_SERVICE_URL`;
  const url = process.env[envVar];

  if (!url) {
    logger.warn(`No URL found for service ${serviceName} (looking for ${envVar})`);
  }

  return url || null;
}

/**
 * Remove routes created by a lexicon (for hot-reloading)
 * @param {Object} app - Express app instance
 * @param {Object} lexicon - Lexicon to remove
 */
function removeLexicon(app, lexicon) {
  // Note: Removing routes from Express is not straightforward
  // This would require tracking registered routes and manually removing them
  // For now, we log a warning that hot-reload requires restart
  logger.warn('Lexicon hot-reload requires application restart');
}

module.exports = {
  applyLexicon,
  removeLexicon,
  createRoute,
  createProxyForTarget,
  getServiceUrl
};
