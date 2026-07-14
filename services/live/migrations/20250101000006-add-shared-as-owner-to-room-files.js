/**
 * Migration: add shared_as_owner to room_files (FEAT-061 — capability provenance; fixes BUG-027)
 *
 * A room file share is a durable capability. Until now it recorded only WHAT was
 * shared and BY WHOM — not whether the sharer was the file's owner. Without that,
 * the download path could not distinguish two cases that must behave differently
 * once the owner flips the file to `private`:
 *
 *   - the OWNER shared their own file into the room  -> keep serving (the flow the
 *     visibility-skip was deliberately built to protect)
 *   - a NON-owner shared a then-public file          -> stop serving on private-flip
 *
 * So `downloadFileStreamForMember` skipped the visibility check entirely, which is
 * BUG-027: a non-owner's share kept serving after the owner made the file private.
 * This column is the per-share provenance that lets the check be reinstated without
 * breaking the owner-share flow.
 *
 * BACKFILL IS LOAD-BEARING. Defaulting existing rows to `false` would revoke access
 * to every file an owner had legitimately shared into a room — a silent regression.
 * The UPDATE below derives the true value by joining back to filevault.files:
 * shared_as_owner = (the sharer WAS the file's owner at share time). Rows we cannot
 * resolve (legacy `ephemeral` rows with no file_id) stay false, which is correct —
 * they are not FileVault-backed and are not subject to the visibility check.
 *
 * Schema-qualified: live tables live in the `live` schema, files in `filevault`.
 * DB_SCHEMA is injected by scripts/migrate-modules.js (db:migrate:raw); the default
 * db:migrate path syncs models and will NOT add a column to an existing table — so
 * this migration must be run for the column to exist.
 */

const SCHEMA = process.env.DB_SCHEMA || 'live';
const FILEVAULT_SCHEMA = process.env.FILEVAULT_DB_SCHEMA || 'filevault';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn(
      { tableName: 'room_files', schema: SCHEMA },
      'shared_as_owner',
      {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment:
          'True when the sharer was the file owner at share time. Governs whether the share survives the owner flipping the file to private (FEAT-061 / BUG-027).'
      }
    );

    // Backfill from the real ownership relation — see the note above on why a
    // blanket `false` would be a regression rather than a safe default.
    await queryInterface.sequelize.query(`
      UPDATE "${SCHEMA}"."room_files" rf
         SET shared_as_owner = true
        FROM "${FILEVAULT_SCHEMA}"."files" f
       WHERE rf.file_id = f.id
         AND rf.kind = 'vault'
         AND rf.user_id = f.user_id
    `);

    await queryInterface.addIndex(
      { tableName: 'room_files', schema: SCHEMA },
      ['room_id', 'shared_as_owner'],
      { name: 'room_files_room_id_shared_as_owner' }
    );
  },

  down: async (queryInterface) => {
    await queryInterface.removeIndex(
      { tableName: 'room_files', schema: SCHEMA },
      'room_files_room_id_shared_as_owner'
    );
    await queryInterface.removeColumn(
      { tableName: 'room_files', schema: SCHEMA },
      'shared_as_owner'
    );
  }
};
