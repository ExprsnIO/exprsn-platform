const { Op } = require('sequelize');
const { WikiPage } = require('../../../models/forge');
const logger = require('../../../utils/logger');

/**
 * Wiki Service
 *
 * Handles wiki page management with versioning, hierarchies, and collaboration
 */

/**
 * List wiki pages with filtering and pagination
 */
async function listPages({
  page = 1,
  limit = 20,
  search,
  category,
  parentPageId,
  status,
  visibility,
  isTemplate,
  sortBy = 'position',
  sortOrder = 'ASC'
}) {
  try {
    const offset = (page - 1) * limit;
    const where = {};

    if (category) where.category = category;
    if (parentPageId === 'null') {
      where.parentPageId = null;
    } else if (parentPageId) {
      where.parentPageId = parentPageId;
    }
    if (status) where.status = status;
    if (visibility) where.visibility = visibility;
    if (isTemplate !== undefined) where.isTemplate = isTemplate;

    // Full-text search
    if (search) {
      where[Op.or] = [
        { title: { [Op.iLike]: `%${search}%` } },
        { searchableText: { [Op.iLike]: `%${search}%` } }
      ];
    }

    const { count, rows } = await WikiPage.findAndCountAll({
      where,
      limit,
      offset,
      order: sortBy ? [[sortBy, sortOrder]] : [['position', 'ASC'], ['updatedAt', 'DESC']],
      attributes: { exclude: ['content', 'searchableText'] }
    });

    logger.info('Wiki pages listed', { count, page, limit });

    return {
      pages: rows,
      pagination: {
        total: count,
        page,
        limit,
        pages: Math.ceil(count / limit)
      }
    };
  } catch (error) {
    logger.error('Failed to list wiki pages', { error: error.message });
    throw error;
  }
}

/**
 * Get wiki page by ID with view tracking
 */
async function getPageById(pageId, userId = null) {
  try {
    const page = await WikiPage.findByPk(pageId);

    if (!page) {
      throw new Error('Wiki page not found');
    }

    // Check visibility permissions
    if (page.visibility === 'private' && userId && page.createdById !== userId) {
      throw new Error('Access denied');
    }

    // Increment view count
    await page.update({
      viewCount: page.viewCount + 1,
      lastViewedAt: new Date()
    });

    logger.info('Wiki page retrieved', { pageId, userId });

    return page;
  } catch (error) {
    logger.error('Failed to get wiki page', { error: error.message, pageId });
    throw error;
  }
}

/**
 * Get wiki page by slug
 */
async function getPageBySlug(slug, userId = null) {
  try {
    const page = await WikiPage.findOne({
      where: { slug }
    });

    if (!page) {
      throw new Error('Wiki page not found');
    }

    // Check visibility permissions
    if (page.visibility === 'private' && userId && page.createdById !== userId) {
      throw new Error('Access denied');
    }

    // Increment view count
    await page.update({
      viewCount: page.viewCount + 1,
      lastViewedAt: new Date()
    });

    logger.info('Wiki page retrieved by slug', { slug, userId });

    return page;
  } catch (error) {
    logger.error('Failed to get wiki page by slug', { error: error.message, slug });
    throw error;
  }
}

/**
 * Create a new wiki page
 */
