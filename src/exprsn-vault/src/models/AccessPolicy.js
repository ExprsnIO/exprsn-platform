/**
 * AccessPolicy Model
 * Defines reusable access policies for secrets and keys
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const AccessPolicy = sequelize.define('AccessPolicy', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    name: {
      type: DataTypes.STRING(255),
      unique: true,
      allowNull: false
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },

    // Policy definition
    policyType: {
      type: DataTypes.ENUM('secret', 'key', 'credential', 'global'),
      allowNull: false
    },
    rules: {
      type: DataTypes.JSONB,
      allowNull: false,
      comment: 'Policy rules in JSONLex format'
    },

    // Applicability
    entityTypes: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      defaultValue: ['user', 'group', 'organization', 'service'],
      comment: 'Entity types this policy can be applied to'
    },

    // Enforcement
    priority: {
      type: DataTypes.INTEGER,
      defaultValue: 100,
      comment: 'Policy priority (higher = more important)'
    },
    enforcementMode: {
      type: DataTypes.ENUM('enforcing', 'permissive', 'audit'),
      defaultValue: 'enforcing'
    },

    // AI suggestions
    aiSuggested: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    aiConfidence: {
      type: DataTypes.FLOAT,
      allowNull: true,
      comment: 'AI confidence score for suggested policies'
    },

    // Status
    status: {
      type: DataTypes.ENUM('active', 'draft', 'deprecated'),
      defaultValue: 'active'
    },

    // Metadata
    createdBy: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    metadata: {
      type: DataTypes.JSONB,
      defaultValue: {}
    }
  }, {
    tableName: 'access_policies',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['name'], unique: true },
      { fields: ['policy_type'] },
      { fields: ['status'] },
      { fields: ['priority'] }
    ]
  });

  AccessPolicy.associate = (models) => {
    AccessPolicy.hasMany(models.TokenBinding, {
      foreignKey: 'policyId',
      as: 'bindings'
    });
  };

  return AccessPolicy;
};
