module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('audit_logs', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      action: {
        type: Sequelize.STRING(100),
        allowNull: false
      },
      resource_type: {
        type: Sequelize.STRING(50),
        allowNull: false
      },
      resource_id: {
        type: Sequelize.UUID,
        allowNull: true
      },
      resource_path: {
        type: Sequelize.STRING(500),
        allowNull: true
      },
      actor: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      actor_ip: {
        type: Sequelize.STRING(45),
        allowNull: true
      },
      token_id: {
        type: Sequelize.UUID,
        allowNull: true
      },
      success: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      error_message: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      metadata: {
        type: Sequelize.JSONB,
        defaultValue: {}
      },
      duration: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      request_id: {
        type: Sequelize.UUID,
        allowNull: true
      },
      user_agent: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      timestamp: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW
      }
    });

    // Add indexes
    await queryInterface.addIndex('audit_logs', ['resource_type', 'resource_id'], {
      name: 'audit_logs_resource_idx'
    });
    await queryInterface.addIndex('audit_logs', ['actor'], {
      name: 'audit_logs_actor_idx'
    });
    await queryInterface.addIndex('audit_logs', ['action'], {
      name: 'audit_logs_action_idx'
    });
    await queryInterface.addIndex('audit_logs', ['timestamp'], {
      name: 'audit_logs_timestamp_idx'
    });
    await queryInterface.addIndex('audit_logs', ['success'], {
      name: 'audit_logs_success_idx'
    });
    await queryInterface.addIndex('audit_logs', ['token_id'], {
      name: 'audit_logs_token_id_idx'
    });
    await queryInterface.addIndex('audit_logs', ['resource_path'], {
      name: 'audit_logs_resource_path_idx'
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('audit_logs');
  }
};
