/**
 * ═══════════════════════════════════════════════════════════════════════
 * File Service - Core file management logic
 * ═══════════════════════════════════════════════════════════════════════
 */

const { Readable } = require('stream');
const { File, FileVersion, Directory, FileModeration, sequelize } = require('../models');
const storage = require('../storage');
const { calculateSHA256, generateStorageKey } = require('../utils/hash');
const logger = require('../utils/logger');
const config = require('../config');
const imageModeration = require('./imageModerationService');
const { enqueueImageModeration, requeueImageModeration } = require('../queues/imageModeration');

/**
 * Upload a new file
 */
async function uploadFile({ userId, buffer, filename, path, directoryId, tags, metadata, mimetype, visibility }) {
  const transaction = await sequelize.transaction();

  try {
    // Calculate content hash
    const contentHash = calculateSHA256(buffer);

    // Check for existing file with same hash (deduplication)
    let storageKey, storageBackend;
    const existingFile = config.app.enableDeduplication
      ? await File.findOne({ where: { contentHash }, transaction })
      : null;

    if (existingFile) {
      // Reuse existing storage
      storageKey = existingFile.storageKey;
      storageBackend = existingFile.storageBackend;
      logger.info(`File deduplicated: ${contentHash}`);
    } else {
      // Select backend and upload
      storageBackend = storage.selectBackend({ fileSize: buffer.length });
      storageKey = generateStorageKey(contentHash);

      await storage.store({ buffer, originalname: filename }, storageBackend, { key: storageKey });
      logger.info(`File uploaded to ${storageBackend}: ${storageKey}`);
    }

    // Create file record
    const file = await File.create({
      userId,
      directoryId,
      name: filename,
      path: path || `/${filename}`,
      size: buffer.length,
      mimetype,
      contentHash,
      storageBackend,
      storageKey,
      currentVersion: 1,
      tags: tags || [],
      metadata: metadata || {},
      // Only override the model default ('private') when a value is supplied.
      ...(visibility ? { visibility } : {})
    }, { transaction });

    // Create first version
    await FileVersion.create({
      fileId: file.id,
      version: 1,
      userId,
      size: buffer.length,
      contentHash,
      storageBackend,
      storageKey,
      metadata: metadata || {}
    }, { transaction });

    // FEAT-031: every uploaded object gets a moderation row IN THIS TRANSACTION,
    // so an image can never exist without a visibility state. In enforce mode
    // images start `pending` (hidden from other users) and are cleared
    // asynchronously; in shadow mode they start `approved` (servable) and are
    // scored asynchronously without ever being held; other objects are `skipped`
    // (servable) immediately.
    await imageModeration.establishModerationState(
      FileModeration, { id: file.id, mimetype, metadata }, { transaction, mode: 'create' });

    await transaction.commit();
    logger.info(`File created: ${file.id}`);

    // Enqueue AFTER commit — a worker must never see a row the transaction has
    // not yet made visible. `shouldQueue` covers BOTH modes (enforce `pending`
    // and shadow `approved`/`shadow_pending`), not just the hidden case. Best-
    // effort: a Redis outage in enforce leaves the image `pending` (fail-closed),
    // and the reconcile sweep re-queues either mode later.
    if (imageModeration.shouldQueue({ mimetype, metadata })) {
      await enqueueImageModeration(file.id);
    }

    return file;
  } catch (error) {
    await transaction.rollback();
    logger.error('Failed to upload file:', error);
    throw error;
  }
}

/**
 * Get file by ID
 */
async function getFile(fileId, userId) {
  const file = await File.findOne({
    where: { id: fileId, isDeleted: false },
    include: [
      { model: Directory, as: 'directory' },
      { model: FileVersion, as: 'versions', limit: 10, order: [['version', 'DESC']] },
      { model: FileModeration, as: 'moderation' }
    ]
  });

  if (!file) {
    throw new Error('FILE_NOT_FOUND');
  }

  // Check access (basic ownership check - extend with permissions)
  if (file.visibility === 'private' && file.userId !== userId) {
    throw new Error('INSUFFICIENT_PERMISSIONS');
  }

  // FEAT-031 fail-closed visibility: an image awaiting (or failing) moderation
  // is served only to its uploader. `userId` is undefined on anonymous paths
  // (share links), which correctly makes them "other users". Deliberately the
  // same error as a missing file — a held image must not be enumerable.
  if (!imageModeration.canServe(file, file.moderation, userId)) {
    throw new Error('FILE_NOT_FOUND');
  }

  return file;
}

