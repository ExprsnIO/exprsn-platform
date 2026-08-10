/**
 * Migration: Enhance Data Sources Table
 *
 * Add support for:
 * - Redis datasources
 * - Plugin-provided datasources
 * - Schema-based datasources
 * - Webservice (WSDL) datasources
 */

'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Update source_type ENUM to include new types
    await queryInterface.sequelize.query(`
      ALTER TYPE "enum_data_sources_source_type"
      ADD VALUE IF NOT EXISTS 'redis';
    `);

    await queryInterface.sequelize.query(`
      ALTER TYPE "enum_data_sources_source_type"
      ADD VALUE IF NOT EXISTS 'plugin';
    `);

    await queryInterface.sequelize.query(`
      ALTER TYPE "enum_data_sources_source_type"
      ADD VALUE IF NOT EXISTS 'schema';
    `);

    await queryInterface.sequelize.query(`
      ALTER TYPE "enum_data_sources_source_type"
      ADD VALUE IF NOT EXISTS 'webservice';
    `);

    // Add plugin configuration fields
    await queryInterface.addColumn('data_sources', 'plugin_id', {
      type: Sequelize.UUID,
      allowNull: true,
      comment: 'Reference to plugin that provides this datasource',
    });

    await queryInterface.addColumn('data_sources', 'plugin_config', {
      type: Sequelize.JSONB,
      allowNull: true,
      comment: 'Plugin-specific configuration',
    });

    await queryInterface.addColumn('data_sources', 'icon', {
      type: Sequelize.STRING(100),
      allowNull: true,
      defaultValue: 'fa-database',
      comment: 'Font Awesome icon class',
    });

    await queryInterface.addColumn('data_sources', 'color', {
      type: Sequelize.STRING(20),
      allowNull: true,
      defaultValue: '#667eea',
      comment: 'Color for UI visualization',
    });

    // Add index for plugin lookups
    await queryInterface.addIndex('data_sources', ['plugin_id'], {
      name: 'data_sources_plugin_id_idx',
    });
  },

  down: async (queryInterface, Sequelize) => {
    // Remove new columns
    await queryInterface.removeColumn('data_sources', 'plugin_id');
    await queryInterface.removeColumn('data_sources', 'plugin_config');
    await queryInterface.removeColumn('data_sources', 'icon');
    await queryInterface.removeColumn('data_sources', 'color');

    // Note: Cannot remove ENUM values in PostgreSQL easily
    // Would require recreating the entire ENUM type
  }
};
