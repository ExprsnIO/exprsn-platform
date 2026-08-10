/**
 * ═══════════════════════════════════════════════════════════
 * Component Model
 * Reusable UI components for building pages
 * ═══════════════════════════════════════════════════════════
 */

const { DataTypes, Model } = require('sequelize');
const { sequelize } = require('../config/database');

class Component extends Model {
  /**
   * Check if user can access this component
   */
  canAccess(userId) {
    if (this.is_public) {
      return true;
    }
    if (this.created_by === userId) {
      return true;
    }
    return false;
  }

  /**
   * Get component data for library
   */
  toLibraryJSON() {
    return {
      id: this.id,
      name: this.name,
      category: this.category,
      description: this.description,
      preview_url: this.preview_url,
      tags: this.tags,
      is_public: this.is_public,
      uses_count: this.uses_count,
      created_at: this.created_at
    };
  }
}

Component.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    created_by: {
      type: DataTypes.UUID,
      allowNull: false,
      comment: 'User who created the component'
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
      comment: 'Component name'
    },
    slug: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
      comment: 'URL-friendly identifier'
    },
    category: {
      type: DataTypes.ENUM('navigation', 'content', 'forms', 'data', 'feedback', 'layout', 'media', 'other'),
      defaultValue: 'other',
      comment: 'Component category'
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Component description'
    },
    preview_url: {
      type: DataTypes.STRING(500),
      allowNull: true,
      comment: 'Preview image URL'
    },
    html: {
      type: DataTypes.TEXT,
      allowNull: false,
      comment: 'Component HTML markup'
    },
    css: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Component CSS styles'
    },
    javascript: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Component JavaScript code'
    },
    props_schema: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
      comment: 'JSON schema for component properties'
    },
    default_props: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
      comment: 'Default property values'
    },
    dependencies: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: [],
      comment: 'Required libraries or other components'
    },
    tags: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      defaultValue: [],
      comment: 'Search tags'
    },
    is_public: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: 'Available to all users'
    },
    uses_count: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: 'Number of times this component was used'
    },
    version: {
      type: DataTypes.STRING(20),
      defaultValue: '1.0.0',
      comment: 'Semantic version'
    }
  },
  {
    sequelize,
    modelName: 'Component',
    tableName: 'components',
    indexes: [
      { fields: ['created_by'] },
      { fields: ['slug'], unique: true },
      { fields: ['category'] },
      { fields: ['is_public'] },
      { fields: ['uses_count'] }
    ],
    hooks: {
      beforeCreate: (component) => {
        if (!component.slug) {
          component.slug = component.name.toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '');
        }
      }
    }
  }
);

module.exports = Component;
