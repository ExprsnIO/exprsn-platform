'use strict';

/**
 * Migration: Add Audit Log Hash Chain Columns
 * ═══════════════════════════════════════════════════════════════════════
 * Adds prev_hash / entry_hash columns used for tamper-evident
 * hash chaining of audit log entries (SHA-256).
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('audit_logs', 'prev_hash', {
      type: Sequelize.STRING(64),
      allowNull: true,
      comment: 'entry_hash of the previous audit log row (hash chain)'
    });

    await queryInterface.addColumn('audit_logs', 'entry_hash', {
      type: Sequelize.STRING(64),
      allowNull: true,
      comment: 'SHA-256 over the canonical entry content + prev_hash'
    });

    await queryInterface.addIndex('audit_logs', ['entry_hash'], {
      name: 'audit_logs_entry_hash_idx'
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeIndex('audit_logs', 'audit_logs_entry_hash_idx');
    await queryInterface.removeColumn('audit_logs', 'entry_hash');
    await queryInterface.removeColumn('audit_logs', 'prev_hash');
  }
};