/**
 * Download file content
 */
async function downloadFile(fileId, userId, versionNumber = null) {
  const file = await getFile(fileId, userId);

  let storageKey, storageBackend;

  if (versionNumber) {
    // Get specific version
    const version = await FileVersion.findOne({
      where: { fileId, version: versionNumber }
    });

    if (!version) {
      throw new Error('VERSION_NOT_FOUND');
    }

    storageKey = version.storageKey;
    storageBackend = version.storageBackend;
  } else {
    // Get current version
    storageKey = file.storageKey;
    storageBackend = file.storageBackend;
  }

  const buffer = await storage.retrieve(storageKey, storageBackend);
  return { buffer, file };
}

/**
 * Download file as stream
 */
async function downloadFileStream(fileId, userId, versionNumber = null) {
  const file = await getFile(fileId, userId);

  let storageKey, storageBackend;

  if (versionNumber) {
    const version = await FileVersion.findOne({
      where: { fileId, version: versionNumber }
    });

    if (!version) {
      throw new Error('VERSION_NOT_FOUND');
    }

    storageKey = version.storageKey;
    storageBackend = version.storageBackend;
  } else {
    storageKey = file.storageKey;
    storageBackend = file.storageBackend;
  }

  // StorageManager exposes a buffer-returning retrieve(); wrap it as a readable
  // stream for the streaming download route.
  const buffer = await storage.retrieve(storageKey, storageBackend);
  const stream = Readable.from(buffer);
  return { stream, file };
}

/**
 * Does a durable container share (a live room today; gallery albums later) still
 * authorize this file, given the provenance of the share?
 *
 * FEAT-061 / BUG-027. A share is a capability minted at share time, and the two
 * cases below must diverge once the owner flips the file to `private`:
 *
 *   - the OWNER shared their own file    -> survives the flip. This is the flow the
 *     old blanket visibility-skip existed to protect, and it must keep working.
 *   - a NON-owner shared a public file   -> dies on the flip. The grant was only ever
 *     as strong as the visibility it was minted under.
 *
 * `sharedAsOwner` is per-share provenance (live: `room_files.shared_as_owner`), NOT a
 * property of the requester — any room member downloading an owner-shared private file
 * passes, which is the point.
 *
 * @param {object} file
 * @param {string} requesterId
 * @param {boolean} sharedAsOwner - was the sharer the file's owner at share time?
 */
function shareGrantAllows(file, requesterId, sharedAsOwner) {
  if (file.visibility !== 'private') return true;
  if (sharedAsOwner) return true;
  // A requester who owns the file needs no share to read it.
  return String(file.userId) === String(requesterId);
}

/**
 * Download a file for a requester whose right to access is established by an
 * EXTERNAL container membership (e.g. a live room), NOT by FileVault ownership.
 *
 * Consolidated inside FileVault so there is one code path for both gates:
 *  - **Share grant (FEAT-061).** Container membership alone is NOT sufficient. The
 *    share carries provenance, and `shareGrantAllows()` decides whether it survived
 *    the file's current visibility. (This function previously skipped the visibility
 *    check outright — that was BUG-027.)
 *  - **Moderation (FEAT-031).** Still applies to the member as a non-uploader: a held
 *    (pending/rejected) image is not served to anyone but its uploader. A share grant
 *    does not buy past it.
 *
 * Both gates throw the same FILE_NOT_FOUND as a missing file, so neither a held image
 * nor a lapsed share is distinguishable from a file that was never there.
 *
 * @param {string} fileId      - FileVault file id
 * @param {string} requesterId - the user asking to read the bytes
 * @param {object} [opts]
 * @param {boolean} [opts.sharedAsOwner=false] - was the sharer the file's owner at share
 *   time? Defaults to false, i.e. fails closed on a private file.
 */
