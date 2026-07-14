/**
 * ═══════════════════════════════════════════════════════════════════════
 * Exprsn Timeline - Interactions Routes
 * ═══════════════════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const interactionService = require('../services/interactionService');
const relationshipService = require('../services/relationshipService');
const heraldService = require('../services/heraldService');
const { Post } = require('../models');
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

    // FEAT-011 W1 (mirror of the /api/posts like route): reject when blocked
    // either way. Single pairwise check on a write path.
    const post = await Post.findByPk(id, { attributes: ['id', 'userId'] });
    if (post && post.userId !== userId
        && await relationshipService.isBlockedEitherWay(userId, post.userId)) {
      return res.status(403).json({ error: 'You cannot interact with this user' });
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

    // FEAT-011 W3 (mirror of the /api/posts repost route): reject when blocked
    // either way.
    const post = await Post.findByPk(id, { attributes: ['id', 'userId'] });
    if (post && post.userId !== userId
        && await relationshipService.isBlockedEitherWay(userId, post.userId)) {
      return res.status(403).json({ error: 'You cannot interact with this user' });
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

    // FEAT-011 W4: reject the follow when blocked either way (contact rejection).
    if (userId !== id
        && await relationshipService.isBlockedEitherWay(userId, id)) {
      return res.status(403).json({ error: 'You cannot follow this user' });
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

/**
 * ─────────────────────────────────────────────────────────────────────
 * Block / Mute (FEAT-011)
 *
 * The actor is ALWAYS req.userId — never a body value. Self-block/self-mute
 * returns 400 (the DB CHECK is the backstop). List endpoints return the
 * caller's OWN OUTGOING edges only; there is NO endpoint that reveals who
 * blocked the caller (ADR §5).
 * ─────────────────────────────────────────────────────────────────────
 */

/**
 * POST /api/interactions/users/:id/block - Block a user (breaks follows both ways)
 */
router.post('/users/:id/block', async (req, res) => {
  try {
    const targetId = req.params.id;
    const userId = req.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    if (userId === targetId) {
      return res.status(400).json({ error: 'Cannot block yourself' });
    }

    const relationship = await relationshipService.block(userId, targetId, {
      reason: req.body?.reason ?? null
    });

    res.status(201).json({ relationship });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * DELETE /api/interactions/users/:id/block - Unblock a user (does NOT restore follows)
 */
router.delete('/users/:id/block', async (req, res) => {
  try {
    const targetId = req.params.id;
    const userId = req.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    await relationshipService.unblock(userId, targetId);

    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * POST /api/interactions/users/:id/mute - Mute a user (one-way, silent; optional expiresAt)
 */
router.post('/users/:id/mute', async (req, res) => {
  try {
    const targetId = req.params.id;
    const userId = req.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    if (userId === targetId) {
      return res.status(400).json({ error: 'Cannot mute yourself' });
    }

    let expiresAt = null;
    if (req.body?.expiresAt) {
      const parsed = new Date(req.body.expiresAt);
      if (Number.isNaN(parsed.getTime())) {
        return res.status(400).json({ error: 'Invalid expiresAt' });
      }
      expiresAt = parsed;
    }

    const relationship = await relationshipService.mute(userId, targetId, {
      expiresAt,
      reason: req.body?.reason ?? null
    });

    res.status(201).json({ relationship });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * DELETE /api/interactions/users/:id/mute - Unmute a user
 */
router.delete('/users/:id/mute', async (req, res) => {
  try {
    const targetId = req.params.id;
    const userId = req.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    await relationshipService.unmute(userId, targetId);

    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * GET /api/interactions/blocks - The caller's OWN outgoing block edges
 */
router.get('/blocks', async (req, res) => {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const relationships = await relationshipService.listRelationships(userId, { type: 'block' });

    res.json({ relationships });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * GET /api/interactions/mutes - The caller's OWN outgoing mute edges
 */
router.get('/mutes', async (req, res) => {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const relationships = await relationshipService.listRelationships(userId, { type: 'mute' });

    res.json({ relationships });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
