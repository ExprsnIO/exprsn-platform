/**
 * Artifact Export/Import Routes
 *
 * API endpoints for exporting artifacts to Git and importing from Git
 */

const express = require('express');
const router = express.Router();
const { asyncHandler } = require('@exprsn/shared');
const ArtifactExportService = require('../services/ArtifactExportService');
const ArtifactImportService = require('../services/ArtifactImportService');

/**
 * Export single artifact to Git repository
 * POST /lowcode/api/artifacts/export
 */
router.post('/export',
  asyncHandler(async (req, res) => {
    const { artifactType, artifactId, repositoryId } = req.body;

    if (!artifactType || !artifactId || !repositoryId) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'artifactType, artifactId, and repositoryId are required'
      });
    }

    const result = await ArtifactExportService.exportArtifact(
      artifactType,
      artifactId,
      repositoryId
    );

    res.json({
      success: true,
      data: result
    });
  })
);

/**
 * Export entire application to Git repository
 * POST /lowcode/api/artifacts/export-application
 */
router.post('/export-application',
  asyncHandler(async (req, res) => {
    const { applicationId, repositoryId } = req.body;

    if (!applicationId || !repositoryId) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'applicationId and repositoryId are required'
      });
    }

    const result = await ArtifactExportService.exportApplication(
      applicationId,
      repositoryId
    );

    res.json({
      success: result.success,
      data: {
        exportedFiles: result.exportedFiles.length,
        errors: result.errors.length,
        files: result.exportedFiles,
        errorDetails: result.errors
      }
    });
  })
);

/**
 * Generate repository files (.gitignore, README)
 * POST /lowcode/api/artifacts/generate-repo-files
 */
router.post('/generate-repo-files',
  asyncHandler(async (req, res) => {
    const { repositoryId, applicationId } = req.body;

    if (!repositoryId) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'repositoryId is required'
      });
    }

    const results = {};

    results.gitignore = await ArtifactExportService.generateGitignore(repositoryId);

    if (applicationId) {
      results.readme = await ArtifactExportService.generateReadme(repositoryId, applicationId);
    }

    res.json({
      success: true,
      data: results
    });
  })
);

/**
 * Import single artifact from Git repository
 * POST /lowcode/api/artifacts/import
 */
router.post('/import',
  asyncHandler(async (req, res) => {
    const { repositoryId, relativePath, overwrite, createNew } = req.body;

    if (!repositoryId || !relativePath) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'repositoryId and relativePath are required'
      });
    }

    const result = await ArtifactImportService.importArtifact(
      repositoryId,
      relativePath,
      { overwrite, createNew }
    );

    if (result.conflict) {
      return res.status(409).json({
        success: false,
        error: 'CONFLICT',
        message: 'Artifact has conflicts',
        data: result
      });
    }

    res.json({
      success: true,
      data: result
    });
  })
);

/**
 * Import entire application from Git repository
 * POST /lowcode/api/artifacts/import-application
 */
router.post('/import-application',
  asyncHandler(async (req, res) => {
    const { repositoryId, applicationId, overwrite } = req.body;

    if (!repositoryId) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'repositoryId is required'
      });
    }

    const result = await ArtifactImportService.importApplication(
      repositoryId,
      applicationId,
      { overwrite }
    );

    res.json({
      success: result.success,
      data: {
        importedArtifacts: result.importedArtifacts.length,
        conflicts: result.conflicts.length,
        errors: result.errors.length,
        artifacts: result.importedArtifacts,
        conflictDetails: result.conflicts,
        errorDetails: result.errors
      }
    });
  })
);

/**
 * Get changed files for an application
 * GET /lowcode/api/artifacts/changed-files
 */
router.get('/changed-files',
  asyncHandler(async (req, res) => {
    const { repositoryId, applicationId } = req.query;

    if (!repositoryId || !applicationId) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'repositoryId and applicationId are required'
      });
    }

    const changedFiles = await ArtifactImportService.getChangedFiles(
      repositoryId,
      applicationId
    );

    res.json({
      success: true,
      data: {
        changedFiles,
        count: changedFiles.length
      }
    });
  })
);

/**
 * Get artifact file content from Git
 * GET /lowcode/api/artifacts/file-content
 */
router.get('/file-content',
  asyncHandler(async (req, res) => {
    const { repositoryId, relativePath } = req.query;

    if (!repositoryId || !relativePath) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'repositoryId and relativePath are required'
      });
    }

    const GitRepository = require('../models/GitRepository');
    const fs = require('fs').promises;
    const path = require('path');

    const repository = await GitRepository.findByPk(repositoryId);
    if (!repository) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'Repository not found'
      });
    }

    const gitReposPath = path.join(__dirname, '../../../../git-repositories');
    const repoPath = path.join(gitReposPath, repository.name);
    const filePath = path.join(repoPath, relativePath);

    const fileContent = await fs.readFile(filePath, 'utf8');
    const fileData = JSON.parse(fileContent);

    res.json({
      success: true,
      data: fileData
    });
  })
);

module.exports = router;
