module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('encryption_keys', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      name: {
        type: Sequelize.STRING(255),
        allowNull: false,
        unique: true
      },
      algorithm: {
        type: Sequelize.STRING(50),
        allowNull: false,
        defaultValue: 'AES-256-GCM'
      },
      encrypted_key: {
        type: Sequelize.TEXT,
        allowNull: false
      },
      key_derivation: {
        type: Sequelize.JSONB,
        defaultValue: {}
      },
      version: {
        type: Sequelize.INTEGER,
        defaultValue: 1,
        allowNull: false
      },
      purpose: {
        type: Sequelize.STRING(100),
        allowNull: false,
        defaultValue: 'general'
      },
      rotation_schedule: {
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
      status: {
        type: Sequelize.ENUM('active', 'rotating', 'deprecated', 'revoked'),
        defaultValue: 'active',
        allowNull: false
      },
      metadata: {
        type: Sequelize.JSONB,
        defaultValue: {}
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
    await queryInterface.addIndex('encryption_keys', ['name'], {
      name: 'encryption_keys_name_idx',
      unique: true,
      where: { deleted_at: null }
    });
    await queryInterface.addIndex('encryption_keys', ['status'], {
      name: 'encryption_keys_status_idx'
    });
    await queryInterface.addIndex('encryption_keys', ['purpose'], {
      name: 'encryption_keys_purpose_idx'
    });
    await queryInterface.addIndex('encryption_keys', ['expires_at'], {
      name: 'encryption_keys_expires_at_idx'
    });
    await queryInterface.addIndex('encryption_keys', ['created_at'], {
      name: 'encryption_keys_created_at_idx'
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('encryption_keys');
  }
};
