const express = require('express');
const router = express.Router();
const { requirePermission } = require('../../../middleware/auth');
const { validateBody, validateQuery, validateParams, schemas } = require('../../../middleware/validation');
const Joi = require('joi');
const documentService = require('../../../services/forge/groupware/documentService');
const logger = require('../../../utils/logger');

// Validation schemas
const folderCreateSchema = Joi.object({
  name: Joi.string().max(255).required(),
  description: Joi.string().optional(),
  parentFolderId: Joi.string().uuid().optional(),
  permissions: Joi.object().optional(),
  metadata: Joi.object().optional()
});

const folderUpdateSchema = folderCreateSchema.fork(
  ['name'],
  (schema) => schema.optional()
);

const documentCreateSchema = Joi.object({
  filename: Joi.string().max(500).required(),
  title: Joi.string().max(500).optional(),
  description: Joi.string().optional(),
  content: Joi.string().optional(),
  mimeType: Joi.string().max(100).required(),
  size: Joi.number().integer().positive().required(),
  folderId: Joi.string().uuid().optional(),
  tags: Joi.array().items(Joi.string()).optional(),
  metadata: Joi.object().optional()
});

const documentUpdateSchema = Joi.object({
  filename: Joi.string().max(500).optional(),
  title: Joi.string().max(500).optional(),
  description: Joi.string().optional(),
  content: Joi.string().optional(),
  folderId: Joi.string().uuid().optional().allow(null),
  tags: Joi.array().items(Joi.string()).optional(),
  metadata: Joi.object().optional()
});

const moveDocumentSchema = Joi.object({
  targetFolderId: Joi.string().uuid().optional().allow(null)
});

const copyDocumentSchema = Joi.object({
  targetFolderId: Joi.string().uuid().optional(),
  newTitle: Joi.string().max(500).optional()
});

// List folders
router.get('/folders',
  
  requirePermission('read'),
  validateQuery(schemas.pagination.keys({
    parentFolderId: Joi.string().uuid().optional().allow(null),
    search: Joi.string().optional()
  })),
  async (req, res) => {
    try {
      const { page, limit, parentFolderId, search } = req.query;
      const offset = (page - 1) * limit;

      const result = await documentService.listFolders({
        parentFolderId: parentFolderId === 'null' ? null : parentFolderId,
        ownerId: req.user.id,
        search,
        limit,
        offset
      });

      res.json({
        success: true,
        folders: result.folders,
        pagination: {
          total: result.total,
          page,
          limit,
          pages: Math.ceil(result.total / limit)
        }
      });
    } catch (error) {
      logger.error('Failed to list folders', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to list folders'
      });
    }
  }
);

