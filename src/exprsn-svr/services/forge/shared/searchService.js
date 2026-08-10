const { Op } = require('sequelize');
const { WikiPage, Document, Note, Task, BoardCard } = require('../../../models/forge');
const logger = require('../../../utils/logger');

/**
 * Search Service
 *
 * Unified full-text search across groupware entities
 */

/**
 * Search across all groupware entities
 */
async function searchAll(query, options = {}) {
  try {
    const {
      userId,
      entityTypes = ['wiki', 'document', 'note', 'task', 'card'],
      limit = 50,
      offset = 0
    } = options;

    const results = {
      query,
      total: 0,
      results: []
    };

    // Search each entity type in parallel
    const searches = [];

    if (entityTypes.includes('wiki')) {
      searches.push(searchWikiPages(query, { userId, limit: Math.floor(limit / entityTypes.length) }));
    }
    if (entityTypes.includes('document')) {
      searches.push(searchDocuments(query, { userId, limit: Math.floor(limit / entityTypes.length) }));
    }
    if (entityTypes.includes('note')) {
      searches.push(searchNotes(query, { userId, limit: Math.floor(limit / entityTypes.length) }));
    }
    if (entityTypes.includes('task')) {
      searches.push(searchTasks(query, { userId, limit: Math.floor(limit / entityTypes.length) }));
    }
    if (entityTypes.includes('card')) {
      searches.push(searchBoardCards(query, { userId, limit: Math.floor(limit / entityTypes.length) }));
    }

    const searchResults = await Promise.all(searches);

    // Combine and sort by relevance
    searchResults.forEach(entityResults => {
      results.results.push(...entityResults);
    });

    // Sort by relevance score (if available) or updated date
    results.results.sort((a, b) => {
      if (a.relevanceScore && b.relevanceScore) {
        return b.relevanceScore - a.relevanceScore;
      }
      return new Date(b.updatedAt) - new Date(a.updatedAt);
    });

    // Apply global limit and offset
    results.total = results.results.length;
    results.results = results.results.slice(offset, offset + limit);

    logger.info('Global search completed', {
      query,
      totalResults: results.total,
      entityTypes
    });

    return results;
  } catch (error) {
    logger.error('Failed to perform global search', {
      error: error.message,
      query
    });
    throw error;
  }
}

/**
 * Search wiki pages
 */
async function searchWikiPages(query, options = {}) {
  try {
    const {
      userId,
      category,
      tags,
      status,
      visibility,
      limit = 50,
      offset = 0
    } = options;

    const where = {
      [Op.or]: [
        { title: { [Op.iLike]: `%${query}%` } },
        { searchableText: { [Op.iLike]: `%${query}%` } }
      ]
    };

    if (category) where.category = category;
    if (status) where.status = status;
    if (tags && tags.length > 0) {
      where.tags = { [Op.overlap]: tags };
    }

    // Apply visibility filters
    if (userId) {
      where[Op.or] = [
        ...(where[Op.or] || []),
        { visibility: 'public' },
        { visibility: 'private', createdById: userId },
        { visibility: 'restricted' }
      ];
    } else {
      where.visibility = 'public';
    }

    const pages = await WikiPage.findAll({
      where,
      limit,
      offset,
      order: [['updatedAt', 'DESC']],
      attributes: {
        exclude: ['content', 'searchableText'],
        include: [
          [
            // Calculate relevance score based on title vs content match
            `CASE
              WHEN title ILIKE '%${query}%' THEN 2
              ELSE 1
            END`,
            'relevanceScore'
          ]
        ]
      }
    });

    return pages.map(page => ({
      ...page.toJSON(),
      entityType: 'wiki',
      relevanceScore: page.dataValues.relevanceScore
    }));
  } catch (error) {
    logger.error('Failed to search wiki pages', {
      error: error.message,
      query
    });
    return [];
  }
}

/**
 * Search documents
 */
async function searchDocuments(query, options = {}) {
  try {
    const {
      userId,
      folderId,
      fileType,
      limit = 50,
      offset = 0
    } = options;

    const where = {
      [Op.or]: [
        { name: { [Op.iLike]: `%${query}%` } },
        { description: { [Op.iLike]: `%${query}%` } },
        { searchableContent: { [Op.iLike]: `%${query}%` } }
      ]
    };

    if (folderId) where.folderId = folderId;
    if (fileType) where.fileType = fileType;

    // Apply permission filters
    if (userId) {
      where[Op.or] = [
        ...(where[Op.or] || []),
        { visibility: 'public' },
        { uploadedById: userId }
      ];
    } else {
      where.visibility = 'public';
    }

    const documents = await Document.findAll({
      where,
      limit,
      offset,
      order: [['updatedAt', 'DESC']],
      attributes: {
        exclude: ['searchableContent'],
        include: [
          [
            `CASE
              WHEN name ILIKE '%${query}%' THEN 3
              WHEN description ILIKE '%${query}%' THEN 2
              ELSE 1
            END`,
            'relevanceScore'
          ]
        ]
      }
    });

    return documents.map(doc => ({
      ...doc.toJSON(),
      entityType: 'document',
      relevanceScore: doc.dataValues.relevanceScore
    }));
  } catch (error) {
    logger.error('Failed to search documents', {
      error: error.message,
      query
    });
    return [];
  }
}

/**
 * Search notes
 */
