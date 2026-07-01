/**
 * ═══════════════════════════════════════════════════════════
 * Word Lists Routes
 * Admin API for reusable allow/deny word lists consumed by the
 * rule engine. Stored in moderator_config under key
 * `wordlist_<name>` with value `{ words:[...], mode:'deny'|'allow' }`.
 * ═══════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const { ModeratorConfig } = require('../models/sequelize-index');
const logger = require('../src/utils/logger');
const requireAdmin = require('../src/middleware/requireAdmin');

// Word lists are moderation policy — admin-only (read + write).
router.use(requireAdmin);

const KEY_PREFIX = 'wordlist_';
const NAME_PATTERN = /^[a-z0-9_]+$/;

// Invalidate the rule engine's in-memory word-list cache after a change.
function clearWordListCache() {
  try {
    require('../services/ruleEngineService').clearWordListCache();
  } catch (_) {
    // Cache invalidation is best-effort; engine reloads lazily on next eval.
  }
}

// Normalize a stored config value into a { words, mode } shape.
function normalizeList(value) {
  const v = value || {};
  return {
    words: Array.isArray(v.words) ? v.words : [],
    mode: v.mode === 'allow' ? 'allow' : 'deny'
  };
}

/**
 * GET /api/wordlists
 * Enumerate all word lists
 */
router.get('/', async (req, res) => {
  try {
    const { Op } = require('sequelize');
    const rows = await ModeratorConfig.findAll({
      where: { key: { [Op.like]: `${KEY_PREFIX}%` } }
    });

    const lists = rows.map((row) => {
      const name = row.key.slice(KEY_PREFIX.length);
      const { words, mode } = normalizeList(row.value);
      return { name, words, mode, count: words.length };
    });

    res.json({
      success: true,
      lists
    });
  } catch (error) {
    logger.error('Failed to list word lists', { error: error.message });
    res.status(500).json({
      error: 'FETCH_FAILED',
      message: error.message
    });
  }
});

/**
 * GET /api/wordlists/:name
 * Get a specific word list
 */
router.get('/:name', async (req, res) => {
  try {
    const { name } = req.params;

    if (!NAME_PATTERN.test(name)) {
      return res.status(400).json({
        error: 'INVALID_REQUEST',
        message: 'Invalid list name. Use lowercase letters, digits and underscores only.'
      });
    }

    const value = await ModeratorConfig.getConfig(`${KEY_PREFIX}${name}`, null);

    if (value === null) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: 'Word list not found'
      });
    }

    const { words, mode } = normalizeList(value);

    res.json({
      success: true,
      list: { name, words, mode }
    });
  } catch (error) {
    logger.error('Failed to get word list', { error: error.message });
    res.status(500).json({
      error: 'FETCH_FAILED',
      message: error.message
    });
  }
});

/**
 * PUT /api/wordlists/:name
 * Upsert a word list
 */
router.put('/:name', async (req, res) => {
  try {
    const { name } = req.params;
    const { words, mode } = req.body;

    if (!NAME_PATTERN.test(name)) {
      return res.status(400).json({
        error: 'INVALID_REQUEST',
        message: 'Invalid list name. Use lowercase letters, digits and underscores only.'
      });
    }

    if (!Array.isArray(words)) {
      return res.status(400).json({
        error: 'INVALID_REQUEST',
        message: 'words must be an array of strings'
      });
    }

    if (mode !== undefined && mode !== 'deny' && mode !== 'allow') {
      return res.status(400).json({
        error: 'INVALID_REQUEST',
        message: "mode must be 'deny' or 'allow'"
      });
    }

    const list = { words, mode: mode === 'allow' ? 'allow' : 'deny' };

    await ModeratorConfig.setConfig(`${KEY_PREFIX}${name}`, list, 'advanced', req.userId);

    clearWordListCache();

    logger.info('Word list saved', { name, count: words.length });

    res.json({
      success: true,
      list: { name, words: list.words, mode: list.mode }
    });
  } catch (error) {
    logger.error('Failed to save word list', { error: error.message });
    res.status(500).json({
      error: 'SAVE_FAILED',
      message: error.message
    });
  }
});

/**
 * DELETE /api/wordlists/:name
 * Delete a word list
 */
router.delete('/:name', async (req, res) => {
  try {
    const { name } = req.params;

    if (!NAME_PATTERN.test(name)) {
      return res.status(400).json({
        error: 'INVALID_REQUEST',
        message: 'Invalid list name. Use lowercase letters, digits and underscores only.'
      });
    }

    await ModeratorConfig.destroy({ where: { key: `${KEY_PREFIX}${name}` } });

    clearWordListCache();

    logger.info('Word list deleted', { name });

    res.json({
      success: true,
      message: 'Word list deleted successfully'
    });
  } catch (error) {
    logger.error('Failed to delete word list', { error: error.message });
    res.status(500).json({
      error: 'DELETE_FAILED',
      message: error.message
    });
  }
});

module.exports = router;
