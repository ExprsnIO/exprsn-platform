/**
 * ═══════════════════════════════════════════════════════════
 * HTML File Model
 * Individual files and folders in HTML projects
 * ═══════════════════════════════════════════════════════════
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const HtmlFile = sequelize.define('HtmlFile', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  projectId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'project_id'
  },
  parentId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'parent_id',
    comment: 'Parent folder (null for root files)'
  },
  name: {
    type: DataTypes.STRING(255),
    allowNull: false,
    validate: {
      notEmpty: true
    }
  },
  path: {
    type: DataTypes.TEXT,
    allowNull: false,
    comment: 'Full path from project root'
  },
  type: {
    type: DataTypes.ENUM('folder', 'html', 'css', 'javascript', 'json', 'image', 'font', 'other'),
    allowNull: false,
    defaultValue: 'html'
  },
  content: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'File content (null for folders and binary files)'
  },
  contentType: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'content_type',
    comment: 'MIME type'
  },
  size: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'File size in bytes'
  },
  storagePath: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'storage_path',
    comment: 'Path to file in storage (for binary files)'
  },
  isEntryPoint: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'is_entry_point',
    comment: 'Is this the main entry HTML file?'
  },
  order: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    comment: 'Display order in file tree'
  },
  metadata: {
    type: DataTypes.JSONB,
    defaultValue: {},
    get() {
      const value = this.getDataValue('metadata');
      return value || {};
    }
  },
  createdBy: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'created_by'
  },
  updatedBy: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'updated_by'
  }
}, {
  tableName: 'html_files',
  underscored: true,
  timestamps: true,
  indexes: [
    { fields: ['project_id'] },
    { fields: ['parent_id'] },
    { fields: ['type'] },
    { fields: ['path'] },
    { fields: ['is_entry_point'] },
    { fields: ['project_id', 'path'], unique: true }
  ]
});

/**
 * Instance Methods
 */
HtmlFile.prototype.toSafeObject = function() {
  return {
    id: this.id,
    projectId: this.projectId,
    parentId: this.parentId,
    name: this.name,
    path: this.path,
    type: this.type,
    content: this.content,
    contentType: this.contentType,
    size: this.size,
    storagePath: this.storagePath,
    isEntryPoint: this.isEntryPoint,
    order: this.order,
    metadata: this.metadata,
    createdBy: this.createdBy,
    updatedBy: this.updatedBy,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt
  };
};

/**
 * Check if file is a folder
 */
HtmlFile.prototype.isFolder = function() {
  return this.type === 'folder';
};

/**
 * Get file extension
 */
HtmlFile.prototype.getExtension = function() {
  if (this.isFolder()) return null;
  const parts = this.name.split('.');
  return parts.length > 1 ? parts.pop().toLowerCase() : null;
};

/**
 * Get MIME type based on extension
 */
HtmlFile.prototype.inferContentType = function() {
  if (this.contentType) return this.contentType;

  const ext = this.getExtension();
  const mimeTypes = {
    'html': 'text/html',
    'htm': 'text/html',
    'css': 'text/css',
    'js': 'text/javascript',
    'json': 'application/json',
    'png': 'image/png',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'gif': 'image/gif',
    'svg': 'image/svg+xml',
    'woff': 'font/woff',
    'woff2': 'font/woff2',
    'ttf': 'font/ttf',
    'eot': 'application/vnd.ms-fontobject'
  };

  return mimeTypes[ext] || 'application/octet-stream';
};

/**
 * Associations
 */
HtmlFile.associate = (models) => {
  // Project this file belongs to
  HtmlFile.belongsTo(models.HtmlProject, {
    foreignKey: 'projectId',
    as: 'project'
  });

  // Parent folder (self-referential)
  HtmlFile.belongsTo(HtmlFile, {
    foreignKey: 'parentId',
    as: 'parent'
  });

  // Child files/folders
  HtmlFile.hasMany(HtmlFile, {
    foreignKey: 'parentId',
    as: 'children'
  });

  // Version history
  HtmlFile.hasMany(models.HtmlFileVersion, {
    foreignKey: 'fileId',
    as: 'versions'
  });

  // Collaboration sessions for this file
  HtmlFile.hasMany(models.HtmlCollaborationSession, {
    foreignKey: 'fileId',
    as: 'collaborationSessions'
  });
};

  return HtmlFile;
};
