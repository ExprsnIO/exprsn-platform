const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const SavedQuery = sequelize.define('SavedQuery', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
      validate: {
        len: [1, 255]
      }
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    query: {
      type: DataTypes.TEXT,
      allowNull: false,
      validate: {
        notEmpty: true
      }
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
    tags: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      allowNull: true,
      defaultValue: []
    },
    isShared: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'is_shared'
    },
    executionCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'execution_count'
    },
    lastExecutedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'last_executed_at'
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {}
    }
  }, {
    tableName: 'saved_queries',
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
        fields: ['is_shared']
      },
      {
        fields: ['tags'],
        using: 'gin'
      }
    ]
  });

  SavedQuery.associate = (models) => {
    SavedQuery.belongsTo(models.Connection, {
      foreignKey: 'connectionId',
      as: 'connection'
    });
  };

  return SavedQuery;
};
