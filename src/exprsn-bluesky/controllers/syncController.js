const { logger } = require('@exprsn/shared');
const repositoryService = require('../services/repositoryService');
const didService = require('../services/didService');
const timelineIntegration = require('../services/integrations/timelineIntegration');
const { Account, Record } = require('../models');
const queueService = require('../services/queueService');

/**
 * Sync Timeline post to Bluesky
 * Called when a post is created/updated in Timeline
 */
async function syncTimelinePostToBluesky(timelinePost) {
  try {
    logger.info('Syncing Timeline post to Bluesky', {
      postId: timelinePost.id,
      userId: timelinePost.userId
    });

    // Get user's Bluesky account
    const account = await Account.findOne({
      where: { exprsnUserId: timelinePost.userId, status: 'active' }
    });

    if (!account) {
      logger.warn('No Bluesky account found for user', {
        userId: timelinePost.userId
      });
      return null;
    }

    // Check if already synced
    if (timelinePost.blueskyUri) {
      logger.info('Post already synced to Bluesky', {
        postId: timelinePost.id,
        blueskyUri: timelinePost.blueskyUri
      });
      return null;
    }

    // Convert Timeline post to Bluesky post format
    const blueskyPost = {
      $type: 'app.bsky.feed.post',
      text: timelinePost.content,
      createdAt: timelinePost.createdAt.toISOString(),
      langs: ['en']
    };

    // Add facets for mentions, links, etc.
    if (timelinePost.metadata?.entities) {
      blueskyPost.facets = convertEntitiesToFacets(timelinePost.metadata.entities);
    }

    // Add images/media if present
    if (timelinePost.media && timelinePost.media.length > 0) {
      blueskyPost.embed = {
        $type: 'app.bsky.embed.images',
        images: timelinePost.media.slice(0, 4).map(m => ({
          alt: m.alt || '',
          image: {
            $type: 'blob',
            ref: { $link: m.cid || m.id },
            mimeType: m.mimeType || 'image/jpeg',
            size: m.size || 0
          }
        }))
      };
    }

    // Generate rkey (record key)
    const rkey = didService.generateRev();

    // Create Bluesky record
    const record = await repositoryService.createRecord(
      account.did,
      'app.bsky.feed.post',
      rkey,
      blueskyPost
    );

    logger.info('Created Bluesky record for Timeline post', {
      postId: timelinePost.id,
      uri: record.uri
    });

    // Update Timeline post with Bluesky URI
    await timelineIntegration.updatePost(timelinePost.id, {
      blueskyUri: record.uri,
      blueskyDid: account.did,
      blueskyRkey: rkey,
      syncedToBluesky: true
    });

    // Update Record with Timeline post ID
    await record.update({
      exprsnPostId: timelinePost.id
    });

    return {
      record,
      blueskyUri: record.uri
    };
  } catch (error) {
    logger.error('Failed to sync Timeline post to Bluesky', {
      error: error.message,
      postId: timelinePost.id
    });
    throw error;
  }
}

/**
 * Sync Bluesky post to Timeline
 * Called when a post is created in Bluesky
 */
async function syncBlueskyPostToTimeline(blueskyRecord) {
  try {
    logger.info('Syncing Bluesky post to Timeline', {
      uri: blueskyRecord.uri,
      collection: blueskyRecord.collection
    });

    // Only sync feed posts
    if (blueskyRecord.collection !== 'app.bsky.feed.post') {
      return null;
    }

    // Check if already synced
    if (blueskyRecord.exprsnPostId) {
      logger.info('Bluesky post already synced to Timeline', {
        uri: blueskyRecord.uri,
        postId: blueskyRecord.exprsnPostId
      });
      return null;
    }

    // Get Bluesky account
    const account = await Account.findOne({
      where: { did: blueskyRecord.repository.did }
    });

    if (!account) {
      logger.warn('No account found for DID', {
        did: blueskyRecord.repository.did
      });
      return null;
    }

    // Convert Bluesky post to Timeline format
    const timelinePostData = {
      userId: account.exprsnUserId,
      content: blueskyRecord.value.text,
      visibility: 'public',
      metadata: {
        source: 'bluesky',
        blueskyUri: blueskyRecord.uri,
        blueskyDid: account.did,
        blueskyCreatedAt: blueskyRecord.value.createdAt,
        entities: extractEntitiesFromFacets(blueskyRecord.value.facets)
      }
    };

    // Handle embedded media
    if (blueskyRecord.value.embed) {
      if (blueskyRecord.value.embed.$type === 'app.bsky.embed.images') {
        timelinePostData.media = blueskyRecord.value.embed.images.map(img => ({
          type: 'image',
          url: img.image.ref.$link,
          alt: img.alt
        }));
        timelinePostData.contentType = 'image';
      }
    }

    // Create Timeline post
    const timelinePost = await timelineIntegration.createPost(timelinePostData);

    logger.info('Created Timeline post from Bluesky record', {
      uri: blueskyRecord.uri,
      postId: timelinePost.data.id
    });

    // Update Bluesky record with Timeline post ID
    await Record.update(
      { exprsnPostId: timelinePost.data.id },
      { where: { id: blueskyRecord.id } }
    );

    return {
      timelinePost,
      postId: timelinePost.data.id
    };
  } catch (error) {
    logger.error('Failed to sync Bluesky post to Timeline', {
      error: error.message,
      uri: blueskyRecord.uri
    });
    throw error;
  }
}

/**
 * Sync Timeline post update to Bluesky
 */
