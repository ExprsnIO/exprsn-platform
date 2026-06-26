'use strict';

/**
 * Enforce the post-length cap at the database level.
 *
 * posts.content is Postgres TEXT (unbounded), so the column itself imposes no
 * limit — this CHECK is the hard ceiling. The app's configurable
 * MAX_POST_LENGTH (default 4000, see src/middleware/validation.js) must stay
 * <= this value; raising the app limit above 4000 without also raising this
 * constraint would cause inserts to fail at the DB.
 *
 * NOTE: the default migrator (`npm run db:migrate`, model sync) does NOT apply
 * DB-level CHECK constraints — they are only created by replaying this file
 * (`db:migrate:raw`) or by applying it manually. Keep this in sync with the app
 * limit.
 */
module.exports = {
  up: async (queryInterface) => {
    // Bare table name resolves to the module schema via the injected search_path.
    await queryInterface.sequelize.query(
      'ALTER TABLE posts ADD CONSTRAINT posts_content_maxlen CHECK (char_length(content) <= 4000)',
    );
  },

  down: async (queryInterface) => {
    await queryInterface.sequelize.query(
      'ALTER TABLE posts DROP CONSTRAINT IF EXISTS posts_content_maxlen',
    );
  },
};
