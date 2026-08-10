module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('posts', 'bluesky_uri', {
      type: Sequelize.STRING(512),
      allowNull: true
    });

    await queryInterface.addColumn('posts', 'bluesky_did', {
      type: Sequelize.STRING(255),
      allowNull: true
    });

    await queryInterface.addColumn('posts', 'bluesky_rkey', {
      type: Sequelize.STRING(255),
      allowNull: true
    });

    await queryInterface.addColumn('posts', 'synced_to_bluesky', {
      type: Sequelize.BOOLEAN,
      defaultValue: false
    });

    // Add indexes
    await queryInterface.addIndex('posts', ['bluesky_uri']);
    await queryInterface.addIndex('posts', ['bluesky_did']);
    await queryInterface.addIndex('posts', ['synced_to_bluesky']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeIndex('posts', ['bluesky_uri']);
    await queryInterface.removeIndex('posts', ['bluesky_did']);
    await queryInterface.removeIndex('posts', ['synced_to_bluesky']);

    await queryInterface.removeColumn('posts', 'bluesky_uri');
    await queryInterface.removeColumn('posts', 'bluesky_did');
    await queryInterface.removeColumn('posts', 'bluesky_rkey');
    await queryInterface.removeColumn('posts', 'synced_to_bluesky');
  }
};
