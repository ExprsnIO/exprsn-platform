'use strict';

/**
 * Migration: create provisioning_runs (FEAT-032 / ADR-0003 Decision 3)
 * ═══════════════════════════════════════════════════════════════════════
 * The org-provisioning saga idempotency ledger. One row per invocation, keyed
 * by the caller-supplied idempotency_key; `kind` discriminates a full org run
 * ('org') from a per-member credentialing run ('member').
 *
 * NEW table → safe under the sync-based `db:migrate` (it creates new tables).
 * This raw migration exists for the `db:migrate:raw` path and for parity;
 * schema-qualified to `auth` so it never lands in `public` (STATUS #1). Columns
 * are snake_case to match the model's `underscored: true`.
 *
 * Two partial-unique indexes (rather than one composite) because Postgres treats
 * NULLs as distinct in a plain unique index — the two run kinds are keyed
 * differently: org runs unique on (idempotency_key); member runs on
 * (idempotency_key, user_id).
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const table = { tableName: 'provisioning_runs', schema: 'auth' };

    await queryInterface.createTable(table, {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      idempotency_key: {
        type: Sequelize.STRING,
        allowNull: false
      },
      kind: {
        type: Sequelize.ENUM('org', 'member'),
        allowNull: false,
        defaultValue: 'org'
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: true
      },
      organization_id: {
        type: Sequelize.UUID,
        allowNull: true
      },
      status: {
        type: Sequelize.ENUM('in_progress', 'completed', 'failed', 'compensation_failed'),
        allowNull: false,
        defaultValue: 'in_progress'
      },
      cursor: {
        type: Sequelize.STRING,
        allowNull: true
      },
      ids: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {}
      },
      error: {
        type: Sequelize.JSONB,
        allowNull: true
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false
      }
    });

    await queryInterface.addIndex(table, ['idempotency_key'], {
      name: 'provisioning_runs_org_key_uidx',
      unique: true,
      where: { kind: 'org' }
    });
    await queryInterface.addIndex(table, ['idempotency_key', 'user_id'], {
      name: 'provisioning_runs_member_uidx',
      unique: true,
      where: { kind: 'member' }
    });
    await queryInterface.addIndex(table, ['organization_id'], {
      name: 'provisioning_runs_organization_id_idx'
    });
  },

  down: async (queryInterface) => {
    const table = { tableName: 'provisioning_runs', schema: 'auth' };
    await queryInterface.dropTable(table);
    // Drop the ENUM types the table's columns created (Postgres keeps them).
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "auth"."enum_provisioning_runs_kind";');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "auth"."enum_provisioning_runs_status";');
  }
};
