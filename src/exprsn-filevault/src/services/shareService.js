/**
 * ═══════════════════════════════════════════════════════════════════════
 * Share Service - File sharing and access control
 * See: TOKEN_SPECIFICATION_V1.0.md Section 8 (Token Generation)
 * ═══════════════════════════════════════════════════════════════════════
 */

const { ShareLink, File } = require('../models');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');
const config = require('../config');

// Mock CA token generation - replace with actual CA integration
async function generateCAToken(params) {
  // TODO: Integrate with actual CA token generation service
  // This is a mock implementation
  return {
    id: uuidv4(),
    signature: Buffer.from(JSON.stringify(params)).toString('base64'),
    expiresAt: params.expiresAt,
    usesAllowed: params.usesAllowed
  };
}

/**
 * Create a share link for a file
 */
async function createShareLink(fileId, userId, options = {}) {
  try {
    // Verify file exists and user has access
    const file = await File.findOne({ where: { id: fileId, userId } });

    if (!file) {
      throw new Error('FILE_NOT_FOUND');
    }

    // Set default permissions
    const permissions = options.permissions || {
      read: true,
      write: false,
      delete: false
    };

    // Calculate expiration
    const expiresAt = options.expiresIn
      ? new Date(Date.now() + options.expiresIn * 1000)
      : null;

    // Generate CA token for access control
    const token = await generateCAToken({
      issuer: {
        domain: config.ca.domain,
        certificateSerial: config.ca.certificateSerial
      },
      permissions,
      resource: {
        url: `https://${config.app.domain}/files/${fileId}`
      },
      expiryType: options.maxUses ? 'use' : 'time',
      expiresAt: expiresAt ? expiresAt.getTime() : undefined,
      usesAllowed: options.maxUses,
      data: {
        fileId,
        sharedBy: userId,
        shareType: 'link'
      }
    });

    // Create share link record
    const shareLink = await ShareLink.create({
      fileId,
      userId,
      tokenId: token.id,
      shareType: 'link',
      permissions,
      expiresAt,
      maxUses: options.maxUses
    });

    // Generate shareable URL
    const shareUrl = `https://${config.app.domain}/share/${shareLink.id}?token=${token.signature}`;

    logger.info(`Share link created: ${shareLink.id} for file: ${fileId}`);

    return {
      shareLink,
      shareUrl,
      token: {
        id: token.id,
        expiresAt: token.expiresAt,
        usesAllowed: token.usesAllowed
      }
    };
  } catch (error) {
    logger.error('Failed to create share link:', error);
    throw error;
  }
}

/**
 * Get share link by ID
 */
async function getShareLink(shareLinkId) {
  const shareLink = await ShareLink.findOne({
    where: { id: shareLinkId, isRevoked: false },
    include: [{ model: File, as: 'file' }]
  });

  if (!shareLink) {
    throw new Error('SHARE_LINK_NOT_FOUND');
  }

  // Check expiration
  if (shareLink.expiresAt && new Date() > shareLink.expiresAt) {
    throw new Error('SHARE_LINK_EXPIRED');
  }

  // Check use count
  if (shareLink.maxUses && shareLink.useCount >= shareLink.maxUses) {
    throw new Error('SHARE_LINK_EXHAUSTED');
  }

  return shareLink;
}

/**
 * Access file via share link
 */
async function accessSharedFile(shareLinkId) {
  const shareLink = await getShareLink(shareLinkId);

  // Increment use count
  await shareLink.increment('useCount');

  logger.info(`Share link accessed: ${shareLinkId} (use ${shareLink.useCount + 1})`);

  return shareLink.file;
}

/**
 * Revoke share link
 */
async function revokeShareLink(shareLinkId, userId) {
  const shareLink = await ShareLink.findOne({
    where: { id: shareLinkId, userId }
  });

  if (!shareLink) {
    throw new Error('SHARE_LINK_NOT_FOUND');
  }

  await shareLink.update({
    isRevoked: true,
    revokedAt: new Date()
  });

  logger.info(`Share link revoked: ${shareLinkId}`);
  return true;
}

/**
 * List share links for a file
 */
async function listShareLinks(fileId, userId) {
  const shareLinks = await ShareLink.findAll({
    where: { fileId, userId, isRevoked: false },
    order: [['createdAt', 'DESC']]
  });

  return shareLinks;
}

/**
 * List all share links created by user
 */
async function listUserShareLinks(userId, options = {}) {
  const shareLinks = await ShareLink.findAll({
    where: { userId, isRevoked: false },
    include: [{ model: File, as: 'file' }],
    limit: options.limit || 50,
    offset: options.offset || 0,
    order: [['createdAt', 'DESC']]
  });

  return shareLinks;
}

module.exports = {
  createShareLink,
  getShareLink,
  accessSharedFile,
  revokeShareLink,
  listShareLinks,
  listUserShareLinks
};
