const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const AuditLog = sequelize.define('AuditLog', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    action: {
      type: DataTypes.STRING(100),
      allowNull: false,
      comment: 'Action performed (read, create, update, delete, encrypt, decrypt, rotate)'
    },
    resourceType: {
      type: DataTypes.STRING(50),
      allowNull: false,
      comment: 'Type of resource (secret, key, lease, credential)'
    },
    resourceId: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: 'ID of the resource affected'
    },
    resourcePath: {
      type: DataTypes.STRING(500),
      allowNull: true,
      comment: 'Path or identifier of the resource'
    },
    actor: {
      type: DataTypes.STRING(255),
      allowNull: false,
      comment: 'User or service that performed the action'
    },
    actorIp: {
      type: DataTypes.STRING(45),
      allowNull: true,
      comment: 'IP address of the actor'
    },
    tokenId: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: 'CA token ID used for authentication'
    },
    success: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      comment: 'Whether the action succeeded'
    },
    errorMessage: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Error message if action failed'
    },
    metadata: {
      type: DataTypes.JSONB,
      defaultValue: {},
      comment: 'Additional context (permissions, changes, etc.)'
    },
    duration: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Operation duration in milliseconds'
    },
    requestId: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: 'Request correlation ID'
    },
    userAgent: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'User agent string'
    },
    timestamp: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      comment: 'When the action occurred'
    }
  }, {
    tableName: 'audit_logs',
    timestamps: false,
    underscored: true,
    indexes: [
      {
        fields: ['resource_type', 'resource_id']
      },
      {
        fields: ['actor']
      },
      {
        fields: ['action']
      },
      {
        fields: ['timestamp']
      },
      {
        fields: ['success']
      },
      {
        fields: ['token_id']
      },
      {
        fields: ['resource_path']
      }
    ]
  });

  AuditLog.associate = (models) => {
    // Polymorphic associations handled via resourceType and resourceId
  };

  return AuditLog;
};
