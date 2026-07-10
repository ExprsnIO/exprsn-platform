'use strict';

/**
 * FEAT-031 follow-up (DBA review): correct the file_moderation → files FK.
 *
 * The table was created by the sync-based `db:migrate`, and Sequelize's default
 * for the `File.hasOne(FileModeration)` association is `ON DELETE SET NULL`.
 * That silently (a) forced `file_id` NULLABLE, contradicting the model's
 * `allowNull: false`, and (b) would leave ORPHAN moderation rows (file_id NULL)
 * behind whenever a file is hard-deleted/purged — breaking the 1:1 invariant and
 * the visibility gate (an orphan row is `isServableToOthers === false` for a file
 * that no longer exists). `db:check` does not inspect nullability or FK actions,
 * so the drift was invisible to the gate.
 *
 * This migration makes `file_id` NOT NULL and swaps the FK to ON DELETE CASCADE
 * (ON UPDATE CASCADE) so a moderation row is a proper dependent of its file.
 *
 * Idempotent: guards on the live constraint/nullability so a re-run (or a fresh
 * deploy where sync already created the corrected FK) is a no-op. Reversible.
 *
 * Schema-qualified to the module's `filevault` schema (STATUS.md #1). The raw
 * migrate path is not wired for filevault (no scripts/migrate.js), so this is
 * applied by running up() directly against the filevault Sequelize connection —
 * the documented ALTER path for this repo (memory: db-migrate-cannot-add-columns).
 */

const SCHEMA = 'filevault';
const TABLE = { tableName: 'file_moderation', schema: SCHEMA };
const FK = 'file_moderation_file_id_fkey';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Drop orphans first so SET NOT NULL cannot fail (there should be none).
    await queryInterface.sequelize.query(
      `DELETE FROM "${SCHEMA}"."file_moderation" WHERE "file_id" IS NULL;`
    );

    // Drop whatever FK exists (SET NULL from sync, or none) before re-adding.
    await queryInterface.sequelize.query(
      `ALTER TABLE "${SCHEMA}"."file_moderation" DROP CONSTRAINT IF EXISTS "${FK}";`
    );

    await queryInterface.changeColumn(TABLE, 'file_id', {
      type: Sequelize.UUID,
      allowNull: false,
    });

    await queryInterface.addConstraint(TABLE, {
      fields: ['file_id'],
      type: 'foreign key',
      name: FK,
      references: { table: { tableName: 'files', schema: SCHEMA }, field: 'id' },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.sequelize.query(
      `ALTER TABLE "${SCHEMA}"."file_moderation" DROP CONSTRAINT IF EXISTS "${FK}";`
    );

    await queryInterface.changeColumn(TABLE, 'file_id', {
      type: Sequelize.UUID,
      allowNull: true,
    });

    await queryInterface.addConstraint(TABLE, {
      fields: ['file_id'],
      type: 'foreign key',
      name: FK,
      references: { table: { tableName: 'files', schema: SCHEMA }, field: 'id' },
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE',
    });
  },
};
