'use strict';

/**
 * FEAT-009 (DBA review): harden the spark.message_moderation side table.
 *
 * The sync-based `db:migrate` CREATES this brand-new table cleanly (no ALTER
 * trap — it did not exist before FEAT-009), so this migration is NOT how the
 * table comes into being. It exists to guarantee, independent of what `sync`
 * emits, the two DBA-mandated invariants sync does not reliably express:
 *
 *   1. FK message_id -> messages(id) ON DELETE CASCADE ON UPDATE CASCADE, with
 *      message_id NOT NULL. (Sequelize's `hasOne` default is ON DELETE SET NULL,
 *      which would force message_id nullable and leave orphan moderation rows —
 *      exactly the FEAT-031 file_moderation defect the DBA caught, BUG follow-up
 *      migration 20260710000001. The association here already declares CASCADE,
 *      but this migration makes it true regardless of how the table was built.)
 *
 *   2. The PARTIAL index on ("updatedAt") WHERE status='pending' — the reconcile
 *      sweep's access path.
 *
 * ⚠ SCHEMA-QUALIFIED (STATUS.md #1 public-leak): spark's Sequelize sets NO
 * searchPath, so every identifier is qualified to the `spark` schema — an
 * unqualified table name would land the ALTER against `public`.
 *
 * Idempotent + reversible. Applied by running up() directly against the spark
 * Sequelize connection (the documented ALTER path for this repo — spark's raw
 * migrate is not wired for model-side tables; memory `db-migrate-cannot-add-columns`).
 */

const SCHEMA = 'spark';
const TABLE = { tableName: 'message_moderation', schema: SCHEMA };
const FK = 'message_moderation_message_id_fkey';
const PARTIAL_IDX = 'message_moderation_pending_updated_idx';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Drop any orphan rows first so SET NOT NULL cannot fail (there should be none).
    await queryInterface.sequelize.query(
      `DELETE FROM "${SCHEMA}"."message_moderation" WHERE "message_id" IS NULL;`
    );

    // Drop whatever FK exists (SET NULL from a naive sync, or none) before re-adding.
    await queryInterface.sequelize.query(
      `ALTER TABLE "${SCHEMA}"."message_moderation" DROP CONSTRAINT IF EXISTS "${FK}";`
    );

    await queryInterface.changeColumn(TABLE, 'message_id', {
      type: Sequelize.UUID,
      allowNull: false,
    });

    await queryInterface.addConstraint(TABLE, {
      fields: ['message_id'],
      type: 'foreign key',
      name: FK,
      references: { table: { tableName: 'messages', schema: SCHEMA }, field: 'id' },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    });

    // Partial index for the reconcile sweep (idempotent; sync may already have it).
    await queryInterface.sequelize.query(
      `CREATE INDEX IF NOT EXISTS "${PARTIAL_IDX}" ` +
      `ON "${SCHEMA}"."message_moderation" ("updatedAt") WHERE "status" = 'pending';`
    );
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.sequelize.query(
      `DROP INDEX IF EXISTS "${SCHEMA}"."${PARTIAL_IDX}";`
    );
    await queryInterface.sequelize.query(
      `ALTER TABLE "${SCHEMA}"."message_moderation" DROP CONSTRAINT IF EXISTS "${FK}";`
    );
    await queryInterface.changeColumn(TABLE, 'message_id', {
      type: Sequelize.UUID,
      allowNull: true,
    });
    await queryInterface.addConstraint(TABLE, {
      fields: ['message_id'],
      type: 'foreign key',
      name: FK,
      references: { table: { tableName: 'messages', schema: SCHEMA }, field: 'id' },
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE',
    });
  },
};
