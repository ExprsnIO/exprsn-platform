'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Add foreign key constraint for custom_role_id in group_memberships
    await queryInterface.addConstraint('group_memberships', {
      fields: ['custom_role_id'],
      type: 'foreign key',
      name: 'group_memberships_custom_role_id_fkey',
      references: {
        table: 'group_roles',
        field: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeConstraint(
      'group_memberships',
      'group_memberships_custom_role_id_fkey'
    );
  }
};
