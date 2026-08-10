const { Op } = require('sequelize');
const { Document, Folder, DocumentVersion } = require('../../../models/forge');
const logger = require('../../../utils/logger');
const path = require('path');
const crypto = require('crypto');

/**
 * Document Service
 *
 * Handles document and folder management with versioning
 */

/**
 * Create a folder
 */
async function createFolder({
  name,
  description,
  parentFolderId,
  ownerId,
  permissions,
  metadata
}) {
  try {
    // Validate parent folder if provided
    if (parentFolderId) {
      const parentFolder = await Folder.findByPk(parentFolderId);
      if (!parentFolder) {
        throw new Error(`Parent folder not found: ${parentFolderId}`);
      }
    }

    const folder = await Folder.create({
      name,
      description,
      parentFolderId: parentFolderId || null,
      ownerId,
      permissions: permissions || {},
      metadata: metadata || {}
    });

    logger.info('Folder created', {
      folderId: folder.id,
      name,
      ownerId
    });

    return folder;
  } catch (error) {
    logger.error('Failed to create folder', {
      name,
      error: error.message
    });
    throw error;
  }
}

/**
 * Get folder by ID
 */
async function getFolderById(id, includeContents = false) {
  const include = [];

  if (includeContents) {
    include.push(
      {
        model: Folder,
        as: 'subFolders',
        limit: 100
      },
      {
        model: Document,
        as: 'documents',
        limit: 100
      }
    );
  }

  const folder = await Folder.findByPk(id, { include });

  if (!folder) {
    throw new Error(`Folder not found: ${id}`);
  }

  return folder;
}

/**
 * List folders
 */
async function listFolders({
  parentFolderId,
  ownerId,
  search,
  limit = 50,
  offset = 0
}) {
  const where = {};

  if (parentFolderId !== undefined) {
    where.parentFolderId = parentFolderId;
  }

  if (ownerId) {
    where.ownerId = ownerId;
  }

  if (search) {
    where[Op.or] = [
      { name: { [Op.iLike]: `%${search}%` } },
      { description: { [Op.iLike]: `%${search}%` } }
    ];
  }

  const { count, rows } = await Folder.findAndCountAll({
    where,
    limit,
    offset,
    order: [['name', 'ASC']]
  });

  return {
    folders: rows,
    total: count,
    limit,
    offset
  };
}

/**
 * Update a folder
 */
async function updateFolder(id, updates) {
  try {
    const folder = await getFolderById(id);

    // Prevent circular parent reference
    if (updates.parentFolderId) {
      if (updates.parentFolderId === id) {
        throw new Error('Folder cannot be its own parent');
      }

      // Check if new parent is a descendant
      const isDescendant = await checkIsDescendant(id, updates.parentFolderId);
      if (isDescendant) {
        throw new Error('Cannot move folder to one of its descendants');
      }
    }

    Object.assign(folder, updates);
    await folder.save();

    logger.info('Folder updated', {
      folderId: id,
      updates: Object.keys(updates)
    });

    return folder;
  } catch (error) {
    logger.error('Failed to update folder', {
      folderId: id,
      error: error.message
    });
    throw error;
  }
}

/**
 * Delete a folder
 */
async function deleteFolder(id, recursive = false) {
  try {
    const folder = await getFolderById(id, true);

    // Check for contents
    const hasSubFolders = folder.subFolders && folder.subFolders.length > 0;
    const hasDocuments = folder.documents && folder.documents.length > 0;

    if ((hasSubFolders || hasDocuments) && !recursive) {
      throw new Error('Folder is not empty. Use recursive=true to delete all contents');
    }

    if (recursive) {
      // Delete all sub-folders recursively
      if (hasSubFolders) {
        for (const subFolder of folder.subFolders) {
          await deleteFolder(subFolder.id, true);
        }
      }

      // Delete all documents
      if (hasDocuments) {
        for (const document of folder.documents) {
          await deleteDocument(document.id);
        }
      }
    }

    await folder.destroy();

    logger.info('Folder deleted', {
      folderId: id,
      recursive
    });

    return { success: true };
  } catch (error) {
    logger.error('Failed to delete folder', {
      folderId: id,
      error: error.message
    });
    throw error;
  }
}

/**
 * Check if targetId is a descendant of folderId
 */
