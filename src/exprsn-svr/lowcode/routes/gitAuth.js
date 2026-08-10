/**
 * ═══════════════════════════════════════════════════════════
 * Git Auth API Routes
 * SSH keys, Personal Access Tokens, and OAuth apps
 * ═══════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const GitAuthService = require('../services/GitAuthService');

// Initialize service
let authService;
const getService = (req) => {
  if (!authService) {
    const models = require('../models');
    authService = new GitAuthService(models);
  }
  return authService;
};

const getUserId = (req) => {
  return req.user?.id || req.userId || null;
};

// ═══════════════════════════════════════════════════════════
// SSH Key Routes
// ═══════════════════════════════════════════════════════════

/**
 * GET /api/git/auth/ssh-keys
 * Get all SSH keys for current user
 */
router.get('/ssh-keys', async (req, res) => {
  try {
    const service = getService(req);
    const userId = getUserId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'Authentication required'
      });
    }

    const keys = await service.getSSHKeys(userId);

    res.json({
      success: true,
      data: keys
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

/**
 * POST /api/git/auth/ssh-keys
 * Add SSH key for current user
 */
router.post('/ssh-keys', async (req, res) => {
  try {
    const service = getService(req);
    const userId = getUserId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'Authentication required'
      });
    }

    const { title, publicKey, keyType, expiresAt } = req.body;

    if (!title || !publicKey) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Title and publicKey are required'
      });
    }

    const key = await service.addSSHKey(userId, {
      title,
      publicKey,
      keyType: keyType || 'rsa',
      expiresAt
    });

    res.status(201).json({
      success: true,
      data: key
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: error.message
    });
  }
});

/**
 * DELETE /api/git/auth/ssh-keys/:id
 * Delete SSH key
 */
