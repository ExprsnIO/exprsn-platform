module.exports = (sequelize, DataTypes) => {
  const Record = sequelize.define('Record', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    repositoryId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'repositories',
        key: 'id'
      }
    },
    uri: {
      type: DataTypes.STRING(512),
      allowNull: false,
      unique: true,
      comment: 'AT URI (at://did/collection/rkey)'
    },
    cid: {
      type: DataTypes.STRING(255),
      allowNull: false,
      comment: 'Content identifier (hash of record)'
    },
    collection: {
      type: DataTypes.STRING(255),
      allowNull: false,
      comment: 'NSID of the collection (app.bsky.feed.post, etc.)'
    },
    rkey: {
      type: DataTypes.STRING(255),
      allowNull: false,
      comment: 'Record key (unique within collection)'
    },
    value: {
      type: DataTypes.JSONB,
      allowNull: false,
      comment: 'The actual record content'
    },
    indexedAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    },
    exprsnPostId: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: 'Linked Exprsn timeline post ID'
    },
    exprsnMessageId: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: 'Linked Exprsn Spark message ID'
    },
    metadata: {
      type: DataTypes.JSONB,
      defaultValue: {},
      comment: 'Additional indexing metadata'
    }
  }, {
    tableName: 'records',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['repository_id'] },
      { fields: ['uri'], unique: true },
      { fields: ['cid'] },
      { fields: ['collection'] },
      { fields: ['rkey'] },
      { fields: ['indexed_at'] },
      { fields: ['exprsn_post_id'] },
      { fields: ['exprsn_message_id'] },
      { fields: ['repository_id', 'collection'] }
    ]
  });

  Record.associate = (models) => {
    Record.belongsTo(models.Repository, {
      foreignKey: 'repositoryId',
      as: 'repository'
    });
  };

  return Record;
};
