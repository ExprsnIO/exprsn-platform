/**
 * Card Service
 *
 * Business logic for card management in the low-code platform.
 * Cards are reusable UI components that can be shared across applications.
 */

const { Op } = require('sequelize');
const { Card, Application } = require('../models');

class CardService {
  /**
   * List cards with pagination and filtering
   */
  async listCards(options = {}) {
    const {
      applicationId,
      type,
      category,
      shared,
      limit = 25,
      offset = 0,
      sortBy = 'created_at',
      sortOrder = 'DESC',
      search
    } = options;

    const where = {};

    if (applicationId) {
      where.applicationId = applicationId;
    }

    if (type) {
      where.type = type;
    }

    if (category) {
      where.category = category;
    }

    if (shared !== undefined) {
      where.shared = shared;
    }

    if (search) {
      where[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { displayName: { [Op.iLike]: `%${search}%` } },
        { description: { [Op.iLike]: `%${search}%` } }
      ];
    }

    const { count, rows } = await Card.findAndCountAll({
      where,
      limit,
      offset,
      order: [[sortBy, sortOrder]],
      include: [
        {
          model: Application,
          as: 'application',
          attributes: ['id', 'name', 'displayName']
        }
      ]
    });

    return {
      total: count,
      cards: rows,
      limit,
      offset,
      hasMore: offset + limit < count
    };
  }

  /**
   * Get card by ID
   */
  async getCardById(cardId) {
    const card = await Card.findByPk(cardId, {
      include: [
        {
          model: Application,
          as: 'application',
          attributes: ['id', 'name', 'displayName', 'status']
        }
      ]
    });

    if (!card) {
      throw new Error('Card not found');
    }

    return card;
  }

  /**
   * Create new card
   */
  async createCard(data, userId) {
    const { applicationId, name, displayName } = data;

    // Verify application exists and user has access
    const application = await Application.findByPk(applicationId);
    if (!application) {
      throw new Error('Application not found');
    }

    if (application.ownerId !== userId) {
      throw new Error('Unauthorized: You do not own this application');
    }

    // Check for duplicate card name within application
    const existing = await Card.findOne({
      where: {
        applicationId,
        name
      }
    });

    if (existing) {
      throw new Error(`Card with name "${name}" already exists in this application`);
    }

    // Create card
    const card = await Card.create({
      applicationId,
      name,
      displayName: displayName || name,
      description: data.description || '',
      type: data.type || 'custom',
      category: data.category || 'general',
      html: data.html || '',
      css: data.css || '',
      javascript: data.javascript || '',
      controls: data.controls || [],
      props: data.props || {},
      events: data.events || {},
      dataBindings: data.dataBindings || [],
      shared: data.shared || false,
      version: data.version || '1.0.0',
      tags: data.tags || []
    });

    return card;
  }

  /**
   * Update card
   */
  async updateCard(cardId, data, userId) {
    const card = await Card.findByPk(cardId, {
      include: [{ model: Application, as: 'application' }]
    });

    if (!card) {
      throw new Error('Card not found');
    }

    if (card.application.ownerId !== userId) {
      throw new Error('Unauthorized');
    }

    // Update allowed fields
    const allowedFields = [
      'name',
      'displayName',
      'description',
      'type',
      'category',
      'html',
      'css',
      'javascript',
      'controls',
      'props',
      'events',
      'dataBindings',
      'shared',
      'version',
      'tags'
    ];

    allowedFields.forEach(field => {
      if (data[field] !== undefined) {
        card[field] = data[field];
      }
    });

    await card.save();
    return card;
  }

  /**
   * Delete card (soft delete)
   */
  async deleteCard(cardId, userId) {
    const card = await Card.findByPk(cardId, {
      include: [{ model: Application, as: 'application' }]
    });

    if (!card) {
      throw new Error('Card not found');
    }

    if (card.application.ownerId !== userId) {
      throw new Error('Unauthorized');
    }

    // Soft delete
    await card.destroy();

    return { success: true, message: 'Card deleted successfully' };
  }

  /**
   * Duplicate card
   */
  async duplicateCard(cardId, userId, newName = null) {
    const card = await Card.findByPk(cardId, {
      include: [{ model: Application, as: 'application' }]
    });

    if (!card) {
      throw new Error('Card not found');
    }

    // Allow duplication of shared cards or owned cards
    if (!card.shared && card.application.ownerId !== userId) {
      throw new Error('Unauthorized');
    }

    const duplicate = await Card.create({
      applicationId: card.applicationId,
      name: newName || `${card.name}_copy`,
      displayName: `${card.displayName} (Copy)`,
      description: card.description,
      type: card.type,
      category: card.category,
      html: card.html,
      css: card.css,
      javascript: card.javascript,
      controls: JSON.parse(JSON.stringify(card.controls)),
      props: JSON.parse(JSON.stringify(card.props)),
      events: JSON.parse(JSON.stringify(card.events)),
      dataBindings: JSON.parse(JSON.stringify(card.dataBindings)),
      shared: false, // Duplicates are not shared by default
      version: '1.0.0', // Reset version
      tags: [...card.tags]
    });

    return duplicate;
  }

