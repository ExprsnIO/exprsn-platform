/**
 * Migration: Create AI Agent System Tables
 *
 * Creates all tables needed for the AI Assistant integration:
 * - AI Provider Configurations (Anthropic, Ollama, OpenAI, custom)
 * - AI Agent Templates (system prompts, examples, configs)
 * - AI Agent Configurations (per-entity/form/workflow AI settings)
 * - AI Execution Logs (tracking all AI calls, costs, performance)
 * - AI Schema Suggestions (entity/field suggestions from AI)
 * - AI Data Transformations (data cleansing, enrichment, validation)
 * - AI Conversation Sessions (chat-style interactions)
 * - AI Conversation Messages (message history)
 * - AI Workflow Optimizations (workflow improvement suggestions)
 * - AI Decision Evaluations (decision table optimizations)
 */

'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      // ═══════════════════════════════════════════════════════════
      // 1. AI Provider Configurations
      // ═══════════════════════════════════════════════════════════
      await queryInterface.createTable('ai_provider_configs', {
        id: {
          type: Sequelize.UUID,
          defaultValue: Sequelize.UUIDV4,
          primaryKey: true,
          allowNull: false,
        },
        provider_name: {
          type: Sequelize.STRING(100),
          allowNull: false,
          unique: true,
        },
        provider_type: {
          type: Sequelize.ENUM('anthropic', 'ollama', 'openai', 'custom'),
          allowNull: false,
        },
        display_name: {
          type: Sequelize.STRING(255),
          allowNull: false,
        },
        base_url: {
          type: Sequelize.STRING(500),
          allowNull: true,
        },
        api_key_env_var: {
          type: Sequelize.STRING(100),
          allowNull: true,
          comment: 'Environment variable name for API key',
        },
        default_model: {
          type: Sequelize.STRING(100),
          allowNull: true,
        },
        available_models: {
          type: Sequelize.JSONB,
          allowNull: false,
          defaultValue: [],
        },
        config: {
          type: Sequelize.JSONB,
          allowNull: false,
          defaultValue: {},
          comment: 'Provider-specific configuration',
        },
        rate_limits: {
          type: Sequelize.JSONB,
          allowNull: false,
          defaultValue: { rpm: 50, rpd: 10000, tpm: 100000 },
        },
        cost_config: {
          type: Sequelize.JSONB,
          allowNull: false,
          defaultValue: {},
          comment: 'Cost per 1000 tokens',
        },
        is_active: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: true,
        },
        is_default: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: false,
        },
        priority: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 100,
          comment: 'Lower = higher priority',
        },
        health_check_url: {
          type: Sequelize.STRING(500),
          allowNull: true,
        },
        last_health_check: {
          type: Sequelize.DATE,
          allowNull: true,
        },
        health_status: {
          type: Sequelize.ENUM('healthy', 'degraded', 'unavailable'),
          allowNull: false,
          defaultValue: 'healthy',
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
        },
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
        },
      }, { transaction });

      await queryInterface.addIndex('ai_provider_configs', ['provider_type'], { transaction });
      await queryInterface.addIndex('ai_provider_configs', ['is_active', 'is_default'], { transaction });
      await queryInterface.addIndex('ai_provider_configs', ['priority'], { transaction });

      // ═══════════════════════════════════════════════════════════
      // 2. AI Agent Templates
      // ═══════════════════════════════════════════════════════════
      await queryInterface.createTable('ai_agent_templates', {
        id: {
          type: Sequelize.UUID,
          defaultValue: Sequelize.UUIDV4,
          primaryKey: true,
          allowNull: false,
        },
        name: {
          type: Sequelize.STRING(255),
          allowNull: false,
          unique: true,
        },
        description: {
          type: Sequelize.TEXT,
          allowNull: true,
        },
        template_type: {
          type: Sequelize.ENUM(
            'schema_designer',
            'data_transformer',
            'workflow_optimizer',
            'code_generator',
            'query_builder',
            'validation_creator',
            'general_assistant'
          ),
          allowNull: false,
        },
        system_prompt: {
          type: Sequelize.TEXT,
          allowNull: false,
        },
        examples: {
          type: Sequelize.JSONB,
          allowNull: false,
          defaultValue: [],
        },
        default_model: {
          type: Sequelize.STRING(100),
          allowNull: false,
          defaultValue: 'claude-sonnet-4',
        },
        temperature: {
          type: Sequelize.DECIMAL(3, 2),
          allowNull: false,
          defaultValue: 0.7,
        },
        max_tokens: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 4096,
        },
        response_format: {
          type: Sequelize.ENUM('text', 'json', 'markdown'),
          allowNull: false,
          defaultValue: 'json',
        },
        is_system: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: false,
        },
        is_active: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: true,
        },
        created_by: {
          type: Sequelize.UUID,
          allowNull: true,
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
        },
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
        },
      }, { transaction });

      await queryInterface.addIndex('ai_agent_templates', ['template_type'], { transaction });
      await queryInterface.addIndex('ai_agent_templates', ['is_active'], { transaction });

      // ═══════════════════════════════════════════════════════════
      // 3. AI Agent Configurations
      // ═══════════════════════════════════════════════════════════
      await queryInterface.createTable('ai_agent_configurations', {
        id: {
          type: Sequelize.UUID,
          defaultValue: Sequelize.UUIDV4,
          primaryKey: true,
          allowNull: false,
        },
        template_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: {
            model: 'ai_agent_templates',
            key: 'id',
          },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT',
        },
        target_type: {
          type: Sequelize.ENUM(
            'application',
            'entity',
            'form',
            'grid',
            'workflow',
            'process',
            'decision_table',
            'chart',
            'dashboard'
          ),
          allowNull: false,
        },
        target_id: {
          type: Sequelize.UUID,
          allowNull: false,
        },
        is_enabled: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: true,
        },
        custom_prompt: {
          type: Sequelize.TEXT,
          allowNull: true,
        },
        override_model: {
          type: Sequelize.STRING(100),
          allowNull: true,
        },
        override_temperature: {
          type: Sequelize.DECIMAL(3, 2),
          allowNull: true,
        },
        override_max_tokens: {
          type: Sequelize.INTEGER,
          allowNull: true,
        },
        trigger_events: {
          type: Sequelize.JSONB,
          allowNull: false,
          defaultValue: [],
        },
        auto_execute: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: false,
        },
        require_approval: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: true,
        },
        context_data: {
          type: Sequelize.JSONB,
          allowNull: false,
          defaultValue: {},
        },
        execution_count: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
        },
        success_count: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
        },
        last_executed_at: {
          type: Sequelize.DATE,
          allowNull: true,
        },
        created_by: {
          type: Sequelize.UUID,
          allowNull: true,
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
        },
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
        },
      }, { transaction });

      await queryInterface.addIndex('ai_agent_configurations', ['template_id'], { transaction });
      await queryInterface.addIndex('ai_agent_configurations', ['target_type', 'target_id'], { transaction });
      await queryInterface.addIndex('ai_agent_configurations', ['is_enabled'], { transaction });
      await queryInterface.addIndex('ai_agent_configurations',
        ['target_type', 'target_id', 'template_id'],
        { unique: true, name: 'unique_agent_per_target', transaction }
      );

      // ═══════════════════════════════════════════════════════════
      // 4. AI Execution Logs
      // ═══════════════════════════════════════════════════════════
      await queryInterface.createTable('ai_execution_logs', {
        id: {
          type: Sequelize.UUID,
          defaultValue: Sequelize.UUIDV4,
          primaryKey: true,
          allowNull: false,
        },
        configuration_id: {
          type: Sequelize.UUID,
          allowNull: true,
          references: {
            model: 'ai_agent_configurations',
            key: 'id',
          },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL',
        },
        template_id: {
          type: Sequelize.UUID,
          allowNull: true,
          references: {
            model: 'ai_agent_templates',
            key: 'id',
          },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL',
        },
        provider_name: {
          type: Sequelize.STRING(100),
          allowNull: false,
        },
        model: {
          type: Sequelize.STRING(100),
          allowNull: false,
        },
        execution_type: {
          type: Sequelize.STRING(100),
          allowNull: false,
        },
        target_type: {
          type: Sequelize.STRING(100),
          allowNull: true,
        },
        target_id: {
          type: Sequelize.UUID,
          allowNull: true,
        },
        input_prompt: {
          type: Sequelize.TEXT,
          allowNull: false,
        },
        input_context: {
          type: Sequelize.JSONB,
          allowNull: false,
          defaultValue: {},
        },
        output_response: {
          type: Sequelize.TEXT,
          allowNull: true,
        },
        output_structured: {
          type: Sequelize.JSONB,
          allowNull: true,
        },
        tokens_input: {
          type: Sequelize.INTEGER,
          allowNull: true,
        },
        tokens_output: {
          type: Sequelize.INTEGER,
          allowNull: true,
        },
        estimated_cost: {
          type: Sequelize.DECIMAL(10, 6),
          allowNull: true,
        },
        duration_ms: {
          type: Sequelize.INTEGER,
          allowNull: true,
        },
        status: {
          type: Sequelize.ENUM('pending', 'success', 'error', 'timeout', 'rate_limited'),
          allowNull: false,
          defaultValue: 'pending',
        },
        error_message: {
          type: Sequelize.TEXT,
          allowNull: true,
        },
        error_code: {
          type: Sequelize.STRING(100),
          allowNull: true,
        },
        user_id: {
          type: Sequelize.UUID,
          allowNull: true,
        },
        session_id: {
          type: Sequelize.UUID,
          allowNull: true,
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
        },
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
        },
      }, { transaction });

      await queryInterface.addIndex('ai_execution_logs', ['configuration_id'], { transaction });
      await queryInterface.addIndex('ai_execution_logs', ['provider_name'], { transaction });
      await queryInterface.addIndex('ai_execution_logs', ['status'], { transaction });
      await queryInterface.addIndex('ai_execution_logs', ['user_id'], { transaction });
      await queryInterface.addIndex('ai_execution_logs', ['created_at'], { transaction });

      // ═══════════════════════════════════════════════════════════
      // 5. AI Schema Suggestions
      // ═══════════════════════════════════════════════════════════
      await queryInterface.createTable('ai_schema_suggestions', {
        id: {
          type: Sequelize.UUID,
          defaultValue: Sequelize.UUIDV4,
          primaryKey: true,
          allowNull: false,
        },
        execution_log_id: {
          type: Sequelize.UUID,
          allowNull: true,
          references: {
            model: 'ai_execution_logs',
            key: 'id',
          },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL',
        },
        configuration_id: {
          type: Sequelize.UUID,
          allowNull: true,
        },
        application_id: {
          type: Sequelize.UUID,
          allowNull: true,
        },
        entity_id: {
          type: Sequelize.UUID,
          allowNull: true,
        },
        suggestion_type: {
          type: Sequelize.ENUM(
            'new_entity',
            'add_field',
            'modify_field',
            'remove_field',
            'add_relationship',
            'add_index',
            'add_validation',
            'complete_schema'
          ),
          allowNull: false,
        },
        suggested_schema: {
          type: Sequelize.JSONB,
          allowNull: false,
        },
        reasoning: {
          type: Sequelize.TEXT,
          allowNull: true,
        },
        confidence_score: {
          type: Sequelize.INTEGER,
          allowNull: true,
        },
        user_prompt: {
          type: Sequelize.TEXT,
          allowNull: false,
        },
        status: {
          type: Sequelize.ENUM('pending', 'approved', 'rejected', 'applied', 'expired'),
          allowNull: false,
          defaultValue: 'pending',
        },
        reviewed_by: {
          type: Sequelize.UUID,
          allowNull: true,
        },
        reviewed_at: {
          type: Sequelize.DATE,
          allowNull: true,
        },
        review_feedback: {
          type: Sequelize.TEXT,
          allowNull: true,
        },
        applied_at: {
          type: Sequelize.DATE,
          allowNull: true,
        },
        applied_result: {
          type: Sequelize.JSONB,
          allowNull: true,
        },
        expires_at: {
          type: Sequelize.DATE,
          allowNull: true,
        },
        created_by: {
          type: Sequelize.UUID,
          allowNull: false,
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
        },
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
        },
      }, { transaction });

      await queryInterface.addIndex('ai_schema_suggestions', ['application_id'], { transaction });
      await queryInterface.addIndex('ai_schema_suggestions', ['entity_id'], { transaction });
      await queryInterface.addIndex('ai_schema_suggestions', ['status'], { transaction });
      await queryInterface.addIndex('ai_schema_suggestions', ['created_by'], { transaction });

      // ═══════════════════════════════════════════════════════════
      // 6. AI Data Transformations
      // ═══════════════════════════════════════════════════════════
      await queryInterface.createTable('ai_data_transformations', {
        id: {
          type: Sequelize.UUID,
          defaultValue: Sequelize.UUIDV4,
          primaryKey: true,
          allowNull: false,
        },
        execution_log_id: {
          type: Sequelize.UUID,
          allowNull: true,
          references: {
            model: 'ai_execution_logs',
            key: 'id',
          },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL',
        },
        configuration_id: {
          type: Sequelize.UUID,
          allowNull: true,
        },
        entity_id: {
          type: Sequelize.UUID,
          allowNull: false,
        },
        transformation_type: {
          type: Sequelize.ENUM(
            'data_cleansing',
            'data_enrichment',
            'data_normalization',
            'duplicate_detection',
            'missing_data_completion',
            'validation',
            'batch_update',
            'data_migration'
          ),
          allowNull: false,
        },
        source_query: {
          type: Sequelize.JSONB,
          allowNull: false,
          defaultValue: {},
        },
        transformation_rules: {
          type: Sequelize.JSONB,
          allowNull: false,
        },
        preview_results: {
          type: Sequelize.JSONB,
          allowNull: false,
          defaultValue: [],
        },
        records_affected: {
          type: Sequelize.INTEGER,
          allowNull: true,
        },
        execution_plan: {
          type: Sequelize.TEXT,
          allowNull: true,
        },
        status: {
          type: Sequelize.ENUM('pending', 'approved', 'running', 'completed', 'failed', 'cancelled'),
          allowNull: false,
          defaultValue: 'pending',
        },
        progress: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
        },
        started_at: {
          type: Sequelize.DATE,
          allowNull: true,
        },
        completed_at: {
          type: Sequelize.DATE,
          allowNull: true,
        },
        error_details: {
          type: Sequelize.JSONB,
          allowNull: true,
        },
        approved_by: {
          type: Sequelize.UUID,
          allowNull: true,
        },
        approved_at: {
          type: Sequelize.DATE,
          allowNull: true,
        },
        created_by: {
          type: Sequelize.UUID,
          allowNull: false,
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
        },
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
        },
      }, { transaction });

      await queryInterface.addIndex('ai_data_transformations', ['entity_id'], { transaction });
      await queryInterface.addIndex('ai_data_transformations', ['status'], { transaction });
      await queryInterface.addIndex('ai_data_transformations', ['transformation_type'], { transaction });

      // ═══════════════════════════════════════════════════════════
      // 7. AI Conversation Sessions
      // ═══════════════════════════════════════════════════════════
      await queryInterface.createTable('ai_conversation_sessions', {
        id: {
          type: Sequelize.UUID,
          defaultValue: Sequelize.UUIDV4,
          primaryKey: true,
          allowNull: false,
        },
        user_id: {
          type: Sequelize.UUID,
          allowNull: false,
        },
        application_id: {
          type: Sequelize.UUID,
          allowNull: true,
        },
        session_type: {
          type: Sequelize.ENUM('schema_design', 'data_query', 'workflow_builder', 'general_assistant'),
          allowNull: false,
        },
        context: {
          type: Sequelize.JSONB,
          allowNull: false,
          defaultValue: {},
        },
        message_count: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
        },
        last_message_at: {
          type: Sequelize.DATE,
          allowNull: true,
        },
        is_active: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: true,
        },
        ended_at: {
          type: Sequelize.DATE,
          allowNull: true,
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
        },
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
        },
      }, { transaction });

      await queryInterface.addIndex('ai_conversation_sessions', ['user_id', 'is_active'], { transaction });
      await queryInterface.addIndex('ai_conversation_sessions', ['application_id'], { transaction });

      // ═══════════════════════════════════════════════════════════
      // 8. AI Conversation Messages
      // ═══════════════════════════════════════════════════════════
      await queryInterface.createTable('ai_conversation_messages', {
        id: {
          type: Sequelize.UUID,
          defaultValue: Sequelize.UUIDV4,
          primaryKey: true,
          allowNull: false,
        },
        session_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: {
            model: 'ai_conversation_sessions',
            key: 'id',
          },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        role: {
          type: Sequelize.ENUM('user', 'assistant', 'system'),
          allowNull: false,
        },
        content: {
          type: Sequelize.TEXT,
          allowNull: false,
        },
        structured_data: {
          type: Sequelize.JSONB,
          allowNull: false,
          defaultValue: {},
        },
        execution_log_id: {
          type: Sequelize.UUID,
          allowNull: true,
          references: {
            model: 'ai_execution_logs',
            key: 'id',
          },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL',
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
        },
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
        },
      }, { transaction });

      await queryInterface.addIndex('ai_conversation_messages', ['session_id'], { transaction });
      await queryInterface.addIndex('ai_conversation_messages', ['created_at'], { transaction });

      // ═══════════════════════════════════════════════════════════
      // 9. AI Workflow Optimizations
      // ═══════════════════════════════════════════════════════════
      await queryInterface.createTable('ai_workflow_optimizations', {
        id: {
          type: Sequelize.UUID,
          defaultValue: Sequelize.UUIDV4,
          primaryKey: true,
          allowNull: false,
        },
        execution_log_id: {
          type: Sequelize.UUID,
          allowNull: true,
          references: {
            model: 'ai_execution_logs',
            key: 'id',
          },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL',
        },
        configuration_id: {
          type: Sequelize.UUID,
          allowNull: true,
        },
        workflow_id: {
          type: Sequelize.UUID,
          allowNull: false,
        },
        optimization_type: {
          type: Sequelize.ENUM(
            'performance',
            'error_handling',
            'simplification',
            'best_practices',
            'security',
            'parallel_execution'
          ),
          allowNull: false,
        },
        suggested_changes: {
          type: Sequelize.JSONB,
          allowNull: false,
        },
        reasoning: {
          type: Sequelize.TEXT,
          allowNull: true,
        },
        impact_analysis: {
          type: Sequelize.JSONB,
          allowNull: false,
          defaultValue: {},
        },
        status: {
          type: Sequelize.ENUM('pending', 'approved', 'rejected', 'applied'),
          allowNull: false,
          defaultValue: 'pending',
        },
        reviewed_by: {
          type: Sequelize.UUID,
          allowNull: true,
        },
        reviewed_at: {
          type: Sequelize.DATE,
          allowNull: true,
        },
        created_by: {
          type: Sequelize.UUID,
          allowNull: false,
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
        },
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
        },
      }, { transaction });

      await queryInterface.addIndex('ai_workflow_optimizations', ['workflow_id'], { transaction });
      await queryInterface.addIndex('ai_workflow_optimizations', ['status'], { transaction });

      // ═══════════════════════════════════════════════════════════
      // 10. AI Decision Evaluations
      // ═══════════════════════════════════════════════════════════
      await queryInterface.createTable('ai_decision_evaluations', {
        id: {
          type: Sequelize.UUID,
          defaultValue: Sequelize.UUIDV4,
          primaryKey: true,
          allowNull: false,
        },
        execution_log_id: {
          type: Sequelize.UUID,
          allowNull: true,
          references: {
            model: 'ai_execution_logs',
            key: 'id',
          },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL',
        },
        configuration_id: {
          type: Sequelize.UUID,
          allowNull: true,
        },
        decision_table_id: {
          type: Sequelize.UUID,
          allowNull: false,
        },
        evaluation_type: {
          type: Sequelize.ENUM(
            'completeness',
            'conflict_detection',
            'optimization',
            'coverage_analysis',
            'rule_simplification'
          ),
          allowNull: false,
        },
        findings: {
          type: Sequelize.JSONB,
          allowNull: false,
          defaultValue: [],
        },
        suggestions: {
          type: Sequelize.JSONB,
          allowNull: false,
          defaultValue: [],
        },
        severity: {
          type: Sequelize.ENUM('info', 'warning', 'error', 'critical'),
          allowNull: false,
          defaultValue: 'info',
        },
        status: {
          type: Sequelize.ENUM('pending', 'acknowledged', 'resolved', 'ignored'),
          allowNull: false,
          defaultValue: 'pending',
        },
        resolved_by: {
          type: Sequelize.UUID,
          allowNull: true,
        },
        resolved_at: {
          type: Sequelize.DATE,
          allowNull: true,
        },
        created_by: {
          type: Sequelize.UUID,
          allowNull: false,
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
        },
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
        },
      }, { transaction });

      await queryInterface.addIndex('ai_decision_evaluations', ['decision_table_id'], { transaction });
      await queryInterface.addIndex('ai_decision_evaluations', ['status'], { transaction });
      await queryInterface.addIndex('ai_decision_evaluations', ['severity'], { transaction });

      await transaction.commit();
      console.log('✅ AI Agent System tables created successfully');

    } catch (error) {
      await transaction.rollback();
      console.error('❌ Error creating AI Agent System tables:', error);
      throw error;
    }
  },

  down: async (queryInterface, Sequelize) => {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      // Drop tables in reverse order (respecting foreign keys)
      await queryInterface.dropTable('ai_decision_evaluations', { transaction });
      await queryInterface.dropTable('ai_workflow_optimizations', { transaction });
      await queryInterface.dropTable('ai_conversation_messages', { transaction });
      await queryInterface.dropTable('ai_conversation_sessions', { transaction });
      await queryInterface.dropTable('ai_data_transformations', { transaction });
      await queryInterface.dropTable('ai_schema_suggestions', { transaction });
      await queryInterface.dropTable('ai_execution_logs', { transaction });
      await queryInterface.dropTable('ai_agent_configurations', { transaction });
      await queryInterface.dropTable('ai_agent_templates', { transaction });
      await queryInterface.dropTable('ai_provider_configs', { transaction });

      await transaction.commit();
      console.log('✅ AI Agent System tables dropped successfully');

    } catch (error) {
      await transaction.rollback();
      console.error('❌ Error dropping AI Agent System tables:', error);
      throw error;
    }
  }
};
