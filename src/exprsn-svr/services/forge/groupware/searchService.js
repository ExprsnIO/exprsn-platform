const { Op, literal } = require('sequelize');
const {
  Document,
  Folder,
  WikiPage,
  Task,
  Note,
  CalendarEvent,
  BoardCard,
  KnowledgeArticle,
  ForumThread
} = require('../../../models/forge');
const logger = require('../../../utils/logger');

/**
 * Global Search Service
 *
 * Full-text search across all groupware modules using PostgreSQL full-text search
 */

/**
 * Search across all groupware modules
 */
async function globalSearch({
  query,
  modules = ['documents', 'wiki', 'tasks', 'notes', 'calendar', 'boards', 'knowledge', 'forums'],
  userId,
  limit = 20,
  offset = 0,
  filters = {}
}) {
  try {
    if (!query || query.trim().length < 2) {
      throw new Error('Search query must be at least 2 characters');
    }

    const results = {
      query,
      results: [],
      total: 0,
      byModule: {}
    };

    // Search each enabled module
    const searchPromises = [];

    if (modules.includes('documents')) {
      searchPromises.push(
        searchDocuments(query, userId, filters).then(r => ({ module: 'documents', ...r }))
      );
    }

    if (modules.includes('wiki')) {
      searchPromises.push(
        searchWikiPages(query, userId, filters).then(r => ({ module: 'wiki', ...r }))
      );
    }

    if (modules.includes('tasks')) {
      searchPromises.push(
        searchTasks(query, userId, filters).then(r => ({ module: 'tasks', ...r }))
      );
    }

    if (modules.includes('notes')) {
      searchPromises.push(
        searchNotes(query, userId, filters).then(r => ({ module: 'notes', ...r }))
      );
    }

    if (modules.includes('calendar')) {
      searchPromises.push(
        searchCalendarEvents(query, userId, filters).then(r => ({ module: 'calendar', ...r }))
      );
    }

    if (modules.includes('boards')) {
      searchPromises.push(
        searchBoardCards(query, userId, filters).then(r => ({ module: 'boards', ...r }))
      );
    }

    if (modules.includes('knowledge')) {
      searchPromises.push(
        searchKnowledgeArticles(query, userId, filters).then(r => ({ module: 'knowledge', ...r }))
      );
    }

    if (modules.includes('forums')) {
      searchPromises.push(
        searchForumThreads(query, userId, filters).then(r => ({ module: 'forums', ...r }))
      );
    }

    // Execute all searches in parallel
    const moduleResults = await Promise.all(searchPromises);

    // Aggregate results
    moduleResults.forEach(result => {
      results.byModule[result.module] = {
        count: result.count,
        items: result.items
      };
      results.results.push(...result.items);
      results.total += result.count;
    });

    // Sort all results by relevance (ts_rank)
    results.results.sort((a, b) => (b.relevance || 0) - (a.relevance || 0));

    // Apply global pagination
    results.results = results.results.slice(offset, offset + limit);

    return results;
  } catch (error) {
    logger.error('Global search failed', {
      query,
      error: error.message
    });
    throw error;
  }
}

/**
 * Search documents
 */
async function searchDocuments(query, userId, filters = {}) {
  const searchQuery = query.trim().replace(/\s+/g, ' & ');

  const where = {
    [Op.and]: [
      literal(`(
        to_tsvector('english', name || ' ' || COALESCE(description, ''))
        @@ to_tsquery('english', '${searchQuery}')
      )`),
      filters.folderId ? { folderId: filters.folderId } : {},
      userId ? { ownerId: userId } : {}
    ]
  };

  const { count, rows } = await Document.findAndCountAll({
    where,
    attributes: [
      '*',
      [
        literal(`ts_rank(
          to_tsvector('english', name || ' ' || COALESCE(description, '')),
          to_tsquery('english', '${searchQuery}')
        )`),
        'relevance'
      ]
    ],
    order: [[literal('relevance'), 'DESC']],
    limit: 10
  });

  return {
    count,
    items: rows.map(doc => ({
      type: 'document',
      id: doc.id,
      title: doc.name,
      description: doc.description,
      relevance: doc.get('relevance'),
      url: `/groupware/documents/${doc.id}`,
      metadata: {
        fileType: doc.fileType,
        fileSize: doc.fileSize,
        createdAt: doc.createdAt
      }
    }))
  };
}

/**
 * Search wiki pages
 */
