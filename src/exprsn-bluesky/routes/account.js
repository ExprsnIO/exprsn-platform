const express = require('express');
const router = express.Router();
const Joi = require('joi');
const { asyncHandler, validateCAToken, requirePermissions } = require('@exprsn/shared');
const didService = require('../services/didService');
const authIntegration = require('../services/integrations/authIntegration');
const workflowIntegration = require('../services/integrations/workflowIntegration');
const { Account, Repository } = require('../models');

// Validation schemas
const createAccountSchema = Joi.object({
  username: Joi.string().alphanum().min(3).max(30).required(),
  email: Joi.string().email().required(),
  exprsnUserId: Joi.string().uuid().required(),
  displayName: Joi.string().max(100),
  description: Joi.string().max(500)
});

// Create account
router.post('/',
  validateCAToken,
  requirePermissions({ write: true }),
  asyncHandler(async (req, res) => {
    const { error, value } = createAccountSchema.validate(req.body);

    if (error) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: error.details[0].message
      });
    }

    // Check if account already exists
    const existing = await Account.findOne({
      where: { exprsnUserId: value.exprsnUserId }
    });

    if (existing) {
      return res.status(409).json({
        success: false,
        error: 'ACCOUNT_EXISTS',
        message: 'Account already exists for this user'
      });
    }

    // Create account and repository
    const { account, repository } = await didService.createAccount(value);

    // Trigger workflow
    await workflowIntegration.onAccountCreated({
      did: account.did,
      handle: account.handle,
      exprsnUserId: account.exprsnUserId
    });

    res.status(201).json({
      success: true,
      data: {
        id: account.id,
        did: account.did,
        handle: account.handle,
        displayName: account.displayName,
        status: account.status
      }
    });
  })
);

// Get account by DID
router.get('/:did',
  asyncHandler(async (req, res) => {
    const { did } = req.params;

    const account = await Account.findOne({
      where: { did },
      include: [{
        model: Repository,
        as: 'repository'
      }],
      attributes: {
        exclude: ['privateKey', 'recoveryKey']
      }
    });

    if (!account) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'Account not found'
      });
    }

    res.json({
      success: true,
      data: account
    });
  })
);

// Update account
router.put('/:did',
  validateCAToken,
  requirePermissions({ update: true }),
  asyncHandler(async (req, res) => {
    const { did } = req.params;
    const { displayName, description, avatarCid, bannerCid } = req.body;

    const account = await Account.findOne({ where: { did } });

    if (!account) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'Account not found'
      });
    }

    await account.update({
      ...(displayName && { displayName }),
      ...(description && { description }),
      ...(avatarCid && { avatarCid }),
      ...(bannerCid && { bannerCid })
    });

    res.json({
      success: true,
      data: account
    });
  })
);

// Delete account (soft delete)
router.delete('/:did',
  validateCAToken,
  requirePermissions({ delete: true }),
  asyncHandler(async (req, res) => {
    const { did } = req.params;

    const account = await Account.findOne({ where: { did } });

    if (!account) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'Account not found'
      });
    }

    await account.update({ status: 'deleted' });

    res.json({
      success: true,
      message: 'Account deleted'
    });
  })
);

module.exports = router;
