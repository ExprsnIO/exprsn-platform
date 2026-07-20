'use strict';

/**
 * Add parent_id to comments for threaded / nested replies.
 *
 * Schema-qualified to the `timeline` schema (STATUS.md #1 / CLAUDE.md) so the
 * raw migration path (`db:migrate:raw`) lands the column in the module schema
 * instead of leaking into `public`. The default sync path (`db:migrate`) derives
 * the same column + index directly from src/models/Comment.js — keep the two in
 * agreement: column `parent_id` (UUID, nullable, self-FK to comments.id) + index
 * `comments_parent_id`.
 *
 * ON DELETE SET NULL: deletes are soft (the `deleted` flag), so hard deletes are
 * rare, but if a parent is ever hard-removed we orphan its replies to top-level
 * rather than cascade-losing the sub-thread.
 */
const COMMENTS = { tableName: 'comments', schema: 'timeline' };

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn(COMMENTS, 'parent_id', {
      type: Sequelize.UUID,
      allowNull: true,
      references: { model: COMMENTS, key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    });

    await queryInterface.addIndex(COMMENTS, ['parent_id'], {
      name: 'comments_parent_id'
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeIndex(COMMENTS, 'comments_parent_id');
    await queryInterface.removeColumn(COMMENTS, 'parent_id');
  }
};