async function checkIsDescendant(folderId, targetId, visited = new Set()) {
  if (visited.has(targetId)) {
    return false;
  }

  visited.add(targetId);

  const target = await Folder.findByPk(targetId, {
    include: [{ model: Folder, as: 'subFolders' }]
  });

  if (!target || !target.subFolders) {
    return false;
  }

  for (const subFolder of target.subFolders) {
    if (subFolder.id === folderId) {
      return true;
    }

    if (await checkIsDescendant(folderId, subFolder.id, visited)) {
      return true;
    }
  }

  return false;
}

/**
 * Create a document
 */
async function createDocument({
  filename,
  title,
  description,
  content,
  mimeType,
  size,
  folderId,
  ownerId,
  tags,
  version,
  metadata
}) {
  try {
    // Validate folder if provided
    if (folderId) {
      await getFolderById(folderId);
    }

    const document = await Document.create({
      filename,
      title: title || filename,
      description,
      content,
      mimeType,
      size,
      folderId: folderId || null,
      ownerId,
      tags: tags || [],
      version: version || 1,
      metadata: metadata || {}
    });

    logger.info('Document created', {
      documentId: document.id,
      filename,
      ownerId
    });

    return document;
  } catch (error) {
    logger.error('Failed to create document', {
      filename,
      error: error.message
    });
    throw error;
  }
}

/**
 * Get document by ID
 */
async function getDocumentById(id, includeFolder = false) {
  const include = [];

  if (includeFolder) {
    include.push({ model: Folder, as: 'folder' });
  }

  const document = await Document.findByPk(id, { include });

  if (!document) {
    throw new Error(`Document not found: ${id}`);
  }

  return document;
}

/**
 * List documents
 */
async function listDocuments({
  folderId,
  ownerId,
  mimeType,
  search,
  tags,
  limit = 50,
  offset = 0,
  orderBy = 'createdAt',
  orderDirection = 'DESC'
}) {
  const where = {};

  if (folderId !== undefined) {
    where.folderId = folderId;
  }

  if (ownerId) {
    where.ownerId = ownerId;
  }

  if (mimeType) {
    where.mimeType = { [Op.like]: `${mimeType}%` };
  }

  if (search) {
    where[Op.or] = [
      { filename: { [Op.iLike]: `%${search}%` } },
      { title: { [Op.iLike]: `%${search}%` } },
      { description: { [Op.iLike]: `%${search}%` } }
    ];
  }

  if (tags && tags.length > 0) {
    where.tags = { [Op.contains]: tags };
  }

  const { count, rows } = await Document.findAndCountAll({
    where,
    limit,
    offset,
    order: [[orderBy, orderDirection]],
    include: [{ model: Folder, as: 'folder', attributes: ['id', 'name'] }]
  });

  return {
    documents: rows,
    total: count,
    limit,
    offset
  };
}

/**
 * Update a document
 */
async function updateDocument(id, updates, userId, changeDescription) {
  try {
    const document = await getDocumentById(id);

    // Validate folder if being changed
    if (updates.folderId) {
      await getFolderById(updates.folderId);
    }

    // Determine change type
    let changeType = 'metadata_updated';
    if (updates.content && updates.content !== document.content) {
      changeType = 'content_updated';
      updates.version = (document.version || 1) + 1;
      updates.lastModifiedAt = new Date();
    } else if (updates.filename && updates.filename !== document.filename) {
      changeType = 'renamed';
    } else if (updates.folderId && updates.folderId !== document.folderId) {
      changeType = 'moved';
    }

    // Create version snapshot before updating
    if (userId) {
      await createDocumentVersion(id, changeType, changeDescription, userId);
    }

    Object.assign(document, updates);
    await document.save();

    logger.info('Document updated', {
      documentId: id,
      updates: Object.keys(updates),
      changeType
    });

    return document;
  } catch (error) {
    logger.error('Failed to update document', {
      documentId: id,
      error: error.message
    });
    throw error;
  }
}

/**
 * Delete a document
 */
async function deleteDocument(id) {
  try {
    const document = await getDocumentById(id);

    // TODO: Delete actual file from storage if applicable

    await document.destroy();

    logger.info('Document deleted', {
      documentId: id,
      filename: document.filename
    });

    return { success: true };
  } catch (error) {
    logger.error('Failed to delete document', {
      documentId: id,
      error: error.message
    });
    throw error;
  }
}

/**
 * Move document to folder
 */
async function moveDocument(documentId, targetFolderId) {
  try {
    const document = await getDocumentById(documentId);

    // Validate target folder
    if (targetFolderId) {
      await getFolderById(targetFolderId);
    }

    document.folderId = targetFolderId;
    await document.save();

    logger.info('Document moved', {
      documentId,
      targetFolderId
    });

    return document;
  } catch (error) {
    logger.error('Failed to move document', {
      documentId,
      targetFolderId,
      error: error.message
    });
    throw error;
  }
}

