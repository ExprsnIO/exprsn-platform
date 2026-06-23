/**
 * ═══════════════════════════════════════════════════════════════════════
 * Share Service - File sharing and access control
 * See: TOKEN_SPECIFICATION_V1.0.md Section 8 (Token Generation)
 * ═══════════════════════════════════════════════════════════════════════
 */

const { ShareLink, File } = require('../models');
const logger = require('../utils/logger');
const config = require('../config');

// In-process CA integration. The whole platform runs in one process, so share
// links mint a real signed CA token directly via the CA token service (same
// pattern as auth's tokenService) instead of the previous base64 mock. The
// token id IS the capability stored on the ShareLink and embedded in the URL;
// revoking the link revokes the CA token so the grant is gone everywhere.
const caTokenService = require('../../../ca/services/token');
const { getSigningCertificateId } = require('../../../ca/services/platformSigning');

/**
 * Mint a real CA token scoped to a shared file.
 *
 * Use-limiting is enforced by the ShareLink record (useCount/maxUses), so the CA
 * token is issued as time-based (or persistent) — that keeps access-time CA
 * status checks free of the use-decrement side effect while the CA remains the
 * source of truth for revocation and permissions.
 */
async function generateCAToken({ fileId, userId, permissions, expiresAt }) {
  const certificateId = await getSigningCertificateId();
  const expirySeconds = expiresAt
    ? Math.max(1, Math.ceil((expiresAt.getTime() - Date.now()) / 1000))
    : null;

  const token = await caTokenService.generateToken(
    {
      certificateId,
      permissions,
      resourceType: 'url',
      // Prefix the share access path; the CA resource matcher accepts prefixes.
      resourceValue: `/filevault/api/share`,
      expiryType: expiresAt ? 'time' : 'persistent',
      ...(expirySeconds ? { expirySeconds: expirySeconds } : {}),
      data: {
        fileId,
        sharedBy: userId,
        shareType: 'link'
      }
    },
    userId,
    { isAdmin: true } // platform-trusted issuance; bypasses cert-ownership check
  );

  return token;
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

    // Mint a real signed CA token for access control
    const token = await generateCAToken({ fileId, userId, permissions, expiresAt });

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

    // Shareable URL — the unguessable share-link id is the capability; the CA
    // token id rides along as a query param for callers that validate it.
    const shareUrl =
      `https://${config.app.domain}/filevault/api/share/${shareLink.id}/download?token=${token.id}`;

    logger.info(`Share link created: ${shareLink.id} for file: ${fileId} (token ${token.id})`);

    return {
      shareLink,
      shareUrl,
      token: {
        id: token.id,
        expiresAt: token.expiresAt,
        maxUses: options.maxUses
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

  // Defense in depth: honor CA-side revocation/expiry even if the local row
  // somehow lags. A CA outage must not break valid links, so only an explicit
  // revoked/expired verdict denies access.
  if (shareLink.tokenId) {
    try {
      const validation = await caTokenService.validateToken(shareLink.tokenId, {
        requiredPermissions: { read: true }
      });
      if (!validation.valid &&
          (validation.error === 'TOKEN_REVOKED' || validation.error === 'TOKEN_EXPIRED')) {
        throw new Error('SHARE_LINK_REVOKED');
      }
    } catch (err) {
      if (err.message === 'SHARE_LINK_REVOKED') throw err;
      logger.warn(`CA token check failed for share ${shareLink.id}, allowing on local state`, {
        error: err.message
      });
    }
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

  // Revoke the underlying CA token so the grant is gone platform-wide, not just
  // hidden by the local flag. Best-effort: the link is already marked revoked.
  if (shareLink.tokenId) {
    try {
      await caTokenService.revokeToken(shareLink.tokenId, 'Share link revoked', null, { isAdmin: true });
    } catch (err) {
      logger.warn(`Failed to revoke CA token ${shareLink.tokenId} for share ${shareLinkId}`, {
        error: err.message
      });
    }
  }

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
