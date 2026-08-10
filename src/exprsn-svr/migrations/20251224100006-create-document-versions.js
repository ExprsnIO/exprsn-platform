/**
 * Migration: Create Document Versions Table
 *
 * Creates table for document version tracking:
 * - document_versions: Version snapshots with checksums and change tracking
 */

'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // ============================================
    // Document Versions Table
    // ============================================

    await queryInterface.createTable('document_versions', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      document_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'documents',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      version_number: {
        type: Sequelize.INTEGER,
        allowNull: false,
        comment: 'Sequential version number (1, 2, 3, ...)'
      },
      filename: {
        type: Sequelize.STRING(500),
        allowNull: false
      },
      title: {
        type: Sequelize.STRING(500),
        allowNull: true
      },
      content: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Snapshot of document content at this version'
      },
      mime_type: {
        type: Sequelize.STRING(100),
        allowNull: false
      },
      size: {
        type: Sequelize.BIGINT,
        allowNull: false,
        comment: 'File size in bytes'
      },
      checksum: {
        type: Sequelize.STRING(64),
        allowNull: true,
        comment: 'SHA-256 hash of content for integrity verification'
      },
      change_type: {
        type: Sequelize.ENUM('created', 'content_updated', 'metadata_updated', 'renamed', 'moved', 'restored'),
        defaultValue: 'content_updated',
        allowNull: false,
        comment: 'Type of change that created this version'
      },
      change_description: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'User-provided description of changes'
      },
      changed_by: {
        type: Sequelize.UUID,
        allowNull: false,
        comment: 'User who created this version'
      },
      changed_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      file_location: {
        type: Sequelize.STRING(1000),
        allowNull: true,
        comment: 'Storage location of version file (if stored separately)'
      },
      metadata: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {},
        comment: 'Additional metadata (tags, custom fields, etc.)'
      },
      is_current_version: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
        allowNull: false,
        comment: 'Whether this is the current/latest version'
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

    // Add indexes for document_versions
    await queryInterface.addIndex('document_versions', ['document_id', 'version_number'], {
      unique: true,
      name: 'document_versions_document_version_unique'
    });
    await queryInterface.addIndex('document_versions', ['document_id', 'is_current_version'], {
      name: 'document_versions_current_idx'
    });
    await queryInterface.addIndex('document_versions', ['changed_by'], {
      name: 'document_versions_changed_by_idx'
    });
    await queryInterface.addIndex('document_versions', ['changed_at'], {
      name: 'document_versions_changed_at_idx'
    });
    await queryInterface.addIndex('document_versions', ['checksum'], {
      name: 'document_versions_checksum_idx'
    });
  },

  down: async (queryInterface, Sequelize) => {
    // Drop document_versions table
    await queryInterface.dropTable('document_versions');
  }
};
