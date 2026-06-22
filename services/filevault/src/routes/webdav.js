/**
 * ═══════════════════════════════════════════════════════════════════════
 * WebDAV Routes for FileVault
 * Provides WebDAV access to files and directories
 * ═══════════════════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const fileService = require('../services/fileService');
const directoryService = require('../services/directoryService');
const {
  parseXmlBody,
  optionsHandler,
  generateMultistatusXml,
  generateCollectionResponse,
  generateResourceResponse,
  parseDepth,
  parseDestination,
  parseOverwrite,
  generateLockResponse,
  parseLockRequest,
  generateProppatchResponse,
  sendWebDAVError,
  WebDAVLockManager
} = require('@exprsn/shared');
const { authenticate, requirePermissions, asyncHandler } = require('../middleware');
const logger = require('../utils/logger');

// Initialize lock manager
const lockManager = new WebDAVLockManager();

/**
 * Helper: Get base URL for WebDAV
 */
function getBaseUrl(req) {
  return `${req.protocol}://${req.get('host')}/webdav`;
}

/**
 * Helper: Parse path to resource
 */
function parsePath(path) {
  const parts = path.replace(/^\/+|\/+$/g, '').split('/');
  return {
    parts,
    isRoot: parts.length === 0 || parts[0] === '',
    directoryId: parts[0] || null,
    fileId: parts[1] || null
  };
}

// Use XML body parser for WebDAV methods
router.use(parseXmlBody);

/**
 * OPTIONS - Return DAV capabilities
 */
router.options('*', optionsHandler(['1', '2']));

/**
 * PROPFIND - Discover resources and their properties
 *
 * Depth: 0 = resource only, 1 = resource + children, infinity = all
 */
router.propfind('*', authenticate, asyncHandler(async (req, res) => {
  const depth = parseDepth(req);
  const baseUrl = getBaseUrl(req);
  const path = parsePath(req.path);

  try {
    const responses = [];

    if (path.isRoot || !path.fileId) {
      // Directory listing
      const directoryId = path.directoryId || null;

      // Get directory info
      if (directoryId) {
        const directory = await directoryService.getDirectory(directoryId, req.userId);
        responses.push(generateCollectionResponse(directory, baseUrl, depth));
      } else {
        // Root collection
        responses.push(generateCollectionResponse({
          id: '',
          name: 'FileVault Root',
          createdAt: new Date(),
          updatedAt: new Date()
        }, baseUrl, depth));
      }

      // Get children if depth > 0
      if (depth > 0) {
        // Get subdirectories
        const directories = await directoryService.listDirectories(req.userId, directoryId);
        directories.forEach(dir => {
          responses.push(generateCollectionResponse(dir, `${baseUrl}/${directoryId || ''}`, depth - 1));
        });

        // Get files
        const files = await fileService.listFiles(req.userId, directoryId);
        files.forEach(file => {
          responses.push(generateResourceResponse(file, `${baseUrl}/${directoryId || ''}`));
        });
      }
    } else {
      // Single file
      const file = await fileService.getFile(path.fileId, req.userId);
      responses.push(generateResourceResponse(file, baseUrl));
    }

    const xml = generateMultistatusXml(responses);

    res.set({
      'Content-Type': 'application/xml; charset=utf-8',
      'DAV': '1, 2'
    });
    res.status(207).send(xml);

    logger.info('WebDAV PROPFIND', {
      userId: req.userId,
      path: req.path,
      depth,
      responseCount: responses.length
    });
  } catch (error) {
    logger.error('WebDAV PROPFIND error', {
      error: error.message,
      path: req.path
    });

    if (error.message.includes('not found')) {
      sendWebDAVError(res, 404, 'Resource not found');
    } else {
      sendWebDAVError(res, 500, 'Internal server error');
    }
  }
}));

/**
 * GET - Download file
 */
