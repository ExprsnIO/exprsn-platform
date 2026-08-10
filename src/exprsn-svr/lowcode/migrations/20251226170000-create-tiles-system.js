/**
 * Migration: Create Tiles System
 *
 * Creates tables for managing application tiles/tools in the Business Hub.
 * Tiles represent the various designers and tools available in the low-code platform.
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Create tiles table
    await queryInterface.createTable('tiles', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      key: {
        type: Sequelize.STRING(100),
        allowNull: false,
        unique: true,
        comment: 'Unique identifier key for the tile (e.g., "entities", "forms", "workflows")',
      },
      name: {
        type: Sequelize.STRING(255),
        allowNull: false,
        comment: 'Display name of the tile',
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: false,
        comment: 'Description of the tile functionality',
      },
      icon: {
        type: Sequelize.STRING(100),
        allowNull: false,
        comment: 'Font Awesome icon class (e.g., "fas fa-database")',
      },
      icon_gradient: {
        type: Sequelize.STRING(255),
        allowNull: true,
        comment: 'CSS gradient for the icon background',
      },
      route: {
        type: Sequelize.STRING(500),
        allowNull: true,
        comment: 'Route/URL template for the tile (may contain placeholders like {appId})',
      },
      category: {
        type: Sequelize.ENUM('data', 'design', 'automation', 'integration', 'security', 'analytics', 'system'),
        allowNull: false,
        defaultValue: 'design',
        comment: 'Category for organizing tiles',
      },
      sort_order: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'Display order for tiles',
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment: 'Whether the tile is active and available',
      },
      is_new: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: 'Whether to show a "NEW" badge on the tile',
      },
      is_enhanced: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: 'Whether to show an "Enhanced" badge on the tile',
      },
      badge_text: {
        type: Sequelize.STRING(50),
        allowNull: true,
        comment: 'Custom badge text (e.g., "13 Features", "10 Datasources")',
      },
      badge_color: {
        type: Sequelize.ENUM('primary', 'success', 'warning', 'danger', 'info'),
        allowNull: false,
        defaultValue: 'success',
        comment: 'Badge color variant',
      },
      required_permissions: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: [],
        comment: 'Array of permission strings required to access this tile',
      },
      metadata: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {},
        comment: 'Additional metadata for the tile',
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
      },
    });

    // Add indexes for tiles
    await queryInterface.addIndex('tiles', ['key']);
    await queryInterface.addIndex('tiles', ['category']);
    await queryInterface.addIndex('tiles', ['sort_order']);
    await queryInterface.addIndex('tiles', ['is_active']);

    // Create application_tiles join table for per-application tile customization
    await queryInterface.createTable('application_tiles', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      application_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'applications',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      tile_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'tiles',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      is_enabled: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment: 'Whether this tile is enabled for this application',
      },
      custom_name: {
        type: Sequelize.STRING(255),
        allowNull: true,
        comment: 'Custom name override for this application',
      },
      custom_description: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Custom description override for this application',
      },
      custom_icon: {
        type: Sequelize.STRING(100),
        allowNull: true,
        comment: 'Custom icon override for this application',
      },
      sort_order: {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: 'Custom sort order for this application (overrides tile default)',
      },
      settings: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {},
        comment: 'Application-specific tile settings',
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
      },
    });

    // Add indexes for application_tiles
    await queryInterface.addIndex('application_tiles', ['application_id']);
    await queryInterface.addIndex('application_tiles', ['tile_id']);
    await queryInterface.addIndex('application_tiles', ['application_id', 'tile_id'], {
      unique: true,
      name: 'application_tiles_unique_constraint'
    });
    await queryInterface.addIndex('application_tiles', ['is_enabled']);

    console.log('✅ Tiles system tables created successfully');
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('application_tiles');
    await queryInterface.dropTable('tiles');
    console.log('✅ Tiles system tables dropped successfully');
  }
};
