/**
 * ═══════════════════════════════════════════════════════════════════════
 * Routes Index
 * ═══════════════════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();

const filesRouter = require('./files');
const directoriesRouter = require('./directories');
const shareRouter = require('./share');
const searchRouter = require('./search');
const storageRouter = require('./storage');
const healthRouter = require('./health');
const adminRouter = require('./admin');

// Mount routes
router.use('/files', filesRouter);
router.use('/directories', directoriesRouter);
router.use('/share', shareRouter);
router.use('/search', searchRouter);
router.use('/storage', storageRouter);
router.use('/admin', adminRouter);

// Health check routes
router.use('/health', healthRouter);

module.exports = router;