async function searchWikiPages(query, userId, filters = {}) {
  const searchQuery = query.trim().replace(/\s+/g, ' & ');

  const where = {
    [Op.and]: [
      literal(`(
        to_tsvector('english', title || ' ' || COALESCE(content, ''))
        @@ to_tsquery('english', '${searchQuery}')
      )`),
      filters.status ? { status: filters.status } : { status: 'published' }
    ]
  };

  const { count, rows } = await WikiPage.findAndCountAll({
    where,
    attributes: [
      '*',
      [
        literal(`ts_rank(
          to_tsvector('english', title || ' ' || COALESCE(content, '')),
          to_tsquery('english', '${searchQuery}')
        )`),
        'relevance'
      ]
    ],
    order: [[literal('relevance'), 'DESC']],
    limit: 10
  });

  return {
    count,
    items: rows.map(page => ({
      type: 'wiki_page',
      id: page.id,
      title: page.title,
      description: page.content ? page.content.substring(0, 200) + '...' : '',
      relevance: page.get('relevance'),
      url: `/groupware/wiki/${page.slug}`,
      metadata: {
        author: page.authorId,
        version: page.version,
        createdAt: page.createdAt
      }
    }))
  };
}

/**
 * Search tasks
 */
async function searchTasks(query, userId, filters = {}) {
  const searchQuery = query.trim().replace(/\s+/g, ' & ');

  const where = {
    [Op.and]: [
      literal(`(
        to_tsvector('english', title || ' ' || COALESCE(description, ''))
        @@ to_tsquery('english', '${searchQuery}')
      )`),
      filters.status ? { status: filters.status } : {},
      filters.priority ? { priority: filters.priority } : {}
    ]
  };

  const { count, rows } = await Task.findAndCountAll({
    where,
    attributes: [
      '*',
      [
        literal(`ts_rank(
          to_tsvector('english', title || ' ' || COALESCE(description, '')),
          to_tsquery('english', '${searchQuery}')
        )`),
        'relevance'
      ]
    ],
    order: [[literal('relevance'), 'DESC']],
    limit: 10
  });

  return {
    count,
    items: rows.map(task => ({
      type: 'task',
      id: task.id,
      title: task.title,
      description: task.description,
      relevance: task.get('relevance'),
      url: `/groupware/tasks/${task.id}`,
      metadata: {
        status: task.status,
        priority: task.priority,
        dueDate: task.dueDate,
        createdAt: task.createdAt
      }
    }))
  };
}

/**
 * Search notes
 */
async function searchNotes(query, userId, filters = {}) {
  const searchQuery = query.trim().replace(/\s+/g, ' & ');

  const where = {
    [Op.and]: [
      literal(`(
        to_tsvector('english', title || ' ' || COALESCE(content, ''))
        @@ to_tsquery('english', '${searchQuery}')
      )`),
      userId ? { ownerId: userId } : {}
    ]
  };

  const { count, rows } = await Note.findAndCountAll({
    where,
    attributes: [
      '*',
      [
        literal(`ts_rank(
          to_tsvector('english', title || ' ' || COALESCE(content, '')),
          to_tsquery('english', '${searchQuery}')
        )`),
        'relevance'
      ]
    ],
    order: [[literal('relevance'), 'DESC']],
    limit: 10
  });

  return {
    count,
    items: rows.map(note => ({
      type: 'note',
      id: note.id,
      title: note.title,
      description: note.content ? note.content.substring(0, 200) + '...' : '',
      relevance: note.get('relevance'),
      url: `/groupware/notes/${note.id}`,
      metadata: {
        tags: note.tags,
        createdAt: note.createdAt
      }
    }))
  };
}

/**
 * Search calendar events
 */
async function searchCalendarEvents(query, userId, filters = {}) {
  const searchQuery = query.trim().replace(/\s+/g, ' & ');

  const where = {
    [Op.and]: [
      literal(`(
        to_tsvector('english', title || ' ' || COALESCE(description, '') || ' ' || COALESCE(location, ''))
        @@ to_tsquery('english', '${searchQuery}')
      )`),
      filters.startDate ? { startTime: { [Op.gte]: filters.startDate } } : {},
      filters.endDate ? { endTime: { [Op.lte]: filters.endDate } } : {}
    ]
  };

  const { count, rows } = await CalendarEvent.findAndCountAll({
    where,
    attributes: [
      '*',
      [
        literal(`ts_rank(
          to_tsvector('english', title || ' ' || COALESCE(description, '') || ' ' || COALESCE(location, '')),
          to_tsquery('english', '${searchQuery}')
        )`),
        'relevance'
      ]
    ],
    order: [[literal('relevance'), 'DESC']],
    limit: 10
  });

  return {
    count,
    items: rows.map(event => ({
      type: 'calendar_event',
      id: event.id,
      title: event.title,
      description: event.description,
      relevance: event.get('relevance'),
      url: `/groupware/calendars/${event.calendarId}/events/${event.id}`,
      metadata: {
        startTime: event.startTime,
        endTime: event.endTime,
        location: event.location,
        eventType: event.eventType
      }
    }))
  };
}

/**
 * Search board cards
 */
