/**
 * CalDAV Service
 *
 * Provides CalDAV server functionality for calendar synchronization.
 * Implements RFC 4791 (CalDAV) and RFC 2518 (WebDAV) protocols.
 *
 * Supports:
 * - Calendar discovery (PROPFIND)
 * - Event synchronization
 * - Calendar subscriptions
 * - Multi-calendar support per user/group
 */

const { Event, EventAttendee, Group, GroupMembership } = require('../models');
const icalService = require('./icalService');
const logger = require('../utils/logger');
const crypto = require('crypto');

/**
 * Get CalDAV calendar URL for a group
 * @param {string} groupId - Group ID
 * @param {string} baseUrl - Base server URL
 * @returns {string} CalDAV URL
 */
function getGroupCalendarUrl(groupId, baseUrl) {
  return `${baseUrl}/caldav/groups/${groupId}/calendar.ics`;
}

/**
 * Get CalDAV calendar URL for a user
 * @param {string} userId - User ID
 * @param {string} baseUrl - Base server URL
 * @returns {string} CalDAV URL
 */
function getUserCalendarUrl(userId, baseUrl) {
  return `${baseUrl}/caldav/users/${userId}/calendar.ics`;
}

/**
 * Get calendar collection for a user (PROPFIND response)
 * Returns metadata about available calendars
 * @param {string} userId - User ID
 * @returns {Promise<object>} Calendar collection data
 */
async function getUserCalendarCollection(userId) {
  try {
    // Get all groups the user is a member of
    const memberships = await GroupMembership.findAll({
      where: { userId, status: 'active' },
      include: [{
        model: Group,
        as: 'group',
        attributes: ['id', 'name', 'slug', 'description']
      }]
    });

    const calendars = [
      {
        id: `user-${userId}`,
        name: 'My Events',
        description: 'Events I\'m attending',
        url: `/caldav/users/${userId}/calendar.ics`,
        ctag: generateCTag(userId, 'user'),
        color: '#3788d8',
        timezone: 'UTC'
      }
    ];

    // Add calendar for each group
    memberships.forEach(({ group }) => {
      calendars.push({
        id: `group-${group.id}`,
        name: `${group.name} Events`,
        description: group.description || `Events from ${group.name}`,
        url: `/caldav/groups/${group.id}/calendar.ics`,
        ctag: generateCTag(group.id, 'group'),
        color: generateColorFromId(group.id),
        timezone: 'UTC'
      });
    });

    return {
      userId,
      calendars,
      updatedAt: Date.now()
    };
  } catch (error) {
    logger.error('Error getting user calendar collection:', error);
    throw error;
  }
}

/**
 * Get calendar properties for WebDAV PROPFIND
 * @param {string} resourceType - 'user' or 'group'
 * @param {string} resourceId - User ID or Group ID
 * @returns {Promise<object>} Calendar properties
 */
async function getCalendarProperties(resourceType, resourceId) {
  try {
    let calendar;

    if (resourceType === 'group') {
      const group = await Group.findByPk(resourceId);
      if (!group) throw new Error('GROUP_NOT_FOUND');

      calendar = {
        displayName: `${group.name} Events`,
        description: group.description || `Events from ${group.name}`,
        ctag: generateCTag(resourceId, 'group'),
        supportedComponents: ['VEVENT'],
        color: generateColorFromId(resourceId),
        timezone: 'UTC'
      };
    } else {
      calendar = {
        displayName: 'My Events',
        description: 'Events I\'m attending',
        ctag: generateCTag(resourceId, 'user'),
        supportedComponents: ['VEVENT'],
        color: '#3788d8',
        timezone: 'UTC'
      };
    }

    return calendar;
  } catch (error) {
    logger.error('Error getting calendar properties:', error);
    throw error;
  }
}

/**
 * Get events for CalDAV sync (REPORT method)
 * @param {string} resourceType - 'user' or 'group'
 * @param {string} resourceId - User ID or Group ID
 * @param {object} options - Sync options (syncToken, timeRange)
 * @returns {Promise<Array>} Array of event objects with etags
 */
