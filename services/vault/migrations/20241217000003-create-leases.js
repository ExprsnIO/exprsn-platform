module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('leases', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      lease_id: {
        type: Sequelize.STRING(255),
        allowNull: false,
        unique: true
      },
      secret_type: {
        type: Sequelize.STRING(50),
        allowNull: false
      },
      secret_path: {
        type: Sequelize.STRING(500),
        allowNull: false
      },
      credential_data: {
        type: Sequelize.JSONB,
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
      ttl: {
        type: Sequelize.INTEGER,
        allowNull: false
      },
      renewable: {
        type: Sequelize.BOOLEAN,
        defaultValue: true,
        allowNull: false
      },
      max_ttl: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      renew_count: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        allowNull: false
      },
      last_renewed_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      expires_at: {
        type: Sequelize.DATE,
        allowNull: false
      },
      created_by: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      status: {
        type: Sequelize.ENUM('active', 'expired', 'revoked'),
        defaultValue: 'active',
        allowNull: false
      },
      metadata: {
        type: Sequelize.JSONB,
        defaultValue: {}
      },
      revoked_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      revoked_by: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false
      }
    });

    // Add indexes
    await queryInterface.addIndex('leases', ['lease_id'], {
      name: 'leases_lease_id_idx',
      unique: true
    });
    await queryInterface.addIndex('leases', ['secret_type'], {
      name: 'leases_secret_type_idx'
    });
    await queryInterface.addIndex('leases', ['status'], {
      name: 'leases_status_idx'
    });
    await queryInterface.addIndex('leases', ['expires_at'], {
      name: 'leases_expires_at_idx'
    });
    await queryInterface.addIndex('leases', ['created_by'], {
      name: 'leases_created_by_idx'
    });
    await queryInterface.addIndex('leases', ['secret_path'], {
      name: 'leases_secret_path_idx'
    });
    await queryInterface.addIndex('leases', ['encryption_key_id'], {
      name: 'leases_encryption_key_id_idx'
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('leases');
  }
};
