/**
 * Grid Model
 *
 * Represents a data grid (subgrid) component that can be embedded in forms.
 * Supports inline editing, bulk operations, and master-detail relationships.
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Grid = sequelize.define('Grid', {
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
    formId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'form_id',
      references: {
        model: 'app_forms',
        key: 'id',
      },
    },
    entityId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'entity_id',
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
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
    gridType: {
      type: DataTypes.ENUM('editable', 'readonly', 'master-detail'),
      allowNull: false,
      defaultValue: 'readonly',
      field: 'grid_type',
    },
    columns: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
    },
    dataSource: {
      type: DataTypes.JSONB,
      allowNull: true,
      field: 'data_source',
    },
    filters: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: [],
    },
    sorting: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: [],
    },
    actions: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: [],
    },
    bulkActions: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: [],
      field: 'bulk_actions',
    },
    pagination: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {
        enabled: true,
        pageSize: 25,
        pageSizeOptions: [10, 25, 50, 100],
      },
    },
    settings: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
    },
  }, {
    tableName: 'app_grids',
    timestamps: true,
    underscored: true,
    paranoid: true,
    indexes: [
      { fields: ['application_id'] },
      { fields: ['form_id'] },
      { fields: ['entity_id'] },
    ],
  });

  Grid.associate = (models) => {
    Grid.belongsTo(models.Application, {
      foreignKey: 'applicationId',
      as: 'application',
    });

    Grid.belongsTo(models.AppForm, {
      foreignKey: 'formId',
      as: 'form',
    });
  };

  // Instance methods
  Grid.prototype.addColumn = function(column) {
    if (!this.columns) {
      this.columns = [];
    }

    if (!column.name || !column.field) {
      throw new Error('Column must have name and field');
    }

    this.columns.push(column);
    this.changed('columns', true);
    return this;
  };

  Grid.prototype.addFilter = function(filter) {
    if (!this.filters) {
      this.filters = [];
    }

    this.filters.push(filter);
    this.changed('filters', true);
    return this;
  };

  return Grid;
};
