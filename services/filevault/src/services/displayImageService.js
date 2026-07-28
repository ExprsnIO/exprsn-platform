'use strict';

/**
 * TASK-055 — revoke the minted capability token (+ reap the superseded
 * FileVault file) when an avatar/cover display image is replaced or removed.
 *
 * `ImageUploadField` (TASK-053) mints a non-expiring, read-only file-scoped
 * access token for every uploaded avatar/cover and stores the tokened
 * download URL:
 *   /filevault/api/share/file/:fileId/download?token=<tokenId>
 * Replacing or removing the field previously only ever changed the stored
 * URL string — the minted token (and the file behind it) lived on forever,
 * so anyone who captured the old URL kept permanent read access.
 *
 * This is the one-call fix the FEAT-077 capability façade promised
 * (`capabilityService.revokeByResource`), plus the simplify-pass scope
 * extension: reap (soft-delete) the superseded FileVault file too. Callers
 * that own an avatar/cover URL field (auth's user profile, nexus's
 * group/subgroup avatar+banner) call `reapDisplayImage` with the OLD and
 * NEW values whenever they persist a change — in-process, same pattern as
 * `services/live/src/routes/roomCollab.js`'s FileVault require. Best-effort:
 * never throws, so a revoke/reap failure never blocks the profile/group
 * update it is cleaning up after.
 */

const logger = require('../utils/logger');
const capabilityService = require('./capabilityService');
const fileService = require('./fileService');

const DISPLAY_URL_RE = /\/filevault\/api\/share\/file\/([^/?]+)\/download(?:\?|$)/;

/** Extract the FileVault file id from a stored display URL, if it is one. */
function extractFileId(url) {
  if (!url || typeof url !== 'string') return null;
  const match = url.match(DISPLAY_URL_RE);
  return match ? match[1] : null;
}

/**
 * Revoke every outstanding capability on the OLD display image and reap
 * (soft-delete) the underlying FileVault file, when the field's value
 * actually changed. No-op when the old value wasn't a FileVault display URL,
 * or the value is unchanged (still the same upload).
 *
 * @param {string|null|undefined} oldUrl - previously stored avatar/cover URL
 * @param {string|null|undefined} newUrl - the URL being persisted now ('' / null if removed)
 * @param {string} ownerId - the FileVault file owner (uploader) id, for the reap call
 */
async function reapDisplayImage(oldUrl, newUrl, ownerId) {
  if (!oldUrl || oldUrl === newUrl) return;

  const fileId = extractFileId(oldUrl);
  if (!fileId) return; // external/non-FileVault URL — nothing minted to revoke

  try {
    await capabilityService.revokeByResource('file', fileId, { reason: 'display-image-replaced' });
  } catch (err) {
    logger.error('Failed to revoke capability for superseded display image', {
      fileId,
      error: err.message
    });
  }

  try {
    await fileService.deleteFile(fileId, ownerId);
  } catch (err) {
    // Not fatal (e.g. already deleted, or ownerId isn't the uploader — rare:
    // a different admin edited the group). Revocation above already killed
    // read access; a missed reap is just disk residue.
    logger.warn('Failed to reap superseded display image file', {
      fileId,
      error: err.message
    });
  }
}

module.exports = {
  extractFileId,
  reapDisplayImage
};
