module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('secrets', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      path: {
        type: Sequelize.STRING(500),
        allowNull: false,
        unique: true
      },
      key: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      encrypted_value: {
        type: Sequelize.TEXT,
        allowNull: false
      },
      encryption_key_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'encryption_keys',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },
      iv: {
        type: Sequelize.STRING(32),
        allowNull: false
      },
      auth_tag: {
        type: Sequelize.STRING(32),
        allowNull: false
      },
      version: {
        type: Sequelize.INTEGER,
        defaultValue: 1,
        allowNull: false
      },
      metadata: {
        type: Sequelize.JSONB,
        defaultValue: {}
      },
      rotation_policy: {
        type: Sequelize.JSONB,
        defaultValue: null
      },
      last_rotated_at: {
        type: Sequelize.DATE,
        defaultValue: null
      },
      expires_at: {
        type: Sequelize.DATE,
        defaultValue: null
      },
      created_by: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      updated_by: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      status: {
        type: Sequelize.ENUM('active', 'deprecated', 'deleted'),
        defaultValue: 'active',
        allowNull: false
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false
      },
      deleted_at: {
        type: Sequelize.DATE,
        allowNull: true
      }
    });

    // Add indexes
    await queryInterface.addIndex('secrets', ['path'], {
      name: 'secrets_path_idx',
      unique: true,
      where: { deleted_at: null }
    });
    await queryInterface.addIndex('secrets', ['encryption_key_id'], {
      name: 'secrets_encryption_key_id_idx'
    });
    await queryInterface.addIndex('secrets', ['status'], {
      name: 'secrets_status_idx'
    });
    await queryInterface.addIndex('secrets', ['created_at'], {
      name: 'secrets_created_at_idx'
    });
    await queryInterface.addIndex('secrets', ['expires_at'], {
      name: 'secrets_expires_at_idx'
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('secrets');
  }
};
