'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('group_roles', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      group_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'groups',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      name: {
        type: Sequelize.STRING(100),
        allowNull: false
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      permissions: {
        type: Sequelize.JSONB,
        defaultValue: {}
      },
      color: {
        type: Sequelize.STRING(7),
        allowNull: true
      },
      priority: {
        type: Sequelize.INTEGER,
        defaultValue: 0
      },
      is_default: {
        type: Sequelize.BOOLEAN,
        defaultValue: false
      },
      is_mentionable: {
        type: Sequelize.BOOLEAN,
        defaultValue: true
      },
      created_at: {
        type: Sequelize.BIGINT,
        allowNull: false
      },
      updated_at: {
        type: Sequelize.BIGINT,
        allowNull: false
      }
    });

    // Add indexes
    await queryInterface.addIndex('group_roles', ['group_id']);
    await queryInterface.addIndex('group_roles', ['group_id', 'name'], { unique: true });
    await queryInterface.addIndex('group_roles', ['priority']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('group_roles');
  }
};
