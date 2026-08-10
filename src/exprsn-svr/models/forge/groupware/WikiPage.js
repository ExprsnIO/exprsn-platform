const { DataTypes } = require('sequelize');
const { sequelize } = require('../../../config/database');

const WikiPage = sequelize.define('WikiPage', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  title: {
    type: DataTypes.STRING(500),
    allowNull: false
  },
  slug: {
    type: DataTypes.STRING(500),
    allowNull: false,
    unique: true
  },
  content: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  contentFormat: {
    type: DataTypes.ENUM('markdown', 'html', 'plain'),
    allowNull: false,
    defaultValue: 'markdown',
    field: 'content_format'
  },
  // Hierarchy
  parentPageId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'parent_page_id'
  },
  position: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    comment: 'Position within parent page'
  },
  depth: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    comment: 'Depth in page hierarchy'
  },
  path: {
    type: DataTypes.STRING(2000),
    allowNull: true,
    comment: 'Full path like /parent/child/grandchild'
  },
  // Authorship
  createdById: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'created_by_id'
  },
  lastEditedById: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'last_edited_by_id'
  },
  lastEditedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'last_edited_at'
  },
  // Versioning
  version: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1
  },
  isLatestVersion: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
    field: 'is_latest_version'
  },
  previousVersionId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'previous_version_id'
  },
  // Status and visibility
  status: {
    type: DataTypes.ENUM('draft', 'published', 'archived'),
    allowNull: false,
    defaultValue: 'draft'
  },
  visibility: {
    type: DataTypes.ENUM('public', 'private', 'restricted'),
    allowNull: false,
    defaultValue: 'private'
  },
  publishedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'published_at'
  },
  // Categories and tags
  category: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  tags: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    allowNull: true,
    defaultValue: []
  },
  // Links and references
  internalLinks: {
    type: DataTypes.ARRAY(DataTypes.UUID),
    allowNull: true,
    field: 'internal_links',
    comment: 'Array of page IDs linked to'
  },
  backlinks: {
    type: DataTypes.ARRAY(DataTypes.UUID),
    allowNull: true,
    comment: 'Array of page IDs that link to this page'
  },
  // Collaboration
  lockedBy: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'locked_by',
    comment: 'User ID who has edit lock'
  },
  lockedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'locked_at'
  },
  contributors: {
    type: DataTypes.ARRAY(DataTypes.UUID),
    allowNull: true,
    defaultValue: [],
    comment: 'All users who have edited this page'
  },
  // Permissions
  permissions: {
    type: DataTypes.JSONB,
    allowNull: true,
    comment: 'Page-specific permissions override'
  },
  // Template
  isTemplate: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'is_template'
  },
  templateId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'template_id',
    comment: 'Template this page was created from'
  },
  // Metrics
  viewCount: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    field: 'view_count'
  },
  editCount: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    field: 'edit_count'
  },
  lastViewedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'last_viewed_at'
  },
  // Search optimization
  searchableText: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'searchable_text',
    comment: 'Indexed text for full-text search'
  },
  // Attachments
  attachments: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: []
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
  tableName: 'wiki_pages',
  timestamps: true,
  underscored: true,
  indexes: [
    {
      fields: ['slug'],
      unique: true
    },
    {
      fields: ['parent_page_id']
    },
    {
      fields: ['created_by_id']
    },
    {
      fields: ['status']
    },
    {
      fields: ['visibility']
    },
    {
      fields: ['category']
    },
    {
      fields: ['is_template']
    },
    {
      fields: ['path']
    }
  ]
});

module.exports = WikiPage;
