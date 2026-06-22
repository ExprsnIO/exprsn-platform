/**
 * Exprsn Vault - Keys Routes (Encryption Keys Management)
 */

const express = require('express');
const router = express.Router();
const Joi = require('joi');
const { asyncHandler, AppError, createRateLimiter } = require('@exprsn/shared');
const { requireToken, requireWrite, requireDelete, requireRead } = require('../middleware/auth');
const keyService = require('../services/keyService');
const encryptionService = require('../services/encryptionService');

// Rate limiters for cryptographic operations
const strictLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 key operations per window (very restrictive)
  keyPrefix: 'vault:keys:strict'
});

const cryptoLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 50, // 50 crypto operations per minute
  keyPrefix: 'vault:keys:crypto'
});

const readLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 100,
  keyPrefix: 'vault:keys:read'
});

// Validation schemas
const createKeySchema = Joi.object({
  name: Joi.string().min(1).max(255).required(),
  purpose: Joi.string().valid('general', 'transit', 'signing').default('general'),
  rotationSchedule: Joi.object().optional(),
  expiresAt: Joi.date().optional(),
  metadata: Joi.object().optional()
});

const encryptDataSchema = Joi.object({
  keyId: Joi.string().uuid().required(),
  plaintext: Joi.string().required()
});

const decryptDataSchema = Joi.object({
  keyId: Joi.string().uuid().required(),
  ciphertext: Joi.string().required(),
  iv: Joi.string().required(),
  authTag: Joi.string().required()
});

// List encryption keys
router.get('/',
  readLimiter,
  ...requireRead('/keys'),
  asyncHandler(async (req, res) => {
    const { status, purpose, limit, offset } = req.query;
    const actor = req.user?.username || req.user?.id || 'service';

    const keys = await keyService.listKeys(
      {
        status,
        purpose,
        limit: limit ? parseInt(limit) : undefined,
        offset: offset ? parseInt(offset) : undefined
      },
      actor
    );

    res.json({
      success: true,
      data: keys,
      count: keys.length
    });
  })
);

// Get specific encryption key
router.get('/:keyId',
  readLimiter,
  ...requireRead('/keys'),
  asyncHandler(async (req, res) => {
    const { keyId } = req.params;
    const actor = req.user?.username || req.user?.id || 'service';

    const key = await keyService.getKey(keyId, actor);

    if (!key) {
      throw new AppError('Encryption key not found', 404, 'NOT_FOUND');
    }

    res.json({
      success: true,
      data: key
    });
  })
);

// Generate new encryption key
router.post('/generate',
  strictLimiter,
  ...requireWrite('/keys'),
  asyncHandler(async (req, res) => {
    const actor = req.user?.username || req.user?.id || 'service';

    // Validate input
    const { error, value } = createKeySchema.validate(req.body);
    if (error) {
      throw new AppError(error.details[0].message, 400, 'VALIDATION_ERROR');
    }

    const key = await keyService.createKey(value, actor);

    res.status(201).json({
      success: true,
      data: key,
      message: 'Encryption key generated successfully'
    });
  })
);

// Encrypt data (transit encryption)
router.post('/encrypt',
  cryptoLimiter,
  ...requireWrite('/keys'),
  asyncHandler(async (req, res) => {
    const actor = req.user?.username || req.user?.id || 'service';

    // Validate input
    const { error, value } = encryptDataSchema.validate(req.body);
    if (error) {
      throw new AppError(error.details[0].message, 400, 'VALIDATION_ERROR');
    }

    const { keyId, plaintext } = value;

    // Get decrypted key
    const dek = await keyService.getDecryptedKey(keyId);

    // Encrypt data
    const { encryptedData, iv, authTag } = encryptionService.encrypt(plaintext, dek);

    res.json({
      success: true,
      data: {
        keyId,
        ciphertext: encryptedData,
        iv,
        authTag,
        algorithm: 'aes-256-gcm'
      }
    });
  })
);

// Decrypt data (transit decryption)
router.post('/decrypt',
  cryptoLimiter,
  ...requireRead('/keys'),
  asyncHandler(async (req, res) => {
    const actor = req.user?.username || req.user?.id || 'service';

    // Validate input
    const { error, value } = decryptDataSchema.validate(req.body);
    if (error) {
      throw new AppError(error.details[0].message, 400, 'VALIDATION_ERROR');
    }

    const { keyId, ciphertext, iv, authTag } = value;

    // Get decrypted key
    const dek = await keyService.getDecryptedKey(keyId);

    // Decrypt data
    const plaintext = encryptionService.decrypt(ciphertext, iv, authTag, dek);

    res.json({
      success: true,
      data: {
        keyId,
        plaintext
      }
    });
  })
);

// Rotate key
router.post('/:keyId/rotate',
  strictLimiter,
  ...requireWrite('/keys'),
  asyncHandler(async (req, res) => {
    const { keyId } = req.params;
    const actor = req.user?.username || req.user?.id || 'service';

    const newKey = await keyService.rotateKey(keyId, actor);

    res.json({
      success: true,
      data: newKey,
      message: 'Key rotated successfully'
    });
  })
);

// Revoke key
router.delete('/:keyId',
  strictLimiter,
  ...requireDelete('/keys'),
  asyncHandler(async (req, res) => {
    const { keyId } = req.params;
    const actor = req.user?.username || req.user?.id || 'service';

    await keyService.revokeKey(keyId, actor);

    res.json({
      success: true,
      message: 'Key revoked successfully'
    });
  })
);

module.exports = router;
