/**
 * ═══════════════════════════════════════════════════════════
 * Pagination Utilities
 * Cursor-based pagination for infinite scroll
 * ═══════════════════════════════════════════════════════════
 */

const { Op } = require('sequelize');

/**
 * Cursor-based pagination for Sequelize models
 * @param {Object} model - Sequelize model
 * @param {Object} options - Pagination options
 * @returns {Promise<Object>} Paginated results
 */
async function cursorPaginate(model, options = {}) {
  const {
    cursor,
    limit = 20,
    where = {},
    order = [['id', 'ASC']],
    include = [],
    attributes
  } = options;

  // Parse cursor if exists
  const cursorWhere = cursor ? parseCursor(cursor, order) : {};

  // Combine where clauses
  const combinedWhere = { ...where, ...cursorWhere };

  // Fetch limit + 1 to check if there are more results
  const results = await model.findAll({
    where: combinedWhere,
    limit: parseInt(limit) + 1,
    order,
    include,
    attributes
  });

  // Check if there are more results
  const hasMore = results.length > limit;

  // Remove extra item if exists
  const items = hasMore ? results.slice(0, -1) : results;

  // Generate next cursor
  const nextCursor = hasMore && items.length > 0
    ? generateCursor(items[items.length - 1], order)
    : null;

  return {
    items,
    pageInfo: {
      hasMore,
      nextCursor,
      count: items.length
    }
  };
}

/**
 * Generate cursor from item and order
 */
function generateCursor(item, order) {
  const cursorData = {};

  for (const [field] of order) {
    cursorData[field] = item[field];
  }

  // Encode as base64
  return Buffer.from(JSON.stringify(cursorData)).toString('base64');
}

/**
 * Parse cursor into where clause
 */
function parseCursor(cursor, order) {
  try {
    // Decode from base64
    const decoded = Buffer.from(cursor, 'base64').toString('utf8');
    const cursorData = JSON.parse(decoded);

    const where = {};

    // Build where clause based on sort order
    const [[field, direction]] = order;

    if (direction === 'ASC') {
      where[field] = { [Op.gt]: cursorData[field] };
    } else {
      where[field] = { [Op.lt]: cursorData[field] };
    }

    return where;
  } catch (error) {
    // Invalid cursor, return empty where clause
    return {};
  }
}

/**
 * Offset-based pagination (traditional)
 * @param {Object} model - Sequelize model
 * @param {Object} options - Pagination options
 * @returns {Promise<Object>} Paginated results
 */
async function offsetPaginate(model, options = {}) {
  const {
    page = 1,
    limit = 20,
    where = {},
    order = [['created_at', 'DESC']],
    include = [],
    attributes
  } = options;

  const offset = (parseInt(page) - 1) * parseInt(limit);

  const { count, rows } = await model.findAndCountAll({
    where,
    limit: parseInt(limit),
    offset,
    order,
    include,
    attributes,
    distinct: true
  });

  const totalPages = Math.ceil(count / limit);

  return {
    items: rows,
    pageInfo: {
      currentPage: parseInt(page),
      totalPages,
      totalItems: count,
      itemsPerPage: parseInt(limit),
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1
    }
  };
}

/**
 * Keyset pagination (more efficient than offset for large datasets)
 * @param {Object} model - Sequelize model
 * @param {Object} options - Pagination options
 * @returns {Promise<Object>} Paginated results
 */
async function keysetPaginate(model, options = {}) {
  const {
    afterId,
    beforeId,
    limit = 20,
    where = {},
    order = [['id', 'ASC']],
    include = [],
    attributes
  } = options;

  let keysetWhere = { ...where };

  if (afterId) {
    keysetWhere.id = { [Op.gt]: afterId };
  } else if (beforeId) {
    keysetWhere.id = { [Op.lt]: beforeId };
  }

  const results = await model.findAll({
    where: keysetWhere,
    limit: parseInt(limit) + 1,
    order,
    include,
    attributes
  });

  const hasMore = results.length > limit;
  const items = hasMore ? results.slice(0, -1) : results;

  return {
    items,
    pageInfo: {
      hasMore,
      afterId: items.length > 0 ? items[items.length - 1].id : null,
      beforeId: items.length > 0 ? items[0].id : null,
      count: items.length
    }
  };
}

/**
 * Parse pagination parameters from request
 */
function parsePaginationParams(req, defaultLimit = 20, maxLimit = 100) {
  const {
    cursor,
    page,
    limit,
    afterId,
    beforeId,
    sortBy,
    sortOrder = 'DESC'
  } = req.query;

  const parsedLimit = Math.min(parseInt(limit) || defaultLimit, maxLimit);

  // Determine pagination type
  const paginationType = cursor
    ? 'cursor'
    : afterId || beforeId
      ? 'keyset'
      : 'offset';

  // Parse sort order
  const order = sortBy
    ? [[sortBy, sortOrder.toUpperCase()]]
    : [['created_at', 'DESC']];

  return {
    type: paginationType,
    cursor,
    page: parseInt(page) || 1,
    limit: parsedLimit,
    afterId,
    beforeId,
    order
  };
}

/**
 * Format paginated response
 */
function formatPaginatedResponse(data, baseUrl, queryParams = {}) {
  const { items, pageInfo } = data;

  const response = {
    success: true,
    data: items,
    pageInfo
  };

  // Add navigation links for cursor pagination
  if (pageInfo.nextCursor) {
    const nextParams = new URLSearchParams({
      ...queryParams,
      cursor: pageInfo.nextCursor
    });
    response.pageInfo.nextUrl = `${baseUrl}?${nextParams.toString()}`;
  }

  return response;
}

/**
 * Middleware to add pagination to request
 */
function paginationMiddleware(options = {}) {
  const {
    defaultLimit = 20,
    maxLimit = 100
  } = options;

  return (req, res, next) => {
    req.pagination = parsePaginationParams(req, defaultLimit, maxLimit);
    next();
  };
}

module.exports = {
  cursorPaginate,
  offsetPaginate,
  keysetPaginate,
  parsePaginationParams,
  formatPaginatedResponse,
  paginationMiddleware,
  generateCursor,
  parseCursor
};
