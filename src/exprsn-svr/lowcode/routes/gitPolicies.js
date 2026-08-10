/**
 * ═══════════════════════════════════════════════════════════
 * Git Policies API Routes
 * Branch protection, code owners, and merge trains
 * ═══════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const GitPolicyService = require('../services/GitPolicyService');

// Initialize service
let policyService;
const getService = (req) => {
  if (!policyService) {
    const models = require('../models');
    policyService = new GitPolicyService(models);
  }
  return policyService;
};

const getUserId = (req) => {
  return req.user?.id || req.userId || null;
};

// ═══════════════════════════════════════════════════════════
// Repository Policy Routes
// ═══════════════════════════════════════════════════════════

/**
 * GET /api/git/policies/repositories/:repositoryId
 * Get all policies for a repository
 */
router.get('/repositories/:repositoryId', async (req, res) => {
  try {
    const service = getService(req);
    const policies = await service.getRepositoryPolicies(req.params.repositoryId);

    res.json({
      success: true,
      data: policies
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
 * POST /api/git/policies/repositories/:repositoryId
 * Set or update repository policy
 */
router.post('/repositories/:repositoryId', async (req, res) => {
  try {
    const service = getService(req);
    const userId = getUserId(req);
    const { repositoryId } = req.params;
    const { branchPattern, ...policyData } = req.body;

    if (!branchPattern) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Branch pattern is required'
      });
    }

    const policy = await service.setRepositoryPolicy(
      repositoryId,
      branchPattern,
      policyData,
      userId
    );

    res.json({
      success: true,
      data: policy
    });
  } catch (error) {
    res.status(error.message.includes('not found') ? 404 : 400).json({
      success: false,
      error: error.message.includes('not found') ? 'NOT_FOUND' : 'VALIDATION_ERROR',
      message: error.message
    });
  }
});

/**
 * GET /api/git/policies/repositories/:repositoryId/branches/:branchName
 * Get policy for specific branch
 */
router.get('/repositories/:repositoryId/branches/:branchName', async (req, res) => {
  try {
    const service = getService(req);
    const { repositoryId, branchName } = req.params;

    const policy = await service.getPolicyForBranch(repositoryId, branchName);

    res.json({
      success: true,
      data: policy
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
 * DELETE /api/git/policies/:policyId
 * Delete repository policy
 */
router.delete('/:policyId', async (req, res) => {
  try {
    const service = getService(req);
    const userId = getUserId(req);

    const result = await service.deleteRepositoryPolicy(req.params.policyId, userId);

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
 * POST /api/git/policies/check-compliance
 * Check if operation is allowed by policy
 */
router.post('/check-compliance', async (req, res) => {
  try {
    const service = getService(req);
    const { repositoryId, branchName, operation, context } = req.body;

    if (!repositoryId || !branchName || !operation) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'repositoryId, branchName, and operation are required'
      });
    }

    const result = await service.checkPolicyCompliance(
      repositoryId,
      branchName,
      operation,
      context || {}
    );

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
// Code Owners Routes
// ═══════════════════════════════════════════════════════════

/**
 * GET /api/git/policies/code-owners/:repositoryId
 * Get all code owner rules for repository
 */
router.get('/code-owners/:repositoryId', async (req, res) => {
  try {
    const service = getService(req);
    const codeOwners = await service.getCodeOwners(req.params.repositoryId);

    res.json({
      success: true,
      data: codeOwners
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
 * POST /api/git/policies/code-owners/:repositoryId
 * Set code owner rule
 */
router.post('/code-owners/:repositoryId', async (req, res) => {
  try {
    const service = getService(req);
    const userId = getUserId(req);
    const { repositoryId } = req.params;
    const { pathPattern, owners, teams, section, order } = req.body;

    if (!pathPattern || !owners || owners.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'pathPattern and owners are required'
      });
    }

    const codeOwner = await service.setCodeOwner(
      repositoryId,
      pathPattern,
      owners,
      { teams, section, order, userId }
    );

    res.json({
      success: true,
      data: codeOwner
    });
  } catch (error) {
    res.status(error.message.includes('not found') ? 404 : 400).json({
      success: false,
      error: error.message.includes('not found') ? 'NOT_FOUND' : 'VALIDATION_ERROR',
      message: error.message
    });
  }
});

/**
 * GET /api/git/policies/code-owners/:repositoryId/path
 * Get code owners for specific file path
 */
router.get('/code-owners/:repositoryId/path', async (req, res) => {
  try {
    const service = getService(req);
    const { repositoryId } = req.params;
    const { filePath } = req.query;

    if (!filePath) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'filePath query parameter is required'
      });
    }

    const owner = await service.getOwnersForPath(repositoryId, filePath);

    res.json({
      success: true,
      data: owner
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
 * DELETE /api/git/policies/code-owners/:codeOwnerId
 * Delete code owner rule
 */
router.delete('/code-owners/:codeOwnerId', async (req, res) => {
  try {
    const service = getService(req);
    const userId = getUserId(req);

    const result = await service.deleteCodeOwner(req.params.codeOwnerId, userId);

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
 * GET /api/git/policies/code-owners/:repositoryId/codeowners-file
 * Generate CODEOWNERS file content
 */
router.get('/code-owners/:repositoryId/codeowners-file', async (req, res) => {
  try {
    const service = getService(req);
    const content = await service.generateCodeOwnersFile(req.params.repositoryId);

    if (!content) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'No code owners defined'
      });
    }

    res.setHeader('Content-Type', 'text/plain');
    res.send(content);
  } catch (error) {
    res.status(error.message.includes('not found') ? 404 : 500).json({
      success: false,
      error: error.message.includes('not found') ? 'NOT_FOUND' : 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

// ═══════════════════════════════════════════════════════════
// Merge Train Routes
// ═══════════════════════════════════════════════════════════

/**
 * GET /api/git/policies/merge-train/:repositoryId/:targetBranch
 * Get merge train for branch
 */
router.get('/merge-train/:repositoryId/:targetBranch', async (req, res) => {
  try {
    const service = getService(req);
    const { repositoryId, targetBranch } = req.params;

    const train = await service.getMergeTrain(repositoryId, targetBranch);

    res.json({
      success: true,
      data: train
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
 * POST /api/git/policies/merge-train
 * Add PR to merge train
 */
router.post('/merge-train', async (req, res) => {
  try {
    const service = getService(req);
    const userId = getUserId(req);
    const { repositoryId, pullRequestId, targetBranch } = req.body;

    if (!repositoryId || !pullRequestId || !targetBranch) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'repositoryId, pullRequestId, and targetBranch are required'
      });
    }

    const entry = await service.addToMergeTrain(
      repositoryId,
      pullRequestId,
      targetBranch,
      userId
    );

    res.status(201).json({
      success: true,
      data: entry
    });
  } catch (error) {
    res.status(error.message.includes('not found') ? 404 : 400).json({
      success: false,
      error: error.message.includes('not found') ? 'NOT_FOUND' : 'VALIDATION_ERROR',
      message: error.message
    });
  }
});

/**
 * PUT /api/git/policies/merge-train/:entryId/complete
 * Complete merge train entry
 */
router.put('/merge-train/:entryId/complete', async (req, res) => {
  try {
    const service = getService(req);
    const userId = getUserId(req);
    const { status, errorMessage } = req.body;

    if (!status) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'status is required'
      });
    }

    const entry = await service.completeMergeTrainEntry(
      req.params.entryId,
      status,
      errorMessage,
      userId
    );

    res.json({
      success: true,
      data: entry
    });
  } catch (error) {
    res.status(error.message.includes('not found') ? 404 : 400).json({
      success: false,
      error: error.message.includes('not found') ? 'NOT_FOUND' : 'VALIDATION_ERROR',
      message: error.message
    });
  }
});

/**
 * DELETE /api/git/policies/merge-train/:entryId
 * Remove from merge train
 */
router.delete('/merge-train/:entryId', async (req, res) => {
  try {
    const service = getService(req);
    const userId = getUserId(req);

    const result = await service.removeFromMergeTrain(req.params.entryId, userId);

    res.json(result);
  } catch (error) {
    res.status(error.message.includes('not found') ? 404 : 500).json({
      success: false,
      error: error.message.includes('not found') ? 'NOT_FOUND' : 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

module.exports = router;
