const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Contact = sequelize.define('Contact', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    addressbookId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'addressbook_id'
    },
    prefix: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    firstName: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'first_name'
    },
    middleName: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'middle_name'
    },
    lastName: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'last_name'
    },
    suffix: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    nickname: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    fullName: {
      type: DataTypes.STRING(500),
      allowNull: true,
      field: 'full_name'
    },
    organization: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    department: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    jobTitle: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'job_title'
    },
    emails: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: []
    },
    phones: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: []
    },
    addresses: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: []
    },
    urls: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: []
    },
    socialProfiles: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
      field: 'social_profiles'
    },
    birthday: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    anniversary: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    photoUrl: {
      type: DataTypes.STRING(1000),
      allowNull: true,
      field: 'photo_url'
    },
    categories: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      allowNull: true,
      defaultValue: []
    },
    tags: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      allowNull: true,
      defaultValue: []
    },
    vcard: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    uid: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    etag: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    linkedCrmContactId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'linked_crm_contact_id'
    },
    linkedCrmCompanyId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'linked_crm_company_id'
    },
    isFavorite: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'is_favorite'
    },
    isArchived: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'is_archived'
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {}
    }
  }, {
    tableName: 'contacts',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['addressbook_id'] },
      { fields: ['first_name'] },
      { fields: ['last_name'] },
      { fields: ['organization'] },
      { fields: ['uid'] },
      { fields: ['linked_crm_contact_id'] },
      { fields: ['is_favorite'] }
    ]
  });

  Contact.associate = (models) => {
    Contact.belongsTo(models.ContactAddressbook, {
      foreignKey: 'addressbookId',
      as: 'Addressbook'
    });
  };

  return Contact;
};
