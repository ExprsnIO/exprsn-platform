const express = require('express');
const router = express.Router();
const Joi = require('joi');
const { asyncHandler } = require('@exprsn/shared');
const sessionService = require('../services/sessionService');
const authIntegration = require('../services/integrations/authIntegration');
const { Account } = require('../models');

// Validation schemas
const createSessionSchema = Joi.object({
  identifier: Joi.string().required(), // handle or email
  password: Joi.string().required()
});

/**
 * XRPC: Create session (login)
 * POST /xrpc/com.atproto.server.createSession
 */
router.post('/com.atproto.server.createSession', asyncHandler(async (req, res) => {
  const { error, value } = createSessionSchema.validate(req.body);

  if (error) {
    return res.status(400).json({
      error: 'InvalidRequest',
      message: error.details[0].message
    });
  }

  const { identifier, password } = value;

  // Authenticate with exprsn-auth
  const authResult = await authIntegration.authenticate(identifier, password);

  if (!authResult.success) {
    return res.status(401).json({
      error: 'AuthenticationFailed',
      message: 'Invalid credentials'
    });
  }

  // Find or create Bluesky account
  let account = await Account.findOne({
    where: { exprsnUserId: authResult.userId }
  });

  if (!account) {
    return res.status(404).json({
      error: 'AccountNotFound',
      message: 'Bluesky account not found. Please create one first.'
    });
  }

  // Create session
  const session = await sessionService.createSession(
    account.did,
    authResult.userId
  );

  res.json(session);
}));

/**
 * XRPC: Refresh session
 * POST /xrpc/com.atproto.server.refreshSession
 */
router.post('/com.atproto.server.refreshSession', asyncHandler(async (req, res) => {
  const refreshToken = req.headers['authorization']?.replace('Bearer ', '');

  if (!refreshToken) {
    return res.status(400).json({
      error: 'InvalidRequest',
      message: 'Refresh token required'
    });
  }

  try {
    const session = await sessionService.refreshSession(refreshToken);
    res.json(session);
  } catch (error) {
    return res.status(401).json({
      error: 'ExpiredToken',
      message: 'Refresh token expired or invalid'
    });
  }
}));

/**
 * XRPC: Get session
 * GET /xrpc/com.atproto.server.getSession
 */
router.get('/com.atproto.server.getSession', asyncHandler(async (req, res) => {
  const accessToken = req.headers['authorization']?.replace('Bearer ', '');

  if (!accessToken) {
    return res.status(401).json({
      error: 'AuthRequired',
      message: 'Authorization header required'
    });
  }

  try {
    const session = await sessionService.getSessionInfo(accessToken);
    res.json(session);
  } catch (error) {
    return res.status(401).json({
      error: 'InvalidToken',
      message: 'Invalid or expired token'
    });
  }
}));

/**
 * XRPC: Delete session (logout)
 * POST /xrpc/com.atproto.server.deleteSession
 */
router.post('/com.atproto.server.deleteSession', asyncHandler(async (req, res) => {
  const accessToken = req.headers['authorization']?.replace('Bearer ', '');

  if (!accessToken) {
    return res.status(400).json({
      error: 'InvalidRequest',
      message: 'Access token required'
    });
  }

  try {
    await sessionService.deleteSession(accessToken);
    res.json({ success: true });
  } catch (error) {
    return res.status(400).json({
      error: 'InvalidToken',
      message: 'Invalid token'
    });
  }
}));

module.exports = router;
