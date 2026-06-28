'use strict';

/**
 * Add group_id to posts for group-scoped (nexus) feeds.
 *
 * Schema-qualified to the `timeline` schema (STATUS.md #1 / CLAUDE.md) so the
 * raw migration path (`db:migrate:raw`) lands the column in the module schema
 * instead of leaking into `public`. The default sync path (`db:migrate`) derives
 * the same column + composite index directly from src/models/Post.js — keep the
 * two in agreement: column `group_id` (UUID, nullable) + index on
 * (group_id, createdAt) named `posts_group_id_created_at`.
 */
const POSTS = { tableName: 'posts', schema: 'timeline' };

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn(POSTS, 'group_id', {
      type: Sequelize.UUID,
      allowNull: true
    });

    await queryInterface.addIndex(POSTS, ['group_id', 'createdAt'], {
      name: 'posts_group_id_created_at'
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeIndex(POSTS, 'posts_group_id_created_at');
    await queryInterface.removeColumn(POSTS, 'group_id');
  }
};
