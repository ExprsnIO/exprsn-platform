'use strict';

/**
 * BUG-025 (TASK-024 follow-up): correct the file_versions → files and
 * share_links → files FKs. Same defect and same fix as file_moderation
 * (migration 20260710000001).
 *
 * Both tables were created by the sync-based `db:migrate`, and Sequelize's
 * default for the `File.hasMany(...)` associations is `ON DELETE SET NULL`. That
 * silently (a) forced `file_id` NULLABLE, contradicting each model's
 * `allowNull: false`, and (b) would ORPHAN rows (file_id NULL) on a hard
 * file delete/purge — a version or share link pointing at nothing. The enhanced
 * `db:check` (TASK-024) surfaced both as nullability drift.
 *
 * A version/share-link is a proper dependent of its file: it should die with the
 * file, not be orphaned. So `file_id` becomes NOT NULL and the FK becomes
 * ON DELETE CASCADE. Note FileVault uses SOFT delete (`isDeleted`); the cascade
 * only fires on a genuine hard delete/purge, exactly when these rows should go.
 *
 * Idempotent and reversible. Schema-qualified to `filevault` (STATUS.md #1). The
 * raw migrate path is not wired for filevault, so this is applied by running
 * up() directly against the filevault Sequelize connection — the documented
 * ALTER path for this repo (memory: db-migrate-cannot-add-columns).
 */

const SCHEMA = 'filevault';

const TABLES = [
  { tableName: 'file_versions', fk: 'file_versions_file_id_fkey' },
  { tableName: 'share_links', fk: 'share_links_file_id_fkey' },
];

module.exports = {
  up: async (queryInterface, Sequelize) => {
    for (const { tableName, fk } of TABLES) {
      const table = { tableName, schema: SCHEMA };
      // There should be no NULL rows; clear any so SET NOT NULL cannot fail.
      await queryInterface.sequelize.query(
        `DELETE FROM "${SCHEMA}"."${tableName}" WHERE "file_id" IS NULL;`
      );
      // Drop whatever FK exists (SET NULL from sync, or none) before re-adding.
      await queryInterface.sequelize.query(
        `ALTER TABLE "${SCHEMA}"."${tableName}" DROP CONSTRAINT IF EXISTS "${fk}";`
      );
      await queryInterface.changeColumn(table, 'file_id', {
        type: Sequelize.UUID,
        allowNull: false,
      });
      await queryInterface.addConstraint(table, {
        fields: ['file_id'],
        type: 'foreign key',
        name: fk,
        references: { table: { tableName: 'files', schema: SCHEMA }, field: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      });
    }
  },

  down: async (queryInterface, Sequelize) => {
    for (const { tableName, fk } of TABLES) {
      const table = { tableName, schema: SCHEMA };
      await queryInterface.sequelize.query(
        `ALTER TABLE "${SCHEMA}"."${tableName}" DROP CONSTRAINT IF EXISTS "${fk}";`
      );
      await queryInterface.changeColumn(table, 'file_id', {
        type: Sequelize.UUID,
        allowNull: true,
      });
      await queryInterface.addConstraint(table, {
        fields: ['file_id'],
        type: 'foreign key',
        name: fk,
        references: { table: { tableName: 'files', schema: SCHEMA }, field: 'id' },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
      });
    }
  },
};
