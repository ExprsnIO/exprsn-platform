const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Connection = sequelize.define('Connection', {
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
    host: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    port: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 5432,
      validate: {
        min: 1,
        max: 65535
      }
    },
    database: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    username: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    password: {
      type: DataTypes.TEXT,
      allowNull: false,
      // Password is encrypted before storage
      get() {
        return '***ENCRYPTED***';
      }
    },
    sslEnabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'ssl_enabled'
    },
    pgVersion: {
      type: DataTypes.STRING(20),
      allowNull: true,
      field: 'pg_version'
    },
    color: {
      type: DataTypes.STRING(7),
      allowNull: true,
      defaultValue: '#007bff',
      validate: {
        is: /^#[0-9A-F]{6}$/i
      }
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'user_id'
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: 'is_active'
    },
    lastConnectedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'last_connected_at'
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {}
    }
  }, {
    tableName: 'connections',
    timestamps: true,
    underscored: true,
    indexes: [
      {
        fields: ['user_id']
      },
      {
        fields: ['is_active']
      },
      {
        unique: true,
        fields: ['user_id', 'name']
      }
    ]
  });

  Connection.associate = (models) => {
    Connection.hasMany(models.SavedQuery, {
      foreignKey: 'connectionId',
      as: 'savedQueries'
    });
    Connection.hasMany(models.QueryHistory, {
      foreignKey: 'connectionId',
      as: 'queryHistory'
    });
  };

  return Connection;
};