  /**
   * Publish card (make it shared)
   */
  async publishCard(cardId, userId) {
    const card = await Card.findByPk(cardId, {
      include: [{ model: Application, as: 'application' }]
    });

    if (!card) {
      throw new Error('Card not found');
    }

    if (card.application.ownerId !== userId) {
      throw new Error('Unauthorized');
    }

    card.shared = true;
    card.publishedAt = new Date();
    await card.save();

    return card;
  }

  /**
   * Unpublish card (make it private)
   */
  async unpublishCard(cardId, userId) {
    const card = await Card.findByPk(cardId, {
      include: [{ model: Application, as: 'application' }]
    });

    if (!card) {
      throw new Error('Card not found');
    }

    if (card.application.ownerId !== userId) {
      throw new Error('Unauthorized');
    }

    card.shared = false;
    await card.save();

    return card;
  }

  /**
   * Increment card version
   */
  async incrementVersion(cardId, versionType, userId) {
    const card = await Card.findByPk(cardId, {
      include: [{ model: Application, as: 'application' }]
    });

    if (!card) {
      throw new Error('Card not found');
    }

    if (card.application.ownerId !== userId) {
      throw new Error('Unauthorized');
    }

    card.incrementVersion(versionType);
    await card.save();

    return card;
  }

  /**
   * Add tag to card
   */
  async addTag(cardId, tag, userId) {
    const card = await Card.findByPk(cardId, {
      include: [{ model: Application, as: 'application' }]
    });

    if (!card) {
      throw new Error('Card not found');
    }

    if (card.application.ownerId !== userId) {
      throw new Error('Unauthorized');
    }

    if (!card.tags) {
      card.tags = [];
    }

    if (!card.tags.includes(tag)) {
      card.tags.push(tag);
      card.changed('tags', true);
      await card.save();
    }

    return card;
  }

  /**
   * Remove tag from card
   */
  async removeTag(cardId, tag, userId) {
    const card = await Card.findByPk(cardId, {
      include: [{ model: Application, as: 'application' }]
    });

    if (!card) {
      throw new Error('Card not found');
    }

    if (card.application.ownerId !== userId) {
      throw new Error('Unauthorized');
    }

    if (card.tags) {
      card.tags = card.tags.filter(t => t !== tag);
      card.changed('tags', true);
      await card.save();
    }

    return card;
  }

  /**
   * Get cards by category
   */
  async getCardsByCategory(category, options = {}) {
    const {
      shared = true,
      limit = 25,
      offset = 0
    } = options;

    const where = {
      category,
      shared // Only return shared cards for category browsing
    };

    const { count, rows } = await Card.findAndCountAll({
      where,
      limit,
      offset,
      order: [['usageCount', 'DESC'], ['createdAt', 'DESC']]
    });

    return {
      total: count,
      cards: rows,
      category,
      limit,
      offset,
      hasMore: offset + limit < count
    };
  }

  /**
   * Search cards by tags
   */
  async searchByTags(tags, options = {}) {
    const {
      shared = true,
      limit = 25,
      offset = 0
    } = options;

    const where = {
      tags: { [Op.overlap]: tags },
      shared
    };

    const { count, rows } = await Card.findAndCountAll({
      where,
      limit,
      offset,
      order: [['usageCount', 'DESC']]
    });

    return {
      total: count,
      cards: rows,
      tags,
      limit,
      offset,
      hasMore: offset + limit < count
    };
  }

  /**
   * Increment usage count
   */
  async incrementUsageCount(cardId) {
    const card = await Card.findByPk(cardId);

    if (!card) {
      throw new Error('Card not found');
    }

    await card.incrementUsageCount();

    return card;
  }

  /**
   * Get popular cards
   */
  async getPopularCards(options = {}) {
    const {
      limit = 10,
      category = null,
      period = 'all' // 'all', 'month', 'week'
    } = options;

    const where = {
      shared: true
    };

    if (category) {
      where.category = category;
    }

    // Could add time-based filtering here based on period

    const cards = await Card.findAll({
      where,
      limit,
      order: [['usageCount', 'DESC'], ['createdAt', 'DESC']],
      include: [
        {
          model: Application,
          as: 'application',
          attributes: ['id', 'name', 'displayName']
        }
      ]
    });

    return cards;
  }

  /**
   * Get card statistics
   */
  async getCardStats(cardId, userId) {
    const card = await Card.findByPk(cardId, {
      include: [{ model: Application, as: 'application' }]
    });

    if (!card) {
      throw new Error('Card not found');
    }

    if (card.application.ownerId !== userId) {
      throw new Error('Unauthorized');
    }

    return {
      id: card.id,
      name: card.name,
      type: card.type,
      category: card.category,
      version: card.version,
      shared: card.shared,
      usageCount: card.usageCount,
      publishedAt: card.publishedAt,
      controlCount: card.controls?.length || 0,
      tagCount: card.tags?.length || 0,
      hasHtml: !!card.html,
      hasCss: !!card.css,
      hasJavascript: !!card.javascript,
      createdAt: card.createdAt,
      updatedAt: card.updatedAt
    };
  }
}

module.exports = new CardService();