async function searchNotes(query, options = {}) {
  try {
    const {
      userId,
      folderId,
      tags,
      limit = 50,
      offset = 0
    } = options;

    const where = {
      [Op.or]: [
        { title: { [Op.iLike]: `%${query}%` } },
        { content: { [Op.iLike]: `%${query}%` } }
      ]
    };

    if (folderId) where.folderId = folderId;
    if (tags && tags.length > 0) {
      where.tags = { [Op.overlap]: tags };
    }

    // Only show user's own notes or shared notes
    if (userId) {
      where.createdById = userId;
    }

    const notes = await Note.findAll({
      where,
      limit,
      offset,
      order: [['updatedAt', 'DESC']],
      attributes: {
        include: [
          [
            `CASE
              WHEN title ILIKE '%${query}%' THEN 2
              ELSE 1
            END`,
            'relevanceScore'
          ]
        ]
      }
    });

    return notes.map(note => ({
      ...note.toJSON(),
      entityType: 'note',
      relevanceScore: note.dataValues.relevanceScore
    }));
  } catch (error) {
    logger.error('Failed to search notes', {
      error: error.message,
      query
    });
    return [];
  }
}

/**
 * Search tasks
 */
async function searchTasks(query, options = {}) {
  try {
    const {
      userId,
      status,
      priority,
      limit = 50,
      offset = 0
    } = options;

    const where = {
      [Op.or]: [
        { title: { [Op.iLike]: `%${query}%` } },
        { description: { [Op.iLike]: `%${query}%` } }
      ]
    };

    if (status) where.status = status;
    if (priority) where.priority = priority;

    // Only show tasks assigned to user or created by user
    if (userId) {
      where[Op.or] = [
        ...(where[Op.or] || []),
        { assignedToId: userId },
        { createdById: userId }
      ];
    }

    const tasks = await Task.findAll({
      where,
      limit,
      offset,
      order: [['updatedAt', 'DESC']],
      attributes: {
        include: [
          [
            `CASE
              WHEN title ILIKE '%${query}%' THEN 2
              ELSE 1
            END`,
            'relevanceScore'
          ]
        ]
      }
    });

    return tasks.map(task => ({
      ...task.toJSON(),
      entityType: 'task',
      relevanceScore: task.dataValues.relevanceScore
    }));
  } catch (error) {
    logger.error('Failed to search tasks', {
      error: error.message,
      query
    });
    return [];
  }
}

/**
 * Search board cards
 */
async function searchBoardCards(query, options = {}) {
  try {
    const {
      userId,
      boardId,
      columnId,
      limit = 50,
      offset = 0
    } = options;

    const where = {
      [Op.or]: [
        { title: { [Op.iLike]: `%${query}%` } },
        { description: { [Op.iLike]: `%${query}%` } }
      ]
    };

    if (boardId) where.boardId = boardId;
    if (columnId) where.columnId = columnId;

    const cards = await BoardCard.findAll({
      where,
      limit,
      offset,
      order: [['updatedAt', 'DESC']],
      attributes: {
        include: [
          [
            `CASE
              WHEN title ILIKE '%${query}%' THEN 2
              ELSE 1
            END`,
            'relevanceScore'
          ]
        ]
      }
    });

    return cards.map(card => ({
      ...card.toJSON(),
      entityType: 'card',
      relevanceScore: card.dataValues.relevanceScore
    }));
  } catch (error) {
    logger.error('Failed to search board cards', {
      error: error.message,
      query
    });
    return [];
  }
}

/**
 * Get search suggestions based on query
 */
async function getSearchSuggestions(query, options = {}) {
  try {
    const {
      userId,
      limit = 10
    } = options;

    // Get top matching titles from each entity type
    const suggestions = new Set();

    const wikiPages = await WikiPage.findAll({
      where: {
        title: { [Op.iLike]: `%${query}%` },
        status: 'published'
      },
      limit: 3,
      order: [['viewCount', 'DESC']],
      attributes: ['title']
    });

    wikiPages.forEach(page => suggestions.add(page.title));

    const documents = await Document.findAll({
      where: {
        name: { [Op.iLike]: `%${query}%` }
      },
      limit: 3,
      order: [['updatedAt', 'DESC']],
      attributes: ['name']
    });

    documents.forEach(doc => suggestions.add(doc.name));

    const notes = await Note.findAll({
      where: {
        title: { [Op.iLike]: `%${query}%` },
        createdById: userId
      },
      limit: 2,
      order: [['updatedAt', 'DESC']],
      attributes: ['title']
    });

    notes.forEach(note => suggestions.add(note.title));

    return Array.from(suggestions).slice(0, limit);
  } catch (error) {
    logger.error('Failed to get search suggestions', {
      error: error.message,
      query
    });
    return [];
  }
}

/**
 * Get recent searches for user
 */
async function getRecentSearches(userId, limit = 10) {
  // This would require a search_history table
  // Placeholder for future implementation
  return [];
}

/**
 * Save search query for analytics
 */
async function saveSearchQuery(query, userId, resultsCount) {
  try {
    // This would save to a search_history table
    // Placeholder for future implementation
    logger.info('Search query logged', {
      query,
      userId,
      resultsCount
    });
  } catch (error) {
    logger.error('Failed to save search query', {
      error: error.message
    });
  }
}

module.exports = {
  searchAll,
  searchWikiPages,
  searchDocuments,
  searchNotes,
  searchTasks,
  searchBoardCards,
  getSearchSuggestions,
  getRecentSearches,
  saveSearchQuery
};