async function downloadFileStreamForMember(fileId, requesterId, { sharedAsOwner = false } = {}) {
  const file = await File.findOne({
    where: { id: fileId, isDeleted: false },
    include: [{ model: FileModeration, as: 'moderation' }]
  });

  if (!file) {
    throw new Error('FILE_NOT_FOUND');
  }

  // BUG-027: a share does not outlive the visibility it was granted under, unless the
  // owner is the one who shared it. Same error as a missing file — a revoked share must
  // not be distinguishable from a file that was never there.
  if (!shareGrantAllows(file, requesterId, sharedAsOwner)) {
    throw new Error('FILE_NOT_FOUND');
  }

  // FEAT-031 fail-closed gate. canServe() lets the uploader see their own held
  // image, but any other member waits for a verdict — identical error to a
  // missing file so a held image can't be probed for existence.
  if (!imageModeration.canServe(file, file.moderation, requesterId)) {
    throw new Error('FILE_NOT_FOUND');
  }

  const buffer = await storage.retrieve(file.storageKey, file.storageBackend);
  return { stream: Readable.from(buffer), file };
}

/**
 * Given a set of FileVault file ids, return the subset that may be served to
 * `requesterId` under the FEAT-031 moderation gate AND the FEAT-061 share grant.
 * Used by container listings (e.g. a live room's file list) so that neither a held
 * image nor a file whose share has lapsed is enumerable.
 *
 * The listing MUST apply the same rule as the download path. If it did not, a file
 * whose share died on a private-flip would keep appearing in the room's file list —
 * leaking its name, size, and existence while its bytes 404. That is the same
 * metadata-disclosure shape as BUG-020, and it is what makes the check belong here
 * rather than only at download.
 *
 * @param {string[]} fileIds
 * @param {string} requesterId
 * @param {object} [opts]
 * @param {Set<string>} [opts.ownerSharedIds] - ids whose share was minted BY the owner
 *   (live: `room_files.shared_as_owner`). Absent = treat every share as non-owner,
 *   which fails closed.
 * @returns {Promise<Set<string>>} servable file ids (as strings)
 */
async function servableFileIds(fileIds, requesterId, { ownerSharedIds } = {}) {
  const ids = (fileIds || []).map((id) => String(id)).filter(Boolean);
  if (ids.length === 0) return new Set();

  const files = await File.findAll({
    where: { id: ids, isDeleted: false },
    include: [{ model: FileModeration, as: 'moderation' }]
  });

  const servable = new Set();
  for (const file of files) {
    const sharedAsOwner = ownerSharedIds ? ownerSharedIds.has(String(file.id)) : false;
    if (!shareGrantAllows(file, requesterId, sharedAsOwner)) continue;
    if (imageModeration.canServe(file, file.moderation, requesterId)) {
      servable.add(String(file.id));
    }
  }
  return servable;
}

/**
 * Update file (creates new version)
 */
async function updateFile(fileId, userId, buffer, changeDescription) {
  const transaction = await sequelize.transaction();

  try {
    const file = await File.findOne({ where: { id: fileId, userId }, transaction });

    if (!file) {
      throw new Error('FILE_NOT_FOUND');
    }

    // Check version limit
    const versionCount = await FileVersion.count({ where: { fileId }, transaction });
    if (versionCount >= config.app.maxVersionsPerFile) {
      throw new Error('MAX_VERSIONS_EXCEEDED');
    }

    // Calculate new content hash
    const contentHash = calculateSHA256(buffer);

    // Upload new version
    const storageBackend = storage.selectBackend({ fileSize: buffer.length });
    const storageKey = generateStorageKey(contentHash);
    await storage.store({ buffer, originalname: file.name }, storageBackend, { key: storageKey });

    const newVersion = file.currentVersion + 1;

    // Create new version record
    await FileVersion.create({
      fileId: file.id,
      version: newVersion,
      userId,
      size: buffer.length,
      contentHash,
      storageBackend,
      storageKey,
      changeDescription
    }, { transaction });

    // Update file record
    await file.update({
      size: buffer.length,
      contentHash,
      storageBackend,
      storageKey,
      currentVersion: newVersion
    }, { transaction });

    // FEAT-031 / BUG-018: the bytes just changed, so the old verdict no longer
    // describes this file. Without this, "upload benign → get approved → save a
    // new version" serves unmoderated content under an approved status. Reset to
    // `pending` (i.e. hidden from others) inside the transaction, then re-queue.
    await imageModeration.establishModerationState(
      FileModeration, file, { transaction, mode: 'reset' });

    await transaction.commit();
    logger.info(`File updated to version ${newVersion}: ${file.id}`);

    if (imageModeration.shouldQueue(file)) {
      // Must REMOVE the stale job first — a plain re-add is a silent no-op while
      // the completed job's key survives in Redis (BUG-016).
      await requeueImageModeration(file.id);
    }

    return file;
  } catch (error) {
    await transaction.rollback();
    logger.error('Failed to update file:', error);
    throw error;
  }
}

