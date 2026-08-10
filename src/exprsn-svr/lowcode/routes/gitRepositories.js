/**
 * ═══════════════════════════════════════════════════════════
 * Git Repositories API Routes
 * Repository management endpoints
 * ═══════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const GitService = require('../services/GitService');
const logger = require('../../utils/logger');

/**
 * Create a new repository
 * POST /api/git/repositories
 */
router.post('/', async (req, res) => {
  try {
    const { name, description, visibility, applicationId, htmlProjectId } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Repository name is required'
      });
    }

    // In production, get from authenticated user
    const ownerId = req.user?.id || req.body.ownerId;

    const repository = await GitService.createRepository({
      name,
      description,
      visibility: visibility || 'private',
      ownerId,
      applicationId,
      htmlProjectId
    });

    res.status(201).json({
      success: true,
      data: repository
    });
  } catch (error) {
    logger.error('Failed to create repository:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

/**
 * List repositories
 * GET /api/git/repositories
 */
router.get('/', async (req, res) => {
  try {
    const { ownerId, applicationId, htmlProjectId, visibility, archived, limit, offset } = req.query;

    const result = await GitService.listRepositories({
      ownerId: ownerId || req.user?.id,
      applicationId,
      htmlProjectId,
      visibility,
      archived: archived === 'true',
      limit: parseInt(limit) || 50,
      offset: parseInt(offset) || 0
    });

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error('Failed to list repositories:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

/**
 * Get repository by ID or slug
 * GET /api/git/repositories/:identifier
 */
router.get('/:identifier', async (req, res) => {
  try {
    const repository = await GitService.getRepository(req.params.identifier);

    if (!repository) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'Repository not found'
      });
    }

    res.json({
      success: true,
      data: repository
    });
  } catch (error) {
    logger.error('Failed to get repository:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

/**
 * Archive repository
 * POST /api/git/repositories/:id/archive
 */
router.post('/:id/archive', async (req, res) => {
  try {
    await GitService.archiveRepository(req.params.id, true);

    res.json({
      success: true,
      message: 'Repository archived'
    });
  } catch (error) {
    logger.error('Failed to archive repository:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

/**
 * Unarchive repository
 * POST /api/git/repositories/:id/unarchive
 */
router.post('/:id/unarchive', async (req, res) => {
  try {
    await GitService.archiveRepository(req.params.id, false);

    res.json({
      success: true,
      message: 'Repository unarchived'
    });
  } catch (error) {
    logger.error('Failed to unarchive repository:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

/**
 * Delete repository
 * DELETE /api/git/repositories/:id
 */
router.delete('/:id', async (req, res) => {
  try {
    await GitService.deleteRepository(req.params.id);

    res.json({
      success: true,
      message: 'Repository deleted'
    });
  } catch (error) {
    logger.error('Failed to delete repository:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

/**
 * Fork repository
 * POST /api/git/repositories/:id/fork
 */
router.post('/:id/fork', async (req, res) => {
  try {
    const { name } = req.body;
    const ownerId = req.user?.id || req.body.ownerId;

    const repository = await GitService.cloneRepository(req.params.id, {
      name,
      ownerId
    });

    res.status(201).json({
      success: true,
      data: repository
    });
  } catch (error) {
    logger.error('Failed to fork repository:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

/**
 * List branches
 * GET /api/git/repositories/:id/branches
 */
router.get('/:id/branches', async (req, res) => {
  try {
    const branches = await GitService.listBranches(req.params.id);

    res.json({
      success: true,
      data: branches
    });
  } catch (error) {
    logger.error('Failed to list branches:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

/**
 * Create branch
 * POST /api/git/repositories/:id/branches
 */
router.post('/:id/branches', async (req, res) => {
  try {
    const { name, sourceBranch } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Branch name is required'
      });
    }

    const createdBy = req.user?.id || req.body.createdBy;

    const branch = await GitService.createBranch(req.params.id, {
      name,
      sourceBranch: sourceBranch || 'main',
      createdBy
    });

    res.status(201).json({
      success: true,
      data: branch
    });
  } catch (error) {
    logger.error('Failed to create branch:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

/**
 * Delete branch
 * DELETE /api/git/repositories/:id/branches/:branchName
 */
router.delete('/:id/branches/:branchName', async (req, res) => {
  try {
    await GitService.deleteBranch(req.params.id, req.params.branchName);

    res.json({
      success: true,
      message: 'Branch deleted'
    });
  } catch (error) {
    logger.error('Failed to delete branch:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

/**
 * Get commits
 * GET /api/git/repositories/:id/commits
 */
router.get('/:id/commits', async (req, res) => {
  try {
    const { branch, limit, offset } = req.query;

    const result = await GitService.getCommits(req.params.id, {
      branch,
      limit: parseInt(limit) || 50,
      offset: parseInt(offset) || 0
    });

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error('Failed to get commits:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

/**
 * Create commit
 * POST /api/git/repositories/:id/commits
 */
router.post('/:id/commits', async (req, res) => {
  try {
    const { branch, message, files, author } = req.body;

    if (!branch || !message || !files || files.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Branch, message, and files are required'
      });
    }

    const commit = await GitService.commit(req.params.id, {
      branch,
      message,
      files,
      author: author || {
        name: req.user?.name || 'Unknown',
        email: req.user?.email || 'unknown@exprsn.io',
        id: req.user?.id
      }
    });

    res.status(201).json({
      success: true,
      data: commit
    });
  } catch (error) {
    logger.error('Failed to create commit:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

/**
 * Get file tree
 * GET /api/git/repositories/:id/tree
 */
router.get('/:id/tree', async (req, res) => {
  try {
    const { ref, path } = req.query;

    const tree = await GitService.getTree(req.params.id, {
      ref: ref || 'main',
      path: path || ''
    });

    res.json({
      success: true,
      data: tree
    });
  } catch (error) {
    logger.error('Failed to get tree:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

/**
 * Get file content
 * GET /api/git/repositories/:id/files
 */
router.get('/:id/files', async (req, res) => {
  try {
    const { ref, path } = req.query;

    if (!path) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'File path is required'
      });
    }

    const file = await GitService.getFileContent(req.params.id, {
      ref: ref || 'main',
      path
    });

    res.json({
      success: true,
      data: file
    });
  } catch (error) {
    logger.error('Failed to get file content:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

/**
 * Get diff
 * GET /api/git/repositories/:id/diff
 */
router.get('/:id/diff', async (req, res) => {
  try {
    const { base, head, path } = req.query;

    if (!base || !head) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Base and head refs are required'
      });
    }

    const diff = await GitService.getDiff(req.params.id, {
      base,
      head,
      filePath: path
    });

    res.json({
      success: true,
      data: diff
    });
  } catch (error) {
    logger.error('Failed to get diff:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

/**
 * Merge branches
 * POST /api/git/repositories/:id/merge
 */
router.post('/:id/merge', async (req, res) => {
  try {
    const { sourceBranch, targetBranch, message } = req.body;

    if (!sourceBranch || !targetBranch) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Source and target branches are required'
      });
    }

    const mergedBy = req.user?.id || req.body.mergedBy;

    const result = await GitService.mergeBranches(req.params.id, {
      sourceBranch,
      targetBranch,
      message: message || `Merge ${sourceBranch} into ${targetBranch}`,
      mergedBy
    });

    if (!result.success) {
      return res.status(409).json({
        success: false,
        error: 'MERGE_CONFLICT',
        message: result.message,
        conflicts: result.conflicts
      });
    }

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error('Failed to merge branches:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

module.exports = router;
