/**
 * ═══════════════════════════════════════════════════════════
 * ProvisioningRun Model — org-provisioning saga idempotency ledger
 * ═══════════════════════════════════════════════════════════
 * FEAT-032 / ADR-0003 (Decision 3). The org-provisioning engine
 * (`src/provisioning/`) records one row per saga invocation, keyed by the
 * caller-supplied `idempotencyKey`. Re-invocation with the same key resumes
 * forward from `cursor` (or short-circuits when `status='completed'`); on
 * unrecoverable failure the ledger drives LIFO compensation over the ids it
 * accumulated. `kind` discriminates the full org run ('org') from the
 * per-member credentialing run ('member', the FEAT-035 seam).
 *
 * NEW table → safe under the sync-based `db:migrate` (it creates new tables;
 * it only fails to ALTER existing ones). Lives in the `auth` schema and is
 * read/written by the engine directly through auth's Sequelize (the engine
 * owns no domain data of its own — this ledger is its sole model).
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const ProvisioningRun = sequelize.define('ProvisioningRun', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },

    // Caller-supplied idempotency key (e.g. derived from the org slug).
    idempotencyKey: {
      type: DataTypes.STRING,
      allowNull: false
    },

    // Discriminator: a full org provisioning run vs. a per-member credentialing run.
    kind: {
      type: DataTypes.ENUM('org', 'member'),
      allowNull: false,
      defaultValue: 'org'
    },

    // Member runs only — the auth user being credentialed.
    userId: {
      type: DataTypes.UUID,
      allowNull: true
    },

    // Filled once the org exists (S1 for org runs; the target org for member runs).
    organizationId: {
      type: DataTypes.UUID,
      allowNull: true
    },

    status: {
      type: DataTypes.ENUM('in_progress', 'completed', 'failed', 'compensation_failed'),
      allowNull: false,
      defaultValue: 'in_progress'
    },

    // Last completed step id (e.g. 'S4') — the resume-forward cursor.
    cursor: {
      type: DataTypes.STRING,
      allowNull: true
    },

    // All created ids + flags (ownerUserCreated, caGroupCreated, intermediateCertId,
    // ownerCertId, tokenId, nexusGroupId, …). The compensation ledger.
    ids: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {}
    },

    // { step, code, message } on failure; augmented with compensation residue.
    error: {
      type: DataTypes.JSONB,
      allowNull: true
    }
  }, {
    tableName: 'provisioning_runs',
    schema: 'auth',
    timestamps: true,
    underscored: true,
    indexes: [
      // Postgres treats NULLs as distinct in a plain unique index, so the two
      // run kinds get separate partial-unique indexes rather than one composite.
      {
        name: 'provisioning_runs_org_key_uidx',
        unique: true,
        fields: ['idempotency_key'],
        where: { kind: 'org' }
      },
      {
        name: 'provisioning_runs_member_uidx',
        unique: true,
        fields: ['idempotency_key', 'user_id'],
        where: { kind: 'member' }
      },
      { name: 'provisioning_runs_organization_id_idx', fields: ['organization_id'] }
    ]
  });

  return ProvisioningRun;
};
