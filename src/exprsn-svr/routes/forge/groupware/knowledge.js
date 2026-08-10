const express = require('express');
const router = express.Router();
const { validateToken } = require('../../../middleware/auth');
const logger = require('../../../utils/logger');
const { sequelize } = require('../../../config/database');
const {
  KnowledgeCategory,
  KnowledgeArticle,
  KnowledgeArticleVersion,
  KnowledgeArticleAttachment
} = require('../../models/index');

// =============== KNOWLEDGE CATEGORIES ===============

// List categories
router.get('/categories', async (req, res) => {
  try {
    const { parentId, visibility, includeArchived } = req.query;

    const where = {};
    if (parentId) where.parentCategoryId = parentId === 'null' ? null : parentId;
    if (visibility) where.visibility = visibility;
    if (!includeArchived) where.isArchived = false;

    const categories = await KnowledgeCategory.findAll({
      where,
      include: [{
        model: KnowledgeCategory,
        as: 'SubCategories',
        attributes: ['id', 'name', 'slug', 'articleCount']
      }],
      order: [['position', 'ASC'], ['name', 'ASC']]
    });

    res.json({ success: true, categories });
  } catch (error) {
    logger.error('GET /knowledge/categories failed', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create category
router.post('/categories',  async (req, res) => {
  try {
    const { name, slug, description, icon, color, parentCategoryId, visibility } = req.body;

    const category = await KnowledgeCategory.create({
      name,
      slug,
      description,
      icon,
      color,
      parentCategoryId,
      visibility: visibility || 'public'
    });

    res.status(201).json({ success: true, category });
  } catch (error) {
    logger.error('POST /knowledge/categories failed', { error: error.message });
    res.status(400).json({ success: false, error: error.message });
  }
});

// Get category by ID or slug
router.get('/categories/:idOrSlug', async (req, res) => {
  try {
    const { idOrSlug } = req.params;
    const { includeArticles } = req.query;

    const where = idOrSlug.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
      ? { id: idOrSlug }
      : { slug: idOrSlug };

    const include = [{
      model: KnowledgeCategory,
      as: 'SubCategories'
    }];

    if (includeArticles === 'true') {
      include.push({
        model: KnowledgeArticle,
        as: 'Articles',
        where: { status: 'published' },
        required: false
      });
    }

    const category = await KnowledgeCategory.findOne({ where, include });

    if (!category) {
      return res.status(404).json({ success: false, error: 'Category not found' });
    }

    res.json({ success: true, category });
  } catch (error) {
    logger.error('GET /knowledge/categories/:idOrSlug failed', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update category
router.put('/categories/:id',  async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const category = await KnowledgeCategory.findByPk(id);
    if (!category) {
      return res.status(404).json({ success: false, error: 'Category not found' });
    }

    await category.update(updates);
    res.json({ success: true, category });
  } catch (error) {
    logger.error('PUT /knowledge/categories/:id failed', { error: error.message });
    res.status(400).json({ success: false, error: error.message });
  }
});

// Delete category
router.delete('/categories/:id',  async (req, res) => {
  try {
    const { id } = req.params;

    const category = await KnowledgeCategory.findByPk(id);
    if (!category) {
      return res.status(404).json({ success: false, error: 'Category not found' });
    }

    // Check if category has articles
    if (category.articleCount > 0) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete category with articles. Please move or delete articles first.'
      });
    }

    await category.destroy();
    res.json({ success: true, message: 'Category deleted successfully' });
  } catch (error) {
    logger.error('DELETE /knowledge/categories/:id failed', { error: error.message });
    res.status(400).json({ success: false, error: error.message });
  }
});

// =============== KNOWLEDGE ARTICLES ===============

// List articles
router.get('/articles', async (req, res) => {
  try {
    const {
      categoryId,
      status,
      visibility,
      tags,
      featured,
      search,
      limit = 20,
      offset = 0
    } = req.query;

    const where = {};
    if (categoryId) where.categoryId = categoryId;
    if (status) where.status = status;
    if (visibility) where.visibility = visibility;
    if (tags) where.tags = { [sequelize.Sequelize.Op.contains]: tags.split(',') };
    if (featured === 'true') where.isFeatured = true;
    if (search) {
      where[sequelize.Sequelize.Op.or] = [
        { title: { [sequelize.Sequelize.Op.iLike]: `%${search}%` } },
        { summary: { [sequelize.Sequelize.Op.iLike]: `%${search}%` } },
        { content: { [sequelize.Sequelize.Op.iLike]: `%${search}%` } }
      ];
    }

    const { count, rows: articles } = await KnowledgeArticle.findAndCountAll({
      where,
      include: [{
        model: KnowledgeCategory,
        as: 'Category',
        attributes: ['id', 'name', 'slug']
      }],
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['publishedAt', 'DESC']]
    });

    res.json({
      success: true,
      articles,
      total: count,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    logger.error('GET /knowledge/articles failed', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create article
router.post('/articles',  async (req, res) => {
  try {
    const {
      categoryId,
      title,
      slug,
      summary,
      content,
      contentFormat,
      status,
      visibility,
      tags,
      metaTitle,
      metaDescription,
      metaKeywords,
      requiresAuthentication,
      allowedRoles,
      enableComments,
      enableFeedback
    } = req.body;

    const article = await KnowledgeArticle.create({
      categoryId,
      title,
      slug,
      summary,
      content,
      contentFormat: contentFormat || 'markdown',
      authorId: req.user.id,
      status: status || 'draft',
      visibility: visibility || 'public',
      tags: tags || [],
      metaTitle,
      metaDescription,
      metaKeywords,
      requiresAuthentication: requiresAuthentication || false,
      allowedRoles: allowedRoles || [],
      enableComments: enableComments !== false,
      enableFeedback: enableFeedback !== false,
      publishedAt: status === 'published' ? new Date() : null
    });

    // Create initial version
    await KnowledgeArticleVersion.create({
      articleId: article.id,
      version: 1,
      title: article.title,
      content: article.content,
      contentFormat: article.contentFormat,
      editedById: req.user.id,
      changeSummary: 'Initial version'
    });

    // Update category article count
    await sequelize.query(
      'UPDATE kb_categories SET article_count = article_count + 1 WHERE id = :categoryId',
      { replacements: { categoryId }, type: sequelize.QueryTypes.UPDATE }
    );

    res.status(201).json({ success: true, article });
  } catch (error) {
    logger.error('POST /knowledge/articles failed', { error: error.message });
    res.status(400).json({ success: false, error: error.message });
  }
});

// Get article by ID or slug
router.get('/articles/:idOrSlug', async (req, res) => {
  try {
    const { idOrSlug } = req.params;
    const { includeVersions, includeAttachments } = req.query;

    const where = idOrSlug.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
      ? { id: idOrSlug }
      : { slug: idOrSlug };

    const include = [{
      model: KnowledgeCategory,
      as: 'Category'
    }];

    if (includeVersions === 'true') {
      include.push({
        model: KnowledgeArticleVersion,
        as: 'Versions',
        order: [['version', 'DESC']]
      });
    }

    if (includeAttachments === 'true') {
      include.push({
        model: KnowledgeArticleAttachment,
        as: 'Attachments'
      });
    }

    const article = await KnowledgeArticle.findOne({ where, include });

    if (!article) {
      return res.status(404).json({ success: false, error: 'Article not found' });
    }

    // Increment view count
    await article.increment('viewCount');

    res.json({ success: true, article });
  } catch (error) {
    logger.error('GET /knowledge/articles/:idOrSlug failed', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update article
router.put('/articles/:id',  async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const article = await KnowledgeArticle.findByPk(id);
    if (!article) {
      return res.status(404).json({ success: false, error: 'Article not found' });
    }

    // Create new version if content changed
    if (updates.content && updates.content !== article.content) {
      const newVersion = article.version + 1;

      await KnowledgeArticleVersion.create({
        articleId: article.id,
        version: newVersion,
        title: updates.title || article.title,
        content: updates.content,
        contentFormat: updates.contentFormat || article.contentFormat,
        editedById: req.user.id,
        changeSummary: updates.changeSummary || 'Article updated'
      });

      updates.version = newVersion;
    }

    updates.lastEditedById = req.user.id;
    updates.lastEditedAt = new Date();

    // If publishing for the first time
    if (updates.status === 'published' && article.status !== 'published') {
      updates.publishedAt = new Date();
    }

    await article.update(updates);
    res.json({ success: true, article });
  } catch (error) {
    logger.error('PUT /knowledge/articles/:id failed', { error: error.message });
    res.status(400).json({ success: false, error: error.message });
  }
});

// Delete article
router.delete('/articles/:id',  async (req, res) => {
  try {
    const { id } = req.params;

    const article = await KnowledgeArticle.findByPk(id);
    if (!article) {
      return res.status(404).json({ success: false, error: 'Article not found' });
    }

    const categoryId = article.categoryId;
    await article.destroy();

    // Update category article count
    await sequelize.query(
      'UPDATE kb_categories SET article_count = article_count - 1 WHERE id = :categoryId',
      { replacements: { categoryId }, type: sequelize.QueryTypes.UPDATE }
    );

    res.json({ success: true, message: 'Article deleted successfully' });
  } catch (error) {
    logger.error('DELETE /knowledge/articles/:id failed', { error: error.message });
    res.status(400).json({ success: false, error: error.message });
  }
});

// Mark article as helpful/not helpful
router.post('/articles/:id/feedback', async (req, res) => {
  try {
    const { id } = req.params;
    const { helpful } = req.body;

    const article = await KnowledgeArticle.findByPk(id);
    if (!article) {
      return res.status(404).json({ success: false, error: 'Article not found' });
    }

    if (helpful === true) {
      await article.increment('helpfulCount');
    } else {
      await article.increment('notHelpfulCount');
    }

    res.json({ success: true, message: 'Feedback recorded' });
  } catch (error) {
    logger.error('POST /knowledge/articles/:id/feedback failed', { error: error.message });
    res.status(400).json({ success: false, error: error.message });
  }
});

// Search articles (full-text search)
router.get('/search', async (req, res) => {
  try {
    const { q, categoryId, limit = 20 } = req.query;

    if (!q || q.length < 2) {
      return res.status(400).json({ success: false, error: 'Search query must be at least 2 characters' });
    }

    const where = {
      status: 'published',
      [sequelize.Sequelize.Op.or]: [
        { title: { [sequelize.Sequelize.Op.iLike]: `%${q}%` } },
        { summary: { [sequelize.Sequelize.Op.iLike]: `%${q}%` } },
        { content: { [sequelize.Sequelize.Op.iLike]: `%${q}%` } },
        { tags: { [sequelize.Sequelize.Op.contains]: [q] } }
      ]
    };

    if (categoryId) {
      where.categoryId = categoryId;
    }

    const articles = await KnowledgeArticle.findAll({
      where,
      include: [{
        model: KnowledgeCategory,
        as: 'Category',
        attributes: ['id', 'name', 'slug']
      }],
      attributes: ['id', 'title', 'slug', 'summary', 'tags', 'publishedAt'],
      limit: parseInt(limit),
      order: [['viewCount', 'DESC'], ['helpfulCount', 'DESC']]
    });

    res.json({ success: true, articles, query: q });
  } catch (error) {
    logger.error('GET /knowledge/search failed', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