async function createPage({
  title,
  slug,
  content,
  contentFormat = 'markdown',
  parentPageId,
  position = 0,
  status = 'draft',
  visibility = 'private',
  category,
  tags = [],
  isTemplate = false,
  templateId,
  permissions,
  attachments = [],
  metadata = {},
  userId
}) {
  try {
    // Calculate depth and path if parent exists
    let depth = 0;
    let path = `/${slug}`;

    if (parentPageId) {
      const parent = await WikiPage.findByPk(parentPageId);
      if (parent) {
        depth = parent.depth + 1;
        path = `${parent.path}/${slug}`;
      }
    }

    // Extract searchable text from content
    const searchableText = extractSearchableText(content);

    const page = await WikiPage.create({
      title,
      slug,
      content,
      contentFormat,
      parentPageId,
      position,
      status,
      visibility,
      category,
      tags,
      isTemplate,
      templateId,
      permissions,
      attachments,
      metadata,
      createdById: userId,
      lastEditedById: userId,
      lastEditedAt: new Date(),
      depth,
      path,
      searchableText,
      contributors: [userId]
    });

    logger.info('Wiki page created', {
      pageId: page.id,
      title,
      userId
    });

    return page;
  } catch (error) {
    logger.error('Failed to create wiki page', { error: error.message });
    throw error;
  }
}

/**
 * Update wiki page with versioning
 */
async function updatePage(pageId, updates, userId) {
  try {
    const page = await WikiPage.findByPk(pageId);

    if (!page) {
      throw new Error('Wiki page not found');
    }

    // Check edit permissions
    if (page.visibility === 'private' && page.createdById !== userId) {
      throw new Error('Access denied');
    }

    // Check if page is locked
    if (page.lockedBy && page.lockedBy !== userId) {
      throw new Error('Page is locked by another user');
    }

    let updateData = { ...updates };

    // Create new version if content changed
    if (updates.content && updates.content !== page.content) {
      // Save current version as previous version
      await WikiPage.create({
        ...page.toJSON(),
        id: undefined, // Let Sequelize generate new ID
        isLatestVersion: false,
        version: page.version,
        createdAt: page.createdAt,
        updatedAt: page.updatedAt
      });

      updateData.version = page.version + 1;
      updateData.searchableText = extractSearchableText(updates.content);
    }

    // Update path if slug changed
    if (updates.slug && updates.slug !== page.slug) {
      const pathParts = page.path.split('/');
      pathParts[pathParts.length - 1] = updates.slug;
      updateData.path = pathParts.join('/');

      // Update child pages' paths recursively
      await updateChildPaths(page.id, updateData.path);
    }

    // Update contributors
    const contributors = page.contributors || [];
    if (!contributors.includes(userId)) {
      updateData.contributors = [...contributors, userId];
    }

    updateData.lastEditedById = userId;
    updateData.lastEditedAt = new Date();
    updateData.editCount = page.editCount + 1;

    await page.update(updateData);

    logger.info('Wiki page updated', {
      pageId,
      userId,
      newVersion: updateData.version || page.version
    });

    return page;
  } catch (error) {
    logger.error('Failed to update wiki page', { error: error.message, pageId });
    throw error;
  }
}

/**
 * Delete wiki page
 */
async function deletePage(pageId, userId) {
  try {
    const page = await WikiPage.findByPk(pageId);

    if (!page) {
      throw new Error('Wiki page not found');
    }

    // Check if page has children
    const childCount = await WikiPage.count({
      where: { parentPageId: pageId }
    });

    if (childCount > 0) {
      throw new Error('Cannot delete page with child pages. Delete or move child pages first.');
    }

    await page.destroy();

    logger.info('Wiki page deleted', { pageId, userId });

    return { success: true };
  } catch (error) {
    logger.error('Failed to delete wiki page', { error: error.message, pageId });
    throw error;
  }
}

/**
 * Get page version history
 */
async function getPageHistory(pageId, limit = 50) {
  try {
    const versions = [];
    let currentPage = await WikiPage.findByPk(pageId);

    if (!currentPage) {
      throw new Error('Wiki page not found');
    }

    versions.push(currentPage);

    // Follow the chain of previous versions
    let previousVersionId = currentPage.previousVersionId;
    while (previousVersionId && versions.length < limit) {
      const prevVersion = await WikiPage.findByPk(previousVersionId);
      if (!prevVersion) break;
      versions.push(prevVersion);
      previousVersionId = prevVersion.previousVersionId;
    }

    logger.info('Wiki page history retrieved', { pageId, versionCount: versions.length });

    return versions;
  } catch (error) {
    logger.error('Failed to get page history', { error: error.message, pageId });
    throw error;
  }
}

