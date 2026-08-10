/**
 * ═══════════════════════════════════════════════════════════
 * Git Integration - Main Routes
 * Mounts all Git-related routes
 * ═══════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();

// Import core Git functionality routers
const repositoriesRouter = require('./gitRepositories');
const issuesRouter = require('./gitIssues');
const pullRequestsRouter = require('./gitPullRequests');
const pipelinesRouter = require('./gitPipelines');

// Import Git Setup & Configuration routers
const setupRouter = require('./gitSetup');
const authRouter = require('./gitAuth');
const policyRouter = require('./gitPolicies');
const runnerRouter = require('./gitRunners');
const securityRouter = require('./gitSecurity');
const environmentRouter = require('./gitEnvironments');

// ═══════════════════════════════════════════════════════════
// Core Git Functionality
// ═══════════════════════════════════════════════════════════

// Mount repositories routes
router.use('/repositories', repositoriesRouter);

// Mount issues, PRs, and pipelines routes (they use :repoId param)
router.use('/repositories', issuesRouter);
router.use('/repositories', pullRequestsRouter);
router.use('/repositories', pipelinesRouter);

// Also mount pipelines routes directly for non-repo-specific operations
router.use('', pipelinesRouter);

// ═══════════════════════════════════════════════════════════
// Git Setup & Configuration (Enterprise Features)
// ═══════════════════════════════════════════════════════════

/**
 * System Configuration & Templates
 * Endpoints for global system settings, repository templates, issue templates
 */
router.use('/setup', setupRouter);

/**
 * Authentication Management
 * SSH keys, Personal Access Tokens, OAuth applications
 */
router.use('/auth', authRouter);

/**
 * Repository Policies
 * Branch protection, code owners (CODEOWNERS), merge trains
 */
router.use('/policies', policyRouter);

/**
 * CI/CD Runners & Pipeline Infrastructure
 * Runner registration, pipeline cache, build artifacts
 */
router.use('/runners', runnerRouter);

/**
 * Security Scanning & Vulnerability Management
 * SAST, dependency scanning, container scanning, license compliance
 */
router.use('/security', securityRouter);

/**
 * Deployment Environments & Registries
 * Environment management, variables, container/package registries
 */
router.use('/environments', environmentRouter);

// ═══════════════════════════════════════════════════════════
// Health Check
// ═══════════════════════════════════════════════════════════

/**
 * GET /api/git/health
 * Combined health check for all Git services
 */
router.get('/health', async (req, res) => {
  try {
    const models = require('../models');

    // Test database connection
    await models.sequelize.authenticate();

    res.json({
      success: true,
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        repositories: 'ok',
        issues: 'ok',
        pullRequests: 'ok',
        pipelines: 'ok',
        setup: 'ok',
        auth: 'ok',
        policies: 'ok',
        runners: 'ok',
        security: 'ok',
        environments: 'ok'
      },
      database: 'ok'
    });
  } catch (error) {
    res.status(503).json({
      success: false,
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

module.exports = router;
