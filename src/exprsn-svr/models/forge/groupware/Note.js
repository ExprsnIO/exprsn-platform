const { DataTypes } = require('sequelize');
const { sequelize } = require('../../../config/database');

const Note = sequelize.define('Note', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  title: {
    type: DataTypes.STRING(500),
    allowNull: true
  },
  content: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  contentFormat: {
    type: DataTypes.ENUM('plain', 'markdown', 'html'),
    allowNull: false,
    defaultValue: 'markdown',
    field: 'content_format'
  },
  noteType: {
    type: DataTypes.ENUM('note', 'snippet', 'checklist', 'bookmark'),
    allowNull: false,
    defaultValue: 'note',
    field: 'note_type'
  },
  // Ownership
  ownerId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'owner_id'
  },
  // Organization
  folderId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'folder_id'
  },
  tags: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    allowNull: true,
    defaultValue: []
  },
  // Status
  isPinned: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'is_pinned'
  },
  isFavorite: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'is_favorite'
  },
  isArchived: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'is_archived'
  },
  archivedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'archived_at'
  },
  // Sharing
  isShared: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'is_shared'
  },
  sharedWith: {
    type: DataTypes.ARRAY(DataTypes.UUID),
    allowNull: true,
    field: 'shared_with',
    comment: 'Array of user IDs'
  },
  sharePermissions: {
    type: DataTypes.ENUM('view', 'edit'),
    allowNull: true,
    defaultValue: 'view',
    field: 'share_permissions'
  },
  // Related entities
  relatedEntityType: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'related_entity_type',
    comment: 'contact, company, task, project, etc.'
  },
  relatedEntityId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'related_entity_id'
  },
  // Reminders
  hasReminder: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'has_reminder'
  },
  reminderAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'reminder_at'
  },
  reminderSent: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'reminder_sent'
  },
  // Checklist support
  checklistItems: {
    type: DataTypes.JSONB,
    allowNull: true,
    field: 'checklist_items',
    comment: 'Array of { id, text, completed, position }'
  },
  // Snippet support
  language: {
    type: DataTypes.STRING(50),
    allowNull: true,
    comment: 'Programming language for snippets'
  },
  // Bookmark support
  url: {
    type: DataTypes.STRING(2000),
    allowNull: true
  },
  // Encryption
  isEncrypted: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'is_encrypted'
  },
  // Attachments
  attachments: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: []
  },
  // Color coding
  color: {
    type: DataTypes.STRING(7),
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
  tableName: 'notes',
  timestamps: true,
  underscored: true,
  indexes: [
    {
      fields: ['owner_id']
    },
    {
      fields: ['folder_id']
    },
    {
      fields: ['note_type']
    },
    {
      fields: ['is_pinned']
    },
    {
      fields: ['is_archived']
    },
    {
      fields: ['related_entity_type', 'related_entity_id']
    },
    {
      fields: ['reminder_at']
    }
  ]
});

module.exports = Note;
