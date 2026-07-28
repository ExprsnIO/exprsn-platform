'use strict';

/**
 * FEAT-009 (DBA review): correct the post_moderation → posts FK and guarantee the
 * reconcile partial index.
 *
 * `timeline.post_moderation` is created by the sync-based `db:migrate` from
 * src/models/PostModeration.js. Two things sync gets wrong / cannot guarantee,
 * exactly as with FEAT-031's file_moderation (filevault migration 20260710000001):
 *
 *   1. Sequelize's default for `Post.hasOne(PostModeration)` is ON DELETE SET
 *      NULL, regardless of the CASCADE declared in associate(). That silently
 *      (a) forces `post_id` NULLABLE, contradicting the model's allowNull:false,
 *      and (b) leaves ORPHAN moderation rows behind when a post is hard-deleted,
 *      breaking the 1:1 invariant. `db:check` inspects neither nullability nor FK
 *      actions, so the drift is invisible.
 *   2. The partial reconcile index (`... ("updatedAt") WHERE status='pending'`)
 *      is ensured here idempotently so the reconcile sweep never table-scans,
 *      even on a deploy where the model-sync path missed the WHERE clause.
 *
 * Idempotent + reversible. Schema-qualified to the `timeline` schema (STATUS.md
 * #1). Timeline has no raw-migrate wiring, so this is applied by running up()
 * directly against the timeline Sequelize connection — the documented ALTER path
 * for this repo (memory: db-migrate-cannot-add-columns).
 */

const SCHEMA = 'timeline';
const TABLE = { tableName: 'post_moderation', schema: SCHEMA };
const FK = 'post_moderation_post_id_fkey';
const PARTIAL_IDX = 'post_moderation_pending_updated_at';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Drop orphans first so SET NOT NULL cannot fail (there should be none).
    await queryInterface.sequelize.query(
      `DELETE FROM "${SCHEMA}"."post_moderation" WHERE "post_id" IS NULL;`
    );

    // Drop whatever FK sync created (SET NULL, or none) before re-adding.
    await queryInterface.sequelize.query(
      `ALTER TABLE "${SCHEMA}"."post_moderation" DROP CONSTRAINT IF EXISTS "${FK}";`
    );

    // BUG-062: repeated create-era runs left Postgres-suffixed duplicates of the
    // same FK ("..._fkey1" … "..._fkey5") on the live dev DB. Drop every extra
    // post_id FK so exactly one canonical constraint (re-added below) remains.
    await queryInterface.sequelize.query(`
      DO $$
      DECLARE c record;
      BEGIN
        FOR c IN
          SELECT conname FROM pg_constraint
          WHERE conrelid = '"${SCHEMA}"."post_moderation"'::regclass
            AND contype = 'f' AND conname LIKE '${FK}%'
        LOOP
          EXECUTE format('ALTER TABLE "${SCHEMA}"."post_moderation" DROP CONSTRAINT %I', c.conname);
        END LOOP;
      END $$;
    `);

    await queryInterface.changeColumn(TABLE, 'post_id', {
      type: Sequelize.UUID,
      allowNull: false,
    });

    await queryInterface.addConstraint(TABLE, {
      fields: ['post_id'],
      type: 'foreign key',
      name: FK,
      references: { table: { tableName: 'posts', schema: SCHEMA }, field: 'id' },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    });

    // Ensure the reconcile partial index (idempotent).
    await queryInterface.sequelize.query(
      `CREATE INDEX IF NOT EXISTS "${PARTIAL_IDX}" ON "${SCHEMA}"."post_moderation" ("updatedAt") WHERE "status" = 'pending';`
    );
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.sequelize.query(
      `DROP INDEX IF EXISTS "${SCHEMA}"."${PARTIAL_IDX}";`
    );

    await queryInterface.sequelize.query(
      `ALTER TABLE "${SCHEMA}"."post_moderation" DROP CONSTRAINT IF EXISTS "${FK}";`
    );

    await queryInterface.changeColumn(TABLE, 'post_id', {
      type: Sequelize.UUID,
      allowNull: true,
    });

    await queryInterface.addConstraint(TABLE, {
      fields: ['post_id'],
      type: 'foreign key',
      name: FK,
      references: { table: { tableName: 'posts', schema: SCHEMA }, field: 'id' },
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE',
    });
  },
};
