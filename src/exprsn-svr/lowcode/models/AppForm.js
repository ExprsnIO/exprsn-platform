/**
 * AppForm Model
 *
 * Represents a form definition within an application.
 * Uses Power Apps-style architecture with data sources, collections, and formula language.
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const AppForm = sequelize.define('AppForm', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false,
    },
    applicationId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'application_id',
      references: {
        model: 'applications',
        key: 'id',
      },
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
      validate: {
        notEmpty: true,
        is: /^[a-zA-Z][a-zA-Z0-9_]*$/,
      },
    },
    displayName: {
      type: DataTypes.STRING(255),
      allowNull: false,
      field: 'display_name',
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    formType: {
      type: DataTypes.ENUM('standard', 'wizard', 'dialog', 'card', 'list'),
      allowNull: false,
      defaultValue: 'standard',
      field: 'form_type',
    },
    layout: {
      type: DataTypes.ENUM('single-column', 'two-column', 'three-column', 'grid', 'custom'),
      allowNull: false,
      defaultValue: 'single-column',
    },
    screens: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: [],
    },
    controls: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
    },
    dataSources: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: [],
      field: 'data_sources',
    },
    collections: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: [],
    },
    variables: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: [],
    },
    events: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
    },
    validationRules: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: [],
      field: 'validation_rules',
    },
    backgroundServices: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: [],
      field: 'background_services',
    },
    theme: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
    },
    settings: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
    },
    permissions: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
    },
    status: {
      type: DataTypes.ENUM('draft', 'published', 'archived'),
      allowNull: false,
      defaultValue: 'draft',
    },
    version: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: '1.0.0',
    },
    publishedVersion: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: 'published_version',
    },
    publishedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'published_at',
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
    },
  }, {
    tableName: 'app_forms',
    timestamps: true,
    underscored: true,
    paranoid: true,
    indexes: [
      { fields: ['application_id'] },
      { fields: ['status'] },
      { fields: ['form_type'] },
      { fields: ['created_at'] },
      {
        unique: true,
        fields: ['application_id', 'name'],
        where: { deleted_at: null },
      },
    ],
  });

  AppForm.associate = (models) => {
    // Form belongs to an application
    AppForm.belongsTo(models.Application, {
      foreignKey: 'applicationId',
      as: 'application',
    });

    // Form has many grids
    AppForm.hasMany(models.Grid, {
      foreignKey: 'formId',
      as: 'grids',
      onDelete: 'CASCADE',
    });

    // Form has many polls
    AppForm.hasMany(models.Poll, {
      foreignKey: 'formId',
      as: 'polls',
      onDelete: 'CASCADE',
    });

    // Form has many form submissions
    AppForm.hasMany(models.FormSubmission, {
      foreignKey: 'appFormId',
      as: 'submissions',
      onDelete: 'CASCADE',
    });

    // Form has many form drafts
    AppForm.hasMany(models.FormDraft, {
      foreignKey: 'appFormId',
      as: 'drafts',
      onDelete: 'CASCADE',
    });

    // Form has many form cards (junction)
    AppForm.hasMany(models.FormCard, {
      foreignKey: 'appFormId',
      as: 'formCards',
      onDelete: 'CASCADE',
    });

    // Form has many form connections (junction)
    AppForm.hasMany(models.FormConnection, {
      foreignKey: 'appFormId',
      as: 'formConnections',
      onDelete: 'CASCADE',
    });
  };

  // Instance methods
  AppForm.prototype.addControl = function(control) {
    if (!this.controls) {
      this.controls = [];
    }

    // Validate control has required properties
    if (!control.type || !control.name) {
      throw new Error('Control must have type and name');
    }

    this.controls.push(control);
    this.changed('controls', true);
    return this;
  };

  AppForm.prototype.removeControl = function(controlName) {
    if (!this.controls) return this;

    this.controls = this.controls.filter(c => c.name !== controlName);
    this.changed('controls', true);
    return this;
  };

  AppForm.prototype.addDataSource = function(dataSource) {
    if (!this.dataSources) {
      this.dataSources = [];
    }

    if (!dataSource.name || !dataSource.type) {
      throw new Error('Data source must have name and type');
    }

    this.dataSources.push(dataSource);
    this.changed('dataSources', true);
    return this;
  };

  AppForm.prototype.addVariable = function(variable) {
    if (!this.variables) {
      this.variables = [];
    }

    if (!variable.name || !variable.type) {
      throw new Error('Variable must have name and type');
    }

    this.variables.push(variable);
    this.changed('variables', true);
    return this;
  };

  AppForm.prototype.addCollection = function(collection) {
    if (!this.collections) {
      this.collections = [];
    }

    if (!collection.name || !collection.schema) {
      throw new Error('Collection must have name and schema');
    }

    this.collections.push(collection);
    this.changed('collections', true);
    return this;
  };

  AppForm.prototype.publish = async function() {
    this.publishedVersion = this.version;
    this.publishedAt = new Date();
    this.status = 'published';
    return await this.save();
  };

  return AppForm;
};