/**
 * Get child pages
 */
async function getChildPages(pageId, recursive = false) {
  try {
    const children = await WikiPage.findAll({
      where: { parentPageId: pageId },
      order: [['position', 'ASC']],
      attributes: { exclude: ['content', 'searchableText'] }
    });

    if (recursive) {
      const allDescendants = [...children];
      for (const child of children) {
        const descendants = await getDescendantsRecursive(child.id);
        allDescendants.push(...descendants);
      }
      return allDescendants;
    }

    return children;
  } catch (error) {
    logger.error('Failed to get child pages', { error: error.message, pageId });
    throw error;
  }
}

/**
 * Publish wiki page
 */
async function publishPage(pageId, userId) {
  try {
    const page = await WikiPage.findByPk(pageId);

    if (!page) {
      throw new Error('Wiki page not found');
    }

    if (page.status === 'published') {
      throw new Error('Page is already published');
    }

    await page.update({
      status: 'published',
      publishedAt: new Date()
    });

    logger.info('Wiki page published', { pageId, userId });

    return page;
  } catch (error) {
    logger.error('Failed to publish wiki page', { error: error.message, pageId });
    throw error;
  }
}

/**
 * Lock/unlock page for editing
 */
async function togglePageLock(pageId, locked, userId) {
  try {
    const page = await WikiPage.findByPk(pageId);

    if (!page) {
      throw new Error('Wiki page not found');
    }

    if (locked) {
      if (page.lockedBy && page.lockedBy !== userId) {
        throw new Error('Page is already locked by another user');
      }
      await page.update({
        lockedBy: userId,
        lockedAt: new Date()
      });
    } else {
      if (page.lockedBy !== userId) {
        throw new Error('Only the user who locked the page can unlock it');
      }
      await page.update({
        lockedBy: null,
        lockedAt: null
      });
    }

    logger.info('Wiki page lock status changed', { pageId, userId, locked });

    return page;
  } catch (error) {
    logger.error('Failed to change lock status', { error: error.message, pageId });
    throw error;
  }
}

/**
 * Search wiki pages with advanced filters
 */
