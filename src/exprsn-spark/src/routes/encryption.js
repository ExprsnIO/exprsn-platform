/**
 * ═══════════════════════════════════════════════════════════
 * Encryption Routes
 * End-to-End Encryption (E2EE) key management endpoints
 * ═══════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const Joi = require('joi');
const encryptionService = require('../services/encryptionService');
const { requireAuth } = require('../middleware/auth');
const logger = require('../utils/logger');

// Rate limiting for key operations
const rateLimit = require('express-rate-limit');

const keyGenerationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 key generations per 15 minutes
  message: 'Too many key generation attempts, please try again later'
});

const keyRotationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // 3 key rotations per hour
  message: 'Too many key rotation attempts, please try again later'
});

// ═══════════════════════════════════════════════════════════
// Validation Schemas
// ═══════════════════════════════════════════════════════════

const generateKeySchema = Joi.object({
  deviceId: Joi.string().min(1).max(255).required(),
  passwordHash: Joi.string().min(32).required()
});

const rotateKeySchema = Joi.object({
  oldPasswordHash: Joi.string().min(32).required(),
  newPasswordHash: Joi.string().min(32).required()
});

const storeMessageKeysSchema = Joi.object({
  recipientKeys: Joi.array().items(
    Joi.object({
      userId: Joi.string().uuid().required(),
      encryptedKey: Joi.string().required()
    })
  ).min(1).required()
});

// ═══════════════════════════════════════════════════════════
// Routes
// ═══════════════════════════════════════════════════════════

/**
 * POST /api/encryption/keys/generate
 * Generate a new RSA key pair for the current user's device
 */
router.post('/keys/generate',
  requireAuth,
  keyGenerationLimiter,
  async (req, res, next) => {
    try {
      // Validate request
      const { error, value } = generateKeySchema.validate(req.body);
      if (error) {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: error.details[0].message
        });
      }

      const { deviceId, passwordHash } = value;
      const userId = req.user.id;

      // Generate key pair
      const result = await encryptionService.generateKeyPair(
        userId,
        deviceId,
        passwordHash
      );

      logger.info('Encryption key generated', {
        userId,
        deviceId,
        keyId: result.keyId
      });

      res.status(201).json({
        success: true,
        data: {
          keyId: result.keyId,
          publicKey: result.publicKey,
          keyFingerprint: result.keyFingerprint,
          expiresAt: result.expiresAt
        }
      });

    } catch (error) {
      logger.error('Failed to generate encryption key', {
        userId: req.user.id,
        error: error.message
      });
      next(error);
    }
  }
);

/**
 * GET /api/encryption/keys/public/:userId
 * Get a user's public key for encrypting messages to them
 */
router.get('/keys/public/:userId',
  requireAuth,
  async (req, res, next) => {
    try {
      const { userId } = req.params;

      // Validate UUID
      if (!Joi.string().uuid().validate(userId).error) {
        const publicKey = await encryptionService.getPublicKey(userId);

        if (!publicKey) {
          return res.status(404).json({
            success: false,
            error: 'KEY_NOT_FOUND',
            message: 'No active public key found for this user'
          });
        }

        res.json({
          success: true,
          data: {
            userId,
            publicKey: publicKey.publicKey,
            keyFingerprint: publicKey.keyFingerprint,
            keyType: publicKey.keyType
          }
        });
      } else {
        res.status(400).json({
          success: false,
          error: 'INVALID_USER_ID',
          message: 'Invalid user ID format'
        });
      }

    } catch (error) {
      logger.error('Failed to get public key', {
        userId: req.params.userId,
        error: error.message
      });
      next(error);
    }
  }
);

/**
 * POST /api/encryption/keys/public/batch
 * Get multiple users' public keys in batch
 */
router.post('/keys/public/batch',
  requireAuth,
  async (req, res, next) => {
    try {
      const { userIds } = req.body;

      // Validate
      if (!Array.isArray(userIds) || userIds.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: 'userIds must be a non-empty array'
        });
      }

      if (userIds.length > 100) {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: 'Maximum 100 user IDs per request'
        });
      }

      // Validate all are UUIDs
      const invalidIds = userIds.filter(id =>
        Joi.string().uuid().validate(id).error
      );

      if (invalidIds.length > 0) {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: 'Invalid user ID format',
          invalidIds
        });
      }

      const publicKeys = await encryptionService.getBatchPublicKeys(userIds);

      res.json({
        success: true,
        data: publicKeys
      });

    } catch (error) {
      logger.error('Failed to get batch public keys', {
        error: error.message
      });
      next(error);
    }
  }
);

/**
 * GET /api/encryption/keys/my-keys
 * Get all encryption keys for the current user (all devices)
 */
router.get('/keys/my-keys',
  requireAuth,
  async (req, res, next) => {
    try {
      const userId = req.user.id;

      const keys = await encryptionService.getUserKeys(userId);

      res.json({
        success: true,
        data: keys
      });

    } catch (error) {
      logger.error('Failed to get user keys', {
        userId: req.user.id,
        error: error.message
      });
      next(error);
    }
  }
);

/**
 * PUT /api/encryption/keys/:keyId/rotate
 * Rotate encryption key (e.g., after password change)
 */