router.get('*', authenticate, requirePermissions({ read: true }), asyncHandler(async (req, res) => {
  const path = parsePath(req.path);

  if (!path.fileId) {
    return sendWebDAVError(res, 400, 'Cannot download directory');
  }

  try {
    const { stream, file } = await fileService.downloadFileStream(
      path.fileId,
      req.userId
    );

    const etag = require('@exprsn/shared').generateETag(file);

    res.set({
      'Content-Type': file.mimetype,
      'Content-Length': file.size,
      'Content-Disposition': `attachment; filename="${file.name}"`,
      'ETag': `"${etag}"`,
      'Last-Modified': new Date(file.updatedAt).toUTCString()
    });

    stream.pipe(res);

    logger.info('WebDAV GET file', {
      fileId: file.id,
      userId: req.userId
    });
  } catch (error) {
    logger.error('WebDAV GET error', { error: error.message });

    if (error.message.includes('not found')) {
      sendWebDAVError(res, 404, 'File not found');
    } else {
      sendWebDAVError(res, 500, 'Internal server error');
    }
  }
}));

/**
 * PUT - Upload or update file
 */
router.put('*', authenticate, requirePermissions({ write: true }), asyncHandler(async (req, res) => {
  const path = parsePath(req.path);

  if (!path.fileId) {
    return sendWebDAVError(res, 400, 'Invalid file path');
  }

  try {
    // Check for lock
    const lockToken = lockManager.parseLockTokenFromHeader(req.headers.if);
    if (lockToken) {
      await lockManager.verifyLockToken(path.fileId, lockToken, req.userId);
    }

    // Collect file data
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));

    await new Promise((resolve, reject) => {
      req.on('end', resolve);
      req.on('error', reject);
    });

    const buffer = Buffer.concat(chunks);
    const filename = path.parts[path.parts.length - 1];

    // Check if file exists
    let file;
    let isUpdate = false;

    try {
      file = await fileService.getFile(path.fileId, req.userId);
      isUpdate = true;

      // Update existing file
      file = await fileService.updateFile(
        path.fileId,
        req.userId,
        buffer,
        'WebDAV update'
      );
    } catch (e) {
      // Create new file
      file = await fileService.uploadFile({
        userId: req.userId,
        buffer,
        filename,
        path: req.path,
        directoryId: path.directoryId || null,
        tags: [],
        metadata: {},
        mimetype: req.headers['content-type'] || 'application/octet-stream'
      });
    }

    const etag = require('@exprsn/shared').generateETag(file);

    res.set({
      'ETag': `"${etag}"`,
      'Content-Type': 'text/plain'
    });

    res.status(isUpdate ? 204 : 201).end();

    logger.info('WebDAV PUT file', {
      fileId: file.id,
      userId: req.userId,
      action: isUpdate ? 'update' : 'create',
      size: buffer.length
    });
  } catch (error) {
    logger.error('WebDAV PUT error', { error: error.message });

    if (error.message === 'LOCKED') {
      sendWebDAVError(res, 423, 'Resource is locked');
    } else {
      sendWebDAVError(res, 500, 'Internal server error');
    }
  }
}));

/**
 * DELETE - Delete file or directory
 */
router.delete('*', authenticate, requirePermissions({ delete: true }), asyncHandler(async (req, res) => {
  const path = parsePath(req.path);

  try {
    // Check for lock
    const lockToken = lockManager.parseLockTokenFromHeader(req.headers.if);
    const resourceId = path.fileId || path.directoryId;

    if (lockToken && resourceId) {
      await lockManager.verifyLockToken(resourceId, lockToken, req.userId);
    }

    if (path.fileId) {
      // Delete file
      await fileService.deleteFile(path.fileId, req.userId);
    } else if (path.directoryId) {
      // Delete directory
      await directoryService.deleteDirectory(path.directoryId, req.userId);
    } else {
      return sendWebDAVError(res, 400, 'Cannot delete root');
    }

    res.status(204).end();

    logger.info('WebDAV DELETE', {
      userId: req.userId,
      path: req.path,
      type: path.fileId ? 'file' : 'directory'
    });
  } catch (error) {
    logger.error('WebDAV DELETE error', { error: error.message });

    if (error.message === 'LOCKED') {
      sendWebDAVError(res, 423, 'Resource is locked');
    } else if (error.message.includes('not found')) {
      sendWebDAVError(res, 404, 'Resource not found');
    } else {
      sendWebDAVError(res, 500, 'Internal server error');
    }
  }
}));