// Get folder by ID
router.get('/folders/:id',
  
  requirePermission('read'),
  validateParams(schemas.id),
  validateQuery(Joi.object({
    includeContents: Joi.boolean().optional()
  })),
  async (req, res) => {
    try {
      const folder = await documentService.getFolderById(
        req.params.id,
        req.query.includeContents === 'true'
      );

      res.json({
        success: true,
        folder
      });
    } catch (error) {
      logger.error('Failed to get folder', { error: error.message, folderId: req.params.id });
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

// Get folder path (breadcrumb)
router.get('/folders/:id/path',
  
  requirePermission('read'),
  validateParams(schemas.id),
  async (req, res) => {
    try {
      const path = await documentService.getFolderPath(req.params.id);

      res.json({
        success: true,
        path
      });
    } catch (error) {
      logger.error('Failed to get folder path', { error: error.message, folderId: req.params.id });
      res.status(500).json({
        success: false,
        error: 'Failed to get folder path'
      });
    }
  }
);

// Create folder
router.post('/folders',
  
  requirePermission('write'),
  validateBody(folderCreateSchema),
  async (req, res) => {
    try {
      const folder = await documentService.createFolder({
        ...req.body,
        ownerId: req.user.id
      });

      // Emit Socket.IO event
      const io = req.app.get('io');
      io.to(`user:${req.user.id}`).emit('folder:created', { folder });

      logger.info('Folder created', {
        folderId: folder.id,
        userId: req.user.id
      });

      res.status(201).json({
        success: true,
        folder
      });
    } catch (error) {
      logger.error('Failed to create folder', { error: error.message });
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

// Update folder
router.put('/folders/:id',
  
  requirePermission('update'),
  validateParams(schemas.id),
  validateBody(folderUpdateSchema),
  async (req, res) => {
    try {
      const folder = await documentService.updateFolder(req.params.id, req.body);

      // Emit Socket.IO event
      const io = req.app.get('io');
      io.to(`user:${req.user.id}`).emit('folder:updated', { folder });

      logger.info('Folder updated', {
        folderId: req.params.id,
        userId: req.user.id
      });

      res.json({
        success: true,
        folder
      });
    } catch (error) {
      logger.error('Failed to update folder', { error: error.message, folderId: req.params.id });
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

// Delete folder
router.delete('/folders/:id',
  
  requirePermission('delete'),
  validateParams(schemas.id),
  validateQuery(Joi.object({
    recursive: Joi.boolean().optional().default(false)
  })),
  async (req, res) => {
    try {
      await documentService.deleteFolder(req.params.id, req.query.recursive === 'true');

      // Emit Socket.IO event
      const io = req.app.get('io');
      io.to(`user:${req.user.id}`).emit('folder:deleted', { folderId: req.params.id });

      logger.info('Folder deleted', {
        folderId: req.params.id,
        userId: req.user.id
      });

      res.json({
        success: true,
        message: 'Folder deleted successfully'
      });
    } catch (error) {
      logger.error('Failed to delete folder', { error: error.message, folderId: req.params.id });
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

// List documents
router.get('/',
  
  requirePermission('read'),
  validateQuery(schemas.pagination.keys({
    folderId: Joi.string().uuid().optional().allow(null),
    mimeType: Joi.string().optional(),
    search: Joi.string().optional(),
    tags: Joi.alternatives().try(
      Joi.string(),
      Joi.array().items(Joi.string())
    ).optional(),
    orderBy: Joi.string().valid('createdAt', 'filename', 'title', 'size').optional(),
    orderDirection: Joi.string().valid('ASC', 'DESC').optional()
  })),
  async (req, res) => {
    try {
      const {
        page,
        limit,
        folderId,
        mimeType,
        search,
        tags,
        orderBy,
        orderDirection
      } = req.query;
      const offset = (page - 1) * limit;

      // Parse tags if string
      const parsedTags = typeof tags === 'string' ? tags.split(',') : tags;

      const result = await documentService.listDocuments({
        folderId: folderId === 'null' ? null : folderId,
        ownerId: req.user.id,
        mimeType,
        search,
        tags: parsedTags,
        limit,
        offset,
        orderBy: orderBy || 'createdAt',
        orderDirection: orderDirection || 'DESC'
      });

      res.json({
        success: true,
        documents: result.documents,
        pagination: {
          total: result.total,
          page,
          limit,
          pages: Math.ceil(result.total / limit)
        }
      });
    } catch (error) {
      logger.error('Failed to list documents', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to list documents'
      });
    }
  }
);

// Get document statistics
router.get('/stats',
  
  requirePermission('read'),
  validateQuery(Joi.object({
    folderId: Joi.string().uuid().optional()
  })),
  async (req, res) => {
    try {
      const stats = await documentService.getDocumentStatistics({
        ownerId: req.user.id,
        folderId: req.query.folderId
      });

      res.json({
        success: true,
        stats
      });
    } catch (error) {
      logger.error('Failed to get document stats', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to get document statistics'
      });
    }
  }
);

// Search documents
router.get('/search',
  
  requirePermission('read'),
  validateQuery(Joi.object({
    query: Joi.string().min(2).required(),
    mimeType: Joi.string().optional(),
    tags: Joi.alternatives().try(
      Joi.string(),
      Joi.array().items(Joi.string())
    ).optional(),
    limit: Joi.number().integer().min(1).max(100).optional().default(50)
  })),
  async (req, res) => {
    try {
      const { query, mimeType, tags, limit } = req.query;
      const parsedTags = typeof tags === 'string' ? tags.split(',') : tags;

      const documents = await documentService.searchDocuments({
        query,
        mimeType,
        tags: parsedTags,
        limit
      });

      res.json({
        success: true,
        documents
      });
    } catch (error) {
      logger.error('Failed to search documents', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to search documents'
      });
    }
  }
);

// Get document by ID
router.get('/:id',
  
  requirePermission('read'),
  validateParams(schemas.id),
  validateQuery(Joi.object({
    includeFolder: Joi.boolean().optional()
  })),
  async (req, res) => {
    try {
      const document = await documentService.getDocumentById(
        req.params.id,
        req.query.includeFolder === 'true'
      );

      res.json({
        success: true,
        document
      });
    } catch (error) {
      logger.error('Failed to get document', { error: error.message, documentId: req.params.id });
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

// Create document
router.post('/',
  
  requirePermission('write'),
  validateBody(documentCreateSchema),
  async (req, res) => {
    try {
      const document = await documentService.createDocument({
        ...req.body,
        ownerId: req.user.id
      });

      // Emit Socket.IO event
      const io = req.app.get('io');
      io.to(`user:${req.user.id}`).emit('document:created', { document });

      logger.info('Document created', {
        documentId: document.id,
        userId: req.user.id
      });

      res.status(201).json({
        success: true,
        document
      });
    } catch (error) {
      logger.error('Failed to create document', { error: error.message });
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

// Move document
router.post('/:id/move',
  
  requirePermission('update'),
  validateParams(schemas.id),
  validateBody(moveDocumentSchema),
  async (req, res) => {
    try {
      const document = await documentService.moveDocument(
        req.params.id,
        req.body.targetFolderId
      );

      // Emit Socket.IO event
      const io = req.app.get('io');
      io.to(`user:${req.user.id}`).emit('document:moved', {
        documentId: req.params.id,
        targetFolderId: req.body.targetFolderId
      });

      logger.info('Document moved', {
        documentId: req.params.id,
        targetFolderId: req.body.targetFolderId,
        userId: req.user.id
      });

      res.json({
        success: true,
        document
      });
    } catch (error) {
      logger.error('Failed to move document', { error: error.message, documentId: req.params.id });
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

// Copy document
router.post('/:id/copy',
  
  requirePermission('write'),
  validateParams(schemas.id),
  validateBody(copyDocumentSchema),
  async (req, res) => {
    try {
      const copy = await documentService.copyDocument(
        req.params.id,
        req.body.targetFolderId,
        req.body.newTitle
      );

      // Emit Socket.IO event
      const io = req.app.get('io');
      io.to(`user:${req.user.id}`).emit('document:copied', {
        originalId: req.params.id,
        copyId: copy.id
      });

      logger.info('Document copied', {
        originalId: req.params.id,
        copyId: copy.id,
        userId: req.user.id
      });

      res.status(201).json({
        success: true,
        document: copy
      });
    } catch (error) {
      logger.error('Failed to copy document', { error: error.message, documentId: req.params.id });
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

// Update document
router.put('/:id',
  
  requirePermission('update'),
  validateParams(schemas.id),
  validateBody(documentUpdateSchema.keys({
    changeDescription: Joi.string().max(500).optional()
  })),
  async (req, res) => {
    try {
      const { changeDescription, ...updates } = req.body;
      const document = await documentService.updateDocument(
        req.params.id,
        updates,
        req.user.id,
        changeDescription
      );

      // Emit Socket.IO event
      const io = req.app.get('io');
      io.to(`user:${req.user.id}`).emit('document:updated', { document });

      logger.info('Document updated', {
        documentId: req.params.id,
        userId: req.user.id
      });

      res.json({
        success: true,
        document
      });
    } catch (error) {
      logger.error('Failed to update document', { error: error.message, documentId: req.params.id });
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

// Get document version history
router.get('/:id/versions',
  
  requirePermission('read'),
  validateParams(schemas.id),
  validateQuery(schemas.pagination),
  async (req, res) => {
    try {
      const { page, limit } = req.query;
      const offset = (page - 1) * limit;

      const result = await documentService.getDocumentVersions(req.params.id, {
        limit,
        offset
      });

      res.json({
        success: true,
        versions: result.versions,
        pagination: {
          total: result.total,
          page,
          limit,
          pages: Math.ceil(result.total / limit)
        }
      });
    } catch (error) {
      logger.error('Failed to get document versions', {
        error: error.message,
        documentId: req.params.id
      });
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

// Get specific document version
router.get('/:id/versions/:versionNumber',
  
  requirePermission('read'),
  validateParams(schemas.id.keys({
    versionNumber: Joi.number().integer().positive().required()
  })),
  async (req, res) => {
    try {
      const version = await documentService.getDocumentVersion(
        req.params.id,
        parseInt(req.params.versionNumber)
      );

      res.json({
        success: true,
        version
      });
    } catch (error) {
      logger.error('Failed to get document version', {
        error: error.message,
        documentId: req.params.id,
        versionNumber: req.params.versionNumber
      });
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

// Restore document to a previous version
router.post('/:id/versions/:versionNumber/restore',
  
  requirePermission('update'),
  validateParams(schemas.id.keys({
    versionNumber: Joi.number().integer().positive().required()
  })),
  async (req, res) => {
    try {
      const document = await documentService.restoreDocumentVersion(
        req.params.id,
        parseInt(req.params.versionNumber),
        req.user.id
      );

      // Emit Socket.IO event
      const io = req.app.get('io');
      io.to(`user:${req.user.id}`).emit('document:restored', {
        documentId: req.params.id,
        versionNumber: req.params.versionNumber
      });

      logger.info('Document restored to version', {
        documentId: req.params.id,
        versionNumber: req.params.versionNumber,
        userId: req.user.id
      });

      res.json({
        success: true,
        document
      });
    } catch (error) {
      logger.error('Failed to restore document version', {
        error: error.message,
        documentId: req.params.id,
        versionNumber: req.params.versionNumber
      });
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

// Compare two document versions
router.get('/:id/versions/compare',
  
  requirePermission('read'),
  validateParams(schemas.id),
  validateQuery(Joi.object({
    version1: Joi.number().integer().positive().required(),
    version2: Joi.number().integer().positive().required()
  })),
  async (req, res) => {
    try {
      const comparison = await documentService.compareVersions(
        req.params.id,
        parseInt(req.query.version1),
        parseInt(req.query.version2)
      );

      res.json({
        success: true,
        comparison
      });
    } catch (error) {
      logger.error('Failed to compare versions', {
        error: error.message,
        documentId: req.params.id,
        version1: req.query.version1,
        version2: req.query.version2
      });
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

// Get version statistics
router.get('/:id/versions/stats',
  
  requirePermission('read'),
  validateParams(schemas.id),
  async (req, res) => {
    try {
      const stats = await documentService.getVersionStatistics(req.params.id);

      res.json({
        success: true,
        stats
      });
    } catch (error) {
      logger.error('Failed to get version statistics', {
        error: error.message,
        documentId: req.params.id
      });
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

// Delete a specific version
router.delete('/:id/versions/:versionNumber',
  
  requirePermission('delete'),
  validateParams(schemas.id.keys({
    versionNumber: Joi.number().integer().positive().required()
  })),
  async (req, res) => {
    try {
      await documentService.deleteDocumentVersion(
        req.params.id,
        parseInt(req.params.versionNumber)
      );

      logger.info('Document version deleted', {
        documentId: req.params.id,
        versionNumber: req.params.versionNumber,
        userId: req.user.id
      });

      res.json({
        success: true,
        message: 'Version deleted successfully'
      });
    } catch (error) {
      logger.error('Failed to delete version', {
        error: error.message,
        documentId: req.params.id,
        versionNumber: req.params.versionNumber
      });
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

// Cleanup old versions
router.post('/:id/versions/cleanup',
  
  requirePermission('delete'),
  validateParams(schemas.id),
  validateBody(Joi.object({
    keepCount: Joi.number().integer().min(1).max(100).default(10)
  })),
  async (req, res) => {
    try {
      const result = await documentService.cleanupOldVersions(
        req.params.id,
        req.body.keepCount
      );

      logger.info('Old versions cleaned up', {
        documentId: req.params.id,
        deleted: result.deleted,
        userId: req.user.id
      });

      res.json({
        success: true,
        deleted: result.deleted
      });
    } catch (error) {
      logger.error('Failed to cleanup versions', {
        error: error.message,
        documentId: req.params.id
      });
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

// Delete document
router.delete('/:id',
  
  requirePermission('delete'),
  validateParams(schemas.id),
  async (req, res) => {
    try {
      await documentService.deleteDocument(req.params.id);

      // Emit Socket.IO event
      const io = req.app.get('io');
      io.to(`user:${req.user.id}`).emit('document:deleted', { documentId: req.params.id });

      logger.info('Document deleted', {
        documentId: req.params.id,
        userId: req.user.id
      });

      res.json({
        success: true,
        message: 'Document deleted successfully'
      });
    } catch (error) {
      logger.error('Failed to delete document', { error: error.message, documentId: req.params.id });
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

module.exports = router;