/**
 * Copy document
 */
async function copyDocument(documentId, targetFolderId, newTitle) {
  try {
    const original = await getDocumentById(documentId);

    const copy = await createDocument({
      filename: original.filename,
      title: newTitle || `${original.title} (Copy)`,
      description: original.description,
      content: original.content,
      mimeType: original.mimeType,
      size: original.size,
      folderId: targetFolderId || original.folderId,
      ownerId: original.ownerId,
      tags: original.tags,
      version: 1,
      metadata: { ...original.metadata, copiedFrom: original.id }
    });

    logger.info('Document copied', {
      originalId: documentId,
      copyId: copy.id,
      targetFolderId
    });

    return copy;
  } catch (error) {
    logger.error('Failed to copy document', {
      documentId,
      error: error.message
    });
    throw error;
  }
}

/**
 * Search documents with full-text search
 */
async function searchDocuments({ query, mimeType, tags, limit = 50 }) {
  const where = {
    [Op.or]: [
      { filename: { [Op.iLike]: `%${query}%` } },
      { title: { [Op.iLike]: `%${query}%` } },
      { description: { [Op.iLike]: `%${query}%` } },
      { content: { [Op.iLike]: `%${query}%` } }
    ]
  };

  if (mimeType) {
    where.mimeType = { [Op.like]: `${mimeType}%` };
  }

  if (tags && tags.length > 0) {
    where.tags = { [Op.contains]: tags };
  }

  const documents = await Document.findAll({
    where,
    limit,
    order: [['createdAt', 'DESC']],
    include: [{ model: Folder, as: 'folder', attributes: ['id', 'name'] }]
  });

  return documents;
}

/**
 * Get document statistics
 */
async function getDocumentStatistics({ ownerId, folderId } = {}) {
  try {
    const where = {};

    if (ownerId) {
      where.ownerId = ownerId;
    }

    if (folderId) {
      where.folderId = folderId;
    }

    const documents = await Document.findAll({
      where,
      attributes: ['id', 'mimeType', 'size']
    });

    const stats = {
      total: documents.length,
      totalSize: 0,
      byMimeType: {},
      averageSize: 0
    };

    documents.forEach(doc => {
      stats.totalSize += doc.size || 0;

      const mimeCategory = doc.mimeType ? doc.mimeType.split('/')[0] : 'unknown';
      stats.byMimeType[mimeCategory] = (stats.byMimeType[mimeCategory] || 0) + 1;
    });

    if (documents.length > 0) {
      stats.averageSize = Math.round(stats.totalSize / documents.length);
    }

    return stats;
  } catch (error) {
    logger.error('Failed to get document statistics', {
      error: error.message
    });
    throw error;
  }
}

/**
 * Get folder tree (breadcrumb path)
 */
async function getFolderPath(folderId) {
  const path = [];
  let currentId = folderId;

  while (currentId) {
    const folder = await Folder.findByPk(currentId, {
      attributes: ['id', 'name', 'parentFolderId']
    });

    if (!folder) break;

    path.unshift({
      id: folder.id,
      name: folder.name
    });

    currentId = folder.parentFolderId;
  }

  return path;
}

/**
 * Create a version snapshot of document
 */
async function createDocumentVersion(documentId, changeType, changeDescription, changedBy) {
  try {
    const document = await getDocumentById(documentId);

    // Calculate checksum of content
    const checksum = crypto.createHash('sha256')
      .update(document.content || '')
      .digest('hex');

    // Mark all previous versions as not current
    await DocumentVersion.update(
      { isCurrentVersion: false },
      { where: { documentId, isCurrentVersion: true } }
    );

    // Get current max version number
    const currentVersion = await DocumentVersion.max('versionNumber', {
      where: { documentId }
    }) || 0;

    // Create new version
    const version = await DocumentVersion.create({
      documentId,
      versionNumber: currentVersion + 1,
      filename: document.filename,
      title: document.title,
      content: document.content,
      mimeType: document.mimeType,
      size: document.size,
      checksum,
      changeType,
      changeDescription,
      changedBy,
      changedAt: new Date(),
      metadata: document.metadata,
      isCurrentVersion: true
    });

    logger.info('Document version created', {
      documentId,
      versionNumber: version.versionNumber,
      changeType
    });

    return version;
  } catch (error) {
    logger.error('Failed to create document version', {
      documentId,
      error: error.message
    });
    throw error;
  }
}

