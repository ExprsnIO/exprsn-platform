/**
 * ═══════════════════════════════════════════════════════════════════════
 * Exprsn Timeline - Interactions Routes
 * ═══════════════════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const interactionService = require('../services/interactionService');

/**
 * POST /api/posts/:id/like - Like a post
 */
router.post('/:id/like', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

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
    const userId = req.user?.id;

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
    const userId = req.user?.id;

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
    const userId = req.user?.id;

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
    const userId = req.user?.id;

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
    const userId = req.user?.id;

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
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const follow = await interactionService.followUser(userId, id);

    res.status(201).json({ follow });
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
    const userId = req.user?.id;

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
