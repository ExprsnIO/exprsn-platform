/**
 * Search Service
 * Elasticsearch integration for fast full-text search
 */

const { Client } = require('@elastic/elasticsearch');
const { createLogger } = require('@exprsn/shared');

const logger = createLogger('exprsn-spark:search');

// Elasticsearch client
const esClient = new Client({
  node: process.env.ELASTICSEARCH_URL || 'http://localhost:9200',
  auth: process.env.ELASTICSEARCH_AUTH ? {
    username: process.env.ELASTICSEARCH_USERNAME,
    password: process.env.ELASTICSEARCH_PASSWORD
  } : undefined
});

const INDEX_NAME = process.env.ELASTICSEARCH_INDEX_PREFIX
  ? `${process.env.ELASTICSEARCH_INDEX_PREFIX}messages`
  : 'spark_messages';

/**
 * Create Elasticsearch index with mapping
 */
async function createIndex() {
  try {
    const exists = await esClient.indices.exists({ index: INDEX_NAME });

    if (!exists) {
      await esClient.indices.create({
        index: INDEX_NAME,
        body: {
          settings: {
            number_of_shards: 2,
            number_of_replicas: 1,
            analysis: {
              analyzer: {
                message_analyzer: {
                  type: 'custom',
                  tokenizer: 'standard',
                  filter: ['lowercase', 'asciifolding', 'stop']
                }
              }
            }
          },
          mappings: {
            properties: {
              messageId: { type: 'keyword' },
              conversationId: { type: 'keyword' },
              senderId: { type: 'keyword' },
              content: {
                type: 'text',
                analyzer: 'message_analyzer',
                fields: {
                  keyword: { type: 'keyword' }
                }
              },
              contentType: { type: 'keyword' },
              mentions: { type: 'keyword' },
              hasAttachments: { type: 'boolean' },
              attachmentTypes: { type: 'keyword' },
              createdAt: { type: 'date' },
              updatedAt: { type: 'date' },
              deleted: { type: 'boolean' }
            }
          }
        }
      });

      logger.info('Elasticsearch index created', { index: INDEX_NAME });
    }
  } catch (error) {
    logger.error('Failed to create Elasticsearch index', {
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

/**
 * Index a message in Elasticsearch
 */
async function indexMessage(message) {
  try {
    await esClient.index({
      index: INDEX_NAME,
      id: message.id,
      body: {
        messageId: message.id,
        conversationId: message.conversationId,
        senderId: message.senderId,
        content: message.content,
        contentType: message.contentType || 'text',
        mentions: message.mentions || [],
        hasAttachments: message.attachments && message.attachments.length > 0,
        attachmentTypes: message.attachments
          ? message.attachments.map(a => a.mimeType?.split('/')[0])
          : [],
        createdAt: message.createdAt,
        updatedAt: message.updatedAt || message.createdAt,
        deleted: message.deleted || false
      }
    });

    logger.debug('Message indexed', { messageId: message.id });
  } catch (error) {
    logger.error('Failed to index message', {
      messageId: message.id,
      error: error.message
    });
    throw error;
  }
}

/**
 * Update indexed message
 */
async function updateIndex(messageId, updates) {
  try {
    await esClient.update({
      index: INDEX_NAME,
      id: messageId,
      body: {
        doc: updates
      }
    });

    logger.debug('Message index updated', { messageId });
  } catch (error) {
    logger.error('Failed to update message index', {
      messageId,
      error: error.message
    });
    throw error;
  }
}

/**
 * Delete message from index
 */
async function deleteFromIndex(messageId) {
  try {
    await esClient.delete({
      index: INDEX_NAME,
      id: messageId
    });

    logger.debug('Message deleted from index', { messageId });
  } catch (error) {
    if (error.meta?.statusCode === 404) {
      logger.warn('Message not found in index', { messageId });
      return;
    }

    logger.error('Failed to delete message from index', {
      messageId,
      error: error.message
    });
    throw error;
  }
}

/**
 * Search messages
 */
async function searchMessages(query, userId, conversationIds, options = {}) {
  try {
    const {
      from = 0,
      size = 20,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      filters = {}
    } = options;

    // Build search query
    const must = [
      {
        multi_match: {
          query,
          fields: ['content^2', 'content.keyword'],
          type: 'best_fields',
          fuzziness: 'AUTO'
        }
      },
      {
        terms: {
          conversationId: conversationIds
        }
      },
      {
        term: {
          deleted: false
        }
      }
    ];

    // Apply filters
    if (filters.senderId) {
      must.push({ term: { senderId: filters.senderId } });
    }

    if (filters.contentType) {
      must.push({ term: { contentType: filters.contentType } });
    }

    if (filters.hasAttachments !== undefined) {
      must.push({ term: { hasAttachments: filters.hasAttachments } });
    }

    if (filters.attachmentType) {
      must.push({ term: { attachmentTypes: filters.attachmentType } });
    }

    if (filters.dateFrom || filters.dateTo) {
      const range = {};
      if (filters.dateFrom) range.gte = filters.dateFrom;
      if (filters.dateTo) range.lte = filters.dateTo;
      must.push({ range: { createdAt: range } });
    }

    if (filters.mentions) {
      must.push({ term: { mentions: filters.mentions } });
    }

    // Execute search
    const response = await esClient.search({
      index: INDEX_NAME,
      body: {
        from,
        size,
        query: {
          bool: { must }
        },
        sort: [
          { [sortBy]: { order: sortOrder } }
        ],
        highlight: {
          fields: {
            content: {
              pre_tags: ['<mark>'],
              post_tags: ['</mark>'],
              fragment_size: 150,
              number_of_fragments: 3
            }
          }
        }
      }
    });

    const results = response.hits.hits.map(hit => ({
      messageId: hit._source.messageId,
      conversationId: hit._source.conversationId,
      senderId: hit._source.senderId,
      content: hit._source.content,
      contentType: hit._source.contentType,
      createdAt: hit._source.createdAt,
      highlights: hit.highlight?.content || [],
      score: hit._score
    }));

    logger.info('Search completed', {
      query,
      userId,
      resultsCount: results.length,
      totalHits: response.hits.total.value
    });

    return {
      results,
      total: response.hits.total.value,
      from,
      size
    };
  } catch (error) {
    logger.error('Search failed', {
      query,
      userId,
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

/**
 * Get search suggestions (autocomplete)
 */
async function getSuggestions(query, conversationIds, limit = 5) {
  try {
    const response = await esClient.search({
      index: INDEX_NAME,
      body: {
        size: limit,
        query: {
          bool: {
            must: [
              {
                match_phrase_prefix: {
                  content: query
                }
              },
              {
                terms: {
                  conversationId: conversationIds
                }
              },
              {
                term: {
                  deleted: false
                }
              }
            ]
          }
        },
        _source: ['content', 'messageId'],
        sort: [
          { createdAt: { order: 'desc' } }
        ]
      }
    });

    const suggestions = response.hits.hits.map(hit => ({
      messageId: hit._source.messageId,
      content: hit._source.content.substring(0, 100)
    }));

    return suggestions;
  } catch (error) {
    logger.error('Failed to get suggestions', {
      query,
      error: error.message
    });
    throw error;
  }
}

/**
 * Bulk index messages
 */
async function bulkIndexMessages(messages) {
  try {
    const operations = messages.flatMap(message => [
      { index: { _index: INDEX_NAME, _id: message.id } },
      {
        messageId: message.id,
        conversationId: message.conversationId,
        senderId: message.senderId,
        content: message.content,
        contentType: message.contentType || 'text',
        mentions: message.mentions || [],
        hasAttachments: message.attachments && message.attachments.length > 0,
        attachmentTypes: message.attachments
          ? message.attachments.map(a => a.mimeType?.split('/')[0])
          : [],
        createdAt: message.createdAt,
        updatedAt: message.updatedAt || message.createdAt,
        deleted: message.deleted || false
      }
    ]);

    const response = await esClient.bulk({ body: operations });

    if (response.errors) {
      logger.error('Bulk indexing had errors', {
        errors: response.items.filter(item => item.index.error)
      });
    }

    logger.info('Bulk indexing completed', {
      indexed: messages.length,
      errors: response.errors
    });

    return response;
  } catch (error) {
    logger.error('Bulk indexing failed', {
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

/**
 * Reindex all messages for a conversation
 */
async function reindexConversation(conversationId) {
  try {
    const db = require('../models');
    const { Message } = db;

    const messages = await Message.findAll({
      where: { conversationId },
      order: [['createdAt', 'ASC']]
    });

    await bulkIndexMessages(messages);

    logger.info('Conversation reindexed', {
      conversationId,
      messageCount: messages.length
    });
  } catch (error) {
    logger.error('Failed to reindex conversation', {
      conversationId,
      error: error.message
    });
    throw error;
  }
}

/**
 * Check Elasticsearch health
 */
async function checkHealth() {
  try {
    const health = await esClient.cluster.health();
    return {
      status: health.status,
      numberOfNodes: health.number_of_nodes,
      activeShards: health.active_shards
    };
  } catch (error) {
    logger.error('Failed to check Elasticsearch health', {
      error: error.message
    });
    return {
      status: 'unavailable',
      error: error.message
    };
  }
}

// Initialize index on module load
if (process.env.ELASTICSEARCH_ENABLED !== 'false') {
  createIndex().catch(err => {
    logger.warn('Failed to create index on startup', { error: err.message });
  });
}

module.exports = {
  createIndex,
  indexMessage,
  updateIndex,
  deleteFromIndex,
  searchMessages,
  getSuggestions,
  bulkIndexMessages,
  reindexConversation,
  checkHealth
};