/**
 * Delete file (soft delete)
 */
async function deleteFile(fileId, userId) {
  const file = await File.findOne({ where: { id: fileId, userId } });

  if (!file) {
    throw new Error('FILE_NOT_FOUND');
  }

  await file.update({
    isDeleted: true,
    deletedAt: new Date()
  });

  logger.info(`File deleted: ${fileId}`);
  return true;
}

/**
 * Rename a file (metadata only — does not create a new content version).
 */
async function renameFile(fileId, userId, name) {
  const clean = String(name || '').trim();
  if (!clean) throw new Error('INVALID_NAME');

  const file = await File.findOne({ where: { id: fileId, userId, isDeleted: false } });
  if (!file) {
    throw new Error('FILE_NOT_FOUND');
  }

  await file.update({ name: clean });
  logger.info(`File renamed: ${fileId} -> ${clean}`);
  return file;
}

/**
 * List files in directory
 */
async function listFiles(userId, directoryId = null, options = {}) {
  const where = {
    userId,
    directoryId,
    isDeleted: false
  };

  if (options.tags && options.tags.length > 0) {
    where.tags = { [sequelize.Op.contains]: options.tags };
  }

  const files = await File.findAll({
    where,
    limit: options.limit || 50,
    offset: options.offset || 0,
    order: [['createdAt', 'DESC']],
    include: [{ model: Directory, as: 'directory' }]
  });

  return files;
}

/**
 * List the caller's trashed (soft-deleted) files.
 *
 * Returns only USER-owned files (owner_type 'user') that are soft-deleted,
 * newest-deleted first. Mirrors the shape of listFiles().
 *
 * @param {string} userId
 * @param {Object} options - { limit, offset }
 */
async function listTrash(userId, { limit = 50, offset = 0 } = {}) {
  const files = await File.findAll({
    where: {
      userId,
      ownerType: 'user',
      isDeleted: true
    },
    limit,
    offset,
    order: [['deletedAt', 'DESC']],
    include: [{ model: Directory, as: 'directory' }]
  });

  return files;
}

/**
 * Restore (undelete) a soft-deleted file owned by the caller.
 *
 * Clears the soft-delete flag and deletedAt timestamp. Throws FILE_NOT_FOUND
 * if the file doesn't exist or isn't owned by userId.
 *
 * @param {string} fileId
 * @param {string} userId
 */
async function restoreFile(fileId, userId) {
  const file = await File.findOne({ where: { id: fileId, userId, isDeleted: true } });

  if (!file) {
    throw new Error('FILE_NOT_FOUND');
  }

  await file.update({
    isDeleted: false,
    deletedAt: null
  });

  logger.info(`File restored: ${fileId}`);
  return file;
}

/**
 * Upload a new file into a group.
 *
 * Mirrors uploadFile() but stamps owner_type='group' and group_id so the file
 * belongs to the group rather than the uploader. user_id still records the
 * uploading user for attribution/audit.
 */
