/**
 * ═══════════════════════════════════════════════════════════════════════
 * Exprsn Timeline - Interactions Routes
 * ═══════════════════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const interactionService = require('../services/interactionService');
const heraldService = require('../services/heraldService');
const { requireToken } = require('../middleware/auth');

// All interaction routes need an authenticated user. requireToken validates the
// CA bearer and sets req.userId (matching the posts router); without it req.user
// is never populated and every handler 401s.
router.use(requireToken({ requiredPermissions: { read: true } }));

/**
 * POST /api/posts/:id/like - Like a post
 */
router.post('/:id/like', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const like = await interactionService.likePost(userId, id);

    res.status(201).json({ like });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * DELETE /api/posts/:id/like - Unlike a post
 */
router.delete('/:id/like', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    await interactionService.unlikePost(userId, id);

    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * POST /api/posts/:id/repost - Repost a post
 */
router.post('/:id/repost', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const repost = await interactionService.repostPost(userId, id);

    res.status(201).json({ repost });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * DELETE /api/posts/:id/repost - Undo repost
 */
router.delete('/:id/repost', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    await interactionService.undoRepost(userId, id);

    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * POST /api/posts/:id/bookmark - Bookmark a post
 */
router.post('/:id/bookmark', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const bookmark = await interactionService.bookmarkPost(userId, id);

    res.status(201).json({ bookmark });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * DELETE /api/posts/:id/bookmark - Remove bookmark
 */
router.delete('/:id/bookmark', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    await interactionService.removeBookmark(userId, id);

    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * POST /api/users/:id/follow - Follow a user
 */
router.post('/users/:id/follow', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const follow = await interactionService.followUser(userId, id);

    // Notify the followed user (in-app bell). Fire-and-forget.
    heraldService.notifyInteraction('follow', id, userId, {}).catch(() => {});

    res.status(201).json({ follow });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * GET /api/users/:id/follow - Whether the caller follows this user
 */
router.get('/users/:id/follow', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const following = await interactionService.isFollowing(userId, id);

    res.json({ following });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * DELETE /api/users/:id/follow - Unfollow a user
 */
router.delete('/users/:id/follow', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    await interactionService.unfollowUser(userId, id);

    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