/**
 * Get all versions of a document
 */
async function getDocumentVersions(documentId, { limit = 50, offset = 0 } = {}) {
  try {
    const { count, rows } = await DocumentVersion.findAndCountAll({
      where: { documentId },
      limit,
      offset,
      order: [['versionNumber', 'DESC']]
    });

    return {
      versions: rows,
      total: count,
      limit,
      offset
    };
  } catch (error) {
    logger.error('Failed to get document versions', {
      documentId,
      error: error.message
    });
    throw error;
  }
}

/**
 * Get specific version of a document
 */
async function getDocumentVersion(documentId, versionNumber) {
  try {
    const version = await DocumentVersion.findOne({
      where: {
        documentId,
        versionNumber
      }
    });

    if (!version) {
      throw new Error(`Version ${versionNumber} not found for document ${documentId}`);
    }

    return version;
  } catch (error) {
    logger.error('Failed to get document version', {
      documentId,
      versionNumber,
      error: error.message
    });
    throw error;
  }
}

/**
 * Restore document to a previous version
 */
async function restoreDocumentVersion(documentId, versionNumber, userId) {
  try {
    // Get the version to restore
    const version = await getDocumentVersion(documentId, versionNumber);

    // Get current document
    const document = await getDocumentById(documentId);

    // Create version snapshot of current state before restore
    await createDocumentVersion(documentId, 'restored', `Restored to version ${versionNumber}`, userId);

    // Update document with version data
    document.filename = version.filename;
    document.title = version.title;
    document.content = version.content;
    document.mimeType = version.mimeType;
    document.size = version.size;
    document.metadata = version.metadata;
    document.version = (document.version || 1) + 1;
    document.lastModifiedAt = new Date();

    await document.save();

    logger.info('Document restored to version', {
      documentId,
      versionNumber,
      userId
    });

    return document;
  } catch (error) {
    logger.error('Failed to restore document version', {
      documentId,
      versionNumber,
      error: error.message
    });
    throw error;
  }
}

/**
 * Compare two versions of a document
 */
async function compareVersions(documentId, version1Number, version2Number) {
  try {
    const [version1, version2] = await Promise.all([
      getDocumentVersion(documentId, version1Number),
      getDocumentVersion(documentId, version2Number)
    ]);

    const comparison = {
      version1: {
        versionNumber: version1.versionNumber,
        changedAt: version1.changedAt,
        changedBy: version1.changedBy,
        changeType: version1.changeType,
        changeDescription: version1.changeDescription
      },
      version2: {
        versionNumber: version2.versionNumber,
        changedAt: version2.changedAt,
        changedBy: version2.changedBy,
        changeType: version2.changeType,
        changeDescription: version2.changeDescription
      },
      differences: {
        filename: version1.filename !== version2.filename,
        title: version1.title !== version2.title,
        content: version1.content !== version2.content,
        mimeType: version1.mimeType !== version2.mimeType,
        size: version1.size !== version2.size,
        checksum: version1.checksum !== version2.checksum
      },
      sizeDifference: version2.size - version1.size,
      contentChanged: version1.checksum !== version2.checksum
    };

    return comparison;
  } catch (error) {
    logger.error('Failed to compare versions', {
      documentId,
      version1Number,
      version2Number,
      error: error.message
    });
    throw error;
  }
}

/**
 * Delete old versions of a document
 */
async function deleteDocumentVersion(documentId, versionNumber) {
  try {
    const version = await getDocumentVersion(documentId, versionNumber);

    // Prevent deletion of current version
    if (version.isCurrentVersion) {
      throw new Error('Cannot delete current version');
    }

    await version.destroy();

    logger.info('Document version deleted', {
      documentId,
      versionNumber
    });

    return { success: true };
  } catch (error) {
    logger.error('Failed to delete document version', {
      documentId,
      versionNumber,
      error: error.message
    });
    throw error;
  }
}

/**
 * Get version history statistics
 */
