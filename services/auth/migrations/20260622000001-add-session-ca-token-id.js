/**
 * ═══════════════════════════════════════════════════════════════════════
 * Migration: add ca_token_id to sessions (SP-6)
 * Auth Service - tie a session row to the revocable CA token minted at login.
 *
 * NOTE: the default platform migrate path is model-sync (`npm run db:migrate`),
 * which honors the camelCase `caTokenId` attribute on the Session model. This
 * raw migration exists for the `db:migrate:raw` path and uses snake_case to
 * match the sibling 20251222000008-create-sessions.js convention.
 * ═══════════════════════════════════════════════════════════════════════
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('sessions', 'ca_token_id', {
      type: Sequelize.STRING,
      allowNull: true
    });

    await queryInterface.addIndex('sessions', ['ca_token_id'], {
      name: 'sessions_ca_token_id_idx'
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeIndex('sessions', 'sessions_ca_token_id_idx');
    await queryInterface.removeColumn('sessions', 'ca_token_id');
  }
};
