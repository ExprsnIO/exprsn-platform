/**
 * ═══════════════════════════════════════════════════════════════════════
 * Version Service - File version management
 * ═══════════════════════════════════════════════════════════════════════
 */

const { File, FileVersion, FileModeration, sequelize } = require('../models');
const storage = require('../storage');
const { calculateTextDiff, isTextFile } = require('../utils/diff');
const logger = require('../utils/logger');
const imageModeration = require('./imageModerationService');
const { requeueImageModeration } = require('../queues/imageModeration');

/**
 * Get all versions of a file
 */
async function getFileVersions(fileId, userId) {
  // Verify access
  const file = await File.findOne({ where: { id: fileId } });

  if (!file) {
    throw new Error('FILE_NOT_FOUND');
  }

  if (file.userId !== userId && file.visibility === 'private') {
    throw new Error('INSUFFICIENT_PERMISSIONS');
  }

  const versions = await FileVersion.findAll({
    where: { fileId },
    order: [['version', 'DESC']]
  });

  return versions;
}

/**
 * Get specific version
 */
async function getVersion(fileId, versionNumber, userId) {
  const file = await File.findOne({ where: { id: fileId } });

  if (!file) {
    throw new Error('FILE_NOT_FOUND');
  }

  if (file.userId !== userId && file.visibility === 'private') {
    throw new Error('INSUFFICIENT_PERMISSIONS');
  }

  const version = await FileVersion.findOne({
    where: { fileId, version: versionNumber }
  });

  if (!version) {
    throw new Error('VERSION_NOT_FOUND');
  }

  return version;
}

/**
 * Restore file to a specific version
 */
async function restoreVersion(fileId, versionNumber, userId) {
  const transaction = await sequelize.transaction();

  try {
    const file = await File.findOne({ where: { id: fileId, userId }, transaction });

    if (!file) {
      throw new Error('FILE_NOT_FOUND');
    }

    const targetVersion = await FileVersion.findOne({
      where: { fileId, version: versionNumber },
      transaction
    });

    if (!targetVersion) {
      throw new Error('VERSION_NOT_FOUND');
    }

    // Create new version with the restored content
    const newVersionNumber = file.currentVersion + 1;

    await FileVersion.create({
      fileId: file.id,
      version: newVersionNumber,
      userId,
      size: targetVersion.size,
      contentHash: targetVersion.contentHash,
      storageBackend: targetVersion.storageBackend,
      storageKey: targetVersion.storageKey,
      changeDescription: `Restored from version ${versionNumber}`,
      metadata: targetVersion.metadata
    }, { transaction });

    // Update file to point to restored version
    await file.update({
      size: targetVersion.size,
      contentHash: targetVersion.contentHash,
      storageBackend: targetVersion.storageBackend,
      storageKey: targetVersion.storageKey,
      currentVersion: newVersionNumber
    }, { transaction });

    // FEAT-031: restoring repoints `storageKey` at DIFFERENT bytes while leaving
    // the verdict untouched. Approve v2, restore v1, and content that was never
    // cleared (or was rejected) serves under an `approved` status. Versions are
    // not individually moderated, so the only safe move is to re-moderate the
    // file's new current bytes: reset to `pending` (hidden) inside the
    // transaction, re-queue after commit.
    await imageModeration.establishModerationState(
      FileModeration, file, { transaction, mode: 'reset' });

    await transaction.commit();
    logger.info(`File restored to version ${versionNumber}: ${fileId}`);

    if (imageModeration.shouldQueue(file)) {
      // Remove the stale job first — a plain re-add is a silent no-op (BUG-016).
      await requeueImageModeration(file.id);
    }

    return file;
  } catch (error) {
    await transaction.rollback();
    logger.error('Failed to restore version:', error);
    throw error;
  }
}

/**
 * Get diff between two versions
 */
async function getVersionDiff(fileId, fromVersion, toVersion, userId) {
  const file = await File.findOne({ where: { id: fileId } });

  if (!file) {
    throw new Error('FILE_NOT_FOUND');
  }

  if (file.userId !== userId && file.visibility === 'private') {
    throw new Error('INSUFFICIENT_PERMISSIONS');
  }

  // Check if file is text-based
  if (!isTextFile(file.mimetype)) {
    throw new Error('DIFF_NOT_SUPPORTED_FOR_BINARY_FILES');
  }

  // Get both versions
  const [v1, v2] = await Promise.all([
    FileVersion.findOne({ where: { fileId, version: fromVersion } }),
    FileVersion.findOne({ where: { fileId, version: toVersion } })
  ]);

  if (!v1 || !v2) {
    throw new Error('VERSION_NOT_FOUND');
  }

  // Download content
  const [content1, content2] = await Promise.all([
    storage.download(v1.storageKey, v1.storageBackend),
    storage.download(v2.storageKey, v2.storageBackend)
  ]);

  // Calculate diff
  const diff = calculateTextDiff(
    content1.toString('utf8'),
    content2.toString('utf8')
  );

  return {
    fromVersion,
    toVersion,
    diff,
    summary: diff.summary
  };
}

/**
 * Delete old versions (keep N most recent)
 */
async function pruneVersions(fileId, userId, keepCount = 10) {
  const file = await File.findOne({ where: { id: fileId, userId } });

  if (!file) {
    throw new Error('FILE_NOT_FOUND');
  }

  const versions = await FileVersion.findAll({
    where: { fileId },
    order: [['version', 'DESC']],
    offset: keepCount
  });

  if (versions.length === 0) {
    return 0;
  }

  // Delete old versions from storage
  for (const version of versions) {
    try {
      await storage.delete(version.storageKey, version.storageBackend);
    } catch (error) {
      logger.warn(`Failed to delete version storage: ${version.id}`, error);
    }
  }

  // Delete version records
  const versionIds = versions.map(v => v.id);
  const deletedCount = await FileVersion.destroy({
    where: { id: versionIds }
  });

  logger.info(`Pruned ${deletedCount} versions for file: ${fileId}`);
  return deletedCount;
}

module.exports = {
  getFileVersions,
  getVersion,
  restoreVersion,
  getVersionDiff,
  pruneVersions
};