/**
 * MKCOL - Create collection (directory)
 */
router.mkcol('*', authenticate, requirePermissions({ write: true }), asyncHandler(async (req, res) => {
  const path = parsePath(req.path);

  if (!path.directoryId) {
    return sendWebDAVError(res, 400, 'Invalid directory path');
  }

  try {
    const directoryName = path.parts[path.parts.length - 1];
    const parentId = path.parts.length > 1 ? path.parts[path.parts.length - 2] : null;

    const directory = await directoryService.createDirectory({
      userId: req.userId,
      name: directoryName,
      parentId,
      metadata: {}
    });

    res.status(201).end();

    logger.info('WebDAV MKCOL', {
      directoryId: directory.id,
      userId: req.userId,
      name: directoryName
    });
  } catch (error) {
    logger.error('WebDAV MKCOL error', { error: error.message });

    if (error.message.includes('exists')) {
      sendWebDAVError(res, 405, 'Directory already exists');
    } else {
      sendWebDAVError(res, 500, 'Internal server error');
    }
  }
}));

/**
 * COPY - Copy resource
 */
router.copy('*', authenticate, requirePermissions({ write: true }), asyncHandler(async (req, res) => {
  const sourcePath = parsePath(req.path);
  const destination = parseDestination(req);
  const overwrite = parseOverwrite(req);

  if (!destination) {
    return sendWebDAVError(res, 400, 'Destination header required');
  }

  const destPath = parsePath(destination);

  try {
    if (sourcePath.fileId) {
      // Copy file
      const file = await fileService.getFile(sourcePath.fileId, req.userId);

      // Download original file
      const { stream } = await fileService.downloadFileStream(sourcePath.fileId, req.userId);

      // Collect data
      const chunks = [];
      stream.on('data', chunk => chunks.push(chunk));

      await new Promise((resolve, reject) => {
        stream.on('end', resolve);
        stream.on('error', reject);
      });

      const buffer = Buffer.concat(chunks);

      // Upload to destination
      await fileService.uploadFile({
        userId: req.userId,
        buffer,
        filename: destPath.parts[destPath.parts.length - 1] || file.name,
        path: destination,
        directoryId: destPath.directoryId || null,
        tags: file.tags || [],
        metadata: { ...file.metadata, copiedFrom: file.id },
        mimetype: file.mimetype
      });

      res.status(overwrite ? 204 : 201).end();
    } else {
      return sendWebDAVError(res, 501, 'Directory copy not implemented');
    }

    logger.info('WebDAV COPY', {
      userId: req.userId,
      source: req.path,
      destination
    });
  } catch (error) {
    logger.error('WebDAV COPY error', { error: error.message });
    sendWebDAVError(res, 500, 'Internal server error');
  }
}));

/**
 * MOVE - Move/rename resource
 */
router.move('*', authenticate, requirePermissions({ write: true }), asyncHandler(async (req, res) => {
  const sourcePath = parsePath(req.path);
  const destination = parseDestination(req);
  const overwrite = parseOverwrite(req);

  if (!destination) {
    return sendWebDAVError(res, 400, 'Destination header required');
  }

  try {
    // Check for lock
    const lockToken = lockManager.parseLockTokenFromHeader(req.headers.if);
    const resourceId = sourcePath.fileId || sourcePath.directoryId;

    if (lockToken && resourceId) {
      await lockManager.verifyLockToken(resourceId, lockToken, req.userId);
    }

    if (sourcePath.fileId) {
      // Move file (update path/directory)
      const destPath = parsePath(destination);

      await fileService.moveFile(
        sourcePath.fileId,
        req.userId,
        destPath.directoryId,
        destPath.parts[destPath.parts.length - 1]
      );

      res.status(overwrite ? 204 : 201).end();
    } else {
      return sendWebDAVError(res, 501, 'Directory move not implemented');
    }

    logger.info('WebDAV MOVE', {
      userId: req.userId,
      source: req.path,
      destination
    });
  } catch (error) {
    logger.error('WebDAV MOVE error', { error: error.message });

    if (error.message === 'LOCKED') {
      sendWebDAVError(res, 423, 'Resource is locked');
    } else {
      sendWebDAVError(res, 500, 'Internal server error');
    }
  }
}));