async function searchPages(query, options = {}) {
  try {
    const {
      category,
      tags,
      status,
      visibility,
      userId,
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
    if (visibility) where.visibility = visibility;
    if (tags && tags.length > 0) {
      where.tags = { [Op.overlap]: tags };
    }

    // Filter by visibility permissions
    if (userId) {
      where[Op.or] = [
        { visibility: 'public' },
        { visibility: 'private', createdById: userId },
        { visibility: 'restricted' } // Would need additional permission check
      ];
    } else {
      where.visibility = 'public';
    }

    const results = await WikiPage.findAll({
      where,
      limit,
      offset,
      order: [['updatedAt', 'DESC']],
      attributes: { exclude: ['content', 'searchableText'] }
    });

    logger.info('Wiki search completed', { query, resultCount: results.length });

    return results;
  } catch (error) {
    logger.error('Failed to search wiki pages', { error: error.message, query });
    throw error;
  }
}

/**
 * Move page to different parent
 */
async function movePage(pageId, newParentId, userId) {
  try {
    const page = await WikiPage.findByPk(pageId);

    if (!page) {
      throw new Error('Wiki page not found');
    }

    let newDepth = 0;
    let newPath = `/${page.slug}`;

    if (newParentId) {
      const newParent = await WikiPage.findByPk(newParentId);
      if (!newParent) {
        throw new Error('New parent page not found');
      }

      // Prevent circular references
      if (newParent.path.startsWith(page.path)) {
        throw new Error('Cannot move page to one of its descendants');
      }

      newDepth = newParent.depth + 1;
      newPath = `${newParent.path}/${page.slug}`;
    }

    await page.update({
      parentPageId: newParentId,
      depth: newDepth,
      path: newPath
    });

    // Update all child pages' paths recursively
    await updateChildPaths(pageId, newPath);

    logger.info('Wiki page moved', { pageId, newParentId, userId });

    return page;
  } catch (error) {
    logger.error('Failed to move wiki page', { error: error.message, pageId });
    throw error;
  }
}

/**
 * Duplicate page (optionally as template)
 */
async function duplicatePage(pageId, options, userId) {
  try {
    const sourcePage = await WikiPage.findByPk(pageId);

    if (!sourcePage) {
      throw new Error('Source wiki page not found');
    }

    const {
      title,
      slug,
      asTemplate = false,
      includeChildren = false
    } = options;

    const duplicatedPage = await createPage({
      title: title || `${sourcePage.title} (Copy)`,
      slug: slug || `${sourcePage.slug}-copy-${Date.now()}`,
      content: sourcePage.content,
      contentFormat: sourcePage.contentFormat,
      category: sourcePage.category,
      tags: sourcePage.tags,
      isTemplate: asTemplate,
      templateId: asTemplate ? sourcePage.id : sourcePage.templateId,
      visibility: 'private', // Always start as private
      status: 'draft',
      userId
    });

    if (includeChildren) {
      await duplicateChildrenRecursive(sourcePage.id, duplicatedPage.id, userId);
    }

    logger.info('Wiki page duplicated', { sourcePageId: pageId, newPageId: duplicatedPage.id, userId });

    return duplicatedPage;
  } catch (error) {
    logger.error('Failed to duplicate wiki page', { error: error.message, pageId });
    throw error;
  }
}

// Helper functions

/**
 * Extract searchable text from content
 */
function extractSearchableText(content) {
  return content
    .replace(/<[^>]*>/g, ' ') // Remove HTML tags
    .replace(/[#*_`]/g, '') // Remove markdown symbols
    .replace(/\s+/g, ' ') // Normalize whitespace
    .toLowerCase()
    .trim();
}

/**
 * Recursively get all descendants
 */
async function getDescendantsRecursive(pageId) {
  const children = await WikiPage.findAll({
    where: { parentPageId: pageId },
    order: [['position', 'ASC']],
    attributes: { exclude: ['content', 'searchableText'] }
  });

  const descendants = [...children];
  for (const child of children) {
    const childDescendants = await getDescendantsRecursive(child.id);
    descendants.push(...childDescendants);
  }
  return descendants;
}

/**
 * Update child pages' paths recursively
 */
async function updateChildPaths(parentPageId, newParentPath) {
  const children = await WikiPage.findAll({
    where: { parentPageId }
  });

  for (const child of children) {
    const newChildPath = `${newParentPath}/${child.slug}`;
    await child.update({ path: newChildPath });
    await updateChildPaths(child.id, newChildPath);
  }
}

/**
 * Duplicate children recursively
 */
async function duplicateChildrenRecursive(sourceParentId, newParentId, userId) {
  const children = await WikiPage.findAll({
    where: { parentPageId: sourceParentId },
    order: [['position', 'ASC']]
  });

  for (const child of children) {
    const duplicatedChild = await createPage({
      title: child.title,
      slug: `${child.slug}-copy-${Date.now()}`,
      content: child.content,
      contentFormat: child.contentFormat,
      parentPageId: newParentId,
      position: child.position,
      category: child.category,
      tags: child.tags,
      visibility: 'private',
      status: 'draft',
      userId
    });

    await duplicateChildrenRecursive(child.id, duplicatedChild.id, userId);
  }
}

module.exports = {
  listPages,
  getPageById,
  getPageBySlug,
  createPage,
  updatePage,
  deletePage,
  getPageHistory,
  getChildPages,
  publishPage,
  togglePageLock,
  searchPages,
  movePage,
  duplicatePage
};
