/**
 * ═══════════════════════════════════════════════════════════
 * SQL Injection Detection Middleware
 * Detects and blocks potential SQL injection attempts
 * ═══════════════════════════════════════════════════════════
 */

const sqlInjection = require('sql-injection');
const config = require('../config');
const logger = require('../utils/logger');
const { AppError } = require('./errorHandler');

/**
 * Check value for SQL injection patterns
 */
function hasSQLInjection(value) {
  if (typeof value !== 'string') {
    return false;
  }

  // Use sql-injection library for detection (if available)
  try {
    if (sqlInjection && typeof sqlInjection.containsSql === 'function' && sqlInjection.containsSql(value)) {
      return true;
    }
  } catch (error) {
    // Fallback to custom patterns if library check fails
    logger.debug('SQL injection library check failed, using custom patterns', { error: error.message });
  }

  // Additional patterns to check
  const suspiciousPatterns = [
    /(\bUNION\b.*\bSELECT\b)/i,
    /(\bSELECT\b.*\bFROM\b.*\bWHERE\b)/i,
    /(\bINSERT\b.*\bINTO\b.*\bVALUES\b)/i,
    /(\bUPDATE\b.*\bSET\b)/i,
    /(\bDELETE\b.*\bFROM\b)/i,
    /(\bDROP\b.*\bTABLE\b)/i,
    /(\bEXEC\b.*\()/i,
    /(\bEXECUTE\b.*\()/i,
    /(;\s*DROP\b)/i,
    /(;\s*DELETE\b)/i,
    /('.*OR.*'.*=.*')/i,
    /(".*OR.*".*=.*")/i,
    /(--\s*$)/,
    /(\/\*.*\*\/)/,
    /(\bxp_cmdshell\b)/i,
    /(\bsp_executesql\b)/i
  ];

  for (const pattern of suspiciousPatterns) {
    if (pattern.test(value)) {
      return true;
    }
  }

  return false;
}

/**
 * Recursively scan object for SQL injection
 */
function scanObject(obj, path = '') {
  if (obj === null || obj === undefined) {
    return null;
  }

  if (typeof obj === 'string') {
    if (hasSQLInjection(obj)) {
      return { path, value: obj };
    }
  }

  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      const result = scanObject(obj[i], `${path}[${i}]`);
      if (result) return result;
    }
  }

  if (typeof obj === 'object') {
    for (const [key, value] of Object.entries(obj)) {
      const currentPath = path ? `${path}.${key}` : key;
      const result = scanObject(value, currentPath);
      if (result) return result;
    }
  }

  return null;
}

/**
 * Middleware to detect SQL injection in requests
 */
function detectSQLInjection(req, res, next) {
  if (!config.security.enableSQLInjectionDetection) {
    return next();
  }

  try {
    // Check query parameters
    if (req.query && Object.keys(req.query).length > 0) {
      const result = scanObject(req.query, 'query');
      if (result) {
        logger.warn('SQL injection detected in query parameters', {
          path: result.path,
          value: result.value,
          ip: req.ip,
          url: req.url
        });
        throw new AppError('Suspicious SQL patterns detected in request', 400, {
          code: 'SQL_INJECTION_DETECTED',
          field: result.path
        });
      }
    }

    // Check request body
    if (req.body && Object.keys(req.body).length > 0) {
      const result = scanObject(req.body, 'body');
      if (result) {
        logger.warn('SQL injection detected in request body', {
          path: result.path,
          value: result.value,
          ip: req.ip,
          url: req.url
        });
        throw new AppError('Suspicious SQL patterns detected in request', 400, {
          code: 'SQL_INJECTION_DETECTED',
          field: result.path
        });
      }
    }

    // Check route parameters
    if (req.params && Object.keys(req.params).length > 0) {
      const result = scanObject(req.params, 'params');
      if (result) {
        logger.warn('SQL injection detected in route parameters', {
          path: result.path,
          value: result.value,
          ip: req.ip,
          url: req.url
        });
        throw new AppError('Suspicious SQL patterns detected in request', 400, {
          code: 'SQL_INJECTION_DETECTED',
          field: result.path
        });
      }
    }

    next();
  } catch (error) {
    if (error instanceof AppError) {
      next(error);
    } else {
      logger.error('SQL injection detection error:', error);
      next(error);
    }
  }
}

module.exports = {
  detectSQLInjection,
  hasSQLInjection,
  scanObject
};
