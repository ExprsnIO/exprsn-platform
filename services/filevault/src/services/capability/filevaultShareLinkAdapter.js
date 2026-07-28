'use strict';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * FEAT-077 — FileVault/ShareLink capability backend adapter
 * ═══════════════════════════════════════════════════════════════════════
 *
 * The backend registered for the `file` resource type of the capability
 * façade (`../capabilityService`). It is a THIN wrapper over the existing
 * `shareService` functions — move/rename, don't rewrite: the shareGate /
 * roomMemberDownload / fileAccessTokenClamp suites are the parity harness.
 *
 * Two grant kinds:
 *   'link'        — ShareLink row + CA token (createShareLink). Credential:
 *                   { shareLinkId, token }. `url` preserves today's shareUrl
 *                   shape exactly.
 *   'file-access' — standalone CA token, no local row (createFileAccessToken).
 *                   Credential: { token }. Read-only unconditionally — the
 *                   TASK-056 clamp lives in shareService and this adapter must
 *                   not reopen it (it never forwards caller permissions).
 *
 * Provenance (§2 of the Shape-A contract) is derived from the VERIFIED
 * resource, never from caller input (BUG-026). Both mint paths require
 * ownership (`File.findOne({ id, userId })` inside shareService), so every
 * existing and new grant of this backend is owner-minted by construction:
 * `mintedAsOwner` is a derived constant `true` — no schema change, no
 * backfill. If FEAT-047 ever allows non-owner mints, ShareLink needs
 * persisted provenance columns → dba gate (see contract §4.3).
 *
 * Error semantics: every denial is CapabilityError('CAP_NOT_FOUND') — missing,
 * expired, exhausted, revoked, provenance-dead, moderation-held and
 * permission-short are indistinguishable (same-404 posture). ONE codified
 * exception, preserved verbatim by delegating to shareService.getShareLink /
 * accessFileByToken: a CA that is UNREACHABLE does not kill an otherwise
 * locally-valid link; an explicit TOKEN_REVOKED/TOKEN_EXPIRED verdict always
 * denies. That rule is internal to this adapter's backend, not façade policy.
 */

const { File, ShareLink, FileModeration } = require('../../models');
const shareService = require('../shareService');
const { shareGrantAllows } = require('../fileService');
const imageModeration = require('../imageModerationService');
const logger = require('../../utils/logger');
const CapabilityError = require('./CapabilityError');

// In-process CA token service — same require direction shareService already
// uses. Needed here for revokeByResource's standalone-token sweep (tokens with
// no local row are found via the CA store filtered on tokenData.fileId).
const caTokenService = require('../../../../ca/services/token');

const BACKEND_NAME = 'filevault-sharelink';

// Derived constant, NOT caller input: both mint paths verify ownership, so
// every grant this backend has ever produced is owner-minted (contract §4.3).
const MINTED_AS_OWNER = true;

const READ_ONLY = Object.freeze({ read: true, write: false, delete: false });

function deny(cause) {
  return new CapabilityError('CAP_NOT_FOUND', cause);
}

/** Run a shareService call, converting its string-coded Errors into denials. */
async function wrap(fn) {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof CapabilityError) throw err;
    throw deny(err.message);
  }
}

/** Every required:true permission must be granted:true, else permission-short. */
function ensureGranted(granted, required) {
  const perms = granted || {};
  for (const key of ['read', 'write', 'delete']) {
    if (required[key] && !perms[key]) {
      throw deny('PERMISSION_SHORT');
    }
  }
}

/**
 * FEAT-031 moderation gate — a held (pending/rejected/failed) object is not
 * served to anyone but its uploader, and denies exactly like a missing
 * capability so it cannot be probed for existence. `canServe` gives the
 * uploader their own-image exemption; an anonymous requester (null) falls
 * through to `isServableToOthers`, matching the share routes' posture.
 */
async function assertModerationServable(file, requesterId) {
  const moderation = await FileModeration.findOne({ where: { fileId: file.id } });
  if (!imageModeration.canServe(file, moderation, requesterId)) {
    throw deny('MODERATION_HELD');
  }
}

/**
 * The lazy provenance predicate (Rick's 2026-07-13 decision, the Pass 1
 * `shareGrantAllows` pattern): non-owner-minted grants die with the visibility
 * they were minted under; owner-minted grants survive a private-flip. For this
 * backend `mintedAsOwner` is constant true, so the check is trivially
 * satisfied — it is asserted anyway so the enforcement point is uniform and
 * self-documenting (and stays correct if the constant ever stops being one).
 */
function assertProvenanceAlive(file, requesterId) {
  if (!shareGrantAllows(file, requesterId, MINTED_AS_OWNER)) {
    throw deny('PROVENANCE_DEAD');
  }
}

/**
 * @param {object} shareLink - ShareLink row (possibly with `file` included)
 * @param {object} [opts]
 * @param {string|null} [opts.mintedUnderVisibility=null] - resource visibility
 *   at mint time, derivable only on the mint path (not persisted on the row —
 *   irrelevant to enforcement here because owner-minted grants survive).
 */
