module.exports = (sequelize, DataTypes) => {
  const Repository = sequelize.define('Repository', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    accountId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'accounts',
        key: 'id'
      }
    },
    did: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true
    },
    head: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: 'Current commit CID (head of the repo)'
    },
    rev: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: 'Current revision identifier'
    },
    commitCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    recordCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    blobCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    totalSize: {
      type: DataTypes.BIGINT,
      defaultValue: 0,
      comment: 'Total size in bytes'
    },
    metadata: {
      type: DataTypes.JSONB,
      defaultValue: {},
      comment: 'Repository metadata and statistics'
    }
  }, {
    tableName: 'repositories',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['account_id'], unique: true },
      { fields: ['did'], unique: true },
      { fields: ['created_at'] }
    ]
  });

  Repository.associate = (models) => {
    Repository.belongsTo(models.Account, {
      foreignKey: 'accountId',
      as: 'account'
    });
    Repository.hasMany(models.Record, {
      foreignKey: 'repositoryId',
      as: 'records'
    });
    Repository.hasMany(models.Blob, {
      foreignKey: 'repositoryId',
      as: 'blobs'
    });
  };

  return Repository;
};
