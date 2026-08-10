/**
 * ═══════════════════════════════════════════════════════════
 * HTML App Builder - Database Migration
 * Creates tables for HTML application projects, files, versions,
 * components, libraries, and collaboration
 * ═══════════════════════════════════════════════════════════
 */

'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // ═══════════════════════════════════════════════════════════
    // HTML Projects - Top-level container for HTML applications
    // ═══════════════════════════════════════════════════════════
    await queryInterface.createTable('html_projects', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      application_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'applications', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
        comment: 'Optional link to Low-Code application'
      },
      name: {
        type: Sequelize.STRING(200),
        allowNull: false,
        comment: 'Project name'
      },
      slug: {
        type: Sequelize.STRING(200),
        allowNull: false,
        unique: true,
        comment: 'URL-friendly identifier'
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      owner_id: {
        type: Sequelize.UUID,
        allowNull: false,
        comment: 'User who created the project'
      },
      organization_id: {
        type: Sequelize.UUID,
        allowNull: true,
        comment: 'Organization that owns this project'
      },
      status: {
        type: Sequelize.ENUM('draft', 'development', 'staging', 'production', 'archived'),
        defaultValue: 'draft',
        allowNull: false
      },
      settings: {
        type: Sequelize.JSONB,
        defaultValue: {},
        comment: 'Project settings (default libraries, theme, etc)'
      },
      metadata: {
        type: Sequelize.JSONB,
        defaultValue: {},
        comment: 'Additional metadata'
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

    await queryInterface.addIndex('html_projects', ['owner_id']);
    await queryInterface.addIndex('html_projects', ['organization_id']);
    await queryInterface.addIndex('html_projects', ['application_id']);
    await queryInterface.addIndex('html_projects', ['slug']);
    await queryInterface.addIndex('html_projects', ['status']);

    // ═══════════════════════════════════════════════════════════
    // HTML Files - Individual files (HTML, CSS, JS, assets)
    // ═══════════════════════════════════════════════════════════
    await queryInterface.createTable('html_files', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      project_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'html_projects', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      parent_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'html_files', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
        comment: 'Parent folder (null for root files)'
      },
      name: {
        type: Sequelize.STRING(255),
        allowNull: false,
        comment: 'File or folder name'
      },
      path: {
        type: Sequelize.TEXT,
        allowNull: false,
        comment: 'Full path from project root'
      },
      type: {
        type: Sequelize.ENUM('folder', 'html', 'css', 'javascript', 'json', 'image', 'font', 'other'),
        allowNull: false,
        defaultValue: 'html'
      },
      content: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'File content (null for folders and binary files)'
      },
      content_type: {
        type: Sequelize.STRING(100),
        allowNull: true,
        comment: 'MIME type'
      },
      size: {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: 'File size in bytes'
      },
      storage_path: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Path to file in storage (for binary files)'
      },
      is_entry_point: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
        comment: 'Is this the main entry HTML file?'
      },
      order: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        comment: 'Display order in file tree'
      },
      metadata: {
        type: Sequelize.JSONB,
        defaultValue: {},
        comment: 'File metadata (dependencies, etc)'
      },
      created_by: {
        type: Sequelize.UUID,
        allowNull: false
      },
      updated_by: {
        type: Sequelize.UUID,
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

    await queryInterface.addIndex('html_files', ['project_id']);
    await queryInterface.addIndex('html_files', ['parent_id']);
    await queryInterface.addIndex('html_files', ['type']);
    await queryInterface.addIndex('html_files', ['path']);
    await queryInterface.addIndex('html_files', ['is_entry_point']);
    await queryInterface.addIndex('html_files', ['project_id', 'path'], { unique: true });

    // ═══════════════════════════════════════════════════════════
    // HTML File Versions - Version control for files
    // ═══════════════════════════════════════════════════════════
    await queryInterface.createTable('html_file_versions', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      file_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'html_files', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      version_number: {
        type: Sequelize.INTEGER,
        allowNull: false,
        comment: 'Incremental version number'
      },
      content: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Snapshot of file content'
      },
      storage_path: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Path to versioned file in storage'
      },
      change_description: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Description of changes'
      },
      created_by: {
        type: Sequelize.UUID,
        allowNull: false
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false
      }
    });

    await queryInterface.addIndex('html_file_versions', ['file_id']);
    await queryInterface.addIndex('html_file_versions', ['file_id', 'version_number'], { unique: true });
    await queryInterface.addIndex('html_file_versions', ['created_at']);

    // ═══════════════════════════════════════════════════════════
    // HTML Components - Reusable UI components/widgets
    // ═══════════════════════════════════════════════════════════
    await queryInterface.createTable('html_components', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      name: {
        type: Sequelize.STRING(200),
        allowNull: false,
        comment: 'Component name'
      },
      slug: {
        type: Sequelize.STRING(200),
        allowNull: false,
        unique: true
      },
      category: {
        type: Sequelize.STRING(100),
        allowNull: false,
        comment: 'Component category (layout, forms, data, etc)'
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      html_template: {
        type: Sequelize.TEXT,
        allowNull: false,
        comment: 'HTML template with placeholders'
      },
      css: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Component-specific CSS'
      },
      javascript: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Component-specific JavaScript'
      },
      properties: {
        type: Sequelize.JSONB,
        defaultValue: [],
        comment: 'Configurable properties schema'
      },
      dependencies: {
        type: Sequelize.JSONB,
        defaultValue: [],
        comment: 'Required libraries/components'
      },
      icon: {
        type: Sequelize.STRING(100),
        allowNull: true,
        comment: 'Icon class or URL'
      },
      is_public: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
        comment: 'Available in component marketplace'
      },
      is_system: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
        comment: 'Built-in system component'
      },
      author_id: {
        type: Sequelize.UUID,
        allowNull: false
      },
      organization_id: {
        type: Sequelize.UUID,
        allowNull: true,
        comment: 'Organization that owns this component'
      },
      version: {
        type: Sequelize.STRING(20),
        defaultValue: '1.0.0',
        allowNull: false
      },
      downloads: {
        type: Sequelize.INTEGER,
        defaultValue: 0
      },
      rating: {
        type: Sequelize.DECIMAL(3, 2),
        defaultValue: 0.00
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
      }
    });

    await queryInterface.addIndex('html_components', ['category']);
    await queryInterface.addIndex('html_components', ['is_public']);
    await queryInterface.addIndex('html_components', ['is_system']);
    await queryInterface.addIndex('html_components', ['author_id']);
    await queryInterface.addIndex('html_components', ['organization_id']);
    await queryInterface.addIndex('html_components', ['slug']);

    // ═══════════════════════════════════════════════════════════
    // HTML Libraries - External libraries (jQuery, Bootstrap, etc)
    // ═══════════════════════════════════════════════════════════
    await queryInterface.createTable('html_libraries', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      name: {
        type: Sequelize.STRING(200),
        allowNull: false,
        unique: true
      },
      version: {
        type: Sequelize.STRING(50),
        allowNull: false
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      type: {
        type: Sequelize.ENUM('css', 'javascript', 'both'),
        allowNull: false,
        defaultValue: 'javascript'
      },
      cdn_css_url: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'CDN URL for CSS file'
      },
      cdn_js_url: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'CDN URL for JavaScript file'
      },
      local_css_path: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Local path for CSS file'
      },
      local_js_path: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Local path for JavaScript file'
      },
      integrity_css: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'SRI hash for CSS'
      },
      integrity_js: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'SRI hash for JavaScript'
      },
      dependencies: {
        type: Sequelize.JSONB,
        defaultValue: [],
        comment: 'Other libraries this depends on'
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        defaultValue: true
      },
      is_popular: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
        comment: 'Featured/popular library'
      },
      metadata: {
        type: Sequelize.JSONB,
        defaultValue: {},
        comment: 'Additional library info'
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

    await queryInterface.addIndex('html_libraries', ['name']);
    await queryInterface.addIndex('html_libraries', ['type']);
    await queryInterface.addIndex('html_libraries', ['is_active']);
    await queryInterface.addIndex('html_libraries', ['is_popular']);

    // ═══════════════════════════════════════════════════════════
    // Project Libraries - Libraries used in a project
    // ═══════════════════════════════════════════════════════════
    await queryInterface.createTable('html_project_libraries', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      project_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'html_projects', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      library_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'html_libraries', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      load_order: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        comment: 'Order in which to load libraries'
      },
      is_enabled: {
        type: Sequelize.BOOLEAN,
        defaultValue: true
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false
      }
    });

    await queryInterface.addIndex('html_project_libraries', ['project_id']);
    await queryInterface.addIndex('html_project_libraries', ['library_id']);
    await queryInterface.addIndex('html_project_libraries', ['project_id', 'library_id'], { unique: true });

    // ═══════════════════════════════════════════════════════════
    // Project Components - Components used in a project
    // ═══════════════════════════════════════════════════════════
    await queryInterface.createTable('html_project_components', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      project_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'html_projects', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      component_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'html_components', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false
      }
    });

    await queryInterface.addIndex('html_project_components', ['project_id']);
    await queryInterface.addIndex('html_project_components', ['component_id']);
    await queryInterface.addIndex('html_project_components', ['project_id', 'component_id'], { unique: true });

    // ═══════════════════════════════════════════════════════════
    // Collaboration Sessions - Real-time editing sessions
    // ═══════════════════════════════════════════════════════════
    await queryInterface.createTable('html_collaboration_sessions', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      project_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'html_projects', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      file_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'html_files', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false
      },
      socket_id: {
        type: Sequelize.STRING(100),
        allowNull: false,
        comment: 'Socket.IO session ID'
      },
      cursor_position: {
        type: Sequelize.JSONB,
        allowNull: true,
        comment: 'Current cursor position in file'
      },
      selection: {
        type: Sequelize.JSONB,
        allowNull: true,
        comment: 'Current text selection'
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        defaultValue: true
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

    await queryInterface.addIndex('html_collaboration_sessions', ['project_id']);
    await queryInterface.addIndex('html_collaboration_sessions', ['file_id']);
    await queryInterface.addIndex('html_collaboration_sessions', ['user_id']);
    await queryInterface.addIndex('html_collaboration_sessions', ['socket_id']);
    await queryInterface.addIndex('html_collaboration_sessions', ['is_active']);

    // ═══════════════════════════════════════════════════════════
    // Project Snapshots - Point-in-time snapshots of entire project
    // ═══════════════════════════════════════════════════════════
    await queryInterface.createTable('html_project_snapshots', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      project_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'html_projects', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      name: {
        type: Sequelize.STRING(200),
        allowNull: false
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      snapshot_data: {
        type: Sequelize.JSONB,
        allowNull: false,
        comment: 'Complete project state'
      },
      created_by: {
        type: Sequelize.UUID,
        allowNull: false
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false
      }
    });

    await queryInterface.addIndex('html_project_snapshots', ['project_id']);
    await queryInterface.addIndex('html_project_snapshots', ['created_at']);

    // ═══════════════════════════════════════════════════════════
    // Data Source Connections - JSONLex/Bridge/Forge integrations
    // ═══════════════════════════════════════════════════════════
    await queryInterface.createTable('html_data_sources', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      project_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'html_projects', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      name: {
        type: Sequelize.STRING(200),
        allowNull: false
      },
      type: {
        type: Sequelize.ENUM('jsonlex', 'bridge', 'forge_crm', 'forge_erp', 'forge_groupware', 'rest_api', 'graphql', 'websocket'),
        allowNull: false
      },
      configuration: {
        type: Sequelize.JSONB,
        allowNull: false,
        comment: 'Connection configuration'
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        defaultValue: true
      },
      created_by: {
        type: Sequelize.UUID,
        allowNull: false
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

    await queryInterface.addIndex('html_data_sources', ['project_id']);
    await queryInterface.addIndex('html_data_sources', ['type']);
    await queryInterface.addIndex('html_data_sources', ['is_active']);

    // ═══════════════════════════════════════════════════════════
    // Project Deployments - Published versions
    // ═══════════════════════════════════════════════════════════
    await queryInterface.createTable('html_project_deployments', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      project_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'html_projects', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      snapshot_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'html_project_snapshots', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      version: {
        type: Sequelize.STRING(50),
        allowNull: false
      },
      environment: {
        type: Sequelize.ENUM('development', 'staging', 'production'),
        allowNull: false,
        defaultValue: 'development'
      },
      url: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Public URL for deployment'
      },
      status: {
        type: Sequelize.ENUM('pending', 'building', 'deployed', 'failed', 'archived'),
        defaultValue: 'pending',
        allowNull: false
      },
      build_log: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      deployed_by: {
        type: Sequelize.UUID,
        allowNull: false
      },
      deployed_at: {
        type: Sequelize.DATE,
        allowNull: false
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

    await queryInterface.addIndex('html_project_deployments', ['project_id']);
    await queryInterface.addIndex('html_project_deployments', ['environment']);
    await queryInterface.addIndex('html_project_deployments', ['status']);
    await queryInterface.addIndex('html_project_deployments', ['deployed_at']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('html_project_deployments');
    await queryInterface.dropTable('html_data_sources');
    await queryInterface.dropTable('html_project_snapshots');
    await queryInterface.dropTable('html_collaboration_sessions');
    await queryInterface.dropTable('html_project_components');
    await queryInterface.dropTable('html_project_libraries');
    await queryInterface.dropTable('html_libraries');
    await queryInterface.dropTable('html_components');
    await queryInterface.dropTable('html_file_versions');
    await queryInterface.dropTable('html_files');
    await queryInterface.dropTable('html_projects');
  }
};
