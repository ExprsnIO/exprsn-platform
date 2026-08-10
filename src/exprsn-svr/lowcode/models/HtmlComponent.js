/**
 * ═══════════════════════════════════════════════════════════
 * HTML Component Model
 * Reusable UI components and widgets
 * ═══════════════════════════════════════════════════════════
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const HtmlComponent = sequelize.define('HtmlComponent', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  name: {
    type: DataTypes.STRING(200),
    allowNull: false,
    validate: {
      notEmpty: true
    }
  },
  slug: {
    type: DataTypes.STRING(200),
    allowNull: false,
    unique: true,
    validate: {
      is: /^[a-z0-9-]+$/i
    }
  },
  category: {
    type: DataTypes.STRING(100),
    allowNull: false,
    comment: 'Component category (layout, forms, data, etc)'
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  htmlTemplate: {
    type: DataTypes.TEXT,
    allowNull: false,
    field: 'html_template',
    comment: 'HTML template with placeholders'
  },
  css: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Component-specific CSS'
  },
  javascript: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Component-specific JavaScript'
  },
  properties: {
    type: DataTypes.JSONB,
    defaultValue: [],
    comment: 'Configurable properties schema',
    get() {
      const value = this.getDataValue('properties');
      return value || [];
    }
  },
  dependencies: {
    type: DataTypes.JSONB,
    defaultValue: [],
    comment: 'Required libraries/components',
    get() {
      const value = this.getDataValue('dependencies');
      return value || [];
    }
  },
  icon: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: 'Icon class or URL'
  },
  isPublic: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'is_public',
    comment: 'Available in component marketplace'
  },
  isSystem: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'is_system',
    comment: 'Built-in system component'
  },
  authorId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'author_id'
  },
  organizationId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'organization_id'
  },
  version: {
    type: DataTypes.STRING(20),
    defaultValue: '1.0.0',
    allowNull: false
  },
  downloads: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  rating: {
    type: DataTypes.DECIMAL(3, 2),
    defaultValue: 0.00
  },
  metadata: {
    type: DataTypes.JSONB,
    defaultValue: {},
    get() {
      const value = this.getDataValue('metadata');
      return value || {};
    }
  }
}, {
  tableName: 'html_components',
  underscored: true,
  timestamps: true,
  indexes: [
    { fields: ['category'] },
    { fields: ['is_public'] },
    { fields: ['is_system'] },
    { fields: ['author_id'] },
    { fields: ['organization_id'] },
    { fields: ['slug'], unique: true }
  ]
});

  HtmlComponent.associate = (models) => {
    HtmlComponent.belongsToMany(models.HtmlProject, {
      through: models.HtmlProjectComponent,
      foreignKey: 'componentId',
      otherKey: 'projectId',
      as: 'projects'
    });
  };

  return HtmlComponent;
};
