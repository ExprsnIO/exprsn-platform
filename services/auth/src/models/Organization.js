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
        // The admin "Auth & Identity" UI binds the "Require 2FA" toggle here.
        // ENFORCED at login via services/auth/src/services/mfaPolicyService.js
        // (STATUS.md #12): un-enrolled members past their grace window must set
        // up 2FA before a bearer is issued.
        requireMfa: false,
        // Structured 2FA / MFA policy configured from the admin UI. `totp` and
        // `backup_codes` are implemented + enforced end-to-end; `sms`, `email`
        // and `webauthn` are config scaffolding for methods not yet built — a
        // policy restricted to only those cannot be enforced (login is allowed
        // through with a warning) until they ship.
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
    },

    // FEAT-032 / ADR-0003 (Decision 5): link to the org's CA directory group
    // (ca.groups id, type organizational_unit). Plain UUID — NO cross-schema FK
    // (ca.groups is a different module's schema; the id spaces bridge only by
    // convention). NULL for orgs not provisioned through the engine. The
    // ca_group_id column exists only after migration 20260710000001's up() is
    // run directly (sync db:migrate will NOT ALTER this existing table) —
    // `npm run db:check` must be clean or every organizations query 500s.
    caGroupId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'ca_group_id'
    }
  }, {
    tableName: 'organizations',
    timestamps: true,
    paranoid: true, // Soft delete
    indexes: [
      { fields: ['slug'], unique: true },
      { fields: ['ownerId'] },
      { fields: ['status'] },
      { fields: ['ca_group_id'], name: 'organizations_ca_group_id_idx' }
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