function linkDescriptor(shareLink, { mintedUnderVisibility = null } = {}) {
  return {
    id: shareLink.id,
    resourceType: 'file',
    resourceId: String(shareLink.fileId),
    backend: BACKEND_NAME,
    kind: 'link',
    permissions: shareLink.permissions,
    provenance: {
      mintedBy: String(shareLink.userId),
      mintedAsOwner: MINTED_AS_OWNER,
      mintedUnderVisibility
    },
    expiresAt: shareLink.expiresAt || null,
    maxUses: shareLink.maxUses || null,
    useCount: shareLink.useCount || 0,
    revoked: Boolean(shareLink.isRevoked),
    createdAt: shareLink.createdAt || null
  };
}

/** Descriptor for a standalone file-access CA token (no local row). */
function fileAccessDescriptor(tokenId, resourceId, { mintedBy, mintedUnderVisibility = null, expiresAt = null, useCount = 0, revoked = false, createdAt = null } = {}) {
  return {
    id: tokenId,
    resourceType: 'file',
    resourceId: String(resourceId),
    backend: BACKEND_NAME,
    kind: 'file-access',
    permissions: { ...READ_ONLY },
    provenance: {
      mintedBy: String(mintedBy),
      mintedAsOwner: MINTED_AS_OWNER,
      mintedUnderVisibility
    },
    expiresAt: expiresAt || null,
    maxUses: null,
    useCount,
    revoked,
    createdAt
  };
}

