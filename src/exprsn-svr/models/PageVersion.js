/**
 * ═══════════════════════════════════════════════════════════
 * PageVersion Model
 * Stores historical versions of pages for rollback and comparison
 * ═══════════════════════════════════════════════════════════
 */

const { DataTypes, Model } = require('sequelize');
const { sequelize } = require('../config/database');

class PageVersion extends Model {
  /**
   * Get safe version data (excludes server code for non-owners)
   */
  toSafeJSON(isOwner = false) {
    const data = this.toJSON();
    if (!isOwner) {
      delete data.server_code;
    }
    return data;
  }

  /**
   * Get summary for version list
   */
  toSummaryJSON() {
    return {
      id: this.id,
      page_id: this.page_id,
      version_number: this.version_number,
      created_by: this.created_by,
      change_summary: this.change_summary,
      created_at: this.created_at,
      content_size: (this.html_content || '').length,
      has_css: !!this.css_content,
      has_javascript: !!this.javascript_content,
      has_server_code: !!this.server_code
    };
  }
}

PageVersion.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    page_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'pages',
        key: 'id'
      },
      onDelete: 'CASCADE',
      comment: 'Reference to the page'
    },
    version_number: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: 'Incremental version number'
    },
    created_by: {
      type: DataTypes.UUID,
      allowNull: false,
      comment: 'User who created this version'
    },
    title: {
      type: DataTypes.STRING(500),
      allowNull: false,
      comment: 'Page title at this version'
    },
    html_content: {
      type: DataTypes.TEXT,
      allowNull: false,
      comment: 'HTML content snapshot'
    },
    css_content: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'CSS content snapshot'
    },
    javascript_content: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'JavaScript content snapshot'
    },
    server_code: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Server code snapshot'
    },
    page_data: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
      comment: 'Page metadata snapshot'
    },
    change_summary: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Description of changes in this version'
    },
    is_auto_save: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: 'True if this is an auto-save version'
    },
    restored_from_version: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'page_versions',
        key: 'id'
      },
      comment: 'If this version was restored from another, reference to source'
    }
  },
  {
    sequelize,
    modelName: 'PageVersion',
    tableName: 'page_versions',
    timestamps: true,
    updatedAt: false, // No updates, versions are immutable
    indexes: [
      { fields: ['page_id'] },
      { fields: ['page_id', 'version_number'], unique: true },
      { fields: ['created_by'] },
      { fields: ['created_at'] },
      { fields: ['is_auto_save'] }
    ]
  }
);

module.exports = PageVersion;
