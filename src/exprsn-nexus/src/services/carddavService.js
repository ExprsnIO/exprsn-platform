/**
 * CardDAV Service
 *
 * Provides CardDAV server functionality for contact/member synchronization.
 * Implements RFC 6352 (CardDAV) and RFC 2426 (vCard) protocols.
 *
 * Supports:
 * - Address book discovery
 * - Contact (member) synchronization
 * - vCard 3.0/4.0 export
 * - Group member contacts
 */

const { GroupMembership, Group } = require('../models');
const logger = require('../utils/logger');
const crypto = require('crypto');

/**
 * Get CardDAV addressbook URL for a group
 * @param {string} groupId - Group ID
 * @param {string} baseUrl - Base server URL
 * @returns {string} CardDAV URL
 */
function getGroupAddressbookUrl(groupId, baseUrl) {
  return `${baseUrl}/carddav/groups/${groupId}/addressbook.vcf`;
}

/**
 * Get CardDAV addressbook URL for user's contacts
 * @param {string} userId - User ID
 * @param {string} baseUrl - Base server URL
 * @returns {string} CardDAV URL
 */
function getUserAddressbookUrl(userId, baseUrl) {
  return `${baseUrl}/carddav/users/${userId}/addressbook.vcf`;
}

/**
 * Get addressbook collection for a user (PROPFIND response)
 * @param {string} userId - User ID
 * @returns {Promise<object>} Addressbook collection data
 */
async function getUserAddressbookCollection(userId) {
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

    const addressbooks = [];

    // Add addressbook for each group
    memberships.forEach(({ group }) => {
      addressbooks.push({
        id: `group-${group.id}`,
        name: `${group.name} Members`,
        description: `Members of ${group.name}`,
        url: `/carddav/groups/${group.id}/addressbook.vcf`,
        ctag: generateCTag(group.id, 'group')
      });
    });

    return {
      userId,
      addressbooks,
      updatedAt: Date.now()
    };
  } catch (error) {
    logger.error('Error getting user addressbook collection:', error);
    throw error;
  }
}

/**
 * Generate vCard for a group member
 * @param {object} membership - GroupMembership object
 * @param {object} userProfile - User profile data (from external service)
 * @returns {string} vCard string (version 4.0)
 */
function generateMemberVCard(membership, userProfile = {}) {
  const { userId, groupId, role } = membership;
  const {
    displayName = 'Unknown User',
    email = '',
    phone = '',
    avatarUrl = '',
    bio = ''
  } = userProfile;

  // vCard 4.0 format
  const vcard = [
    'BEGIN:VCARD',
    'VERSION:4.0',
    `UID:${userId}`,
    `FN:${escapevCardValue(displayName)}`,
    email ? `EMAIL:${email}` : null,
    phone ? `TEL:${phone}` : null,
    avatarUrl ? `PHOTO:${avatarUrl}` : null,
    bio ? `NOTE:${escapevCardValue(bio)}` : null,
    `CATEGORIES:${escapevCardValue(role)}`,
    `X-GROUP-ID:${groupId}`,
    `X-MEMBERSHIP-ID:${membership.id}`,
    `REV:${new Date(membership.joinedAt).toISOString()}`,
    'END:VCARD'
  ].filter(Boolean).join('\r\n');

  return vcard;
}

/**
 * Get all members as vCards for a group
 * @param {string} groupId - Group ID
 * @param {object} options - Options (includeInactive, userProfileService)
 * @returns {Promise<Array>} Array of vCard objects
 */
async function getGroupMembersAsVCards(groupId, options = {}) {
  try {
    const { includeInactive = false, userProfileService = null } = options;

    const whereClause = {
      groupId,
      ...(includeInactive ? {} : { status: 'active' })
    };

    const memberships = await GroupMembership.findAll({
      where: whereClause,
      order: [['joinedAt', 'ASC']]
    });

    const vcards = [];

    for (const membership of memberships) {
      // Fetch user profile from external service (Auth service)
      let userProfile = {};
      if (userProfileService) {
        try {
          userProfile = await userProfileService.getUserProfile(membership.userId);
        } catch (error) {
          logger.warn(`Failed to fetch profile for user ${membership.userId}:`, error.message);
        }
      }

      const vcard = generateMemberVCard(membership, userProfile);
      vcards.push({
        id: membership.userId,
        href: `/carddav/contacts/${membership.userId}.vcf`,
        etag: generateETag(membership),
        vcard
      });
    }

    return vcards;
  } catch (error) {
    logger.error('Error getting group members as vCards:', error);
    throw error;
  }
}

/**
 * Get vCards for members that changed since syncToken
 * @param {string} groupId - Group ID
 * @param {string} syncToken - Sync token
 * @param {object} options - Options
 * @returns {Promise<Array>} Array of changed vCard objects
 */
async function getMembersForSync(groupId, syncToken, options = {}) {
  try {
    const syncTime = parseSyncToken(syncToken);
    const { userProfileService = null } = options;

    const memberships = await GroupMembership.findAll({
      where: {
        groupId,
        updatedAt: { $gt: syncTime }
      },
      order: [['updatedAt', 'ASC']]
    });

    const vcards = [];

    for (const membership of memberships) {
      let userProfile = {};
      if (userProfileService) {
        try {
          userProfile = await userProfileService.getUserProfile(membership.userId);
        } catch (error) {
          logger.warn(`Failed to fetch profile for user ${membership.userId}`);
        }
      }

      const vcard = generateMemberVCard(membership, userProfile);
      vcards.push({
        id: membership.userId,
        href: `/carddav/contacts/${membership.userId}.vcf`,
        etag: generateETag(membership),
        vcard,
        status: membership.status === 'active' ? 'active' : 'deleted'
      });
    }

    return vcards;
  } catch (error) {
    logger.error('Error getting members for sync:', error);
    throw error;
  }
}

/**
 * Get addressbook properties for WebDAV PROPFIND
 * @param {string} groupId - Group ID
 * @returns {Promise<object>} Addressbook properties
 */
async function getAddressbookProperties(groupId) {
  try {
    const group = await Group.findByPk(groupId);
    if (!group) throw new Error('GROUP_NOT_FOUND');

    const memberCount = await GroupMembership.count({
      where: { groupId, status: 'active' }
    });

    return {
      displayName: `${group.name} Members`,
      description: `Members of ${group.name}`,
      ctag: generateCTag(groupId, 'group'),
      supportedAddressData: ['text/vcard'],
      maxResourceSize: 10240, // 10KB max per vCard
      memberCount
    };
  } catch (error) {
    logger.error('Error getting addressbook properties:', error);
    throw error;
  }
}

/**
 * Escape special characters in vCard values
 * @param {string} value - Value to escape
 * @returns {string} Escaped value
 */
function escapevCardValue(value) {
  if (!value) return '';
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

/**
 * Generate ETag for a membership
 * @param {object} membership - Membership object
 * @returns {string} ETag
 */
function generateETag(membership) {
  const hash = crypto
    .createHash('md5')
    .update(`${membership.id}-${membership.updatedAt || membership.joinedAt}`)
    .digest('hex');
  return `"${hash}"`;
}

/**
 * Generate CTag for an addressbook
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

module.exports = {
  getGroupAddressbookUrl,
  getUserAddressbookUrl,
  getUserAddressbookCollection,
  generateMemberVCard,
  getGroupMembersAsVCards,
  getMembersForSync,
  getAddressbookProperties,
  generateETag,
  generateCTag,
  generateSyncToken,
  parseSyncToken
};