/**
 * LOCK - Lock resource
 */
router.lock('*', authenticate, asyncHandler(async (req, res) => {
  const path = parsePath(req.path);
  const resourceId = path.fileId || path.directoryId;

  if (!resourceId) {
    return sendWebDAVError(res, 400, 'Cannot lock root');
  }

  try {
    const lockInfo = parseLockRequest(req.xmlBody);
    const timeout = parseInt(req.headers.timeout?.replace(/^Second-/, '') || '3600');

    // Check if already locked
    const existingLock = await lockManager.getLock(resourceId);

    if (existingLock && existingLock.userId !== req.userId) {
      return sendWebDAVError(res, 423, 'Resource is already locked');
    }

    // Create or refresh lock
    const lock = await lockManager.createLock(resourceId, req.userId, {
      scope: lockInfo.scope,
      type: lockInfo.type,
      depth: req.headers.depth || '0',
      owner: lockInfo.owner || req.userId,
      timeout
    });

    const xml = generateLockResponse(lock, getBaseUrl(req) + req.path);

    res.set({
      'Content-Type': 'application/xml; charset=utf-8',
      'Lock-Token': `<opaquelocktoken:${lock.token}>`
    });
    res.status(200).send(xml);

    logger.info('WebDAV LOCK', {
      resourceId,
      userId: req.userId,
      token: lock.token
    });
  } catch (error) {
    logger.error('WebDAV LOCK error', { error: error.message });
    sendWebDAVError(res, 500, 'Internal server error');
  }
}));

/**
 * UNLOCK - Unlock resource
 */
router.unlock('*', authenticate, asyncHandler(async (req, res) => {
  const lockToken = req.headers['lock-token']?.replace(/<|>/g, '').replace('opaquelocktoken:', '');

  if (!lockToken) {
    return sendWebDAVError(res, 400, 'Lock-Token header required');
  }

  try {
    const removed = await lockManager.removeLock(lockToken, req.userId);

    if (!removed) {
      return sendWebDAVError(res, 404, 'Lock not found');
    }

    res.status(204).end();

    logger.info('WebDAV UNLOCK', {
      userId: req.userId,
      token: lockToken
    });
  } catch (error) {
    logger.error('WebDAV UNLOCK error', { error: error.message });

    if (error.message === 'LOCK_FORBIDDEN') {
      sendWebDAVError(res, 403, 'Not lock owner');
    } else {
      sendWebDAVError(res, 500, 'Internal server error');
    }
  }
}));

/**
 * HEAD - Check resource existence
 */
router.head('*', authenticate, asyncHandler(async (req, res) => {
  const path = parsePath(req.path);

  try {
    if (path.fileId) {
      const file = await fileService.getFile(path.fileId, req.userId);
      const etag = require('@exprsn/shared').generateETag(file);

      res.set({
        'Content-Type': file.mimetype,
        'Content-Length': file.size,
        'ETag': `"${etag}"`,
        'Last-Modified': new Date(file.updatedAt).toUTCString()
      });

      res.status(200).end();
    } else if (path.directoryId) {
      const directory = await directoryService.getDirectory(path.directoryId, req.userId);

      res.set({
        'Content-Type': 'httpd/unix-directory'
      });

      res.status(200).end();
    } else {
      res.status(200).end();
    }
  } catch (error) {
    res.status(404).end();
  }
}));

module.exports = router;
