/**
 * ═══════════════════════════════════════════════════════════════════════
 * File Service - Core file management logic
 * ═══════════════════════════════════════════════════════════════════════
 */

const { Readable } = require('stream');
const { File, FileVersion, Directory, sequelize } = require('../models');
const storage = require('../storage');
const { calculateSHA256, generateStorageKey } = require('../utils/hash');
const logger = require('../utils/logger');
const config = require('../config');

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

    await transaction.commit();
    logger.info(`File created: ${file.id}`);

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
      { model: FileVersion, as: 'versions', limit: 10, order: [['version', 'DESC']] }
    ]
  });

  if (!file) {
    throw new Error('FILE_NOT_FOUND');
  }

  // Check access (basic ownership check - extend with permissions)
  if (file.visibility === 'private' && file.userId !== userId) {
    throw new Error('INSUFFICIENT_PERMISSIONS');
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

    await transaction.commit();
    logger.info(`File updated to version ${newVersion}: ${file.id}`);

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

    await transaction.commit();
    logger.info(`Group file created: ${file.id} (group ${groupId})`);

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
