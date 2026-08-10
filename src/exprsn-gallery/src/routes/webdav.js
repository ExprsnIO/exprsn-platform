/**
 * ═══════════════════════════════════════════════════════════════════════
 * WebDAV Routes for Gallery
 * Provides WebDAV access to albums and media
 * ═══════════════════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const albumService = require('../services/albumService');
const mediaService = require('../services/mediaService');
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
const { validateToken } = require('../middleware/auth');
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
 * Format: /albumId or /albumId/mediaId
 */
function parsePath(path) {
  const parts = path.replace(/^\/+|\/+$/g, '').split('/');
  return {
    parts,
    isRoot: parts.length === 0 || parts[0] === '',
    albumId: parts[0] || null,
    mediaId: parts[1] || null
  };
}

/**
 * Helper: Authenticate user from token
 */
async function authenticateWebDAV(req, res, next) {
  try {
    await validateToken(req, res, next);
  } catch (error) {
    return sendWebDAVError(res, 401, 'Unauthorized');
  }
}

// Use XML body parser for WebDAV methods
router.use(parseXmlBody);

/**
 * OPTIONS - Return DAV capabilities
 */
router.options('*', optionsHandler(['1', '2']));

/**
 * PROPFIND - Discover albums and media
 */
router.propfind('*', authenticateWebDAV, async (req, res) => {
  const depth = parseDepth(req);
  const baseUrl = getBaseUrl(req);
  const path = parsePath(req.path);

  try {
    const responses = [];

    if (path.isRoot || !path.mediaId) {
      // Album listing
      const albumId = path.albumId || null;

      if (albumId) {
        // Get specific album
        const album = await albumService.getAlbum(albumId, req.user.id);
        responses.push(generateCollectionResponse({
          id: album.id,
          name: album.title,
          createdAt: album.createdAt,
          updatedAt: album.updatedAt
        }, baseUrl, depth));

        // Get media in album if depth > 0
        if (depth > 0) {
          const media = await mediaService.listMediaByAlbum(albumId, {
            limit: 1000,
            offset: 0
          });

          media.forEach(item => {
            responses.push(generateResourceResponse({
              id: item.id,
              name: item.filename || `${item.id}.${item.fileExtension}`,
              filename: item.filename,
              size: item.fileSize,
              mimetype: item.mimeType,
              contentType: item.mimeType,
              createdAt: item.createdAt,
              updatedAt: item.updatedAt,
              created_at: item.createdAt,
              updated_at: item.updatedAt
            }, `${baseUrl}/${albumId}`));
          });
        }
      } else {
        // Root - list all albums
        responses.push(generateCollectionResponse({
          id: '',
          name: 'Gallery Root',
          createdAt: new Date(),
          updatedAt: new Date()
        }, baseUrl, depth));

        if (depth > 0) {
          const albums = await albumService.listAlbums({
            ownerId: req.user.id,
            limit: 100,
            offset: 0
          });

          albums.albums.forEach(album => {
            responses.push(generateCollectionResponse({
              id: album.id,
              name: album.title,
              createdAt: album.createdAt,
              updatedAt: album.updatedAt
            }, baseUrl, depth - 1));
          });
        }
      }
    } else {
      // Single media item
      const media = await mediaService.getMedia(path.mediaId);

      responses.push(generateResourceResponse({
        id: media.id,
        name: media.filename || `${media.id}.${media.fileExtension}`,
        filename: media.filename,
        size: media.fileSize,
        mimetype: media.mimeType,
        contentType: media.mimeType,
        createdAt: media.createdAt,
        updatedAt: media.updatedAt,
        created_at: media.createdAt,
        updated_at: media.updatedAt
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
 * GET - Download media
 */
router.get('*', authenticateWebDAV, async (req, res) => {
  const path = parsePath(req.path);

  if (!path.mediaId) {
    return sendWebDAVError(res, 400, 'Cannot download album');
  }

  try {
    const media = await mediaService.getMedia(path.mediaId);

    // Get media file
    const fileData = await mediaService.downloadMedia(path.mediaId);

    const etag = require('@exprsn/shared').generateETag({
      id: media.id,
      updatedAt: media.updatedAt,
      size: media.fileSize
    });

    res.set({
      'Content-Type': media.mimeType,
      'Content-Length': media.fileSize,
      'Content-Disposition': `attachment; filename="${media.filename || media.id}"`,
      'ETag': `"${etag}"`,
      'Last-Modified': new Date(media.updatedAt).toUTCString()
    });

    if (fileData.stream) {
      fileData.stream.pipe(res);
    } else if (fileData.buffer) {
      res.send(fileData.buffer);
    } else {
      res.redirect(fileData.url);
    }

    logger.info('WebDAV GET media', {
      mediaId: media.id,
      userId: req.user.id
    });
  } catch (error) {
    logger.error('WebDAV GET error', { error: error.message });

    if (error.message.includes('not found')) {
      sendWebDAVError(res, 404, 'Media not found');
    } else {
      sendWebDAVError(res, 500, 'Internal server error');
    }
  }
});

/**
 * PUT - Upload media
 */
router.put('*', authenticateWebDAV, async (req, res) => {
  const path = parsePath(req.path);

  if (!path.albumId) {
    return sendWebDAVError(res, 400, 'Album required for upload');
  }

  try {
    // Check for lock
    const lockToken = lockManager.parseLockTokenFromHeader(req.headers.if);
    if (lockToken && path.mediaId) {
      await lockManager.verifyLockToken(path.mediaId, lockToken, req.user.id);
    }

    // Collect media data
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));

    await new Promise((resolve, reject) => {
      req.on('end', resolve);
      req.on('error', reject);
    });

    const buffer = Buffer.concat(chunks);
    const filename = path.parts[path.parts.length - 1];

    // Verify album exists
    const album = await albumService.getAlbum(path.albumId, req.user.id);

    // Check if media exists (update) or create new
    let media;
    let isUpdate = false;

    if (path.mediaId) {
      try {
        media = await mediaService.getMedia(path.mediaId);
        isUpdate = true;

        // Update not typically supported for media, would need to delete and recreate
        return sendWebDAVError(res, 405, 'Media update not supported');
      } catch (e) {
        // Media doesn't exist, create new
      }
    }

    // Upload new media
    media = await mediaService.uploadMedia({
      albumId: path.albumId,
      uploadedBy: req.user.id,
      file: {
        buffer,
        originalname: filename,
        mimetype: req.headers['content-type'] || 'application/octet-stream',
        size: buffer.length
      },
      caption: '',
      altText: filename
    });

    const etag = require('@exprsn/shared').generateETag({
      id: media.id,
      updatedAt: media.updatedAt || media.createdAt,
      size: media.fileSize
    });

    res.set({
      'ETag': `"${etag}"`,
      'Content-Type': 'text/plain'
    });

    res.status(201).end();

    logger.info('WebDAV PUT media', {
      mediaId: media.id,
      albumId: path.albumId,
      userId: req.user.id,
      size: buffer.length
    });
  } catch (error) {
    logger.error('WebDAV PUT error', { error: error.message });

    if (error.message === 'LOCKED') {
      sendWebDAVError(res, 423, 'Resource is locked');
    } else if (error.message.includes('not found')) {
      sendWebDAVError(res, 404, 'Album not found');
    } else {
      sendWebDAVError(res, 500, 'Internal server error');
    }
  }
});

/**
 * DELETE - Delete media or album
 */
router.delete('*', authenticateWebDAV, async (req, res) => {
  const path = parsePath(req.path);

  try {
    // Check for lock
    const lockToken = lockManager.parseLockTokenFromHeader(req.headers.if);
    const resourceId = path.mediaId || path.albumId;

    if (lockToken && resourceId) {
      await lockManager.verifyLockToken(resourceId, lockToken, req.user.id);
    }

    if (path.mediaId) {
      // Delete media
      await mediaService.deleteMedia(path.mediaId, req.user.id);
    } else if (path.albumId) {
      // Delete album
      await albumService.deleteAlbum(path.albumId, req.user.id);
    } else {
      return sendWebDAVError(res, 400, 'Cannot delete root');
    }

    res.status(204).end();

    logger.info('WebDAV DELETE', {
      userId: req.user.id,
      path: req.path,
      type: path.mediaId ? 'media' : 'album'
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
 * MKCOL - Create album
 */
router.mkcol('*', authenticateWebDAV, async (req, res) => {
  const path = parsePath(req.path);

  if (!path.albumId || path.mediaId) {
    return sendWebDAVError(res, 400, 'Invalid album path');
  }

  try {
    const albumTitle = path.parts[path.parts.length - 1];

    const album = await albumService.createAlbum({
      title: albumTitle,
      description: '',
      ownerId: req.user.id,
      visibility: 'private'
    });

    res.status(201).end();

    logger.info('WebDAV MKCOL', {
      albumId: album.id,
      userId: req.user.id,
      title: albumTitle
    });
  } catch (error) {
    logger.error('WebDAV MKCOL error', { error: error.message });

    if (error.message.includes('exists')) {
      sendWebDAVError(res, 405, 'Album already exists');
    } else {
      sendWebDAVError(res, 500, 'Internal server error');
    }
  }
});

/**
 * COPY - Copy media
 */
router.copy('*', authenticateWebDAV, async (req, res) => {
  const sourcePath = parsePath(req.path);
  const destination = parseDestination(req);
  const overwrite = parseOverwrite(req);

  if (!destination) {
    return sendWebDAVError(res, 400, 'Destination header required');
  }

  if (!sourcePath.mediaId) {
    return sendWebDAVError(res, 501, 'Album copy not supported');
  }

  const destPath = parsePath(destination);

  try {
    // Get source media
    const media = await mediaService.getMedia(sourcePath.mediaId);

    // Download media
    const fileData = await mediaService.downloadMedia(sourcePath.mediaId);

    let buffer;
    if (fileData.buffer) {
      buffer = fileData.buffer;
    } else if (fileData.stream) {
      const chunks = [];
      fileData.stream.on('data', chunk => chunks.push(chunk));

      await new Promise((resolve, reject) => {
        fileData.stream.on('end', resolve);
        fileData.stream.on('error', reject);
      });

      buffer = Buffer.concat(chunks);
    } else {
      return sendWebDAVError(res, 501, 'Cannot copy remote media');
    }

    // Upload to destination album
    await mediaService.uploadMedia({
      albumId: destPath.albumId,
      uploadedBy: req.user.id,
      file: {
        buffer,
        originalname: media.filename || destPath.parts[destPath.parts.length - 1],
        mimetype: media.mimeType,
        size: buffer.length
      },
      caption: media.caption || '',
      altText: media.altText || media.filename
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
 * MOVE - Move media between albums
 */
router.move('*', authenticateWebDAV, async (req, res) => {
  const sourcePath = parsePath(req.path);
  const destination = parseDestination(req);

  if (!destination) {
    return sendWebDAVError(res, 400, 'Destination header required');
  }

  if (!sourcePath.mediaId) {
    return sendWebDAVError(res, 501, 'Album move not supported');
  }

  try {
    // Check for lock
    const lockToken = lockManager.parseLockTokenFromHeader(req.headers.if);

    if (lockToken) {
      await lockManager.verifyLockToken(sourcePath.mediaId, lockToken, req.user.id);
    }

    const destPath = parsePath(destination);

    // Move media to destination album
    await mediaService.moveMedia(sourcePath.mediaId, destPath.albumId, req.user.id);

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
 * LOCK - Lock media or album
 */
router.lock('*', authenticateWebDAV, async (req, res) => {
  const path = parsePath(req.path);
  const resourceId = path.mediaId || path.albumId;

  if (!resourceId) {
    return sendWebDAVError(res, 400, 'Cannot lock root');
  }

  try {
    const lockInfo = parseLockRequest(req.xmlBody);
    const timeout = parseInt(req.headers.timeout?.replace(/^Second-/, '') || '3600');

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
    sendWebDAVError(res, 500, 'Internal server error');
  }
});

/**
 * UNLOCK - Unlock resource
 */
router.unlock('*', authenticateWebDAV, async (req, res) => {
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
router.head('*', authenticateWebDAV, async (req, res) => {
  const path = parsePath(req.path);

  try {
    if (path.mediaId) {
      const media = await mediaService.getMedia(path.mediaId);
      const etag = require('@exprsn/shared').generateETag({
        id: media.id,
        updatedAt: media.updatedAt,
        size: media.fileSize
      });

      res.set({
        'Content-Type': media.mimeType,
        'Content-Length': media.fileSize,
        'ETag': `"${etag}"`,
        'Last-Modified': new Date(media.updatedAt).toUTCString()
      });

      res.status(200).end();
    } else if (path.albumId) {
      await albumService.getAlbum(path.albumId, req.user.id);

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