router.put('/keys/:keyId/rotate',
  requireAuth,
  keyRotationLimiter,
  async (req, res, next) => {
    try {
      const { keyId } = req.params;
      const userId = req.user.id;

      // Validate request
      const { error, value } = rotateKeySchema.validate(req.body);
      if (error) {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: error.details[0].message
        });
      }

      // Validate key ownership
      const ownsKey = await encryptionService.validateKeyOwnership(keyId, userId);
      if (!ownsKey) {
        return res.status(403).json({
          success: false,
          error: 'FORBIDDEN',
          message: 'You do not own this key'
        });
      }

      // Get device ID from existing key
      const { EncryptionKey } = require('../models');
      const existingKey = await EncryptionKey.findByPk(keyId);

      if (!existingKey) {
        return res.status(404).json({
          success: false,
          error: 'KEY_NOT_FOUND',
          message: 'Key not found'
        });
      }

      const { oldPasswordHash, newPasswordHash } = value;

      // Rotate key
      const result = await encryptionService.rotateKey(
        userId,
        existingKey.deviceId,
        oldPasswordHash,
        newPasswordHash
      );

      logger.info('Encryption key rotated', {
        userId,
        oldKeyId: keyId,
        newKeyId: result.keyId
      });

      res.json({
        success: true,
        data: {
          keyId: result.keyId,
          publicKey: result.publicKey,
          keyFingerprint: result.keyFingerprint,
          expiresAt: result.expiresAt
        }
      });

    } catch (error) {
      logger.error('Failed to rotate encryption key', {
        userId: req.user.id,
        keyId: req.params.keyId,
        error: error.message
      });

      if (error.message === 'Invalid old password') {
        return res.status(401).json({
          success: false,
          error: 'INVALID_PASSWORD',
          message: error.message
        });
      }

      next(error);
    }
  }
);

/**
 * DELETE /api/encryption/keys/:keyId
 * Delete encryption key (logout/remove device)
 */
router.delete('/keys/:keyId',
  requireAuth,
  async (req, res, next) => {
    try {
      const { keyId } = req.params;
      const userId = req.user.id;

      // Validate key ownership
      const ownsKey = await encryptionService.validateKeyOwnership(keyId, userId);
      if (!ownsKey) {
        return res.status(403).json({
          success: false,
          error: 'FORBIDDEN',
          message: 'You do not own this key'
        });
      }

      // Get device ID
      const { EncryptionKey } = require('../models');
      const key = await EncryptionKey.findByPk(keyId);

      if (!key) {
        return res.status(404).json({
          success: false,
          error: 'KEY_NOT_FOUND',
          message: 'Key not found'
        });
      }

      // Delete keys for this device
      await encryptionService.deleteDeviceKeys(userId, key.deviceId);

      logger.info('Encryption key deleted', {
        userId,
        keyId,
        deviceId: key.deviceId
      });

      res.json({
        success: true,
        message: 'Encryption key deleted successfully'
      });

    } catch (error) {
      logger.error('Failed to delete encryption key', {
        userId: req.user.id,
        keyId: req.params.keyId,
        error: error.message
      });
      next(error);
    }
  }
);

/**
 * POST /api/encryption/messages/:messageId/keys
 * Store encrypted message keys for recipients
 */
router.post('/messages/:messageId/keys',
  requireAuth,
  async (req, res, next) => {
    try {
      const { messageId } = req.params;

      // Validate request
      const { error, value } = storeMessageKeysSchema.validate(req.body);
      if (error) {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: error.details[0].message
        });
      }

      // Verify user is the message sender
      const { Message } = require('../models');
      const message = await Message.findByPk(messageId);

      if (!message) {
        return res.status(404).json({
          success: false,
          error: 'MESSAGE_NOT_FOUND',
          message: 'Message not found'
        });
      }

      if (message.senderId !== req.user.id) {
        return res.status(403).json({
          success: false,
          error: 'FORBIDDEN',
          message: 'Only the message sender can store encryption keys'
        });
      }

      const { recipientKeys } = value;

      // Store keys
      await encryptionService.storeMessageKeys(messageId, recipientKeys);

      logger.info('Message keys stored', {
        messageId,
        recipientCount: recipientKeys.length
      });

      res.status(201).json({
        success: true,
        message: 'Message keys stored successfully'
      });

    } catch (error) {
      logger.error('Failed to store message keys', {
        messageId: req.params.messageId,
        error: error.message
      });
      next(error);
    }
  }
);

/**
 * GET /api/encryption/messages/:messageId/keys
 * Get encrypted message key for the current user
 */
router.get('/messages/:messageId/keys',
  requireAuth,
  async (req, res, next) => {
    try {
      const { messageId } = req.params;
      const userId = req.user.id;

      // Verify user has access to this message
      const { Message, Participant } = require('../models');
      const message = await Message.findByPk(messageId);

      if (!message) {
        return res.status(404).json({
          success: false,
          error: 'MESSAGE_NOT_FOUND',
          message: 'Message not found'
        });
      }

      // Check if user is a participant in the conversation
      const isParticipant = await Participant.findOne({
        where: {
          conversationId: message.conversationId,
          userId
        }
      });

      if (!isParticipant) {
        return res.status(403).json({
          success: false,
          error: 'FORBIDDEN',
          message: 'You are not a participant in this conversation'
        });
      }

      // Get encrypted message key
      const encryptedKey = await encryptionService.getMessageKey(messageId, userId);

      if (!encryptedKey) {
        return res.status(404).json({
          success: false,
          error: 'KEY_NOT_FOUND',
          message: 'No encryption key found for this message'
        });
      }

      res.json({
        success: true,
        data: {
          messageId,
          encryptedKey
        }
      });

    } catch (error) {
      logger.error('Failed to get message key', {
        messageId: req.params.messageId,
        userId: req.user.id,
        error: error.message
      });
      next(error);
    }
  }
);

module.exports = router;