async function syncTimelineUpdateToBluesky(timelinePost) {
  try {
    if (!timelinePost.blueskyUri) {
      logger.info('Timeline post not synced to Bluesky, skipping update', {
        postId: timelinePost.id
      });
      return null;
    }

    logger.info('Syncing Timeline post update to Bluesky', {
      postId: timelinePost.id,
      blueskyUri: timelinePost.blueskyUri
    });

    const account = await Account.findOne({
      where: { exprsnUserId: timelinePost.userId }
    });

    if (!account) {
      return null;
    }

    // Update Bluesky record
    const blueskyPost = {
      $type: 'app.bsky.feed.post',
      text: timelinePost.content,
      createdAt: timelinePost.createdAt.toISOString(),
      langs: ['en']
    };

    if (timelinePost.metadata?.entities) {
      blueskyPost.facets = convertEntitiesToFacets(timelinePost.metadata.entities);
    }

    await repositoryService.updateRecord(
      account.did,
      'app.bsky.feed.post',
      timelinePost.blueskyRkey,
      blueskyPost
    );

    logger.info('Updated Bluesky record', {
      postId: timelinePost.id,
      blueskyUri: timelinePost.blueskyUri
    });

    return true;
  } catch (error) {
    logger.error('Failed to sync Timeline update to Bluesky', {
      error: error.message,
      postId: timelinePost.id
    });
    throw error;
  }
}

/**
 * Sync Timeline post deletion to Bluesky
 */
async function syncTimelineDeletionToBluesky(timelinePost) {
  try {
    if (!timelinePost.blueskyUri) {
      return null;
    }

    logger.info('Syncing Timeline post deletion to Bluesky', {
      postId: timelinePost.id,
      blueskyUri: timelinePost.blueskyUri
    });

    const account = await Account.findOne({
      where: { exprsnUserId: timelinePost.userId }
    });

    if (!account) {
      return null;
    }

    await repositoryService.deleteRecord(
      account.did,
      'app.bsky.feed.post',
      timelinePost.blueskyRkey
    );

    logger.info('Deleted Bluesky record', {
      postId: timelinePost.id,
      blueskyUri: timelinePost.blueskyUri
    });

    return true;
  } catch (error) {
    logger.error('Failed to sync Timeline deletion to Bluesky', {
      error: error.message,
      postId: timelinePost.id
    });
    throw error;
  }
}

/**
 * Sync Timeline like to Bluesky
 */
async function syncTimelineLikeToBluesky(timelinePost, userId) {
  try {
    logger.info('Syncing Timeline like to Bluesky', {
      postId: timelinePost.id,
      userId
    });

    const account = await Account.findOne({
      where: { exprsnUserId: userId, status: 'active' }
    });

    if (!account || !timelinePost.blueskyUri) {
      return null;
    }

    // Create Bluesky like record
    const likeRecord = {
      $type: 'app.bsky.feed.like',
      subject: {
        uri: timelinePost.blueskyUri,
        cid: timelinePost.blueskyRkey
      },
      createdAt: new Date().toISOString()
    };

    const rkey = didService.generateRev();

    await repositoryService.createRecord(
      account.did,
      'app.bsky.feed.like',
      rkey,
      likeRecord
    );

    logger.info('Created Bluesky like record', {
      postId: timelinePost.id,
      userId
    });

    return true;
  } catch (error) {
    logger.error('Failed to sync like to Bluesky', {
      error: error.message,
      postId: timelinePost.id
    });
    return null;
  }
}

/**
 * Helper: Convert Timeline entities to Bluesky facets
 */
function convertEntitiesToFacets(entities) {
  const facets = [];

  if (entities.mentions) {
    entities.mentions.forEach(mention => {
      facets.push({
        index: {
          byteStart: mention.start,
          byteEnd: mention.end
        },
        features: [{
          $type: 'app.bsky.richtext.facet#mention',
          did: mention.did
        }]
      });
    });
  }

  if (entities.urls) {
    entities.urls.forEach(url => {
      facets.push({
        index: {
          byteStart: url.start,
          byteEnd: url.end
        },
        features: [{
          $type: 'app.bsky.richtext.facet#link',
          uri: url.url
        }]
      });
    });
  }

  if (entities.hashtags) {
    entities.hashtags.forEach(tag => {
      facets.push({
        index: {
          byteStart: tag.start,
          byteEnd: tag.end
        },
        features: [{
          $type: 'app.bsky.richtext.facet#tag',
          tag: tag.tag
        }]
      });
    });
  }

  return facets.length > 0 ? facets : undefined;
}

/**
 * Helper: Extract entities from Bluesky facets
 */
function extractEntitiesFromFacets(facets) {
  if (!facets || facets.length === 0) {
    return {};
  }

  const entities = {
    mentions: [],
    urls: [],
    hashtags: []
  };

  facets.forEach(facet => {
    facet.features.forEach(feature => {
      if (feature.$type === 'app.bsky.richtext.facet#mention') {
        entities.mentions.push({
          did: feature.did,
          start: facet.index.byteStart,
          end: facet.index.byteEnd
        });
      } else if (feature.$type === 'app.bsky.richtext.facet#link') {
        entities.urls.push({
          url: feature.uri,
          start: facet.index.byteStart,
          end: facet.index.byteEnd
        });
      } else if (feature.$type === 'app.bsky.richtext.facet#tag') {
        entities.hashtags.push({
          tag: feature.tag,
          start: facet.index.byteStart,
          end: facet.index.byteEnd
        });
      }
    });
  });

  return entities;
}

module.exports = {
  syncTimelinePostToBluesky,
  syncBlueskyPostToTimeline,
  syncTimelineUpdateToBluesky,
  syncTimelineDeletionToBluesky,
  syncTimelineLikeToBluesky
};
