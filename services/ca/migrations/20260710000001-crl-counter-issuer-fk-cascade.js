'use strict';

/**
 * BUG-025 (TASK-024 follow-up): correct the ca.crl_counters → ca.certificates FK
 * to ON DELETE CASCADE.
 *
 * The enhanced db:check (TASK-024) found: the model intends CASCADE
 * (`Certificate.hasOne(CrlCounter)` — the owning side defaults to CASCADE on a
 * non-null FK), but the live FK is NO ACTION. Unlike the other BUG-025 items
 * (where the live value was correct and the model was aligned to it), here the
 * MODEL is correct: a crl_counter is a strict dependent of its issuing CA
 * certificate — an RFC 5280 monotonic per-issuer CRL number that is meaningless
 * once the issuer is gone. So it should die with the issuer, not block its
 * deletion (NO ACTION) or be orphaned. The DBA review flagged this for a live
 * migration rather than downgrading the model.
 *
 * Verified before writing: `crl_counters.issuer_id` is NOT NULL, references
 * `ca.certificates(id)`, currently ON DELETE NO ACTION, with 0 orphan rows — so
 * swapping to CASCADE is safe and affects only future issuer deletes.
 *
 * Idempotent (drop-if-exists then re-add) and reversible. Schema-qualified to
 * `ca` (STATUS.md #1). Sync-based db:migrate never ALTERs an existing table, so
 * apply by running up() directly against the ca Sequelize connection
 * (memory: db-migrate-cannot-add-columns).
 */

const SCHEMA = 'ca';
const TABLE = { tableName: 'crl_counters', schema: SCHEMA };
const FK = 'crl_counters_issuer_id_fkey';

module.exports = {
  up: async (queryInterface) => {
    await queryInterface.sequelize.query(
      `ALTER TABLE "${SCHEMA}"."crl_counters" DROP CONSTRAINT IF EXISTS "${FK}";`
    );
    await queryInterface.addConstraint(TABLE, {
      fields: ['issuer_id'],
      type: 'foreign key',
      name: FK,
      references: { table: { tableName: 'certificates', schema: SCHEMA }, field: 'id' },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    });
  },

  down: async (queryInterface) => {
    await queryInterface.sequelize.query(
      `ALTER TABLE "${SCHEMA}"."crl_counters" DROP CONSTRAINT IF EXISTS "${FK}";`
    );
    await queryInterface.addConstraint(TABLE, {
      fields: ['issuer_id'],
      type: 'foreign key',
      name: FK,
      references: { table: { tableName: 'certificates', schema: SCHEMA }, field: 'id' },
      onDelete: 'NO ACTION',
      onUpdate: 'NO ACTION',
    });
  },
};
