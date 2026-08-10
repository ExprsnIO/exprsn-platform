const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const AuditLog = sequelize.define('AuditLog', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'user_id'
    },
    action: {
      type: DataTypes.STRING(100),
      allowNull: false,
      validate: {
        len: [1, 100]
      }
    },
    resourceType: {
      type: DataTypes.STRING(50),
      allowNull: false,
      field: 'resource_type',
      validate: {
        isIn: [['table', 'view', 'function', 'trigger', 'sequence', 'tablespace', 'role', 'connection', 'query']]
      }
    },
    resourceId: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'resource_id'
    },
    connectionId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'connection_id',
      references: {
        model: 'connections',
        key: 'id'
      }
    },
    details: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {}
    },
    ipAddress: {
      type: DataTypes.STRING(45),
      allowNull: true,
      field: 'ip_address'
    },
    userAgent: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'user_agent'
    },
    status: {
      type: DataTypes.ENUM('success', 'failure', 'warning'),
      allowNull: false,
      defaultValue: 'success'
    }
  }, {
    tableName: 'audit_logs',
    timestamps: true,
    underscored: true,
    indexes: [
      {
        fields: ['user_id']
      },
      {
        fields: ['action']
      },
      {
        fields: ['resource_type']
      },
      {
        fields: ['connection_id']
      },
      {
        fields: ['created_at']
      },
      {
        fields: ['status']
      }
    ]
  });

  AuditLog.associate = (models) => {
    AuditLog.belongsTo(models.Connection, {
      foreignKey: 'connectionId',
      as: 'connection'
    });
  };

  return AuditLog;
};
