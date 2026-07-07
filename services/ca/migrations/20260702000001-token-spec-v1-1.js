'use strict';

/**
 * Migration: Token Specification v1.1
 * ═══════════════════════════════════════════════════════════════════════
 * - tokens.group_id / tokens.organization_id — optional scoping to a CA
 *   directory group / organization (org = group of type organizational_unit
 *   or department); admins of the scope may invalidate the token.
 * - tokens.revoked_by — the principal who revoked the token (null = system,
 *   e.g. the certificate revocation cascade).
 * - "UserGroups".role — per-membership role (member/admin/owner) that makes
 *   a user an admin of a group/organization.
 *
 * Note (platform): the sync-based `db:migrate` creates new tables but never
 * ALTERs existing ones — run this migration's up() directly against the DB
 * (see scripts or docs) when deploying.
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const table = { tableName: 'tokens', schema: 'ca' };
    const userGroups = { tableName: 'UserGroups', schema: 'ca' };

    const tokenColumns = await queryInterface.describeTable(table);

    if (!tokenColumns.group_id) {
      await queryInterface.addColumn(table, 'group_id', {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: { tableName: 'groups', schema: 'ca' },
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      });
      await queryInterface.addIndex(table, ['group_id'], {
        name: 'tokens_group_id_idx'
      });
    }

    if (!tokenColumns.organization_id) {
      await queryInterface.addColumn(table, 'organization_id', {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: { tableName: 'groups', schema: 'ca' },
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      });
      await queryInterface.addIndex(table, ['organization_id'], {
        name: 'tokens_organization_id_idx'
      });
    }

    if (!tokenColumns.revoked_by) {
      await queryInterface.addColumn(table, 'revoked_by', {
        type: Sequelize.UUID,
        allowNull: true
      });
    }

    const userGroupColumns = await queryInterface.describeTable(userGroups);
    if (!userGroupColumns.role) {
      await queryInterface.addColumn(userGroups, 'role', {
        type: Sequelize.ENUM('member', 'admin', 'owner'),
        allowNull: false,
        defaultValue: 'member'
      });
      await queryInterface.addIndex(userGroups, ['role'], {
        name: 'user_groups_role_idx'
      });
    }
  },

  down: async (queryInterface, Sequelize) => {
    const table = { tableName: 'tokens', schema: 'ca' };
    const userGroups = { tableName: 'UserGroups', schema: 'ca' };

    await queryInterface.removeColumn(table, 'group_id');
    await queryInterface.removeColumn(table, 'organization_id');
    await queryInterface.removeColumn(table, 'revoked_by');
    await queryInterface.removeColumn(userGroups, 'role');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "ca"."enum_UserGroups_role";');
  }
};
