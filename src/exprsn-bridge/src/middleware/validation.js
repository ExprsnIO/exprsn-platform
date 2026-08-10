/**
 * Validation Middleware
 *
 * Validates request parameters, query, body, and headers against JSON schemas.
 */

const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const logger = require('../config/logger');

// Create Ajv instance
const ajv = new Ajv({ allErrors: true, strict: false, coerceTypes: true });
addFormats(ajv);

/**
 * Create validation middleware based on lexicon validation config
 * @param {Object} validationConfig - Validation configuration from lexicon
 * @returns {Function} Express middleware function
 */
function createValidationMiddleware(validationConfig) {
  // Compile schemas
  const compiledSchemas = {};

  if (validationConfig) {
    if (validationConfig.params) {
      compiledSchemas.params = ajv.compile({
        type: 'object',
        properties: validationConfig.params,
        additionalProperties: false
      });
    }

    if (validationConfig.query) {
      compiledSchemas.query = ajv.compile({
        type: 'object',
        properties: validationConfig.query,
        additionalProperties: true
      });
    }

    if (validationConfig.body) {
      compiledSchemas.body = ajv.compile(validationConfig.body);
    }

    if (validationConfig.headers) {
      compiledSchemas.headers = ajv.compile({
        type: 'object',
        properties: validationConfig.headers,
        additionalProperties: true
      });
    }
  }

  return (req, res, next) => {
    try {
      const errors = [];

      // Validate params
      if (compiledSchemas.params) {
        const valid = compiledSchemas.params(req.params);
        if (!valid) {
          errors.push({
            location: 'params',
            errors: compiledSchemas.params.errors
          });
        }
      }

      // Validate query
      if (compiledSchemas.query) {
        const valid = compiledSchemas.query(req.query);
        if (!valid) {
          errors.push({
            location: 'query',
            errors: compiledSchemas.query.errors
          });
        }
      }

      // Validate body
      if (compiledSchemas.body) {
        const valid = compiledSchemas.body(req.body);
        if (!valid) {
          errors.push({
            location: 'body',
            errors: compiledSchemas.body.errors
          });
        }
      }

      // Validate headers
      if (compiledSchemas.headers) {
        const valid = compiledSchemas.headers(req.headers);
        if (!valid) {
          errors.push({
            location: 'headers',
            errors: compiledSchemas.headers.errors
          });
        }
      }

      // Return validation errors if any
      if (errors.length > 0) {
        logger.debug('Validation failed', { errors });

        return res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          details: errors.map(e => ({
            location: e.location,
            errors: e.errors.map(err => ({
              path: err.instancePath,
              message: err.message,
              params: err.params
            }))
          }))
        });
      }

      next();
    } catch (error) {
      logger.error('Validation middleware error:', error);
      return res.status(500).json({
        error: 'VALIDATION_ERROR',
        message: 'Failed to validate request'
      });
    }
  };
}

/**
 * Validate data against a JSON schema
 * @param {Object} schema - JSON schema
 * @param {*} data - Data to validate
 * @returns {Object} { valid: boolean, errors: Array }
 */
function validate(schema, data) {
  const validateFn = ajv.compile(schema);
  const valid = validateFn(data);

  return {
    valid,
    errors: valid ? [] : validateFn.errors
  };
}

module.exports = {
  createValidationMiddleware,
  validate
};
