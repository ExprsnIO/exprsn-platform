/**
 * ═══════════════════════════════════════════════════════════
 * Page Model
 * Stores HTML pages with code, metadata, and access control
 * ═══════════════════════════════════════════════════════════
 */

const { DataTypes, Model } = require('sequelize');
const { sequelize } = require('../config/database');

class Page extends Model {
  /**
   * Check if user can access this page
   */
  canAccess(userId, requiredPermission = 'read') {
    if (this.is_public && requiredPermission === 'read') {
      return true;
    }
    if (this.owner_id === userId) {
      return true;
    }
    // Check permissions in page_data
    if (this.page_data && this.page_data.permissions) {
      const userPermissions = this.page_data.permissions[userId];
      if (userPermissions && userPermissions.includes(requiredPermission)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Get safe page data for client (excludes sensitive fields)
   */
  toSafeJSON() {
    const { server_code, ...safeData } = this.toJSON();
    return safeData;
  }
}

Page.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    owner_id: {
      type: DataTypes.UUID,
      allowNull: false,
      comment: 'User who created the page'
    },
    slug: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
      comment: 'URL-friendly identifier'
    },
    title: {
      type: DataTypes.STRING(500),
      allowNull: false
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    html_content: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: '',
      comment: 'HTML content of the page'
    },
    css_content: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Custom CSS styles'
    },
    javascript_content: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Client-side JavaScript code'
    },
    server_code: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Server-side JavaScript code (Node.js)'
    },
    is_static: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: 'If true, serve as static HTML; if false, use EJS rendering'
    },
    is_public: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: 'Public access without authentication'
    },
    status: {
      type: DataTypes.ENUM('draft', 'published', 'archived'),
      defaultValue: 'draft'
    },
    page_data: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
      comment: 'Custom page metadata, permissions, and configuration'
    },
    socket_events: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: [],
      comment: 'Socket.IO events this page listens to'
    },
    api_routes: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: [],
      comment: 'API routes this page can access'
    },
    version: {
      type: DataTypes.INTEGER,
      defaultValue: 1,
      comment: 'Version number for tracking changes'
    },
    published_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    last_edited_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    },
    views_count: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    }
  },
  {
    sequelize,
    modelName: 'Page',
    tableName: 'pages',
    indexes: [
      { fields: ['owner_id'] },
      { fields: ['slug'], unique: true },
      { fields: ['status'] },
      { fields: ['is_public'] },
      { fields: ['published_at'] }
    ],
    hooks: {
      beforeUpdate: (page) => {
        page.last_edited_at = new Date();
      },
      beforeCreate: (page) => {
        if (!page.slug) {
          page.slug = page.title.toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '');
        }
      }
    }
  }
);

module.exports = Page;