async function getEventsForSync(resourceType, resourceId, options = {}) {
  try {
    const { syncToken, timeRange } = options;
    let events;

    if (resourceType === 'group') {
      const whereClause = {
        groupId: resourceId,
        status: ['published', 'cancelled']
      };

      if (timeRange) {
        whereClause.startTime = {
          $gte: timeRange.start,
          $lte: timeRange.end
        };
      }

      if (syncToken) {
        const syncTime = parseSyncToken(syncToken);
        whereClause.updatedAt = { $gt: syncTime };
      }

      events = await Event.findAll({
        where: whereClause,
        order: [['startTime', 'ASC']],
        include: [{
          model: Group,
          as: 'group',
          attributes: ['id', 'name', 'slug']
        }]
      });
    } else {
      // User events
      const attendees = await EventAttendee.findAll({
        where: { userId: resourceId, rsvpStatus: 'going' },
        include: [{
          model: Event,
          as: 'event',
          where: {
            status: ['published', 'cancelled'],
            ...(timeRange ? {
              startTime: {
                $gte: timeRange.start,
                $lte: timeRange.end
              }
            } : {}),
            ...(syncToken ? {
              updatedAt: { $gt: parseSyncToken(syncToken) }
            } : {})
          },
          include: [{
            model: Group,
            as: 'group',
            attributes: ['id', 'name', 'slug']
          }]
        }]
      });

      events = attendees.map(a => a.event).filter(Boolean);
    }

    // Convert events to CalDAV format with ETags
    return events.map(event => ({
      id: event.id,
      href: `/caldav/events/${event.id}.ics`,
      etag: generateETag(event),
      lastModified: event.updatedAt,
      ical: null // Will be populated on demand
    }));
  } catch (error) {
    logger.error('Error getting events for sync:', error);
    throw error;
  }
}

/**
 * Generate ETag for an event (for change detection)
 * @param {object} event - Event object
 * @returns {string} ETag
 */
function generateETag(event) {
  const hash = crypto
    .createHash('md5')
    .update(`${event.id}-${event.updatedAt}`)
    .digest('hex');
  return `"${hash}"`;
}

/**
 * Generate CTag for a calendar (collection-level change tag)
 * @param {string} resourceId - Resource ID
 * @param {string} resourceType - Resource type
 * @returns {string} CTag
 */
function generateCTag(resourceId, resourceType) {
  const timestamp = Date.now();
  const hash = crypto
    .createHash('md5')
    .update(`${resourceId}-${resourceType}-${timestamp}`)
    .digest('hex')
    .substring(0, 16);
  return `"${hash}"`;
}

/**
 * Parse sync token to extract timestamp
 * @param {string} syncToken - Sync token
 * @returns {number} Timestamp
 */
function parseSyncToken(syncToken) {
  try {
    const decoded = Buffer.from(syncToken, 'base64').toString('utf-8');
    const timestamp = parseInt(decoded, 10);
    return timestamp || 0;
  } catch {
    return 0;
  }
}

/**
 * Generate sync token from timestamp
 * @param {number} timestamp - Timestamp
 * @returns {string} Sync token
 */
function generateSyncToken(timestamp = Date.now()) {
  return Buffer.from(timestamp.toString()).toString('base64');
}

/**
 * Generate color from resource ID (deterministic)
 * @param {string} id - Resource ID
 * @returns {string} Hex color
 */
function generateColorFromId(id) {
  const hash = crypto.createHash('md5').update(id).digest('hex');
  return `#${hash.substring(0, 6)}`;
}

/**
 * Validate CalDAV credentials (basic auth or token)
 * @param {string} authHeader - Authorization header
 * @param {string} userId - Expected user ID
 * @returns {boolean} Whether credentials are valid
 */
function validateCalDAVCredentials(authHeader, userId) {
  // This would integrate with the CA token system
  // For now, placeholder implementation
  return true;
}

module.exports = {
  getGroupCalendarUrl,
  getUserCalendarUrl,
  getUserCalendarCollection,
  getCalendarProperties,
  getEventsForSync,
  generateETag,
  generateCTag,
  generateSyncToken,
  parseSyncToken,
  validateCalDAVCredentials
};
