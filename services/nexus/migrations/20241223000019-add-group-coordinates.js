'use strict';

/**
 * Add geographic coordinates to groups so discovery can do real proximity
 * search (bounding-box prefilter + Haversine) instead of the previous
 * text-only location match. See groupDiscoveryService.findGroupsNearLocation.
 */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('groups', 'latitude', {
      type: Sequelize.DECIMAL(9, 6),
      allowNull: true
    });
    await queryInterface.addColumn('groups', 'longitude', {
      type: Sequelize.DECIMAL(9, 6),
      allowNull: true
    });
    await queryInterface.addIndex('groups', ['latitude', 'longitude'], {
      name: 'groups_latitude_longitude'
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeIndex('groups', 'groups_latitude_longitude');
    await queryInterface.removeColumn('groups', 'longitude');
    await queryInterface.removeColumn('groups', 'latitude');
  }
};
