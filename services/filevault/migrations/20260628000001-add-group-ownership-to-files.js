'use strict';

/**
 * Phase 3 (Galleries + shared files): add group ownership to files.
 *
 * Adds `owner_type` ('user' | 'group') and nullable `group_id` so a file can
 * belong to a nexus group instead of a single user, plus a composite index to
 * back group file/gallery listings.
 *
 * Schema-qualified ({ tableName, schema: 'filevault' }) so the columns land in
 * the module's `filevault` schema rather than `public` (STATUS.md #1).
 */
const TABLE = { tableName: 'files', schema: 'filevault' };

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn(TABLE, 'owner_type', {
      type: Sequelize.ENUM('user', 'group'),
      allowNull: false,
      defaultValue: 'user'
    });

    await queryInterface.addColumn(TABLE, 'group_id', {
      type: Sequelize.UUID,
      allowNull: true
    });

    await queryInterface.addIndex(TABLE, ['group_id', 'owner_type', 'is_deleted'], {
      name: 'files_group_id_owner_type_is_deleted'
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeIndex(TABLE, 'files_group_id_owner_type_is_deleted');
    await queryInterface.removeColumn(TABLE, 'group_id');
    await queryInterface.removeColumn(TABLE, 'owner_type');
    // Drop the ENUM type left behind by removeColumn (Postgres).
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "filevault"."enum_files_owner_type";');
  }
};
