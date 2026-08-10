/**
 * ═══════════════════════════════════════════════════════════
 * HTML App Builder Routes Index
 * Aggregates all HTML-related API routes
 * ═══════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();

// Import HTML routes
const htmlProjectsRouter = require('./htmlProjects');
const htmlFilesRouter = require('./htmlFiles');
const htmlComponentsRouter = require('./htmlComponents');
const htmlLibrariesRouter = require('./htmlLibraries');

// Mount routes
router.use('/html-projects', htmlProjectsRouter);
router.use('/html-files', htmlFilesRouter);
router.use('/html-components', htmlComponentsRouter);
router.use('/html-libraries', htmlLibrariesRouter);

module.exports = router;
