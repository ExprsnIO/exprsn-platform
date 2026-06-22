/**
 * TokenBinding Model
 * Links tokens to policies and entities
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const TokenBinding = sequelize.define('TokenBinding', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    tokenId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'vault_tokens',
        key: 'id'
      },
      onDelete: 'CASCADE'
    },
    policyId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'access_policies',
        key: 'id'
      },
      onDelete: 'SET NULL'
    },

    // Direct permissions override (if no policy)
    permissions: {
      type: DataTypes.JSONB,
      allowNull: true,
      comment: 'Direct permission overrides'
    },

    // Binding metadata
    boundAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    },
    boundBy: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: true
    },

    status: {
      type: DataTypes.ENUM('active', 'inactive'),
      defaultValue: 'active'
    }
  }, {
    tableName: 'token_bindings',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['token_id'] },
      { fields: ['policy_id'] },
      { fields: ['status'] }
    ]
  });

  TokenBinding.associate = (models) => {
    TokenBinding.belongsTo(models.VaultToken, {
      foreignKey: 'tokenId',
      as: 'token'
    });
    TokenBinding.belongsTo(models.AccessPolicy, {
      foreignKey: 'policyId',
      as: 'policy'
    });
  };

  return TokenBinding;
};
