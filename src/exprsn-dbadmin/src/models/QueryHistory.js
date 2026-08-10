const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const QueryHistory = sequelize.define('QueryHistory', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    query: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    connectionId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'connection_id',
      references: {
        model: 'connections',
        key: 'id'
      }
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'user_id'
    },
    executionTimeMs: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'execution_time_ms'
    },
    rowsAffected: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'rows_affected'
    },
    status: {
      type: DataTypes.ENUM('success', 'error', 'cancelled'),
      allowNull: false,
      defaultValue: 'success'
    },
    errorMessage: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'error_message'
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {}
    }
  }, {
    tableName: 'query_history',
    timestamps: true,
    underscored: true,
    indexes: [
      {
        fields: ['connection_id']
      },
      {
        fields: ['user_id']
      },
      {
        fields: ['status']
      },
      {
        fields: ['created_at']
      }
    ]
  });

  QueryHistory.associate = (models) => {
    QueryHistory.belongsTo(models.Connection, {
      foreignKey: 'connectionId',
      as: 'connection'
    });
  };

  return QueryHistory;
};
