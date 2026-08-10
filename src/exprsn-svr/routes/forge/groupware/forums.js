const express = require('express');
const router = express.Router();
const {  optionalAuth } = require('../../../middleware/auth');
const logger = require('../../../utils/logger');
const { sequelize } = require('../../../config/database');
const {
  ForumCategory,
  Forum,
  ForumThread,
  ForumPost
} = require('../../models/index');

// =============== FORUM CATEGORIES ===============

router.get('/categories', async (req, res) => {
  try {
    const categories = await ForumCategory.findAll({
      include: [{
        model: Forum,
        as: 'Forums',
        where: { isArchived: false },
        required: false
      }],
      order: [['position', 'ASC'], ['name', 'ASC']]
    });

    res.json({ success: true, categories });
  } catch (error) {
    logger.error('GET /forums/categories failed', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/categories',  async (req, res) => {
  try {
    const { name, slug, description, icon, color, position } = req.body;

    const category = await ForumCategory.create({
      name,
      slug,
      description,
      icon,
      color,
      position: position || 0
    });

    res.status(201).json({ success: true, category });
  } catch (error) {
    logger.error('POST /forums/categories failed', { error: error.message });
    res.status(400).json({ success: false, error: error.message });
  }
});

// =============== FORUMS ===============

router.get('/', async (req, res) => {
  try {
    const { categoryId, visibility } = req.query;

    const where = { isArchived: false };
    if (categoryId) where.categoryId = categoryId;
    if (visibility) where.visibility = visibility;

    const forums = await Forum.findAll({
      where,
      include: [{
        model: ForumCategory,
        as: 'Category',
        attributes: ['id', 'name', 'slug']
      }],
      order: [['position', 'ASC'], ['name', 'ASC']]
    });

    res.json({ success: true, forums });
  } catch (error) {
    logger.error('GET /forums failed', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/',  async (req, res) => {
  try {
    const {
      categoryId,
      name,
      slug,
      description,
      icon,
      position,
      visibility,
      requiresApproval,
      allowedRoles,
      isModerated,
      moderatorIds
    } = req.body;

    const forum = await Forum.create({
      categoryId,
      name,
      slug,
      description,
      icon,
      position: position || 0,
      visibility: visibility || 'public',
      requiresApproval: requiresApproval || false,
      allowedRoles: allowedRoles || [],
      isModerated: isModerated || false,
      moderatorIds: moderatorIds || []
    });

    // Update category forum count
    await sequelize.query(
      'UPDATE forum_categories SET forum_count = forum_count + 1 WHERE id = :categoryId',
      { replacements: { categoryId }, type: sequelize.QueryTypes.UPDATE }
    );

    res.status(201).json({ success: true, forum });
  } catch (error) {
    logger.error('POST /forums failed', { error: error.message });
    res.status(400).json({ success: false, error: error.message });
  }
});

router.get('/:idOrSlug', async (req, res) => {
  try {
    const { idOrSlug } = req.params;
    const { page = 1, limit = 20 } = req.query;

    const where = idOrSlug.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
      ? { id: idOrSlug }
      : { slug: idOrSlug };

    const forum = await Forum.findOne({
      where,
      include: [{
        model: ForumCategory,
        as: 'Category'
      }]
    });

    if (!forum) {
      return res.status(404).json({ success: false, error: 'Forum not found' });
    }

    // Get threads
    const offset = (page - 1) * limit;
    const { count, rows: threads } = await ForumThread.findAndCountAll({
      where: { forumId: forum.id, moderationStatus: 'approved' },
      limit: parseInt(limit),
      offset,
      order: [
        ['isPinned', 'DESC'],
        ['isSticky', 'DESC'],
        ['lastPostAt', 'DESC']
      ]
    });

    res.json({
      success: true,
      forum,
      threads,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    logger.error('GET /forums/:idOrSlug failed', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

// =============== THREADS ===============

router.post('/:forumId/threads',  async (req, res) => {
  try {
    const { forumId } = req.params;
    const { title, slug, tags, isPinned, isAnnouncement, content, contentFormat } = req.body;

    const forum = await Forum.findByPk(forumId);
    if (!forum) {
      return res.status(404).json({ success: false, error: 'Forum not found' });
    }

    // Check if forum is locked
    if (forum.isLocked) {
      return res.status(403).json({ success: false, error: 'Forum is locked' });
    }

    const transaction = await sequelize.transaction();

    try {
      // Create thread
      const thread = await ForumThread.create({
        forumId,
        title,
        slug,
        authorId: req.user.id,
        tags: tags || [],
        isPinned: isPinned || false,
        isAnnouncement: isAnnouncement || false,
        moderationStatus: forum.requiresApproval ? 'pending' : 'approved'
      }, { transaction });

      // Create first post
      const post = await ForumPost.create({
        threadId: thread.id,
        authorId: req.user.id,
        content,
        contentFormat: contentFormat || 'markdown',
        moderationStatus: forum.requiresApproval ? 'pending' : 'approved'
      }, { transaction });

      // Update thread stats
      await thread.update({
        postCount: 1,
        lastPostId: post.id,
        lastPostAt: new Date(),
        lastPostUserId: req.user.id
      }, { transaction });

      // Update forum stats
      await forum.increment({
        threadCount: 1,
        postCount: 1
      }, { transaction });

      await transaction.commit();

      res.status(201).json({ success: true, thread, post });
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  } catch (error) {
    logger.error('POST /forums/:forumId/threads failed', { error: error.message });
    res.status(400).json({ success: false, error: error.message });
  }
});

router.get('/:forumId/threads/:threadIdOrSlug', async (req, res) => {
  try {
    const { threadIdOrSlug } = req.params;
    const { page = 1, limit = 20 } = req.query;

    const where = threadIdOrSlug.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
      ? { id: threadIdOrSlug }
      : { slug: threadIdOrSlug };

    const thread = await ForumThread.findOne({
      where,
      include: [{
        model: Forum,
        as: 'Forum',
        include: [{
          model: ForumCategory,
          as: 'Category'
        }]
      }]
    });

    if (!thread) {
      return res.status(404).json({ success: false, error: 'Thread not found' });
    }

    // Increment view count
    await thread.increment('viewCount');

    // Get posts
    const offset = (page - 1) * limit;
    const { count, rows: posts } = await ForumPost.findAndCountAll({
      where: { threadId: thread.id, moderationStatus: 'approved' },
      limit: parseInt(limit),
      offset,
      order: [['createdAt', 'ASC']]
    });

    res.json({
      success: true,
      thread,
      posts,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    logger.error('GET /forums/:forumId/threads/:threadIdOrSlug failed', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

// =============== POSTS ===============

router.post('/threads/:threadId/posts',  async (req, res) => {
  try {
    const { threadId } = req.params;
    const { content, contentFormat, parentPostId, replyToUserId } = req.body;

    const thread = await ForumThread.findByPk(threadId, {
      include: [{
        model: Forum,
        as: 'Forum'
      }]
    });

    if (!thread) {
      return res.status(404).json({ success: false, error: 'Thread not found' });
    }

    // Check if thread is locked
    if (thread.isLocked) {
      return res.status(403).json({ success: false, error: 'Thread is locked' });
    }

    const post = await ForumPost.create({
      threadId,
      authorId: req.user.id,
      content,
      contentFormat: contentFormat || 'markdown',
      parentPostId,
      replyToUserId,
      moderationStatus: thread.Forum.requiresApproval ? 'pending' : 'approved',
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    // Update thread stats
    await thread.update({
      postCount: thread.postCount + 1,
      replyCount: thread.replyCount + 1,
      lastPostId: post.id,
      lastPostAt: new Date(),
      lastPostUserId: req.user.id
    });

    // Update forum stats
    await thread.Forum.increment('postCount');

    res.status(201).json({ success: true, post });
  } catch (error) {
    logger.error('POST /threads/:threadId/posts failed', { error: error.message });
    res.status(400).json({ success: false, error: error.message });
  }
});

router.put('/posts/:id',  async (req, res) => {
  try {
    const { id } = req.params;
    const { content, editReason } = req.body;

    const post = await ForumPost.findByPk(id);
    if (!post) {
      return res.status(404).json({ success: false, error: 'Post not found' });
    }

    // Check ownership
    if (post.authorId !== req.user.id) {
      return res.status(403).json({ success: false, error: 'You can only edit your own posts' });
    }

    await post.update({
      content,
      editedById: req.user.id,
      editedAt: new Date(),
      editCount: post.editCount + 1,
      editReason
    });

    res.json({ success: true, post });
  } catch (error) {
    logger.error('PUT /posts/:id failed', { error: error.message });
    res.status(400).json({ success: false, error: error.message });
  }
});

router.delete('/posts/:id',  async (req, res) => {
  try {
    const { id } = req.params;

    const post = await ForumPost.findByPk(id);
    if (!post) {
      return res.status(404).json({ success: false, error: 'Post not found' });
    }

    // Check ownership
    if (post.authorId !== req.user.id) {
      return res.status(403).json({ success: false, error: 'You can only delete your own posts' });
    }

    // Soft delete
    await post.destroy();

    res.json({ success: true, message: 'Post deleted successfully' });
  } catch (error) {
    logger.error('DELETE /posts/:id failed', { error: error.message });
    res.status(400).json({ success: false, error: error.message });
  }
});

// Like post
router.post('/posts/:id/like',  async (req, res) => {
  try {
    const { id } = req.params;

    const post = await ForumPost.findByPk(id);
    if (!post) {
      return res.status(404).json({ success: false, error: 'Post not found' });
    }

    await post.increment('likeCount');

    res.json({ success: true, message: 'Post liked', likeCount: post.likeCount + 1 });
  } catch (error) {
    logger.error('POST /posts/:id/like failed', { error: error.message });
    res.status(400).json({ success: false, error: error.message });
  }
});

// Mark post as solution
router.post('/posts/:id/mark-solution',  async (req, res) => {
  try {
    const { id } = req.params;

    const post = await ForumPost.findByPk(id, {
      include: [{
        model: ForumThread,
        as: 'Thread'
      }]
    });

    if (!post) {
      return res.status(404).json({ success: false, error: 'Post not found' });
    }

    // Check if user is thread author
    if (post.Thread.authorId !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Only thread author can mark solution' });
    }

    await post.update({
      isSolution: true,
      markedSolutionAt: new Date(),
      markedSolutionById: req.user.id
    });

    res.json({ success: true, message: 'Post marked as solution' });
  } catch (error) {
    logger.error('POST /posts/:id/mark-solution failed', { error: error.message });
    res.status(400).json({ success: false, error: error.message });
  }
});

module.exports = router;