router.delete('/ssh-keys/:id', async (req, res) => {
  try {
    const service = getService(req);
    const userId = getUserId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'Authentication required'
      });
    }

    const result = await service.deleteSSHKey(req.params.id, userId);

    res.json(result);
  } catch (error) {
    res.status(error.message.includes('not found') ? 404 : 500).json({
      success: false,
      error: error.message.includes('not found') ? 'NOT_FOUND' : 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

/**
 * POST /api/git/auth/ssh-keys/verify
 * Verify SSH key (internal use)
 */
router.post('/ssh-keys/verify', async (req, res) => {
  try {
    const service = getService(req);
    const { fingerprint } = req.body;

    if (!fingerprint) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Fingerprint is required'
      });
    }

    const result = await service.verifySSHKey(fingerprint);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

// ═══════════════════════════════════════════════════════════
// Personal Access Token Routes
// ═══════════════════════════════════════════════════════════

/**
 * GET /api/git/auth/tokens
 * Get all PATs for current user
 */
router.get('/tokens', async (req, res) => {
  try {
    const service = getService(req);
    const userId = getUserId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'Authentication required'
      });
    }

    const tokens = await service.getPATs(userId);

    res.json({
      success: true,
      data: tokens
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

/**
 * POST /api/git/auth/tokens
 * Generate new Personal Access Token
 */
router.post('/tokens', async (req, res) => {
  try {
    const service = getService(req);
    const userId = getUserId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'Authentication required'
      });
    }

    const { name, scopes, expiresAt } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Token name is required'
      });
    }

    const result = await service.generatePAT(userId, {
      name,
      scopes: scopes || ['read_repository', 'write_repository'],
      expiresAt
    });

    res.status(201).json({
      success: true,
      data: result,
      message: 'Token created. Save it now - you won\'t see it again!'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

/**
 * PUT /api/git/auth/tokens/:id/revoke
 * Revoke Personal Access Token
 */
router.put('/tokens/:id/revoke', async (req, res) => {
  try {
    const service = getService(req);
    const userId = getUserId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'Authentication required'
      });
    }

    const result = await service.revokePAT(req.params.id, userId);

    res.json(result);
  } catch (error) {
    res.status(error.message.includes('not found') ? 404 : 500).json({
      success: false,
      error: error.message.includes('not found') ? 'NOT_FOUND' : 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

/**
 * DELETE /api/git/auth/tokens/:id
 * Delete Personal Access Token
 */
router.delete('/tokens/:id', async (req, res) => {
  try {
    const service = getService(req);
    const userId = getUserId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'Authentication required'
      });
    }

    const result = await service.deletePAT(req.params.id, userId);

    res.json(result);
  } catch (error) {
    res.status(error.message.includes('not found') ? 404 : 500).json({
      success: false,
      error: error.message.includes('not found') ? 'NOT_FOUND' : 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

/**
 * POST /api/git/auth/tokens/verify
 * Verify Personal Access Token (internal use)
 */
router.post('/tokens/verify', async (req, res) => {
  try {
    const service = getService(req);
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Token is required'
      });
    }

    const result = await service.verifyPAT(token);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

// ═══════════════════════════════════════════════════════════
// OAuth Application Routes
// ═══════════════════════════════════════════════════════════

/**
 * GET /api/git/auth/oauth/apps
 * Get all OAuth applications for current user
 */
router.get('/oauth/apps', async (req, res) => {
  try {
    const service = getService(req);
    const userId = getUserId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'Authentication required'
      });
    }

    const apps = await service.getOAuthApps(userId);

    res.json({
      success: true,
      data: apps
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

/**
 * GET /api/git/auth/oauth/apps/:id
 * Get OAuth application by ID
 */
router.get('/oauth/apps/:id', async (req, res) => {
  try {
    const service = getService(req);
    const userId = getUserId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'Authentication required'
      });
    }

    const app = await service.getOAuthApp(req.params.id, userId);

    res.json({
      success: true,
      data: app
    });
  } catch (error) {
    res.status(error.message.includes('not found') ? 404 : 500).json({
      success: false,
      error: error.message.includes('not found') ? 'NOT_FOUND' : 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

/**
 * POST /api/git/auth/oauth/register
 * Register new OAuth application
 */
router.post('/oauth/register', async (req, res) => {
  try {
    const service = getService(req);
    const userId = getUserId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'Authentication required'
      });
    }

    const {
      name,
      description,
      redirectUris,
      scopes,
      logoUrl,
      homepageUrl,
      privacyPolicyUrl,
      termsOfServiceUrl
    } = req.body;

    if (!name || !redirectUris || redirectUris.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Name and redirect URIs are required'
      });
    }

    const result = await service.registerOAuthApp(userId, req.body);

    res.status(201).json({
      success: true,
      data: result,
      message: 'Application registered. Save the client secret - you won\'t see it again!'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

/**
 * PUT /api/git/auth/oauth/apps/:id
 * Update OAuth application
 */
router.put('/oauth/apps/:id', async (req, res) => {
  try {
    const service = getService(req);
    const userId = getUserId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'Authentication required'
      });
    }

    const app = await service.updateOAuthApp(req.params.id, userId, req.body);

    res.json({
      success: true,
      data: app
    });
  } catch (error) {
    res.status(error.message.includes('not found') ? 404 : 500).json({
      success: false,
      error: error.message.includes('not found') ? 'NOT_FOUND' : 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

/**
 * POST /api/git/auth/oauth/apps/:id/regenerate-secret
 * Regenerate OAuth client secret
 */
router.post('/oauth/apps/:id/regenerate-secret', async (req, res) => {
  try {
    const service = getService(req);
    const userId = getUserId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'Authentication required'
      });
    }

    const result = await service.regenerateClientSecret(req.params.id, userId);

    res.json({
      success: true,
      data: result,
      message: 'Client secret regenerated. Save it now - you won\'t see it again!'
    });
  } catch (error) {
    res.status(error.message.includes('not found') ? 404 : 500).json({
      success: false,
      error: error.message.includes('not found') ? 'NOT_FOUND' : 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

/**
 * DELETE /api/git/auth/oauth/apps/:id
 * Delete OAuth application
 */
router.delete('/oauth/apps/:id', async (req, res) => {
  try {
    const service = getService(req);
    const userId = getUserId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'Authentication required'
      });
    }

    const result = await service.deleteOAuthApp(req.params.id, userId);

    res.json(result);
  } catch (error) {
    res.status(error.message.includes('not found') ? 404 : 500).json({
      success: false,
      error: error.message.includes('not found') ? 'NOT_FOUND' : 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

/**
 * POST /api/git/auth/oauth/verify
 * Verify OAuth client credentials (internal use)
 */
router.post('/oauth/verify', async (req, res) => {
  try {
    const service = getService(req);
    const { clientId, clientSecret } = req.body;

    if (!clientId || !clientSecret) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Client ID and secret are required'
      });
    }

    const result = await service.verifyOAuthClient(clientId, clientSecret);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

// ═══════════════════════════════════════════════════════════
// Statistics Routes
// ═══════════════════════════════════════════════════════════

/**
 * GET /api/git/auth/stats
 * Get authentication statistics for current user
 */
router.get('/stats', async (req, res) => {
  try {
    const service = getService(req);
    const userId = getUserId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'Authentication required'
      });
    }

    const stats = await service.getUserAuthStats(userId);

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

module.exports = router;
