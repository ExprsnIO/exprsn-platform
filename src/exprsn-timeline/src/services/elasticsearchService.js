/**
 * ═══════════════════════════════════════════════════════════
 * ElasticSearch Service
 * Search indexing and full-text search for posts
 * ═══════════════════════════════════════════════════════════
 */

const { Client } = require('@elastic/elasticsearch');
const config = require('../config');
const logger = require('../utils/logger');

let client = null;

/**
 * Initialize ElasticSearch client
 */
function initClient() {
  if (!config.elasticsearch.enabled) {
    logger.info('ElasticSearch is disabled');
    return null;
  }

  if (client) {
    return client;
  }

  try {
    const clientConfig = {
      node: config.elasticsearch.node,
      maxRetries: config.elasticsearch.maxRetries,
      requestTimeout: config.elasticsearch.requestTimeout,
      sniffOnStart: config.elasticsearch.sniffOnStart
    };

    // Add authentication if password is provided
    if (config.elasticsearch.auth.password) {
      clientConfig.auth = {
        username: config.elasticsearch.auth.username,
        password: config.elasticsearch.auth.password
      };
    }

    client = new Client(clientConfig);

    logger.info('ElasticSearch client initialized', {
      node: config.elasticsearch.node,
      indices: config.elasticsearch.indices
    });

    return client;
  } catch (error) {
    logger.error('Failed to initialize ElasticSearch client', {
      error: error.message
    });
    return null;
  }
}

/**
 * Get ElasticSearch client instance
 */
function getClient() {
  if (!client) {
    return initClient();
  }
  return client;
}

/**
 * Posts index mapping
 * Optimized for full-text search and filtering
 */
const postsIndexMapping = {
  properties: {
    id: { type: 'keyword' },
    userId: { type: 'keyword' },
    content: {
      type: 'text',
      analyzer: 'standard',
      fields: {
        keyword: { type: 'keyword', ignore_above: 256 }
      }
    },
    contentType: { type: 'keyword' },
    visibility: { type: 'keyword' },
    status: { type: 'keyword' },

    // Full-text searchable fields
    hashtags: {
      type: 'keyword',
      normalizer: 'lowercase'
    },
    mentions: { type: 'keyword' },
    urls: { type: 'keyword' },

    // Metadata
    language: { type: 'keyword' },
    isRepost: { type: 'boolean' },
    originalPostId: { type: 'keyword' },
    replyToPostId: { type: 'keyword' },
    replyToUserId: { type: 'keyword' },

    // Engagement metrics (for ranking)
    likeCount: { type: 'integer' },
    repostCount: { type: 'integer' },
    replyCount: { type: 'integer' },
    viewCount: { type: 'integer' },
    engagementScore: { type: 'float' },

    // Timestamps
    createdAt: { type: 'date' },
    updatedAt: { type: 'date' },
    publishedAt: { type: 'date' },

    // Location data
    location: { type: 'geo_point' },
    locationName: { type: 'text' },

    // Media attachments
    hasMedia: { type: 'boolean' },
    mediaTypes: { type: 'keyword' },
    mediaCount: { type: 'integer' },

    // Search optimization
    searchText: {
      type: 'text',
      analyzer: 'standard',
      search_analyzer: 'standard'
    }
  }
};

/**
 * Create posts index
 */
async function createPostsIndex() {
  const esClient = getClient();
  if (!esClient) {
    return { success: false, reason: 'ElasticSearch disabled' };
  }

  const indexName = config.elasticsearch.indices.posts;

  try {
    // Check if index exists
    const exists = await esClient.indices.exists({ index: indexName });

    if (exists) {
      logger.info('Posts index already exists', { index: indexName });
      return { success: true, exists: true };
    }

    // Create index with mapping
    await esClient.indices.create({
      index: indexName,
      body: {
        settings: {
          number_of_shards: 3,
          number_of_replicas: 1,
          analysis: {
            normalizer: {
              lowercase: {
                type: 'custom',
                filter: ['lowercase']
              }
            }
          }
        },
        mappings: postsIndexMapping
      }
    });

    logger.info('Posts index created successfully', { index: indexName });
    return { success: true, created: true };
  } catch (error) {
    logger.error('Failed to create posts index', {
      index: indexName,
      error: error.message
    });
    return { success: false, error: error.message };
  }
}

/**
 * Index a post document
 */
