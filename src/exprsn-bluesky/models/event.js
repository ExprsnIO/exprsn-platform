module.exports = (sequelize, DataTypes) => {
  const Event = sequelize.define('Event', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    accountId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'accounts',
        key: 'id'
      }
    },
    seq: {
      type: DataTypes.BIGINT,
      allowNull: false,
      unique: true,
      comment: 'Sequence number for firehose ordering'
    },
    did: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    eventType: {
      type: DataTypes.ENUM('commit', 'identity', 'account', 'handle'),
      allowNull: false
    },
    operation: {
      type: DataTypes.ENUM('create', 'update', 'delete'),
      allowNull: true
    },
    collection: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    rkey: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    record: {
      type: DataTypes.JSONB,
      allowNull: true,
      comment: 'The record data for create/update operations'
    },
    cid: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    rev: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    time: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    }
  }, {
    tableName: 'events',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['seq'], unique: true },
      { fields: ['account_id'] },
      { fields: ['did'] },
      { fields: ['event_type'] },
      { fields: ['operation'] },
      { fields: ['collection'] },
      { fields: ['time'] },
      { fields: ['created_at'] }
    ]
  });

  Event.associate = (models) => {
    Event.belongsTo(models.Account, {
      foreignKey: 'accountId',
      as: 'account'
    });
  };

  return Event;
};
