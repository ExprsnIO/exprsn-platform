/**
 * ═══════════════════════════════════════════════════════════════════════
 * File Service - Core file management logic
 * ═══════════════════════════════════════════════════════════════════════
 */

const { File, FileVersion, Directory, sequelize } = require('../models');
const storage = require('../storage');
const { calculateSHA256, generateStorageKey } = require('../utils/hash');
const logger = require('../utils/logger');
const config = require('../config');

/**
 * Upload a new file
 */
async function uploadFile({ userId, buffer, filename, path, directoryId, tags, metadata, mimetype }) {
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
      storageBackend = storage.selectBackend(buffer.length, mimetype);
      storageKey = generateStorageKey(contentHash);

      await storage.upload(buffer, storageKey, storageBackend);
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
      metadata: metadata || {}
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

  const buffer = await storage.download(storageKey, storageBackend);
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

  const stream = await storage.downloadStream(storageKey, storageBackend);
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
    const storageBackend = storage.selectBackend(buffer.length, file.mimetype);
    const storageKey = generateStorageKey(contentHash);
    await storage.upload(buffer, storageKey, storageBackend);

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
  getFile,
  downloadFile,
  downloadFileStream,
  updateFile,
  deleteFile,
  listFiles,
  searchFiles,
  getStorageUsage
};
