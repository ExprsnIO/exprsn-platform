const { DataTypes } = require('sequelize');
const { sequelize } = require('../../../config/database');

const Folder = sequelize.define('Folder', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  name: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  folderType: {
    type: DataTypes.ENUM('document', 'note', 'general'),
    allowNull: false,
    defaultValue: 'general',
    field: 'folder_type'
  },
  // Hierarchy
  parentFolderId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'parent_folder_id'
  },
  path: {
    type: DataTypes.STRING(2000),
    allowNull: true,
    comment: 'Full path like /parent/child'
  },
  depth: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  position: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  // Ownership and permissions
  ownerId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'owner_id'
  },
  isPublic: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'is_public'
  },
  permissions: {
    type: DataTypes.JSONB,
    allowNull: true,
    comment: 'Folder-specific permissions'
  },
  // Sharing
  sharedWith: {
    type: DataTypes.ARRAY(DataTypes.UUID),
    allowNull: true,
    field: 'shared_with',
    comment: 'Array of user IDs'
  },
  // System folders
  isSystem: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'is_system',
    comment: 'System folders cannot be deleted'
  },
  systemType: {
    type: DataTypes.ENUM('inbox', 'drafts', 'trash', 'archive', 'templates'),
    allowNull: true,
    field: 'system_type'
  },
  // Metadata
  itemCount: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    field: 'item_count'
  },
  totalSize: {
    type: DataTypes.BIGINT,
    allowNull: false,
    defaultValue: 0,
    field: 'total_size',
    comment: 'Total size in bytes'
  },
  color: {
    type: DataTypes.STRING(7),
    allowNull: true
  },
  icon: {
    type: DataTypes.STRING(50),
    allowNull: true
  },
  metadata: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: {}
  },
  createdAt: {
    type: DataTypes.DATE,
    allowNull: false,
    field: 'created_at'
  },
  updatedAt: {
    type: DataTypes.DATE,
    allowNull: false,
    field: 'updated_at'
  }
}, {
  tableName: 'folders',
  timestamps: true,
  underscored: true,
  indexes: [
    {
      fields: ['owner_id']
    },
    {
      fields: ['parent_folder_id']
    },
    {
      fields: ['folder_type']
    },
    {
      fields: ['is_public']
    },
    {
      fields: ['system_type']
    },
    {
      fields: ['path']
    }
  ]
});

module.exports = Folder;