async function searchBoardCards(query, userId, filters = {}) {
  const searchQuery = query.trim().replace(/\s+/g, ' & ');

  const where = {
    [Op.and]: [
      literal(`(
        to_tsvector('english', title || ' ' || COALESCE(description, ''))
        @@ to_tsquery('english', '${searchQuery}')
      )`)
    ]
  };

  const { count, rows } = await BoardCard.findAndCountAll({
    where,
    attributes: [
      '*',
      [
        literal(`ts_rank(
          to_tsvector('english', title || ' ' || COALESCE(description, '')),
          to_tsquery('english', '${searchQuery}')
        )`),
        'relevance'
      ]
    ],
    order: [[literal('relevance'), 'DESC']],
    limit: 10
  });

  return {
    count,
    items: rows.map(card => ({
      type: 'board_card',
      id: card.id,
      title: card.title,
      description: card.description,
      relevance: card.get('relevance'),
      url: `/groupware/boards/${card.boardId}/cards/${card.id}`,
      metadata: {
        labels: card.labels,
        dueDate: card.dueDate,
        createdAt: card.createdAt
      }
    }))
  };
}

/**
 * Search knowledge articles
 */
async function searchKnowledgeArticles(query, userId, filters = {}) {
  const searchQuery = query.trim().replace(/\s+/g, ' & ');

  const where = {
    [Op.and]: [
      literal(`(
        to_tsvector('english', title || ' ' || COALESCE(content, ''))
        @@ to_tsquery('english', '${searchQuery}')
      )`),
      { status: 'published' }
    ]
  };

  const { count, rows } = await KnowledgeArticle.findAndCountAll({
    where,
    attributes: [
      '*',
      [
        literal(`ts_rank(
          to_tsvector('english', title || ' ' || COALESCE(content, '')),
          to_tsquery('english', '${searchQuery}')
        )`),
        'relevance'
      ]
    ],
    order: [[literal('relevance'), 'DESC']],
    limit: 10
  });

  return {
    count,
    items: rows.map(article => ({
      type: 'knowledge_article',
      id: article.id,
      title: article.title,
      description: article.content ? article.content.substring(0, 200) + '...' : '',
      relevance: article.get('relevance'),
      url: `/groupware/knowledge/articles/${article.slug}`,
      metadata: {
        category: article.categoryId,
        views: article.views,
        helpful: article.helpfulCount,
        createdAt: article.createdAt
      }
    }))
  };
}

/**
 * Search forum threads
 */
async function searchForumThreads(query, userId, filters = {}) {
  const searchQuery = query.trim().replace(/\s+/g, ' & ');

  const where = {
    [Op.and]: [
      literal(`(
        to_tsvector('english', title || ' ' || COALESCE(content, ''))
        @@ to_tsquery('english', '${searchQuery}')
      )`),
      { status: { [Op.ne]: 'deleted' } }
    ]
  };

  const { count, rows } = await ForumThread.findAndCountAll({
    where,
    attributes: [
      '*',
      [
        literal(`ts_rank(
          to_tsvector('english', title || ' ' || COALESCE(content, '')),
          to_tsquery('english', '${searchQuery}')
        )`),
        'relevance'
      ]
    ],
    order: [[literal('relevance'), 'DESC']],
    limit: 10
  });

  return {
    count,
    items: rows.map(thread => ({
      type: 'forum_thread',
      id: thread.id,
      title: thread.title,
      description: thread.content ? thread.content.substring(0, 200) + '...' : '',
      relevance: thread.get('relevance'),
      url: `/groupware/forums/${thread.forumId}/threads/${thread.id}`,
      metadata: {
        author: thread.authorId,
        replies: thread.replyCount,
        views: thread.viewCount,
        createdAt: thread.createdAt
      }
    }))
  };
}

/**
 * Create search suggestions (autocomplete)
 */
async function getSearchSuggestions(query, module, limit = 5) {
  try {
    const searchQuery = query.trim().replace(/\s+/g, ' & ');

    let model, fields;
    switch (module) {
      case 'documents':
        model = Document;
        fields = ['name'];
        break;
      case 'wiki':
        model = WikiPage;
        fields = ['title'];
        break;
      case 'tasks':
        model = Task;
        fields = ['title'];
        break;
      case 'notes':
        model = Note;
        fields = ['title'];
        break;
      default:
        return [];
    }

    const results = await model.findAll({
      where: {
        [Op.or]: fields.map(field => ({
          [field]: { [Op.iLike]: `%${query}%` }
        }))
      },
      attributes: fields,
      limit
    });

    return results.map(r => r[fields[0]]);
  } catch (error) {
    logger.error('Failed to get search suggestions', {
      query,
      module,
      error: error.message
    });
    return [];
  }
}

module.exports = {
  globalSearch,
  searchDocuments,
  searchWikiPages,
  searchTasks,
  searchNotes,
  searchCalendarEvents,
  searchBoardCards,
  searchKnowledgeArticles,
  searchForumThreads,
  getSearchSuggestions
};
