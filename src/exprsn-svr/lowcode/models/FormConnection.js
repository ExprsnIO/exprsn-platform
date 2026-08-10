/**
 * FormConnection Model
 *
 * Junction table linking forms to data source connections.
 * Represents a specific data source instance within a form.
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const FormConnection = sequelize.define('FormConnection', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false,
    },
    formId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'form_id',
      references: {
        model: 'forms',
        key: 'id',
      },
    },
    appFormId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'app_form_id',
      references: {
        model: 'app_forms',
        key: 'id',
      },
    },
    dataSourceId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'data_source_id',
      references: {
        model: 'data_sources',
        key: 'id',
      },
    },
    connectionName: {
      type: DataTypes.STRING(255),
      allowNull: false,
      field: 'connection_name',
      validate: {
        notEmpty: true,
        is: /^[a-zA-Z][a-zA-Z0-9_]*$/,
      },
    },
    operations: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {
        read: true,
        create: false,
        update: false,
        delete: false,
      },
    },
    filters: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    config: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
    },
  }, {
    tableName: 'form_connections',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['form_id'] },
      { fields: ['app_form_id'] },
      { fields: ['data_source_id'] },
    ],
    validate: {
      eitherFormOrAppForm() {
        if ((this.formId && this.appFormId) || (!this.formId && !this.appFormId)) {
          throw new Error('Must specify either formId or appFormId, but not both');
        }
      },
    },
  });

  FormConnection.associate = (models) => {
    FormConnection.belongsTo(models.Form, {
      foreignKey: 'formId',
      as: 'form',
    });

    FormConnection.belongsTo(models.AppForm, {
      foreignKey: 'appFormId',
      as: 'appForm',
    });

    FormConnection.belongsTo(models.DataSource, {
      foreignKey: 'dataSourceId',
      as: 'dataSource',
    });
  };

  // Instance methods
  FormConnection.prototype.enableOperation = function(operation) {
    const validOperations = ['read', 'create', 'update', 'delete'];

    if (!validOperations.includes(operation)) {
      throw new Error(`Invalid operation: ${operation}`);
    }

    if (!this.operations) {
      this.operations = {};
    }

    this.operations[operation] = true;
    this.changed('operations', true);
    return this;
  };

  FormConnection.prototype.disableOperation = function(operation) {
    const validOperations = ['read', 'create', 'update', 'delete'];

    if (!validOperations.includes(operation)) {
      throw new Error(`Invalid operation: ${operation}`);
    }

    if (!this.operations) {
      this.operations = {};
    }

    this.operations[operation] = false;
    this.changed('operations', true);
    return this;
  };

  FormConnection.prototype.addFilter = function(filter) {
    if (!this.filters) {
      this.filters = [];
    }

    this.filters.push(filter);
    this.changed('filters', true);
    return this;
  };

  return FormConnection;
};
