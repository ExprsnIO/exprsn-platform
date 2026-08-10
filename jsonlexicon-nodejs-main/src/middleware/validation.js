/**
 * Request Validation Middleware
 * Uses express-validator for input validation
 */

const { validationResult, body, param, query } = require('express-validator');
const logger = require('../utils/logger');

/**
 * Middleware: Handle validation errors
 */
function handleValidationErrors(req, res, next) {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    logger.warn('Validation failed', {
      errors: errors.array(),
      path: req.path,
      requestId: req.requestId,
    });

    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: errors.array().map(err => ({
          field: err.param,
          message: err.msg,
          value: err.value,
        })),
        requestId: req.requestId,
      },
    });
  }

  next();
}

/**
 * Validation Rules: User Registration
 */
const validateUserRegistration = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email is required'),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must contain uppercase, lowercase, and number'),
  body('first_name')
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('First name must be 1-100 characters'),
  body('last_name')
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Last name must be 1-100 characters'),
  handleValidationErrors,
];

/**
 * Validation Rules: User Login
 */
const validateUserLogin = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email is required'),
  body('password')
    .notEmpty()
    .withMessage('Password is required'),
  handleValidationErrors,
];

/**
 * Validation Rules: Certificate Request
 */
const validateCertificateRequest = [
  body('common_name')
    .notEmpty()
    .trim()
    .isLength({ min: 1, max: 255 })
    .withMessage('Common name is required (1-255 characters)'),
  body('organization')
    .optional()
    .trim()
    .isLength({ max: 255 })
    .withMessage('Organization must be max 255 characters'),
  body('organizational_unit')
    .optional()
    .trim()
    .isLength({ max: 255 })
    .withMessage('Organizational unit must be max 255 characters'),
  body('country')
    .optional()
    .isLength({ min: 2, max: 2 })
    .withMessage('Country must be 2-letter code'),
  body('state')
    .optional()
    .trim()
    .isLength({ max: 128 })
    .withMessage('State must be max 128 characters'),
  body('locality')
    .optional()
    .trim()
    .isLength({ max: 128 })
    .withMessage('Locality must be max 128 characters'),
  body('email')
    .optional()
    .isEmail()
    .withMessage('Valid email is required'),
  body('validity_days')
    .optional()
    .isInt({ min: 1, max: 3650 })
    .withMessage('Validity days must be between 1 and 3650'),
  body('key_usage')
    .optional()
    .isArray()
    .withMessage('Key usage must be an array'),
  body('extended_key_usage')
    .optional()
    .isArray()
    .withMessage('Extended key usage must be an array'),
  body('subject_alt_names')
    .optional()
    .isArray()
    .withMessage('Subject alternative names must be an array'),
  handleValidationErrors,
];

/**
 * Validation Rules: Token Creation
 */
const validateTokenCreation = [
  body('type')
    .notEmpty()
    .isIn([
      'access', 'refresh', 'session', 'api-key', 'service-account',
      'delegated', 'ephemeral', 'one-time', 'streaming', 'transaction',
    ])
    .withMessage('Valid token type is required'),
  body('subject')
    .notEmpty()
    .trim()
    .isLength({ min: 1, max: 255 })
    .withMessage('Subject is required (1-255 characters)'),
  body('audience')
    .optional()
    .isArray()
    .withMessage('Audience must be an array'),
  body('permissions')
    .optional()
    .isObject()
    .withMessage('Permissions must be an object'),
  body('scopes')
    .optional()
    .isArray()
    .withMessage('Scopes must be an array'),
  body('expires_in')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Expires in must be a positive integer (seconds)'),
  body('uses_total')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Uses total must be a positive integer'),
  body('binding_type')
    .optional()
    .isIn(['certificate', 'ip', 'device', 'none'])
    .withMessage('Invalid binding type'),
  handleValidationErrors,
];

/**
 * Validation Rules: Webhook Subscription
 */
const validateWebhookSubscription = [
  body('name')
    .notEmpty()
    .trim()
    .isLength({ min: 1, max: 255 })
    .withMessage('Name is required (1-255 characters)'),
  body('url')
    .notEmpty()
    .isURL({ protocols: ['http', 'https'], require_protocol: true })
    .withMessage('Valid HTTPS URL is required'),
  body('events')
    .isArray({ min: 1 })
    .withMessage('At least one event is required'),
  body('events.*')
    .isIn([
      'certificate.created', 'certificate.revoked', 'certificate.expired',
      'token.created', 'token.used', 'token.revoked', 'token.expired',
      'user.created', 'user.updated', 'user.deleted',
    ])
    .withMessage('Invalid event type'),
  body('method')
    .optional()
    .isIn(['POST', 'PUT', 'PATCH'])
    .withMessage('Method must be POST, PUT, or PATCH'),
  body('timeout')
    .optional()
    .isInt({ min: 1000, max: 30000 })
    .withMessage('Timeout must be between 1000 and 30000 ms'),
  body('retry_attempts')
    .optional()
    .isInt({ min: 0, max: 10 })
    .withMessage('Retry attempts must be between 0 and 10'),
  handleValidationErrors,
];

/**
 * Validation Rules: UUID Parameter
 */
const validateUuidParam = (paramName = 'id') => [
  param(paramName)
    .isUUID()
    .withMessage(`${paramName} must be a valid UUID`),
  handleValidationErrors,
];

/**
 * Validation Rules: Pagination Query
 */
const validatePagination = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  query('sort')
    .optional()
    .isIn(['created_at', 'updated_at', 'name', 'email', 'status'])
    .withMessage('Invalid sort field'),
  query('order')
    .optional()
    .isIn(['asc', 'desc'])
    .withMessage('Order must be asc or desc'),
  handleValidationErrors,
];

/**
 * Validation Rules: Certificate Serial Parameter
 */
const validateCertificateSerial = [
  param('serial')
    .notEmpty()
    .matches(/^[A-Fa-f0-9]{1,64}$/)
    .withMessage('Serial must be a valid hex string (1-64 chars)'),
  handleValidationErrors,
];

/**
 * Validation Rules: Token Handle Parameter
 */
const validateTokenHandle = [
  param('handle')
    .matches(/^[a-z]{2,3}_[a-f0-9]{32}$/)
    .withMessage('Invalid token handle format'),
  handleValidationErrors,
];

/**
 * Sanitize output - remove sensitive fields
 */
function sanitizeUser(user) {
  const { password_hash, mfa_secret, mfa_backup_codes, ...sanitized } = user;
  return sanitized;
}

/**
 * Sanitize token - remove sensitive data
 */
function sanitizeToken(token) {
  const { signature, ...sanitized } = token;
  return sanitized;
}

/**
 * Sanitize certificate - remove private key if present
 */
function sanitizeCertificate(cert) {
  const { private_key, ...sanitized } = cert;
  return sanitized;
}

module.exports = {
  handleValidationErrors,
  validateUserRegistration,
  validateUserLogin,
  validateCertificateRequest,
  validateTokenCreation,
  validateWebhookSubscription,
  validateUuidParam,
  validatePagination,
  validateCertificateSerial,
  validateTokenHandle,
  sanitizeUser,
  sanitizeToken,
  sanitizeCertificate,
};