async function getVersionStatistics(documentId) {
  try {
    const versions = await DocumentVersion.findAll({
      where: { documentId },
      attributes: ['versionNumber', 'changeType', 'size', 'changedAt']
    });

    const stats = {
      totalVersions: versions.length,
      changeTypes: {},
      totalSize: 0,
      oldestVersion: null,
      newestVersion: null
    };

    versions.forEach(version => {
      stats.changeTypes[version.changeType] = (stats.changeTypes[version.changeType] || 0) + 1;
      stats.totalSize += version.size || 0;

      if (!stats.oldestVersion || version.changedAt < stats.oldestVersion) {
        stats.oldestVersion = version.changedAt;
      }
      if (!stats.newestVersion || version.changedAt > stats.newestVersion) {
        stats.newestVersion = version.changedAt;
      }
    });

    return stats;
  } catch (error) {
    logger.error('Failed to get version statistics', {
      documentId,
      error: error.message
    });
    throw error;
  }
}

/**
 * Cleanup old versions (keep only N most recent)
 */
async function cleanupOldVersions(documentId, keepCount = 10) {
  try {
    const versions = await DocumentVersion.findAll({
      where: { documentId },
      order: [['versionNumber', 'DESC']]
    });

    if (versions.length <= keepCount) {
      return { deleted: 0 };
    }

    // Keep the most recent versions, delete the rest
    const versionsToDelete = versions.slice(keepCount);
    const versionNumbers = versionsToDelete
      .filter(v => !v.isCurrentVersion)
      .map(v => v.versionNumber);

    const deleted = await DocumentVersion.destroy({
      where: {
        documentId,
        versionNumber: { [Op.in]: versionNumbers }
      }
    });

    logger.info('Old versions cleaned up', {
      documentId,
      deleted,
      kept: keepCount
    });

    return { deleted };
  } catch (error) {
    logger.error('Failed to cleanup old versions', {
      documentId,
      error: error.message
    });
    throw error;
  }
}

/**
 * Create document annotation
 */
async function createAnnotation(documentId, {
  type = 'comment',
  content,
  userId,
  position,
  color,
  metadata = {}
}) {
  try {
    const document = await Document.findByPk(documentId);
    if (!document) {
      throw new Error(`Document not found: ${documentId}`);
    }

    const annotations = document.metadata?.annotations || [];
    const annotation = {
      id: crypto.randomBytes(16).toString('hex'),
      type, // comment, highlight, note, drawing
      content,
      userId,
      position, // {page, x, y, width, height} or {start, end} for text
      color,
      createdAt: new Date(),
      metadata
    };

    annotations.push(annotation);

    await document.update({
      metadata: {
        ...document.metadata,
        annotations
      }
    });

    logger.info('Document annotation created', {
      documentId,
      annotationId: annotation.id,
      type,
      userId
    });

    return annotation;
  } catch (error) {
    logger.error('Failed to create annotation', {
      documentId,
      error: error.message
    });
    throw error;
  }
}

/**
 * Get document annotations
 */
async function getAnnotations(documentId, filters = {}) {
  try {
    const document = await Document.findByPk(documentId);
    if (!document) {
      throw new Error(`Document not found: ${documentId}`);
    }

    let annotations = document.metadata?.annotations || [];

    // Apply filters
    if (filters.type) {
      annotations = annotations.filter(a => a.type === filters.type);
    }
    if (filters.userId) {
      annotations = annotations.filter(a => a.userId === filters.userId);
    }

    return annotations;
  } catch (error) {
    logger.error('Failed to get annotations', {
      documentId,
      error: error.message
    });
    throw error;
  }
}

/**
 * Delete document annotation
 */
async function deleteAnnotation(documentId, annotationId, userId) {
  try {
    const document = await Document.findByPk(documentId);
    if (!document) {
      throw new Error(`Document not found: ${documentId}`);
    }

    const annotations = document.metadata?.annotations || [];
    const annotation = annotations.find(a => a.id === annotationId);

    if (!annotation) {
      throw new Error(`Annotation not found: ${annotationId}`);
    }

    // Check ownership
    if (annotation.userId !== userId) {
      throw new Error('Only annotation owner can delete annotation');
    }

    const updatedAnnotations = annotations.filter(a => a.id !== annotationId);

    await document.update({
      metadata: {
        ...document.metadata,
        annotations: updatedAnnotations
      }
    });

    logger.info('Document annotation deleted', {
      documentId,
      annotationId,
      userId
    });

    return { success: true };
  } catch (error) {
    logger.error('Failed to delete annotation', {
      documentId,
      annotationId,
      error: error.message
    });
    throw error;
  }
}

/**
 * Track active editors (for real-time collaboration awareness)
 */
const activeEditors = new Map(); // documentId -> Set of {userId, name, cursorPosition, lastActivity}

