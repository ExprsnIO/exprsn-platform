/**
 * ═══════════════════════════════════════════════════════════
 * Cursor-based Pagination Utilities
 * Encode/decode cursors for efficient infinite scroll
 * ═══════════════════════════════════════════════════════════
 */

/**
 * Encode cursor from timestamp and ID
 * Creates a base64-encoded string containing timestamp and ID
 *
 * @param {Date|string} timestamp - Post creation timestamp
 * @param {string} id - Post ID
 * @returns {string} - Base64-encoded cursor
 */
function encodeCursor(timestamp, id) {
  if (!timestamp || !id) {
    return null;
  }

  const timestampMs = timestamp instanceof Date
    ? timestamp.getTime()
    : new Date(timestamp).getTime();

  const cursorData = {
    t: timestampMs,
    id
  };

  return Buffer.from(JSON.stringify(cursorData)).toString('base64');
}

/**
 * Decode cursor to timestamp and ID
 *
 * @param {string} cursor - Base64-encoded cursor
 * @returns {Object|null} - { timestamp: Date, id: string } or null if invalid
 */
function decodeCursor(cursor) {
  if (!cursor) {
    return null;
  }

  try {
    const decoded = Buffer.from(cursor, 'base64').toString('utf8');
    const cursorData = JSON.parse(decoded);

    if (!cursorData.t || !cursorData.id) {
      return null;
    }

    return {
      timestamp: new Date(cursorData.t),
      id: cursorData.id
    };
  } catch (error) {
    // Invalid cursor format
    return null;
  }
}

/**
 * Build cursor-based pagination response
 *
 * @param {Array} items - Array of items (posts, etc.)
 * @param {number} limit - Requested limit
 * @param {string} [cursorField='createdAt'] - Field to use for cursor
 * @param {string} [idField='id'] - ID field name
 * @returns {Object} - Pagination metadata with cursors
 */
function buildCursorResponse(items, limit, cursorField = 'createdAt', idField = 'id') {
  const hasMore = items.length > limit;
  const itemsToReturn = hasMore ? items.slice(0, limit) : items;

  let nextCursor = null;
  let prevCursor = null;

  if (itemsToReturn.length > 0) {
    // Next cursor points to the last item
    const lastItem = itemsToReturn[itemsToReturn.length - 1];
    nextCursor = encodeCursor(lastItem[cursorField], lastItem[idField]);

    // Previous cursor points to the first item
    const firstItem = itemsToReturn[0];
    prevCursor = encodeCursor(firstItem[cursorField], firstItem[idField]);
  }

  return {
    items: itemsToReturn,
    pagination: {
      hasMore,
      nextCursor: hasMore ? nextCursor : null,
      prevCursor,
      count: itemsToReturn.length
    }
  };
}

/**
 * Build Sequelize where clause for cursor pagination
 *
 * @param {string} cursor - Base64-encoded cursor
 * @param {string} direction - 'after' or 'before'
 * @param {string} [cursorField='createdAt'] - Field to use for cursor
 * @param {string} [idField='id'] - ID field name
 * @returns {Object|null} - Sequelize where clause
 */
function buildCursorWhere(cursor, direction = 'after', cursorField = 'createdAt', idField = 'id') {
  const decoded = decodeCursor(cursor);

  if (!decoded) {
    return null;
  }

  const { Op } = require('sequelize');

  if (direction === 'after') {
    // Get items after this cursor (older items for DESC order)
    return {
      [Op.or]: [
        {
          [cursorField]: {
            [Op.lt]: decoded.timestamp
          }
        },
        {
          [cursorField]: decoded.timestamp,
          [idField]: {
            [Op.lt]: decoded.id
          }
        }
      ]
    };
  } else if (direction === 'before') {
    // Get items before this cursor (newer items for DESC order)
    return {
      [Op.or]: [
        {
          [cursorField]: {
            [Op.gt]: decoded.timestamp
          }
        },
        {
          [cursorField]: decoded.timestamp,
          [idField]: {
            [Op.gt]: decoded.id
          }
        }
      ]
    };
  }

  return null;
}

/**
 * Parse pagination parameters from request
 * Supports both cursor-based and offset-based pagination
 *
 * @param {Object} query - Request query parameters
 * @returns {Object} - Parsed pagination parameters
 */
function parsePaginationParams(query) {
  const {
    cursor,
    limit = 20,
    direction = 'after',
    // Legacy offset-based params
    page,
    offset
  } = query;

  const parsedLimit = Math.min(parseInt(limit) || 20, 100); // Max 100 items

  // Cursor-based pagination
  if (cursor) {
    return {
      type: 'cursor',
      cursor,
      limit: parsedLimit + 1, // Fetch one extra to check if there are more
      direction,
      cursorData: decodeCursor(cursor)
    };
  }

  // Legacy offset-based pagination
  if (offset !== undefined || page !== undefined) {
    const parsedOffset = offset !== undefined
      ? parseInt(offset) || 0
      : (parseInt(page) - 1) * parsedLimit || 0;

    return {
      type: 'offset',
      limit: parsedLimit,
      offset: parsedOffset,
      page: page !== undefined ? parseInt(page) || 1 : Math.floor(parsedOffset / parsedLimit) + 1
    };
  }

  // Default: cursor-based with no cursor (start from beginning)
  return {
    type: 'cursor',
    cursor: null,
    limit: parsedLimit + 1,
    direction: 'after',
    cursorData: null
  };
}

/**
 * Validate cursor
 *
 * @param {string} cursor - Cursor to validate
 * @returns {boolean} - True if valid
 */
function isValidCursor(cursor) {
  if (!cursor || typeof cursor !== 'string') {
    return false;
  }

  const decoded = decodeCursor(cursor);
  return decoded !== null;
}

module.exports = {
  encodeCursor,
  decodeCursor,
  buildCursorResponse,
  buildCursorWhere,
  parsePaginationParams,
  isValidCursor
};