module.exports = {
  backendName: BACKEND_NAME,

  /**
   * Mint a capability. kind: 'link' (default) | 'file-access'.
   * Provenance is derived from the verified File row — anything provenance-
   * shaped in `opts` is ignored (BUG-026).
   */
  async mint(resourceId, grantorId, opts = {}) {
    const kind = opts.kind || 'link';

    // Verify the resource against the grantor BEFORE minting so provenance is
    // derived from the verified row. shareService re-checks ownership itself;
    // this read exists to source `mintedUnderVisibility`, not to authorize.
    const file = await File.findOne({
      where: { id: resourceId, userId: grantorId, isDeleted: false }
    });
    if (!file) {
      throw deny('FILE_NOT_FOUND');
    }
    const provenance = {
      mintedBy: String(grantorId),
      mintedAsOwner: MINTED_AS_OWNER,
      mintedUnderVisibility: file.visibility || null
    };

    if (kind === 'link') {
      const result = await wrap(() => shareService.createShareLink(resourceId, grantorId, {
        permissions: opts.permissions,
        expiresIn: opts.expiresIn,
        maxUses: opts.maxUses
      }));
      return {
        capability: linkDescriptor(result.shareLink, {
          mintedUnderVisibility: provenance.mintedUnderVisibility
        }),
        credential: { shareLinkId: result.shareLink.id, token: result.token.id },
        url: result.shareUrl // today's shareUrl shape, verbatim from shareService
      };
    }

    if (kind === 'file-access') {
      // NOTE: caller permissions are intentionally NOT forwarded — 'file-access'
      // is read-only by construction (TASK-056 clamp inside shareService).
      const result = await wrap(() => shareService.createFileAccessToken(resourceId, grantorId, {
        expiresIn: opts.expiresIn
      }));
      return {
        capability: fileAccessDescriptor(result.tokenId, resourceId, {
          mintedBy: grantorId,
          mintedUnderVisibility: provenance.mintedUnderVisibility,
          expiresAt: result.expiresAt,
          createdAt: new Date()
        }),
        credential: { token: result.tokenId },
        // Today's downloadUrl shape from POST /files/:fileId/access-token.
        url: `/filevault/api/share/file/${resourceId}/download?token=${result.tokenId}`
      };
    }

    throw deny(`UNKNOWN_KIND:${kind}`);
  },

  /**
   * Resolve + enforce in one call. credential.shareLinkId present = 'link'
   * path (existence, secret match, expiry, maxUses/use-count, revocation, CA
   * defense-in-depth incl. the codified unreachable-CA exception — all inside
   * shareService.getShareLink, unchanged); absent = 'file-access' path keyed
   * { resourceId, token } via shareService.accessFileByToken.
   */
  async authorize(credential, ctx = {}) {
    if (!credential || typeof credential !== 'object') {
      throw deny('CREDENTIAL_REQUIRED');
    }
    const required = ctx.requiredPermissions || { read: true };
    const requesterId = ctx.requesterId || null;

    if (credential.shareLinkId) {
      const shareLink = await wrap(() =>
        shareService.getShareLink(credential.shareLinkId, credential.token));

      const file = shareLink.file;
      if (!file || file.isDeleted) {
        throw deny('FILE_NOT_FOUND');
      }

      ensureGranted(shareLink.permissions, required);
      assertProvenanceAlive(file, requesterId);
      await assertModerationServable(file, requesterId);

      // All gates passed — this authorization consumes a use (accessSharedFile
      // semantics; the increment happens after enforcement, never before).
      await shareLink.increment('useCount');

      return { resource: file, capability: linkDescriptor(shareLink) };
    }

    // ── 'file-access' path ──
    if (!ctx.resourceId) {
      throw deny('RESOURCE_ID_REQUIRED');
    }
    // file-access tokens are read-only by construction; asking for more is
    // permission-short without even hitting the CA.
    if (required.write || required.delete) {
      throw deny('PERMISSION_SHORT');
    }

    const file = await wrap(() =>
      shareService.accessFileByToken(ctx.resourceId, credential.token));

    assertProvenanceAlive(file, requesterId);
    await assertModerationServable(file, requesterId);

    return {
      resource: file,
      capability: fileAccessDescriptor(credential.token, ctx.resourceId, {
        // Only the owner can mint a file-access token, so the file's owner IS
        // the minter — derived, not taken from any caller input.
        mintedBy: file.userId,
        createdAt: null
      })
    };
  },

  /**
   * Revoke one capability by id, actor-checked. ShareLink ids take the
   * existing revokeShareLink path verbatim (row flagged + CA token revoked
   * best-effort). A non-ShareLink id is treated as a standalone 'file-access'
   * CA token id — verified as such before revocation so this adapter can never
   * be used to revoke arbitrary CA tokens.
   */
  async revoke(capabilityId, actorId) {
    try {
      await shareService.revokeShareLink(capabilityId, actorId);
      return true;
    } catch (err) {
      if (err instanceof CapabilityError) throw err;
      if (err.message !== 'SHARE_LINK_NOT_FOUND') throw deny(err.message);
      // fall through: not a ShareLink row — maybe a file-access token id
    }

    let validation;
    try {
      validation = await caTokenService.validateToken(capabilityId);
    } catch (err) {
      throw deny(err.message);
    }
    const data = validation && validation.valid ? validation.tokenData : null;
    if (!data || data.shareType !== 'file-access') {
      // missing, already dead, or not one of ours — indistinguishable
      throw deny('CAP_NOT_FOUND');
    }

    try {
      // revokeToken actor-checks (owner/admin); an unauthorized actor gets the
      // same denial as a missing capability.
      await caTokenService.revokeToken(capabilityId, 'Capability revoked', actorId);
      return true;
    } catch (err) {
      throw deny(err.code || err.message);
    }
  },

  /**
   * The "resource replaced/deleted" hammer (TASK-055): kill EVERY outstanding
   * capability on the file — all kinds, all provenance (owner-minted included).
   * Sweeps BOTH ShareLink-backed grants (rows flagged + their CA tokens
   * revoked, best-effort per current revokeShareLink semantics) AND standalone
   * 'file-access' tokens, which have no local row and are found via the CA
   * token store filtered on tokenData ({ fileId, shareType:'file-access' } —
   * queryable without schema change; tokens are minted with that data today).
   * Platform-internal: callers are responsible for owner verification.
   * Returns { revoked } — 0 is success, not an error.
   */
  async revokeByResource(resourceId, opts = {}) {
    const reason = opts.reason || 'resource-revoked';

    const rows = await ShareLink.findAll({
      where: { fileId: resourceId, isRevoked: false }
    });

    let revoked = 0;
    for (const row of rows) {
      await row.update({ isRevoked: true, revokedAt: new Date() });
      revoked += 1;
      if (row.tokenId) {
        try {
          await caTokenService.revokeToken(row.tokenId, reason, null, { isAdmin: true });
        } catch (err) {
          logger.warn(
            `Failed to revoke CA token ${row.tokenId} for share ${row.id} during revokeByResource`,
            { error: err.message }
          );
        }
      }
    }

    const swept = await caTokenService.revokeTokensByData(
      { fileId: resourceId, shareType: 'file-access' },
      reason,
      { revokedBy: opts.actorId || null }
    );

    logger.info(`Capabilities revoked by resource: file ${resourceId}`, {
      shareLinks: revoked,
      fileAccessTokens: swept,
      reason
    });

    return { revoked: revoked + swept };
  },

  /**
   * Owner's management view of live grants — descriptors only, never secret
   * material beyond the descriptor ids the contract defines. Non-owner (or
   * missing resource) gets the same denial.
   */
  async listByResource(resourceId, requesterId) {
    const file = await File.findOne({
      where: { id: resourceId, userId: requesterId, isDeleted: false }
    });
    if (!file) {
      throw deny('FILE_NOT_FOUND');
    }

    const rows = await shareService.listShareLinks(resourceId, requesterId);
    const descriptors = rows.map((row) => linkDescriptor(row));

    const tokens = await caTokenService.findTokensByData(
      { fileId: resourceId, shareType: 'file-access' }
    );
    for (const token of tokens) {
      descriptors.push(fileAccessDescriptor(token.id, resourceId, {
        mintedBy: (token.tokenData && token.tokenData.sharedBy) || token.userId,
        expiresAt: token.expiresAt ? new Date(Number(token.expiresAt)) : null,
        useCount: token.useCount || 0,
        revoked: token.status !== 'active',
        createdAt: token.createdAt || null
      }));
    }

    return descriptors;
  }
};