async function uploadGroupFile({ groupId, userId, buffer, filename, path, directoryId, tags, metadata, mimetype }) {
  const transaction = await sequelize.transaction();

  try {
    const contentHash = calculateSHA256(buffer);

    let storageKey, storageBackend;
    const existingFile = config.app.enableDeduplication
      ? await File.findOne({ where: { contentHash }, transaction })
      : null;

    if (existingFile) {
      storageKey = existingFile.storageKey;
      storageBackend = existingFile.storageBackend;
      logger.info(`Group file deduplicated: ${contentHash}`);
    } else {
      storageBackend = storage.selectBackend({ fileSize: buffer.length });
      storageKey = generateStorageKey(contentHash);
      await storage.store({ buffer, originalname: filename }, storageBackend, { key: storageKey });
      logger.info(`Group file uploaded to ${storageBackend}: ${storageKey}`);
    }

    const file = await File.create({
      userId,
      ownerType: 'group',
      groupId,
      directoryId,
      name: filename,
      path: path || `/${filename}`,
      size: buffer.length,
      mimetype,
      contentHash,
      storageBackend,
      storageKey,
      currentVersion: 1,
      tags: tags || [],
      metadata: metadata || {},
      visibility: 'shared'
    }, { transaction });

    await FileVersion.create({
      fileId: file.id,
      version: 1,
      userId,
      size: buffer.length,
      contentHash,
      storageBackend,
      storageKey,
      metadata: metadata || {}
    }, { transaction });

    // FEAT-031 / BUG-017: group uploads are moderated exactly like personal ones.
    // This path created no moderation row at all, so every group image was served
    // unmoderated to the whole group — the chokepoint's largest hole, and exactly
    // the content most visible to other people.
    await imageModeration.establishModerationState(
      FileModeration, { id: file.id, mimetype, metadata }, { transaction, mode: 'create' });

    await transaction.commit();
    logger.info(`Group file created: ${file.id} (group ${groupId})`);

    if (imageModeration.shouldQueue({ mimetype, metadata })) {
      await enqueueImageModeration(file.id);
    }

    return file;
  } catch (error) {
    await transaction.rollback();
    logger.error('Failed to upload group file:', error);
    throw error;
  }
}

/**
 * List files owned by a group.
 *
 * @param {string} groupId
 * @param {string|null} directoryId - optional directory filter
 * @param {Object} options - { limit, offset, tags, imagesOnly, mimetype }
 */
async function listGroupFiles(groupId, directoryId = null, options = {}) {
  const where = {
    groupId,
    ownerType: 'group',
    isDeleted: false
  };

  if (typeof directoryId !== 'undefined' && directoryId !== null) {
    where.directoryId = directoryId;
  }

  if (options.imagesOnly) {
    where.mimetype = { [sequelize.Op.iLike]: 'image/%' };
  } else if (options.mimetype) {
    where.mimetype = { [sequelize.Op.iLike]: `${options.mimetype}%` };
  }

  if (options.tags && options.tags.length > 0) {
    where.tags = { [sequelize.Op.contains]: options.tags };
  }

  const files = await File.findAll({
    where,
    limit: options.limit || 50,
    offset: options.offset || 0,
    order: [['createdAt', 'DESC']],
    include: [{ model: Directory, as: 'directory' }]
  });

  return files;
}

/**
 * Search files
 */
async function searchFiles(userId, query, options = {}) {
  const where = {
    userId,
    isDeleted: false,
    [sequelize.Op.or]: [
      { name: { [sequelize.Op.iLike]: `%${query}%` } },
      { path: { [sequelize.Op.iLike]: `%${query}%` } }
    ]
  };

  const files = await File.findAll({
    where,
    limit: options.limit || 50,
    offset: options.offset || 0,
    order: [['createdAt', 'DESC']]
  });

  return files;
}

/**
 * Get storage usage for user
 */
async function getStorageUsage(userId) {
  const result = await File.findOne({
    where: { userId, isDeleted: false },
    attributes: [
      [sequelize.fn('COUNT', sequelize.col('id')), 'fileCount'],
      [sequelize.fn('SUM', sequelize.col('size')), 'totalSize']
    ],
    raw: true
  });

  return {
    fileCount: parseInt(result.fileCount || 0),
    totalSize: parseInt(result.totalSize || 0)
  };
}

module.exports = {
  uploadFile,
  uploadGroupFile,
  getFile,
  downloadFile,
  downloadFileStream,
  downloadFileStreamForMember,
  servableFileIds,
  shareGrantAllows,
  updateFile,
  renameFile,
  deleteFile,
  listTrash,
  restoreFile,
  listFiles,
  listGroupFiles,
  searchFiles,
  getStorageUsage
};
