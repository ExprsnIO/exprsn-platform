/**
 * ═══════════════════════════════════════════════════════════
 * Query Service - Business logic for visual queries
 * ═══════════════════════════════════════════════════════════
 */

// In-memory storage (shared with routes/queries.js)
// TODO: Replace with database storage
const queries = new Map();

class QueryService {
  /**
   * Get query by ID
   */
  static async getQueryById(queryId) {
    const query = queries.get(queryId);

    if (!query) {
      throw new Error('Query not found');
    }

    return query;
  }

  /**
   * Get all queries for an application
   */
  static async getQueriesByApplicationId(applicationId) {
    return Array.from(queries.values())
      .filter(q => q.applicationId === applicationId)
      .sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));
  }

  /**
   * Create a new query
   */
  static async createQuery(queryData) {
    queryData.createdAt = new Date().toISOString();
    queryData.updatedAt = new Date().toISOString();

    queries.set(queryData.id, queryData);

    return queryData;
  }

  /**
   * Update an existing query
   */
  static async updateQuery(queryId, queryData) {
    const existingQuery = queries.get(queryId);

    if (!existingQuery) {
      throw new Error('Query not found');
    }

    queryData.id = queryId;
    queryData.createdAt = existingQuery.createdAt;
    queryData.updatedAt = new Date().toISOString();

    queries.set(queryId, queryData);

    return queryData;
  }

  /**
   * Delete a query
   */
  static async deleteQuery(queryId) {
    const existingQuery = queries.get(queryId);

    if (!existingQuery) {
      throw new Error('Query not found');
    }

    queries.delete(queryId);

    return true;
  }
}

module.exports = QueryService;
