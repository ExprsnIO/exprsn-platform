'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('group_moderation_cases', {
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
      case_type: {
        type: Sequelize.STRING(100),
        allowNull: false
      },
      severity: {
        type: Sequelize.ENUM('low', 'medium', 'high', 'critical'),
        defaultValue: 'medium'
      },
      priority: {
        type: Sequelize.INTEGER,
        defaultValue: 0
      },
      subject_type: {
        type: Sequelize.STRING(50),
        allowNull: false
      },
      subject_id: {
        type: Sequelize.UUID,
        allowNull: false
      },
      title: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      evidence: {
        type: Sequelize.JSONB,
        defaultValue: {}
      },
      flags: {
        type: Sequelize.ARRAY(Sequelize.UUID),
        defaultValue: []
      },
      status: {
        type: Sequelize.ENUM('open', 'under-review', 'resolved', 'closed'),
        defaultValue: 'open'
      },
      actions: {
        type: Sequelize.JSONB,
        defaultValue: []
      },
      resolution: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      assigned_to: {
        type: Sequelize.ARRAY(Sequelize.UUID),
        defaultValue: []
      },
      resolved_by: {
        type: Sequelize.UUID,
        allowNull: true
      },
      resolved_at: {
        type: Sequelize.BIGINT,
        allowNull: true
      },
      moderator_service_case_id: {
        type: Sequelize.STRING(255),
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
    await queryInterface.addIndex('group_moderation_cases', ['group_id']);
    await queryInterface.addIndex('group_moderation_cases', ['status']);
    await queryInterface.addIndex('group_moderation_cases', ['severity']);
    await queryInterface.addIndex('group_moderation_cases', ['priority']);
    await queryInterface.addIndex('group_moderation_cases', ['group_id', 'status']);
    await queryInterface.addIndex('group_moderation_cases', ['subject_type', 'subject_id']);
    await queryInterface.addIndex('group_moderation_cases', ['moderator_service_case_id']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('group_moderation_cases');
  }
};