async function registerEditor(documentId, userId, userName) {
  if (!activeEditors.has(documentId)) {
    activeEditors.set(documentId, new Map());
  }

  const editors = activeEditors.get(documentId);
  editors.set(userId, {
    userId,
    userName,
    cursorPosition: null,
    lastActivity: Date.now()
  });

  logger.info('Editor registered', { documentId, userId });

  return Array.from(editors.values());
}

async function unregisterEditor(documentId, userId) {
  if (activeEditors.has(documentId)) {
    const editors = activeEditors.get(documentId);
    editors.delete(userId);

    if (editors.size === 0) {
      activeEditors.delete(documentId);
    }

    logger.info('Editor unregistered', { documentId, userId });
  }

  return activeEditors.has(documentId) ?
    Array.from(activeEditors.get(documentId).values()) :
    [];
}

async function updateEditorCursor(documentId, userId, cursorPosition) {
  if (activeEditors.has(documentId)) {
    const editors = activeEditors.get(documentId);
    const editor = editors.get(userId);

    if (editor) {
      editor.cursorPosition = cursorPosition;
      editor.lastActivity = Date.now();
    }
  }

  return activeEditors.has(documentId) ?
    Array.from(activeEditors.get(documentId).values()) :
    [];
}

async function getActiveEditors(documentId) {
  if (!activeEditors.has(documentId)) {
    return [];
  }

  const editors = activeEditors.get(documentId);
  const now = Date.now();
  const timeout = 5 * 60 * 1000; // 5 minutes

  // Clean up stale editors
  for (const [userId, editor] of editors.entries()) {
    if (now - editor.lastActivity > timeout) {
      editors.delete(userId);
    }
  }

  if (editors.size === 0) {
    activeEditors.delete(documentId);
    return [];
  }

  return Array.from(editors.values());
}

/**
 * Advanced version comparison with diff
 */
async function compareVersionsDetailed(documentId, version1, version2) {
  try {
    const v1 = await DocumentVersion.findOne({
      where: { documentId, versionNumber: version1 }
    });

    const v2 = await DocumentVersion.findOne({
      where: { documentId, versionNumber: version2 }
    });

    if (!v1 || !v2) {
      throw new Error('One or both versions not found');
    }

    // Simple line-by-line diff
    const lines1 = (v1.content || '').split('\n');
    const lines2 = (v2.content || '').split('\n');

    const diff = {
      added: [],
      removed: [],
      changed: [],
      unchanged: 0
    };

    const maxLen = Math.max(lines1.length, lines2.length);

    for (let i = 0; i < maxLen; i++) {
      const line1 = lines1[i];
      const line2 = lines2[i];

      if (line1 === undefined) {
        diff.added.push({ lineNumber: i + 1, content: line2 });
      } else if (line2 === undefined) {
        diff.removed.push({ lineNumber: i + 1, content: line1 });
      } else if (line1 !== line2) {
        diff.changed.push({
          lineNumber: i + 1,
          from: line1,
          to: line2
        });
      } else {
        diff.unchanged++;
      }
    }

    return {
      version1: {
        number: v1.versionNumber,
        createdAt: v1.createdAt,
        createdBy: v1.createdBy
      },
      version2: {
        number: v2.versionNumber,
        createdAt: v2.createdAt,
        createdBy: v2.createdBy
      },
      diff,
      summary: {
        totalChanges: diff.added.length + diff.removed.length + diff.changed.length,
        linesAdded: diff.added.length,
        linesRemoved: diff.removed.length,
        linesChanged: diff.changed.length,
        linesUnchanged: diff.unchanged
      }
    };
  } catch (error) {
    logger.error('Failed to compare versions', {
      documentId,
      version1,
      version2,
      error: error.message
    });
    throw error;
  }
}

module.exports = {
  createFolder,
  getFolderById,
  listFolders,
  updateFolder,
  deleteFolder,
  createDocument,
  getDocumentById,
  listDocuments,
  updateDocument,
  deleteDocument,
  moveDocument,
  copyDocument,
  searchDocuments,
  getDocumentStatistics,
  getFolderPath,
  // Document versioning
  createDocumentVersion,
  getDocumentVersions,
  getDocumentVersion,
  restoreDocumentVersion,
  compareVersions,
  deleteDocumentVersion,
  getVersionStatistics,
  cleanupOldVersions,
  // Collaboration features
  createAnnotation,
  getAnnotations,
  deleteAnnotation,
  registerEditor,
  unregisterEditor,
  updateEditorCursor,
  getActiveEditors,
  compareVersionsDetailed
};