async function indexPost(post) {
  const esClient = getClient();
  if (!esClient) {
    return { success: false, reason: 'ElasticSearch disabled' };
  }

  const indexName = config.elasticsearch.indices.posts;

  try {
    // Build search text combining all searchable fields
    const searchText = [
      post.content,
      post.hashtags?.join(' '),
      post.mentions?.join(' '),
      post.locationName
    ]
      .filter(Boolean)
      .join(' ');

    const document = {
      id: post.id,
      userId: post.userId,
      content: post.content,
      contentType: post.contentType || 'text',
      visibility: post.visibility || 'public',
      status: post.status || 'published',

      hashtags: post.hashtags || [],
      mentions: post.mentions || [],
      urls: post.urls || [],

      language: post.language || 'en',
      isRepost: post.isRepost || false,
      originalPostId: post.originalPostId || null,
      replyToPostId: post.replyToPostId || null,
      replyToUserId: post.replyToUserId || null,

      likeCount: post.likeCount || 0,
      repostCount: post.repostCount || 0,
      replyCount: post.replyCount || 0,
      viewCount: post.viewCount || 0,
      engagementScore: post.engagementScore || 0,

      createdAt: post.createdAt,
      updatedAt: post.updatedAt,
      publishedAt: post.publishedAt || post.createdAt,

      location: post.location ? {
        lat: post.location.lat,
        lon: post.location.lon
      } : null,
      locationName: post.locationName || null,

      hasMedia: post.hasMedia || false,
      mediaTypes: post.mediaTypes || [],
      mediaCount: post.mediaCount || 0,

      searchText
    };

    await esClient.index({
      index: indexName,
      id: post.id,
      document,
      refresh: false // Bulk refresh handled separately
    });

    logger.debug('Post indexed successfully', {
      postId: post.id,
      index: indexName
    });

    return { success: true, postId: post.id };
  } catch (error) {
    logger.error('Failed to index post', {
      postId: post.id,
      error: error.message
    });
    return { success: false, error: error.message };
  }
}

/**
 * Bulk index posts
 */
async function bulkIndexPosts(posts) {
  const esClient = getClient();
  if (!esClient) {
    return { success: false, reason: 'ElasticSearch disabled' };
  }

  const indexName = config.elasticsearch.indices.posts;

  try {
    const operations = posts.flatMap(post => {
      const searchText = [
        post.content,
        post.hashtags?.join(' '),
        post.mentions?.join(' '),
        post.locationName
      ]
        .filter(Boolean)
        .join(' ');

      return [
        { index: { _index: indexName, _id: post.id } },
        {
          id: post.id,
          userId: post.userId,
          content: post.content,
          contentType: post.contentType || 'text',
          visibility: post.visibility || 'public',
          status: post.status || 'published',
          hashtags: post.hashtags || [],
          mentions: post.mentions || [],
          urls: post.urls || [],
          language: post.language || 'en',
          isRepost: post.isRepost || false,
          originalPostId: post.originalPostId || null,
          replyToPostId: post.replyToPostId || null,
          replyToUserId: post.replyToUserId || null,
          likeCount: post.likeCount || 0,
          repostCount: post.repostCount || 0,
          replyCount: post.replyCount || 0,
          viewCount: post.viewCount || 0,
          engagementScore: post.engagementScore || 0,
          createdAt: post.createdAt,
          updatedAt: post.updatedAt,
          publishedAt: post.publishedAt || post.createdAt,
          location: post.location ? { lat: post.location.lat, lon: post.location.lon } : null,
          locationName: post.locationName || null,
          hasMedia: post.hasMedia || false,
          mediaTypes: post.mediaTypes || [],
          mediaCount: post.mediaCount || 0,
          searchText
        }
      ];
    });

    const result = await esClient.bulk({
      operations,
      refresh: true
    });

    const errors = result.items.filter(item => item.index?.error);

    logger.info('Bulk index completed', {
      total: posts.length,
      errors: errors.length,
      successful: posts.length - errors.length
    });

    return {
      success: true,
      total: posts.length,
      indexed: posts.length - errors.length,
      errors: errors.length
    };
  } catch (error) {
    logger.error('Failed to bulk index posts', {
      count: posts.length,
      error: error.message
    });
    return { success: false, error: error.message };
  }
}

/**
 * Update post document
 */
async function updatePost(postId, updates) {
  const esClient = getClient();
  if (!esClient) {
    return { success: false, reason: 'ElasticSearch disabled' };
  }

  const indexName = config.elasticsearch.indices.posts;

  try {
    await esClient.update({
      index: indexName,
      id: postId,
      doc: updates,
      refresh: false
    });

    logger.debug('Post updated in index', {
      postId,
      fields: Object.keys(updates)
    });

    return { success: true, postId };
  } catch (error) {
    logger.error('Failed to update post in index', {
      postId,
      error: error.message
    });
    return { success: false, error: error.message };
  }
}

/**
 * Delete post from index
 */
