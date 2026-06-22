/**
 * ═══════════════════════════════════════════════════════════
 * Organization Model
 * Multi-tenant organizations that own users, groups, and applications
 * ═══════════════════════════════════════════════════════════
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Organization = sequelize.define('Organization', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },

    name: {
      type: DataTypes.STRING,
      allowNull: false
    },

    slug: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      validate: {
        is: /^[a-z0-9-]+$/i
      }
    },

    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },

    // Organization type
    type: {
      type: DataTypes.ENUM('enterprise', 'team', 'personal'),
      defaultValue: 'team'
    },

    // Owner user ID
    ownerId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      }
    },

    // Contact info
    email: {
      type: DataTypes.STRING,
      allowNull: true,
      validate: {
        isEmail: true
      }
    },

    website: {
      type: DataTypes.STRING,
      allowNull: true
    },

    // Branding
    logoUrl: {
      type: DataTypes.STRING,
      allowNull: true
    },

    // Subscription/billing
    plan: {
      type: DataTypes.ENUM('free', 'starter', 'professional', 'enterprise'),
      defaultValue: 'free'
    },

    billingEmail: {
      type: DataTypes.STRING,
      allowNull: true
    },

    // Settings
    settings: {
      type: DataTypes.JSON,
      defaultValue: {
        allowUserRegistration: false,
        requireEmailVerification: true,
        // Legacy flag retained for backward compatibility; the admin "Auth &
        // Identity" UI binds the "Require 2FA" toggle here. NOTE: this is NOT
        // yet enforced at login — see STATUS.md "Org 2FA policy enforcement".
        requireMfa: false,
        // Structured 2FA / MFA policy configured from the admin UI. Persisted
        // only for now (no login-path enforcement yet). `totp` and
        // `backup_codes` are implemented end-to-end; `sms`, `email` and
        // `webauthn` are config scaffolding for methods not yet built.
        mfa: {
          allowedMethods: ['totp', 'backup_codes'],
          enrollmentGracePeriodDays: 7,
          rememberDeviceDays: 0
        },
        sessionTimeout: 3600000, // 1 hour
        passwordPolicy: {
          minLength: 8,
          requireUppercase: true,
          requireLowercase: true,
          requireNumbers: true,
          requireSymbols: false
        }
      }
    },

    // Status
    status: {
      type: DataTypes.ENUM('active', 'suspended', 'deleted'),
      defaultValue: 'active'
    },

    // Metadata
    metadata: {
      type: DataTypes.JSON,
      defaultValue: {}
    }
  }, {
    tableName: 'organizations',
    timestamps: true,
    paranoid: true, // Soft delete
    indexes: [
      { fields: ['slug'], unique: true },
      { fields: ['ownerId'] },
      { fields: ['status'] }
    ]
  });

  Organization.associate = function(models) {
    // Owner relationship
    Organization.belongsTo(models.User, {
      as: 'owner',
      foreignKey: 'ownerId'
    });

    // Members relationship
    Organization.belongsToMany(models.User, {
      through: models.OrganizationMember,
      as: 'members',
      foreignKey: 'organizationId',
      otherKey: 'userId'
    });

    // Groups relationship
    Organization.hasMany(models.Group, {
      as: 'groups',
      foreignKey: 'organizationId'
    });

    // Applications relationship
    Organization.hasMany(models.Application, {
      as: 'applications',
      foreignKey: 'organizationId'
    });
  };

  return Organization;
};
