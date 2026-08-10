const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const ContactAddressbook = sequelize.define('ContactAddressbook', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    ownerId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'owner_id'
    },
    color: {
      type: DataTypes.STRING(7),
      allowNull: true
    },
    isShared: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'is_shared'
    },
    sharedWith: {
      type: DataTypes.ARRAY(DataTypes.UUID),
      allowNull: true,
      defaultValue: [],
      field: 'shared_with'
    },
    contactCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'contact_count'
    },
    syncToken: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'sync_token'
    },
    ctag: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {}
    }
  }, {
    tableName: 'contact_addressbooks',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['owner_id'] },
      { fields: ['sync_token'] }
    ]
  });

  ContactAddressbook.associate = (models) => {
    ContactAddressbook.hasMany(models.Contact, {
      foreignKey: 'addressbookId',
      as: 'Contacts'
    });
  };

  return ContactAddressbook;
};
