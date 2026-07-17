/**
 * VaultConfig — persisted admin configuration for the Vault module (TASK-039).
 * One row per section (vault-secrets, vault-encryption, vault-access,
 * vault-audit); `data` holds that section's key→value settings. Before this,
 * config POSTs logged-and-echoed without persisting anything; GETs now merge
 * these rows over the env-derived defaults (row value wins).
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const VaultConfig = sequelize.define(
    'VaultConfig',
    {
      section: {
        type: DataTypes.STRING(64),
        primaryKey: true
      },
      data: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: {}
      }
    },
    {
      tableName: 'vault_config',
      timestamps: true,
      underscored: true
    }
  );

  return VaultConfig;
};
