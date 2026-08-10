module.exports = (sequelize, DataTypes) => {
  const Account = sequelize.define('Account', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    did: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
      comment: 'Decentralized Identifier (did:plc:xxx or did:web:xxx)'
    },
    handle: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
      comment: 'Handle (@username.exprsn.io)'
    },
    exprsnUserId: {
      type: DataTypes.UUID,
      allowNull: false,
      comment: 'Reference to Exprsn auth user ID'
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true
    },
    displayName: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    avatarCid: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: 'CID of avatar blob'
    },
    bannerCid: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: 'CID of banner blob'
    },
    privateKey: {
      type: DataTypes.TEXT,
      allowNull: false,
      comment: 'Encrypted private signing key'
    },
    publicKey: {
      type: DataTypes.TEXT,
      allowNull: false,
      comment: 'Public signing key'
    },
    recoveryKey: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Account recovery key'
    },
    status: {
      type: DataTypes.ENUM('active', 'suspended', 'deleted'),
      defaultValue: 'active'
    },
    isVerified: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    lastSeenAt: {
      type: DataTypes.DATE,
      allowNull: true
    },
    metadata: {
      type: DataTypes.JSONB,
      defaultValue: {},
      comment: 'Additional account metadata'
    }
  }, {
    tableName: 'accounts',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['did'], unique: true },
      { fields: ['handle'], unique: true },
      { fields: ['exprsn_user_id'] },
      { fields: ['email'], unique: true },
      { fields: ['status'] },
      { fields: ['created_at'] }
    ]
  });

  Account.associate = (models) => {
    Account.hasOne(models.Repository, {
      foreignKey: 'accountId',
      as: 'repository'
    });
    Account.hasMany(models.Subscription, {
      foreignKey: 'accountId',
      as: 'subscriptions'
    });
    Account.hasMany(models.Event, {
      foreignKey: 'accountId',
      as: 'events'
    });
  };

  return Account;
};
