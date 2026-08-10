/**
 * ═══════════════════════════════════════════════════════════════════════
 * WebDAV Routes for Forge Documents
 * Provides WebDAV access to documents and folders
 * ═══════════════════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const documentService = require('../../../services/forge/groupware/documentService');
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
  sendWebDAVError,
  WebDAVLockManager
} = require('@exprsn/shared');
const { validateToken } = require('../../../middleware/auth');
const logger = require('../../../utils/logger');

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
 * Format: /folderId or /folderId/documentId
 */
function parsePath(path) {
  const parts = path.replace(/^\/+|\/+$/g, '').split('/');
  return {
    parts,
    isRoot: parts.length === 0 || parts[0] === '',
    folderId: parts[0] || null,
    documentId: parts[1] || null
  };
}

// Use XML body parser for WebDAV methods
router.use(parseXmlBody);

/**
 * OPTIONS - Return DAV capabilities
 */
router.options('*', optionsHandler(['1', '2']));

/**
 * PROPFIND - Discover folders and documents
 */
router.propfind('*',  async (req, res) => {
  const depth = parseDepth(req);
  const baseUrl = getBaseUrl(req);
  const path = parsePath(req.path);

  try {
    const responses = [];

    if (path.isRoot || !path.documentId) {
      // Folder listing
      const folderId = path.folderId || null;

      if (folderId) {
        // Get specific folder
        const folder = await documentService.getFolder(folderId);

        // Verify access
        if (folder.ownerId !== req.user.id) {
          return sendWebDAVError(res, 403, 'Access denied');
        }

        responses.push(generateCollectionResponse({
          id: folder.id,
          name: folder.name,
          createdAt: folder.createdAt,
          updatedAt: folder.updatedAt
        }, baseUrl, depth));

        // Get children if depth > 0
        if (depth > 0) {
          // Get subfolders
          const subfolders = await documentService.listFolders({
            parentFolderId: folderId,
            ownerId: req.user.id,
            limit: 1000,
            offset: 0
          });

          subfolders.folders.forEach(subfolder => {
            responses.push(generateCollectionResponse({
              id: subfolder.id,
              name: subfolder.name,
              createdAt: subfolder.createdAt,
              updatedAt: subfolder.updatedAt
            }, `${baseUrl}/${folderId}`, depth - 1));
          });

          // Get documents
          const documents = await documentService.listDocuments({
            folderId,
            ownerId: req.user.id,
            limit: 1000,
            offset: 0
          });

          documents.documents.forEach(doc => {
            responses.push(generateResourceResponse({
              id: doc.id,
              name: doc.filename,
              filename: doc.filename,
              size: doc.size || 0,
              mimetype: doc.mimeType,
              contentType: doc.mimeType,
              createdAt: doc.createdAt,
              updatedAt: doc.updatedAt,
              created_at: doc.createdAt,
              updated_at: doc.updatedAt
            }, `${baseUrl}/${folderId}`));
          });
        }
      } else {
        // Root - list all root folders
        responses.push(generateCollectionResponse({
          id: '',
          name: 'Documents Root',
          createdAt: new Date(),
          updatedAt: new Date()
        }, baseUrl, depth));

        if (depth > 0) {
          const folders = await documentService.listFolders({
            parentFolderId: null,
            ownerId: req.user.id,
            limit: 100,
            offset: 0
          });

          folders.folders.forEach(folder => {
            responses.push(generateCollectionResponse({
              id: folder.id,
              name: folder.name,
              createdAt: folder.createdAt,
              updatedAt: folder.updatedAt
            }, baseUrl, depth - 1));
          });

          // Also list documents at root level
          const documents = await documentService.listDocuments({
            folderId: null,
            ownerId: req.user.id,
            limit: 100,
            offset: 0
          });

          documents.documents.forEach(doc => {
            responses.push(generateResourceResponse({
              id: doc.id,
              name: doc.filename,
              filename: doc.filename,
              size: doc.size || 0,
              mimetype: doc.mimeType,
              contentType: doc.mimeType,
              createdAt: doc.createdAt,
              updatedAt: doc.updatedAt,
              created_at: doc.createdAt,
              updated_at: doc.updatedAt
            }, baseUrl));
          });
        }
      }
    } else {
      // Single document
      const document = await documentService.getDocument(path.documentId);

      // Verify access
      if (document.ownerId !== req.user.id) {
        return sendWebDAVError(res, 403, 'Access denied');
      }

      responses.push(generateResourceResponse({
        id: document.id,
        name: document.filename,
        filename: document.filename,
        size: document.size || 0,
        mimetype: document.mimeType,
        contentType: document.mimeType,
        createdAt: document.createdAt,
        updatedAt: document.updatedAt,
        created_at: document.createdAt,
        updated_at: document.updatedAt
      }, baseUrl));
    }

    const xml = generateMultistatusXml(responses);

    res.set({
      'Content-Type': 'application/xml; charset=utf-8',
      'DAV': '1, 2'
    });
    res.status(207).send(xml);

    logger.info('WebDAV PROPFIND', {
      userId: req.user.id,
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
});

/**
 * GET - Download document
 */
router.get('*',  async (req, res) => {
  const path = parsePath(req.path);

  if (!path.documentId) {
    return sendWebDAVError(res, 400, 'Cannot download folder');
  }

  try {
    const document = await documentService.getDocument(path.documentId);

    // Verify access
    if (document.ownerId !== req.user.id) {
      return sendWebDAVError(res, 403, 'Access denied');
    }

    // Download document content
    const content = await documentService.downloadDocument(path.documentId);

    const etag = require('@exprsn/shared').generateETag({
      id: document.id,
      updatedAt: document.updatedAt,
      size: document.size
    });

    res.set({
      'Content-Type': document.mimeType,
      'Content-Length': document.size || 0,
      'Content-Disposition': `attachment; filename="${document.filename}"`,
      'ETag': `"${etag}"`,
      'Last-Modified': new Date(document.updatedAt).toUTCString()
    });

    if (content.stream) {
      content.stream.pipe(res);
    } else if (content.buffer) {
      res.send(content.buffer);
    } else if (content.data) {
      res.send(content.data);
    } else {
      res.send(document.content || '');
    }

    logger.info('WebDAV GET document', {
      documentId: document.id,
      userId: req.user.id
    });
  } catch (error) {
    logger.error('WebDAV GET error', { error: error.message });

    if (error.message.includes('not found')) {
      sendWebDAVError(res, 404, 'Document not found');
    } else {
      sendWebDAVError(res, 500, 'Internal server error');
    }
  }
});

/**
 * PUT - Upload or update document
 */
router.put('*',  async (req, res) => {
  const path = parsePath(req.path);

  try {
    // Check for lock
    const lockToken = lockManager.parseLockTokenFromHeader(req.headers.if);
    if (lockToken && path.documentId) {
      await lockManager.verifyLockToken(path.documentId, lockToken, req.user.id);
    }

    // Collect document data
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));

    await new Promise((resolve, reject) => {
      req.on('end', resolve);
      req.on('error', reject);
    });

    const buffer = Buffer.concat(chunks);
    const filename = path.parts[path.parts.length - 1];
    const content = buffer.toString('utf8');

    // Check if document exists (update) or create new
    let document;
    let isUpdate = false;

    if (path.documentId) {
      try {
        document = await documentService.getDocument(path.documentId);

        // Verify ownership
        if (document.ownerId !== req.user.id) {
          return sendWebDAVError(res, 403, 'Access denied');
        }

        isUpdate = true;

        // Update existing document
        document = await documentService.updateDocument(path.documentId, {
          content,
          size: buffer.length
        });
      } catch (e) {
        // Document doesn't exist, create new
      }
    }

    if (!isUpdate) {
      // Create new document
      document = await documentService.createDocument({
        filename,
        title: filename,
        content,
        mimeType: req.headers['content-type'] || 'application/octet-stream',
        size: buffer.length,
        folderId: path.folderId || null,
        ownerId: req.user.id,
        tags: [],
        metadata: {}
      });
    }

    const etag = require('@exprsn/shared').generateETag({
      id: document.id,
      updatedAt: document.updatedAt,
      size: document.size
    });

    res.set({
      'ETag': `"${etag}"`,
      'Content-Type': 'text/plain'
    });

    res.status(isUpdate ? 204 : 201).end();

    logger.info('WebDAV PUT document', {
      documentId: document.id,
      userId: req.user.id,
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
});

/**
 * DELETE - Delete document or folder
 */
router.delete('*',  async (req, res) => {
  const path = parsePath(req.path);

  try {
    // Check for lock
    const lockToken = lockManager.parseLockTokenFromHeader(req.headers.if);
    const resourceId = path.documentId || path.folderId;

    if (lockToken && resourceId) {
      await lockManager.verifyLockToken(resourceId, lockToken, req.user.id);
    }

    if (path.documentId) {
      // Delete document
      const document = await documentService.getDocument(path.documentId);

      // Verify ownership
      if (document.ownerId !== req.user.id) {
        return sendWebDAVError(res, 403, 'Access denied');
      }

      await documentService.deleteDocument(path.documentId);
    } else if (path.folderId) {
      // Delete folder
      const folder = await documentService.getFolder(path.folderId);

      // Verify ownership
      if (folder.ownerId !== req.user.id) {
        return sendWebDAVError(res, 403, 'Access denied');
      }

      await documentService.deleteFolder(path.folderId);
    } else {
      return sendWebDAVError(res, 400, 'Cannot delete root');
    }

    res.status(204).end();

    logger.info('WebDAV DELETE', {
      userId: req.user.id,
      path: req.path,
      type: path.documentId ? 'document' : 'folder'
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
});

/**
 * MKCOL - Create folder
 */
router.mkcol('*',  async (req, res) => {
  const path = parsePath(req.path);

  if (!path.folderId || path.documentId) {
    return sendWebDAVError(res, 400, 'Invalid folder path');
  }

  try {
    const folderName = path.parts[path.parts.length - 1];
    const parentId = path.parts.length > 1 ? path.parts[path.parts.length - 2] : null;

    const folder = await documentService.createFolder({
      name: folderName,
      description: '',
      parentFolderId: parentId,
      ownerId: req.user.id,
      permissions: {},
      metadata: {}
    });

    res.status(201).end();

    logger.info('WebDAV MKCOL', {
      folderId: folder.id,
      userId: req.user.id,
      name: folderName
    });
  } catch (error) {
    logger.error('WebDAV MKCOL error', { error: error.message });

    if (error.message.includes('exists')) {
      sendWebDAVError(res, 405, 'Folder already exists');
    } else {
      sendWebDAVError(res, 500, 'Internal server error');
    }
  }
});

/**
 * COPY - Copy document
 */
router.copy('*',  async (req, res) => {
  const sourcePath = parsePath(req.path);
  const destination = parseDestination(req);
  const overwrite = parseOverwrite(req);

  if (!destination) {
    return sendWebDAVError(res, 400, 'Destination header required');
  }

  if (!sourcePath.documentId) {
    return sendWebDAVError(res, 501, 'Folder copy not supported');
  }

  const destPath = parsePath(destination);

  try {
    const document = await documentService.getDocument(sourcePath.documentId);

    // Verify ownership
    if (document.ownerId !== req.user.id) {
      return sendWebDAVError(res, 403, 'Access denied');
    }

    // Copy document
    await documentService.copyDocument(sourcePath.documentId, {
      targetFolderId: destPath.folderId || null,
      newTitle: destPath.parts[destPath.parts.length - 1] || document.title
    });

    res.status(overwrite ? 204 : 201).end();

    logger.info('WebDAV COPY', {
      userId: req.user.id,
      source: req.path,
      destination
    });
  } catch (error) {
    logger.error('WebDAV COPY error', { error: error.message });
    sendWebDAVError(res, 500, 'Internal server error');
  }
});

/**
 * MOVE - Move document
 */
router.move('*',  async (req, res) => {
  const sourcePath = parsePath(req.path);
  const destination = parseDestination(req);

  if (!destination) {
    return sendWebDAVError(res, 400, 'Destination header required');
  }

  if (!sourcePath.documentId) {
    return sendWebDAVError(res, 501, 'Folder move not supported');
  }

  try {
    // Check for lock
    const lockToken = lockManager.parseLockTokenFromHeader(req.headers.if);

    if (lockToken) {
      await lockManager.verifyLockToken(sourcePath.documentId, lockToken, req.user.id);
    }

    const document = await documentService.getDocument(sourcePath.documentId);

    // Verify ownership
    if (document.ownerId !== req.user.id) {
      return sendWebDAVError(res, 403, 'Access denied');
    }

    const destPath = parsePath(destination);

    // Move document
    await documentService.moveDocument(sourcePath.documentId, {
      targetFolderId: destPath.folderId || null
    });

    res.status(204).end();

    logger.info('WebDAV MOVE', {
      userId: req.user.id,
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
});

/**
 * LOCK - Lock document or folder
 */
router.lock('*',  async (req, res) => {
  const path = parsePath(req.path);
  const resourceId = path.documentId || path.folderId;

  if (!resourceId) {
    return sendWebDAVError(res, 400, 'Cannot lock root');
  }

  try {
    const lockInfo = parseLockRequest(req.xmlBody);
    const timeout = parseInt(req.headers.timeout?.replace(/^Second-/, '') || '3600');

    // Verify resource exists and user has access
    if (path.documentId) {
      const document = await documentService.getDocument(path.documentId);
      if (document.ownerId !== req.user.id) {
        return sendWebDAVError(res, 403, 'Access denied');
      }
    } else {
      const folder = await documentService.getFolder(path.folderId);
      if (folder.ownerId !== req.user.id) {
        return sendWebDAVError(res, 403, 'Access denied');
      }
    }

    // Check if already locked
    const existingLock = await lockManager.getLock(resourceId);

    if (existingLock && existingLock.userId !== req.user.id) {
      return sendWebDAVError(res, 423, 'Resource is already locked');
    }

    // Create or refresh lock
    const lock = await lockManager.createLock(resourceId, req.user.id, {
      scope: lockInfo.scope,
      type: lockInfo.type,
      depth: req.headers.depth || '0',
      owner: lockInfo.owner || req.user.id,
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
      userId: req.user.id,
      token: lock.token
    });
  } catch (error) {
    logger.error('WebDAV LOCK error', { error: error.message });

    if (error.message.includes('not found')) {
      sendWebDAVError(res, 404, 'Resource not found');
    } else {
      sendWebDAVError(res, 500, 'Internal server error');
    }
  }
});

/**
 * UNLOCK - Unlock resource
 */
router.unlock('*',  async (req, res) => {
  const lockToken = req.headers['lock-token']?.replace(/<|>/g, '').replace('opaquelocktoken:', '');

  if (!lockToken) {
    return sendWebDAVError(res, 400, 'Lock-Token header required');
  }

  try {
    const removed = await lockManager.removeLock(lockToken, req.user.id);

    if (!removed) {
      return sendWebDAVError(res, 404, 'Lock not found');
    }

    res.status(204).end();

    logger.info('WebDAV UNLOCK', {
      userId: req.user.id,
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
});

/**
 * HEAD - Check resource existence
 */
router.head('*',  async (req, res) => {
  const path = parsePath(req.path);

  try {
    if (path.documentId) {
      const document = await documentService.getDocument(path.documentId);

      // Verify access
      if (document.ownerId !== req.user.id) {
        return res.status(403).end();
      }

      const etag = require('@exprsn/shared').generateETag({
        id: document.id,
        updatedAt: document.updatedAt,
        size: document.size
      });

      res.set({
        'Content-Type': document.mimeType,
        'Content-Length': document.size || 0,
        'ETag': `"${etag}"`,
        'Last-Modified': new Date(document.updatedAt).toUTCString()
      });

      res.status(200).end();
    } else if (path.folderId) {
      const folder = await documentService.getFolder(path.folderId);

      // Verify access
      if (folder.ownerId !== req.user.id) {
        return res.status(403).end();
      }

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
});

module.exports = router;
