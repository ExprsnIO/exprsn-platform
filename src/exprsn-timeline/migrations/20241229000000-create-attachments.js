/**
 * Migration: Create Attachments Table
 * Adds file attachment support for posts and comments
 */

'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('attachments', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },

      // Polymorphic association
      entity_type: {
        type: Sequelize.STRING(50),
        allowNull: false,
        comment: 'Type of entity (post, comment)'
      },

      entity_id: {
        type: Sequelize.UUID,
        allowNull: false,
        comment: 'ID of the parent entity'
      },

      // FileVault reference
      file_id: {
        type: Sequelize.UUID,
        allowNull: false,
        comment: 'Reference to file in FileVault'
      },

      // Denormalized file metadata
      filename: {
        type: Sequelize.STRING(255),
        allowNull: false
      },

      original_name: {
        type: Sequelize.STRING(255),
        allowNull: true
      },

      mime_type: {
        type: Sequelize.STRING(100),
        allowNull: false,
        defaultValue: 'application/octet-stream'
      },

      file_size: {
        type: Sequelize.BIGINT,
        allowNull: false,
        defaultValue: 0
      },

      file_url: {
        type: Sequelize.TEXT,
        allowNull: false
      },

      thumbnail_url: {
        type: Sequelize.TEXT,
        allowNull: true
      },

      preview_url: {
        type: Sequelize.TEXT,
        allowNull: true
      },

      // Upload metadata
      upload_source: {
        type: Sequelize.STRING(50),
        allowNull: true,
        comment: 'Source: web, mobile, api, etc.'
      },

      uploaded_by: {
        type: Sequelize.UUID,
        allowNull: false
      },

      // Display settings
      display_order: {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: 0
      },

      is_primary: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },

      // Status
      status: {
        type: Sequelize.ENUM('pending', 'active', 'processing', 'failed', 'deleted', 'quarantined'),
        allowNull: false,
        defaultValue: 'active'
      },

      // Media-specific
      duration: {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: 'Duration in seconds for audio/video'
      },

      dimensions: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {}
      },

      // Metadata
      metadata: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {}
      },

      description: {
        type: Sequelize.TEXT,
        allowNull: true
      },

      alt_text: {
        type: Sequelize.TEXT,
        allowNull: true
      },

      // Security
      content_hash: {
        type: Sequelize.STRING(64),
        allowNull: true
      },

      virus_scan_status: {
        type: Sequelize.ENUM('pending', 'clean', 'infected', 'error'),
        allowNull: true
      },

      virus_scan_date: {
        type: Sequelize.DATE,
        allowNull: true
      },

      // Timestamps
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

    // Add indexes for performance
    await queryInterface.addIndex('attachments', ['entity_type', 'entity_id'], {
      name: 'idx_attachments_entity'
    });

    await queryInterface.addIndex('attachments', ['file_id'], {
      name: 'idx_attachments_file_id'
    });

    await queryInterface.addIndex('attachments', ['uploaded_by'], {
      name: 'idx_attachments_uploaded_by'
    });

    await queryInterface.addIndex('attachments', ['status'], {
      name: 'idx_attachments_status'
    });

    await queryInterface.addIndex('attachments', ['entity_type', 'entity_id', 'is_primary'], {
      name: 'idx_attachments_primary',
      where: {
        is_primary: true
      }
    });

    await queryInterface.addIndex('attachments', ['created_at'], {
      name: 'idx_attachments_created'
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('attachments');
  }
};
