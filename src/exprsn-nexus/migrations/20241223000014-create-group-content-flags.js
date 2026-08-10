'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('group_content_flags', {
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
      flagger_id: {
        type: Sequelize.UUID,
        allowNull: false
      },
      content_type: {
        type: Sequelize.STRING(50),
        allowNull: false
      },
      content_id: {
        type: Sequelize.UUID,
        allowNull: false
      },
      flag_reason: {
        type: Sequelize.ENUM('spam', 'harassment', 'hate-speech', 'violence', 'misinformation', 'inappropriate', 'copyright', 'other'),
        allowNull: false
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      status: {
        type: Sequelize.ENUM('pending', 'under-review', 'resolved', 'dismissed'),
        defaultValue: 'pending'
      },
      action: {
        type: Sequelize.STRING(100),
        allowNull: true
      },
      resolution: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      resolved_by: {
        type: Sequelize.UUID,
        allowNull: true
      },
      resolved_at: {
        type: Sequelize.BIGINT,
        allowNull: true
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
    await queryInterface.addIndex('group_content_flags', ['group_id']);
    await queryInterface.addIndex('group_content_flags', ['flagger_id']);
    await queryInterface.addIndex('group_content_flags', ['content_type', 'content_id']);
    await queryInterface.addIndex('group_content_flags', ['status']);
    await queryInterface.addIndex('group_content_flags', ['group_id', 'status']);
    await queryInterface.addIndex('group_content_flags', ['flag_reason']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('group_content_flags');
  }
};
