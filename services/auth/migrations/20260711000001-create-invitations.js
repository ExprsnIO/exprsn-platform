'use strict';

/**
 * Migration: create invitations (FEAT-034)
 * ═══════════════════════════════════════════════════════════════════════
 * Single-use invite / activation tokens. The raw token is emailed once and
 * never stored — only its sha256 hash lives in `tokenHash`. Tokens are
 * single-use, expiring (`expiresAt`, epoch-ms), and superseded on re-invite.
 *
 * NEW table → safe under the sync-based `db:migrate` (it creates new tables).
 * This raw migration exists for the `db:migrate:raw` path and for parity;
 * schema-qualified to `auth` so it never lands in `public` (STATUS #1).
 *
 * Column casing mirrors the Invitation model, which is NOT `underscored`
 * (unlike ProvisioningRun) — so the sync path and this raw path produce the
 * SAME camelCase columns and `db:check` stays clean under either.
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const table = { tableName: 'invitations', schema: 'auth' };

    await queryInterface.createTable(table, {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      tokenHash: {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true
      },
      email: {
        type: Sequelize.STRING,
        allowNull: false
      },
      kind: {
        type: Sequelize.ENUM('invite', 'activation'),
        allowNull: false,
        defaultValue: 'invite'
      },
      status: {
        type: Sequelize.ENUM('pending', 'accepted', 'revoked', 'expired'),
        allowNull: false,
        defaultValue: 'pending'
      },
      organizationId: {
        type: Sequelize.UUID,
        allowNull: true
      },
      role: {
        type: Sequelize.ENUM('owner', 'admin', 'member', 'guest'),
        allowNull: true,
        defaultValue: 'member'
      },
      invitedBy: {
        type: Sequelize.UUID,
        allowNull: true
      },
      userId: {
        type: Sequelize.UUID,
        allowNull: true
      },
      expiresAt: {
        type: Sequelize.BIGINT,
        allowNull: false
      },
      acceptedAt: {
        type: Sequelize.BIGINT,
        allowNull: true
      },
      revokedAt: {
        type: Sequelize.BIGINT,
        allowNull: true
      },
      metadata: {
        type: Sequelize.JSON,
        allowNull: false,
        defaultValue: {}
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false
      }
    });

    await queryInterface.addIndex(table, ['tokenHash'], {
      name: 'invitations_token_hash_uidx',
      unique: true
    });
    await queryInterface.addIndex(table, ['email'], { name: 'invitations_email_idx' });
    await queryInterface.addIndex(table, ['organizationId'], { name: 'invitations_organization_id_idx' });
    await queryInterface.addIndex(table, ['status'], { name: 'invitations_status_idx' });
    await queryInterface.addIndex(table, ['expiresAt'], { name: 'invitations_expires_at_idx' });
  },

  down: async (queryInterface) => {
    const table = { tableName: 'invitations', schema: 'auth' };
    await queryInterface.dropTable(table);
    // Drop the ENUM types the table's columns created (Postgres keeps them).
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "auth"."enum_invitations_kind";');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "auth"."enum_invitations_status";');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "auth"."enum_invitations_role";');
  }
};
