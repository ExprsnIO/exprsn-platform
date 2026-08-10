const { DataTypes } = require('sequelize');
const crypto = require('crypto');

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || crypto.randomBytes(32);
const ALGORITHM = 'aes-256-gcm';

module.exports = (sequelize) => {
  const PaymentConfiguration = sequelize.define('PaymentConfiguration', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'user_id',
      comment: 'User ID for user-level configuration (null for org-level)'
    },
    organizationId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'organization_id',
      comment: 'Organization ID for org-level configuration (null for user-level)'
    },
    provider: {
      type: DataTypes.ENUM('stripe', 'paypal', 'authorizenet'),
      allowNull: false,
      comment: 'Payment gateway provider'
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      field: 'is_active',
      comment: 'Whether this configuration is active'
    },
    isPrimary: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'is_primary',
      comment: 'Primary payment method for this user/org'
    },
    credentials: {
      type: DataTypes.TEXT,
      allowNull: false,
      comment: 'Encrypted payment gateway credentials',
      get() {
        const encrypted = this.getDataValue('credentials');
        if (!encrypted) return null;

        try {
          const parts = encrypted.split(':');
          const iv = Buffer.from(parts[0], 'hex');
          const authTag = Buffer.from(parts[1], 'hex');
          const encryptedText = Buffer.from(parts[2], 'hex');

          const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY), iv);
          decipher.setAuthTag(authTag);

          let decrypted = decipher.update(encryptedText);
          decrypted = Buffer.concat([decrypted, decipher.final()]);

          return JSON.parse(decrypted.toString());
        } catch (error) {
          console.error('Error decrypting credentials:', error);
          return null;
        }
      },
      set(value) {
        if (!value) {
          this.setDataValue('credentials', null);
          return;
        }

        const text = JSON.stringify(value);
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY), iv);

        let encrypted = cipher.update(text);
        encrypted = Buffer.concat([encrypted, cipher.final()]);

        const authTag = cipher.getAuthTag();
        const combined = `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;

        this.setDataValue('credentials', combined);
      }
    },
    webhookSecret: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'webhook_secret',
      comment: 'Webhook secret for verifying incoming webhooks'
    },
    settings: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
      comment: 'Additional provider-specific settings'
    },
    testMode: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      field: 'test_mode',
      comment: 'Whether this configuration is for test mode'
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
      comment: 'Additional metadata'
    }
  }, {
    tableName: 'payment_configurations',
    timestamps: true,
    underscored: true,
    indexes: [
      {
        fields: ['user_id']
      },
      {
        fields: ['organization_id']
      },
      {
        fields: ['provider']
      },
      {
        fields: ['is_active']
      },
      {
        unique: true,
        fields: ['user_id', 'provider'],
        where: {
          organization_id: null
        },
        name: 'unique_user_provider'
      },
      {
        unique: true,
        fields: ['organization_id', 'provider'],
        where: {
          user_id: null
        },
        name: 'unique_org_provider'
      }
    ],
    validate: {
      eitherUserOrOrg() {
        if ((this.userId && this.organizationId) || (!this.userId && !this.organizationId)) {
          throw new Error('Either userId or organizationId must be set, but not both');
        }
      }
    }
  });

  PaymentConfiguration.associate = (models) => {
    PaymentConfiguration.hasMany(models.Transaction, {
      foreignKey: 'configurationId',
      as: 'transactions'
    });
  };

  return PaymentConfiguration;
};
