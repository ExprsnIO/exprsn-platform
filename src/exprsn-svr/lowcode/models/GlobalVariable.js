const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const GlobalVariable = sequelize.define('GlobalVariable', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    applicationId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'application_id',
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
    dataType: {
      type: DataTypes.ENUM('string', 'number', 'boolean', 'date', 'object', 'array'),
      allowNull: false,
      defaultValue: 'string',
      field: 'data_type',
    },
    value: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    defaultValue: {
      type: DataTypes.JSONB,
      allowNull: true,
      field: 'default_value',
    },
    scope: {
      type: DataTypes.ENUM('global', 'environment'),
      allowNull: false,
      defaultValue: 'global',
    },
    environment: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    encrypted: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    readOnly: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'read_only',
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
    },
  }, {
    tableName: 'global_variables',
    timestamps: true,
    underscored: true,
    paranoid: true,
  });

  GlobalVariable.associate = (models) => {
    GlobalVariable.belongsTo(models.Application, {
      foreignKey: 'applicationId',
      as: 'application',
    });
  };

  return GlobalVariable;
};
