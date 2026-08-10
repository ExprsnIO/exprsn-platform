/**
 * Migration: Create app_settings table
 * Stores configuration variables and settings for Low-Code applications
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('app_settings', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      application_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'applications',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      key: {
        type: Sequelize.STRING(255),
        allowNull: false,
        comment: 'Setting key/name (e.g., "apiUrl", "maxUploadSize")'
      },
      display_name: {
        type: Sequelize.STRING(255),
        allowNull: false,
        comment: 'User-friendly name'
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Description of what this setting does'
      },
      category: {
        type: Sequelize.STRING(100),
        allowNull: false,
        defaultValue: 'general',
        comment: 'Setting category (general, api, database, ui, security, etc.)'
      },
      data_type: {
        type: Sequelize.ENUM(
          'string',
          'number',
          'boolean',
          'json',
          'array',
          'date',
          'datetime',
          'password',
          'url',
          'email',
          'color',
          'file'
        ),
        allowNull: false,
        defaultValue: 'string',
        comment: 'Data type of the setting value'
      },
      value: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Actual value (stored as string, parsed based on dataType)'
      },
      default_value: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Default value if not set'
      },
      is_user_customizable: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment: 'Can users modify this setting?'
      },
      is_system_setting: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: 'Is this a system-managed setting?'
      },
      is_required: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: 'Is this setting required?'
      },
      is_encrypted: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: 'Is the value encrypted? (for passwords, API keys, etc.)'
      },
      environment: {
        type: Sequelize.ENUM('all', 'development', 'staging', 'production'),
        allowNull: false,
        defaultValue: 'all',
        comment: 'Which environment this setting applies to'
      },
      validation_rules: {
        type: Sequelize.JSON,
        allowNull: true,
        comment: 'Validation rules (min, max, pattern, enum, etc.)'
      },
      metadata: {
        type: Sequelize.JSON,
        allowNull: true,
        comment: 'Additional metadata (options for select, format hints, etc.)'
      },
      sort_order: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'Display order'
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment: 'Is this setting currently active?'
      },
      created_by: {
        type: Sequelize.UUID,
        allowNull: true
      },
      updated_by: {
        type: Sequelize.UUID,
        allowNull: true
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    // Create indexes
    await queryInterface.addIndex('app_settings', ['application_id', 'key', 'environment'], {
      unique: true,
      name: 'app_settings_unique_key'
    });

    await queryInterface.addIndex('app_settings', ['application_id', 'category'], {
      name: 'app_settings_category_idx'
    });

    await queryInterface.addIndex('app_settings', ['is_system_setting'], {
      name: 'app_settings_system_idx'
    });

    await queryInterface.addIndex('app_settings', ['is_active'], {
      name: 'app_settings_active_idx'
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('app_settings');
  }
};
