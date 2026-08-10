/**
 * ═══════════════════════════════════════════════════════════
 * Git OAuth Application Model
 * Represents OAuth applications for third-party integrations
 * ═══════════════════════════════════════════════════════════
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {

  const GitOAuthApplication = sequelize.define('GitOAuthApplication', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      notEmpty: true
    }
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  clientId: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
    field: 'client_id'
  },
  clientSecretHash: {
    type: DataTypes.STRING,
    allowNull: false,
    field: 'client_secret_hash'
  },
  redirectUris: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    defaultValue: [],
    field: 'redirect_uris'
  },
  scopes: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    defaultValue: ['read_user', 'read_repository']
  },
  logoUrl: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'logo_url'
  },
  homepageUrl: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'homepage_url'
  },
  privacyPolicyUrl: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'privacy_policy_url'
  },
  termsOfServiceUrl: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'terms_of_service_url'
  },
  ownerId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'owner_id'
  },
  active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  }
  }, {
  tableName: 'git_oauth_applications',
  underscored: true,
  timestamps: true,
  indexes: [
    { fields: ['client_id'], unique: true },
    { fields: ['owner_id'] },
    { fields: ['active'] }
  ]
  });

  return GitOAuthApplication;
};