async function deletePost(postId) {
  const esClient = getClient();
  if (!esClient) {
    return { success: false, reason: 'ElasticSearch disabled' };
  }

  const indexName = config.elasticsearch.indices.posts;

  try {
    await esClient.delete({
      index: indexName,
      id: postId,
      refresh: false
    });

    logger.debug('Post deleted from index', { postId });
    return { success: true, postId };
  } catch (error) {
    if (error.meta?.statusCode === 404) {
      logger.warn('Post not found in index', { postId });
      return { success: true, postId, notFound: true };
    }

    logger.error('Failed to delete post from index', {
      postId,
      error: error.message
    });
    return { success: false, error: error.message };
  }
}

/**
 * Search posts
 */
async function searchPosts(query, options = {}) {
  const esClient = getClient();
  if (!esClient) {
    return { success: false, reason: 'ElasticSearch disabled' };
  }

  const indexName = config.elasticsearch.indices.posts;

  try {
    const {
      from = 0,
      size = 20,
      sortBy = 'relevance', // relevance, recent, popular
      filters = {}
    } = options;

    // Build query
    const must = [];
    const filter = [];

    // Main search query
    if (query && query.trim()) {
      must.push({
        multi_match: {
          query: query,
          fields: ['searchText^2', 'content^1.5', 'hashtags^3'],
          type: 'best_fields',
          fuzziness: 'AUTO'
        }
      });
    } else {
      must.push({ match_all: {} });
    }

    // Apply filters
    if (filters.userId) {
      filter.push({ term: { userId: filters.userId } });
    }
    if (filters.hashtag) {
      filter.push({ term: { hashtags: filters.hashtag.toLowerCase() } });
    }
    if (filters.visibility) {
      filter.push({ term: { visibility: filters.visibility } });
    }
    if (filters.hasMedia !== undefined) {
      filter.push({ term: { hasMedia: filters.hasMedia } });
    }
    if (filters.dateFrom) {
      filter.push({ range: { createdAt: { gte: filters.dateFrom } } });
    }
    if (filters.dateTo) {
      filter.push({ range: { createdAt: { lte: filters.dateTo } } });
    }

    // Default filter: only published posts
    filter.push({ term: { status: 'published' } });

    // Build sort
    let sort = [];
    if (sortBy === 'recent') {
      sort = [{ createdAt: 'desc' }];
    } else if (sortBy === 'popular') {
      sort = [
        { engagementScore: 'desc' },
        { createdAt: 'desc' }
      ];
    } else {
      sort = ['_score', { createdAt: 'desc' }];
    }

    const result = await esClient.search({
      index: indexName,
      from,
      size,
      query: {
        bool: {
          must,
          filter
        }
      },
      sort
    });

    const posts = result.hits.hits.map(hit => ({
      ...hit._source,
      _score: hit._score
    }));

    return {
      success: true,
      posts,
      total: result.hits.total.value,
      from,
      size
    };
  } catch (error) {
    logger.error('Search failed', {
      query,
      error: error.message
    });
    return { success: false, error: error.message };
  }
}

/**
 * Check ElasticSearch health
 */
async function checkHealth() {
  const esClient = getClient();
  if (!esClient) {
    return {
      status: 'disabled',
      healthy: false,
      message: 'ElasticSearch is not enabled'
    };
  }

  try {
    const health = await esClient.cluster.health();
    const indexName = config.elasticsearch.indices.posts;

    // Check if posts index exists
    const indexExists = await esClient.indices.exists({ index: indexName });

    return {
      status: 'connected',
      healthy: health.status === 'green' || health.status === 'yellow',
      cluster: {
        name: health.cluster_name,
        status: health.status,
        numberOfNodes: health.number_of_nodes,
        numberOfDataNodes: health.number_of_data_nodes
      },
      indices: {
        posts: indexExists ? 'exists' : 'missing'
      }
    };
  } catch (error) {
    return {
      status: 'disconnected',
      healthy: false,
      error: error.message
    };
  }
}

/**
 * Refresh index
 */
async function refreshIndex() {
  const esClient = getClient();
  if (!esClient) {
    return { success: false, reason: 'ElasticSearch disabled' };
  }

  const indexName = config.elasticsearch.indices.posts;

  try {
    await esClient.indices.refresh({ index: indexName });
    logger.debug('Index refreshed', { index: indexName });
    return { success: true };
  } catch (error) {
    logger.error('Failed to refresh index', {
      index: indexName,
      error: error.message
    });
    return { success: false, error: error.message };
  }
}

/**
 * Close ElasticSearch client
 */
async function closeClient() {
  if (client) {
    try {
      await client.close();
      client = null;
      logger.info('ElasticSearch client closed');
    } catch (error) {
      logger.error('Error closing ElasticSearch client', {
        error: error.message
      });
    }
  }
}

module.exports = {
  initClient,
  getClient,
  createPostsIndex,
  indexPost,
  bulkIndexPosts,
  updatePost,
  deletePost,
  searchPosts,
  checkHealth,
  refreshIndex,
  closeClient
};
