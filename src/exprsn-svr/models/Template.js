/**
 * ═══════════════════════════════════════════════════════════
 * Template Model
 * Pre-built page templates for common use cases
 * ═══════════════════════════════════════════════════════════
 */

const { DataTypes, Model } = require('sequelize');
const { sequelize } = require('../config/database');

class Template extends Model {
  /**
   * Check if user can access this template
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
   * Get template data for preview
   */
  toPreviewJSON() {
    return {
      id: this.id,
      name: this.name,
      category: this.category,
      description: this.description,
      thumbnail_url: this.thumbnail_url,
      tags: this.tags,
      is_public: this.is_public,
      uses_count: this.uses_count,
      rating: this.rating,
      created_at: this.created_at
    };
  }
}

Template.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    created_by: {
      type: DataTypes.UUID,
      allowNull: false,
      comment: 'User who created the template'
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
      comment: 'Template name'
    },
    slug: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
      comment: 'URL-friendly identifier'
    },
    category: {
      type: DataTypes.ENUM('landing', 'dashboard', 'documentation', 'blog', 'portfolio', 'admin', 'ecommerce', 'other'),
      defaultValue: 'other',
      comment: 'Template category'
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Template description'
    },
    thumbnail_url: {
      type: DataTypes.STRING(500),
      allowNull: true,
      comment: 'Preview image URL'
    },
    html_template: {
      type: DataTypes.TEXT,
      allowNull: false,
      comment: 'HTML template with placeholders'
    },
    css_template: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'CSS template'
    },
    javascript_template: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'JavaScript template'
    },
    server_code_template: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Server-side code template'
    },
    customization_schema: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
      comment: 'JSON schema for customization options'
    },
    default_data: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
      comment: 'Default values for template variables'
    },
    required_components: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: [],
      comment: 'List of component IDs this template uses'
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
    is_featured: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: 'Featured template'
    },
    uses_count: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: 'Number of times this template was used'
    },
    rating: {
      type: DataTypes.DECIMAL(3, 2),
      defaultValue: 0.00,
      comment: 'Average rating (0-5)'
    },
    rating_count: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: 'Number of ratings'
    }
  },
  {
    sequelize,
    modelName: 'Template',
    tableName: 'templates',
    indexes: [
      { fields: ['created_by'] },
      { fields: ['slug'], unique: true },
      { fields: ['category'] },
      { fields: ['is_public'] },
      { fields: ['is_featured'] },
      { fields: ['uses_count'] },
      { fields: ['rating'] }
    ],
    hooks: {
      beforeCreate: (template) => {
        if (!template.slug) {
          template.slug = template.name.toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '');
        }
      }
    }
  }
);

module.exports = Template;
