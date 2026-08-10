/**
 * Migration: Fix AI Agent Templates Schema
 *
 * Adds missing columns to ai_agent_templates to match the model definition:
 * - display_name: Human-readable name for UI
 * - category: Replaces template_type with correct ENUM values
 * - capabilities: JSONB object defining what the agent can do
 * - tools: JSONB array of available function calling tools
 * - rate_limit: JSONB object for rate limiting configuration
 * - version: String for agent template versioning
 *
 * This migration preserves existing data and maps template_type to category.
 */

'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      console.log('🔧 Fixing ai_agent_templates schema...\n');

      // 1. Add display_name column
      console.log('   Adding display_name column...');
      await queryInterface.addColumn(
        'ai_agent_templates',
        'display_name',
        {
          type: Sequelize.STRING(255),
          allowNull: true, // Temporarily nullable for migration
        },
        { transaction }
      );

      // 2. Add category ENUM column
      console.log('   Adding category column...');
      await queryInterface.addColumn(
        'ai_agent_templates',
        'category',
        {
          type: Sequelize.ENUM(
            'schema_design',
            'data_transformation',
            'workflow_automation',
            'validation',
            'optimization',
            'conversational',
            'analysis'
          ),
          allowNull: true, // Temporarily nullable for migration
        },
        { transaction }
      );

      // 3. Migrate data from template_type to category
      console.log('   Migrating template_type → category...');
      const [templates] = await queryInterface.sequelize.query(
        'SELECT id, template_type FROM ai_agent_templates',
        { transaction }
      );

      for (const template of templates) {
        let category = template.template_type;

        // Map template_type values to category values
        const typeMap = {
          'schema_designer': 'schema_design',
          'data_transformer': 'data_transformation',
          'workflow_optimizer': 'workflow_automation',
          'code_reviewer': 'analysis',
          'validation_engine': 'validation',
          'conversational_assistant': 'conversational',
          'performance_analyzer': 'optimization',
        };

        category = typeMap[template.template_type] || template.template_type;

        await queryInterface.sequelize.query(
          `UPDATE ai_agent_templates SET category = :category WHERE id = :id`,
          {
            replacements: { category, id: template.id },
            transaction,
          }
        );
      }

      // 4. Populate display_name from name (title case)
      console.log('   Generating display names from template names...');
      await queryInterface.sequelize.query(
        `UPDATE ai_agent_templates
         SET display_name = INITCAP(REPLACE(name, '-', ' '))
         WHERE display_name IS NULL`,
        { transaction }
      );

      // 5. Make category and display_name NOT NULL
      await queryInterface.changeColumn(
        'ai_agent_templates',
        'category',
        {
          type: Sequelize.ENUM(
            'schema_design',
            'data_transformation',
            'workflow_automation',
            'validation',
            'optimization',
            'conversational',
            'analysis'
          ),
          allowNull: false,
        },
        { transaction }
      );

      await queryInterface.changeColumn(
        'ai_agent_templates',
        'display_name',
        {
          type: Sequelize.STRING(255),
          allowNull: false,
        },
        { transaction }
      );

      // 6. Add capabilities column with default value
      console.log('   Adding capabilities column...');
      await queryInterface.addColumn(
        'ai_agent_templates',
        'capabilities',
        {
          type: Sequelize.JSONB,
          allowNull: false,
          defaultValue: {},
        },
        { transaction }
      );

      // 7. Set default capabilities based on category
      console.log('   Setting default capabilities...');
      await queryInterface.sequelize.query(
        `UPDATE ai_agent_templates
         SET capabilities = '{"schema_generation": true, "entity_design": true}'::jsonb
         WHERE category = 'schema_design' AND (capabilities IS NULL OR capabilities = '{}'::jsonb)`,
        { transaction }
      );

      await queryInterface.sequelize.query(
        `UPDATE ai_agent_templates
         SET capabilities = '{"data_transformation": true, "data_validation": true}'::jsonb
         WHERE category = 'data_transformation' AND (capabilities IS NULL OR capabilities = '{}'::jsonb)`,
        { transaction }
      );

      await queryInterface.sequelize.query(
        `UPDATE ai_agent_templates
         SET capabilities = '{"workflow_generation": true, "workflow_optimization": true}'::jsonb
         WHERE category = 'workflow_automation' AND (capabilities IS NULL OR capabilities = '{}'::jsonb)`,
        { transaction }
      );

      // 8. Add tools column
      console.log('   Adding tools column...');
      await queryInterface.addColumn(
        'ai_agent_templates',
        'tools',
        {
          type: Sequelize.JSONB,
          allowNull: false,
          defaultValue: [],
        },
        { transaction }
      );

      // 9. Add rate_limit column
      console.log('   Adding rate_limit column...');
      await queryInterface.addColumn(
        'ai_agent_templates',
        'rate_limit',
        {
          type: Sequelize.JSONB,
          allowNull: false,
          defaultValue: { requests_per_minute: 60, requests_per_hour: 1000 },
        },
        { transaction }
      );

      // 10. Add version column
      console.log('   Adding version column...');
      await queryInterface.addColumn(
        'ai_agent_templates',
        'version',
        {
          type: Sequelize.STRING(20),
          allowNull: false,
          defaultValue: '1.0.0',
        },
        { transaction }
      );

      // 11. Add index on category
      console.log('   Adding index on category...');
      await queryInterface.addIndex(
        'ai_agent_templates',
        ['category'],
        { transaction }
      );

      // Note: We're keeping template_type for backward compatibility
      // It can be dropped in a future migration after ensuring no code depends on it

      await transaction.commit();
      console.log('\n✅ ai_agent_templates schema fixed successfully!');
      console.log('   • Added: display_name, category, capabilities, tools, rate_limit, version');
      console.log('   • Migrated: template_type → category');
      console.log('   • Preserved: template_type column (for backward compatibility)');
    } catch (error) {
      await transaction.rollback();
      console.error('❌ Migration failed:', error.message);
      throw error;
    }
  },

  down: async (queryInterface, Sequelize) => {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      // Remove indexes
      await queryInterface.removeIndex('ai_agent_templates', ['category'], { transaction });

      // Remove columns (in reverse order)
      await queryInterface.removeColumn('ai_agent_templates', 'version', { transaction });
      await queryInterface.removeColumn('ai_agent_templates', 'rate_limit', { transaction });
      await queryInterface.removeColumn('ai_agent_templates', 'tools', { transaction });
      await queryInterface.removeColumn('ai_agent_templates', 'capabilities', { transaction });
      await queryInterface.removeColumn('ai_agent_templates', 'category', { transaction });
      await queryInterface.removeColumn('ai_agent_templates', 'display_name', { transaction });

      await transaction.commit();
      console.log('✅ Rollback completed');
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
};
