module.exports = (sequelize, DataTypes) => {
  const Subscription = sequelize.define('Subscription', {
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
    subjectDid: {
      type: DataTypes.STRING(255),
      allowNull: false,
      comment: 'DID of the followed account'
    },
    subjectHandle: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: 'Handle of the followed account'
    },
    type: {
      type: DataTypes.ENUM('follow', 'mute', 'block'),
      defaultValue: 'follow'
    },
    uri: {
      type: DataTypes.STRING(512),
      allowNull: true,
      comment: 'AT URI of the follow record'
    },
    status: {
      type: DataTypes.ENUM('active', 'pending', 'removed'),
      defaultValue: 'active'
    }
  }, {
    tableName: 'subscriptions',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['account_id'] },
      { fields: ['subject_did'] },
      { fields: ['type'] },
      { fields: ['status'] },
      { fields: ['account_id', 'subject_did', 'type'], unique: true }
    ]
  });

  Subscription.associate = (models) => {
    Subscription.belongsTo(models.Account, {
      foreignKey: 'accountId',
      as: 'account'
    });
  };

  return Subscription;
};
