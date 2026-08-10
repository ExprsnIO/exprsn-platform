'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('group_invites', {
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
      user_id: {
        type: Sequelize.UUID,
        allowNull: true
      },
      inviter_id: {
        type: Sequelize.UUID,
        allowNull: false
      },
      invite_code: {
        type: Sequelize.STRING(100),
        allowNull: false,
        unique: true
      },
      message: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      status: {
        type: Sequelize.ENUM('pending', 'accepted', 'expired', 'revoked'),
        defaultValue: 'pending'
      },
      max_uses: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      use_count: {
        type: Sequelize.INTEGER,
        defaultValue: 0
      },
      created_at: {
        type: Sequelize.BIGINT,
        allowNull: false
      },
      expires_at: {
        type: Sequelize.BIGINT,
        allowNull: true
      },
      accepted_at: {
        type: Sequelize.BIGINT,
        allowNull: true
      }
    });

    // Add indexes
    await queryInterface.addIndex('group_invites', ['group_id']);
    await queryInterface.addIndex('group_invites', ['user_id']);
    await queryInterface.addIndex('group_invites', ['inviter_id']);
    await queryInterface.addIndex('group_invites', ['invite_code'], { unique: true });
    await queryInterface.addIndex('group_invites', ['status']);
    await queryInterface.addIndex('group_invites', ['expires_at']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('group_invites');
  }
};
