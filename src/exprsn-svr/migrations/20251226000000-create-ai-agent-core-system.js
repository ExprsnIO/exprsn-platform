/**
 * Migration: AI Agent Core System for Low-Code Platform
 *
 * Comprehensive AI agent infrastructure for:
 * - Schema generation and suggestions (entities, tables, columns)
 * - Data transformation and validation
 * - Workflow/process generation and optimization
 * - Decision table dynamic decision-making
 * - Conversational interface for natural language queries
 * - Multi-provider support (Anthropic Claude, Ollama, custom)
 * - Hybrid configuration (global templates + per-entity customization)
 *
 * Date: 2025-12-26
 * Author: AI Integration Specialist
 */

'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {

    // AI Agent Templates - Global reusable AI personas
    await queryInterface.createTable('ai_agent_templates', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      name: { type: Sequelize.STRING(100), allowNull: false, unique: true }, // e.g., 'schema-architect', 'data-validator'
      display_name: { type: Sequelize.STRING(255), allowNull: false },
      description: { type: Sequelize.TEXT },
      category: {
        type: Sequelize.ENUM(
          'schema_design', 'data_transformation', 'workflow_automation',
          'validation', 'optimization', 'conversational', 'analysis'
        ),
        allowNull: false
      },
      capabilities: {
        type: Sequelize.JSONB,
        defaultValue: {},
        comment: '{ schema_generation: true, data_validation: true, workflow_optimization: false, ... }'
      },
      system_prompt: { type: Sequelize.TEXT, allowNull: false, comment: 'Base system prompt for this agent' },
      default_model: { type: Sequelize.STRING(100), defaultValue: 'claude-sonnet-4' }, // claude-sonnet-4, claude-opus-4, ollama:llama3
      temperature: { type: Sequelize.DECIMAL(3, 2), defaultValue: 0.7 },
      max_tokens: { type: Sequelize.INTEGER, defaultValue: 4096 },
      response_format: { type: Sequelize.ENUM('text', 'json', 'structured'), defaultValue: 'json' },
      examples: {
        type: Sequelize.JSONB,
        defaultValue: [],
        comment: 'Few-shot examples for this agent [{ input, output }]'
      },
      tools: {
        type: Sequelize.JSONB,
        defaultValue: [],
        comment: 'Function calling tools available to this agent'
      },
      rate_limit: {
        type: Sequelize.JSONB,
        defaultValue: { requests_per_minute: 60, requests_per_hour: 1000 }
      },
      is_active: { type: Sequelize.BOOLEAN, defaultValue: true },
      is_system: { type: Sequelize.BOOLEAN, defaultValue: false, comment: 'System templates cannot be deleted' },
      version: { type: Sequelize.STRING(20), defaultValue: '1.0.0' },
      created_by: { type: Sequelize.UUID },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    });
    await queryInterface.addIndex('ai_agent_templates', ['name']);
    await queryInterface.addIndex('ai_agent_templates', ['category']);
    await queryInterface.addIndex('ai_agent_templates', ['is_active']);

    // AI Provider Configurations - Multi-provider support
    await queryInterface.createTable('ai_provider_configs', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      provider_name: { type: Sequelize.STRING(100), allowNull: false, unique: true }, // 'anthropic', 'ollama', 'openai', 'custom'
      provider_type: {
        type: Sequelize.ENUM('anthropic', 'ollama', 'openai', 'custom'),
        allowNull: false
      },
      display_name: { type: Sequelize.STRING(255), allowNull: false },
      base_url: { type: Sequelize.STRING(500) }, // For Ollama or custom providers
      api_key_env_var: { type: Sequelize.STRING(100), comment: 'Environment variable name for API key' },
      default_model: { type: Sequelize.STRING(100) },
      available_models: {
        type: Sequelize.JSONB,
        defaultValue: [],
        comment: '[{ id: "claude-sonnet-4", name: "Claude Sonnet 4", maxTokens: 200000 }]'
      },
      config: {
        type: Sequelize.JSONB,
        defaultValue: {},
        comment: 'Provider-specific configuration (headers, auth, etc.)'
      },
      rate_limits: {
        type: Sequelize.JSONB,
        defaultValue: { rpm: 50, rpd: 10000, tpm: 100000 },
        comment: 'Requests per minute, requests per day, tokens per minute'
      },
      cost_config: {
        type: Sequelize.JSONB,
        defaultValue: {},
        comment: '{ input_token_cost: 0.003, output_token_cost: 0.015 } per 1000 tokens'
      },
      is_active: { type: Sequelize.BOOLEAN, defaultValue: true },
      is_default: { type: Sequelize.BOOLEAN, defaultValue: false },
      priority: { type: Sequelize.INTEGER, defaultValue: 100 }, // Lower number = higher priority
      health_check_url: { type: Sequelize.STRING(500) },
      last_health_check: { type: Sequelize.DATE },
      health_status: { type: Sequelize.ENUM('healthy', 'degraded', 'unavailable'), defaultValue: 'healthy' },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    });
    await queryInterface.addIndex('ai_provider_configs', ['provider_type']);
    await queryInterface.addIndex('ai_provider_configs', ['is_active', 'is_default']);

    // AI Agent Configurations - Per-entity/form/workflow customization
    await queryInterface.createTable('ai_agent_configurations', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      template_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'ai_agent_templates', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },
      target_type: {
        type: Sequelize.ENUM(
          'application', 'entity', 'form', 'grid', 'workflow',
          'process', 'decision_table', 'chart', 'dashboard'
        ),
        allowNull: false
      },
      target_id: { type: Sequelize.UUID, allowNull: false, comment: 'ID of the entity/form/workflow' },
      is_enabled: { type: Sequelize.BOOLEAN, defaultValue: true },
      custom_prompt: { type: Sequelize.TEXT, comment: 'Additional instructions specific to this entity' },
      override_model: { type: Sequelize.STRING(100), comment: 'Override default model for this configuration' },
      override_temperature: { type: Sequelize.DECIMAL(3, 2) },
      override_max_tokens: { type: Sequelize.INTEGER },
      trigger_events: {
        type: Sequelize.JSONB,
        defaultValue: [],
        comment: 'When to invoke this agent: ["onCreate", "onUpdate", "onValidate", "onDemand"]'
      },
      auto_execute: { type: Sequelize.BOOLEAN, defaultValue: false, comment: 'Execute automatically on triggers' },
      require_approval: { type: Sequelize.BOOLEAN, defaultValue: true, comment: 'Require human approval before applying suggestions' },
      context_data: {
        type: Sequelize.JSONB,
        defaultValue: {},
        comment: 'Additional context for the agent (schema details, business rules, etc.)'
      },
      execution_count: { type: Sequelize.INTEGER, defaultValue: 0 },
      success_count: { type: Sequelize.INTEGER, defaultValue: 0 },
      last_executed_at: { type: Sequelize.DATE },
      created_by: { type: Sequelize.UUID },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    });
    await queryInterface.addIndex('ai_agent_configurations', ['template_id']);
    await queryInterface.addIndex('ai_agent_configurations', ['target_type', 'target_id']);
    await queryInterface.addIndex('ai_agent_configurations', ['is_enabled']);
    await queryInterface.addConstraint('ai_agent_configurations', {
      fields: ['target_type', 'target_id', 'template_id'],
      type: 'unique',
      name: 'unique_agent_per_target'
    });

    // AI Execution Logs - Track all AI calls for debugging, costs, auditing
    await queryInterface.createTable('ai_execution_logs', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      configuration_id: {
        type: Sequelize.UUID,
        references: { model: 'ai_agent_configurations', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      template_id: {
        type: Sequelize.UUID,
        references: { model: 'ai_agent_templates', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      provider_name: { type: Sequelize.STRING(100), allowNull: false },
      model: { type: Sequelize.STRING(100), allowNull: false },
      execution_type: {
        type: Sequelize.ENUM(
          'schema_generation', 'data_validation', 'data_transformation',
          'workflow_generation', 'workflow_optimization', 'decision_evaluation',
          'conversational_query', 'analysis'
        ),
        allowNull: false
      },
      target_type: { type: Sequelize.STRING(50) },
      target_id: { type: Sequelize.UUID },
      input_prompt: { type: Sequelize.TEXT, allowNull: false },
      input_context: { type: Sequelize.JSONB, defaultValue: {} },
      output_response: { type: Sequelize.TEXT },
      output_structured: { type: Sequelize.JSONB, defaultValue: {} },
      tokens_input: { type: Sequelize.INTEGER },
      tokens_output: { type: Sequelize.INTEGER },
      estimated_cost: { type: Sequelize.DECIMAL(10, 6), comment: 'Cost in USD' },
      duration_ms: { type: Sequelize.INTEGER },
      status: {
        type: Sequelize.ENUM('pending', 'success', 'error', 'timeout', 'rate_limited'),
        allowNull: false,
        defaultValue: 'pending'
      },
      error_message: { type: Sequelize.TEXT },
      error_code: { type: Sequelize.STRING(100) },
      retry_count: { type: Sequelize.INTEGER, defaultValue: 0 },
      user_id: { type: Sequelize.UUID },
      session_id: { type: Sequelize.UUID, comment: 'For grouping related executions' },
      created_at: { type: Sequelize.DATE, allowNull: false }
    });
    await queryInterface.addIndex('ai_execution_logs', ['configuration_id', 'created_at']);
    await queryInterface.addIndex('ai_execution_logs', ['execution_type']);
    await queryInterface.addIndex('ai_execution_logs', ['status']);
    await queryInterface.addIndex('ai_execution_logs', ['user_id']);
    await queryInterface.addIndex('ai_execution_logs', ['session_id']);
    await queryInterface.addIndex('ai_execution_logs', ['created_at']); // For retention cleanup

    // AI Schema Suggestions - Entity/table/column generation
    await queryInterface.createTable('ai_schema_suggestions', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      execution_log_id: {
        type: Sequelize.UUID,
        references: { model: 'ai_execution_logs', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      application_id: { type: Sequelize.UUID },
      entity_id: { type: Sequelize.UUID, comment: 'Existing entity being modified, or null for new entity' },
      suggestion_type: {
        type: Sequelize.ENUM(
          'new_entity', 'add_field', 'modify_field', 'remove_field',
          'add_relationship', 'add_index', 'add_validation',
          'complete_schema'
        ),
        allowNull: false
      },
      suggested_schema: {
        type: Sequelize.JSONB,
        allowNull: false,
        comment: 'Complete entity schema or specific changes'
      },
      reasoning: { type: Sequelize.TEXT, comment: 'Why the AI suggested this' },
      confidence_score: { type: Sequelize.INTEGER, comment: '0-100' },
      user_prompt: { type: Sequelize.TEXT, allowNull: false, comment: 'Original natural language request' },
      status: {
        type: Sequelize.ENUM('pending', 'approved', 'rejected', 'applied', 'expired'),
        defaultValue: 'pending'
      },
      reviewed_by: { type: Sequelize.UUID },
      reviewed_at: { type: Sequelize.DATE },
      review_feedback: { type: Sequelize.TEXT },
      applied_at: { type: Sequelize.DATE },
      applied_result: { type: Sequelize.JSONB, comment: 'Result of applying the suggestion (entity ID, etc.)' },
      expires_at: { type: Sequelize.DATE },
      created_by: { type: Sequelize.UUID, allowNull: false },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    });
    await queryInterface.addIndex('ai_schema_suggestions', ['application_id']);
    await queryInterface.addIndex('ai_schema_suggestions', ['entity_id']);
    await queryInterface.addIndex('ai_schema_suggestions', ['status']);
    await queryInterface.addIndex('ai_schema_suggestions', ['created_by']);

    // AI Data Transformations - Data cleansing, normalization, enrichment
    await queryInterface.createTable('ai_data_transformations', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      execution_log_id: {
        type: Sequelize.UUID,
        references: { model: 'ai_execution_logs', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      entity_id: { type: Sequelize.UUID, allowNull: false },
      transformation_type: {
        type: Sequelize.ENUM(
          'data_cleansing', 'data_enrichment', 'data_normalization',
          'duplicate_detection', 'missing_data_completion', 'validation',
          'batch_update', 'data_migration'
        ),
        allowNull: false
      },
      source_query: {
        type: Sequelize.JSONB,
        defaultValue: {},
        comment: 'Query to select records to transform'
      },
      transformation_rules: {
        type: Sequelize.JSONB,
        allowNull: false,
        comment: 'AI-generated transformation logic'
      },
      preview_results: {
        type: Sequelize.JSONB,
        defaultValue: [],
        comment: 'Sample of transformed data for review'
      },
      records_affected: { type: Sequelize.INTEGER },
      execution_plan: { type: Sequelize.TEXT, comment: 'Human-readable explanation' },
      status: {
        type: Sequelize.ENUM('pending', 'approved', 'running', 'completed', 'failed', 'cancelled'),
        defaultValue: 'pending'
      },
      progress: { type: Sequelize.INTEGER, defaultValue: 0, comment: '0-100' },
      started_at: { type: Sequelize.DATE },
      completed_at: { type: Sequelize.DATE },
      error_details: { type: Sequelize.JSONB },
      approved_by: { type: Sequelize.UUID },
      approved_at: { type: Sequelize.DATE },
      created_by: { type: Sequelize.UUID, allowNull: false },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    });
    await queryInterface.addIndex('ai_data_transformations', ['entity_id']);
    await queryInterface.addIndex('ai_data_transformations', ['status']);
    await queryInterface.addIndex('ai_data_transformations', ['transformation_type']);

    // AI Conversation Sessions - Natural language interface
    await queryInterface.createTable('ai_conversation_sessions', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      user_id: { type: Sequelize.UUID, allowNull: false },
      application_id: { type: Sequelize.UUID },
      session_type: {
        type: Sequelize.ENUM('schema_design', 'data_query', 'workflow_builder', 'general_assistant'),
        allowNull: false
      },
      context: {
        type: Sequelize.JSONB,
        defaultValue: {},
        comment: 'Current conversation context (entities, forms, workflows referenced)'
      },
      message_count: { type: Sequelize.INTEGER, defaultValue: 0 },
      last_message_at: { type: Sequelize.DATE },
      is_active: { type: Sequelize.BOOLEAN, defaultValue: true },
      ended_at: { type: Sequelize.DATE },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    });
    await queryInterface.addIndex('ai_conversation_sessions', ['user_id', 'is_active']);
    await queryInterface.addIndex('ai_conversation_sessions', ['application_id']);

    // AI Conversation Messages
    await queryInterface.createTable('ai_conversation_messages', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      session_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'ai_conversation_sessions', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      execution_log_id: {
        type: Sequelize.UUID,
        references: { model: 'ai_execution_logs', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      role: { type: Sequelize.ENUM('user', 'assistant', 'system'), allowNull: false },
      content: { type: Sequelize.TEXT, allowNull: false },
      structured_data: {
        type: Sequelize.JSONB,
        defaultValue: {},
        comment: 'Parsed intents, entities, actions from the message'
      },
      actions_taken: {
        type: Sequelize.JSONB,
        defaultValue: [],
        comment: '[{ type: "create_entity", result: {...} }]'
      },
      created_at: { type: Sequelize.DATE, allowNull: false }
    });
    await queryInterface.addIndex('ai_conversation_messages', ['session_id', 'created_at']);

    // AI Workflow Optimizations - Process improvement suggestions
    await queryInterface.createTable('ai_workflow_optimizations', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      execution_log_id: {
        type: Sequelize.UUID,
        references: { model: 'ai_execution_logs', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      workflow_type: { type: Sequelize.ENUM('lowcode_process', 'exprsn_workflow'), allowNull: false },
      workflow_id: { type: Sequelize.UUID, allowNull: false },
      optimization_type: {
        type: Sequelize.ENUM(
          'performance', 'cost_reduction', 'error_handling',
          'parallel_execution', 'step_consolidation', 'resource_optimization',
          'security_improvement', 'maintainability'
        ),
        allowNull: false
      },
      current_metrics: {
        type: Sequelize.JSONB,
        defaultValue: {},
        comment: '{ avg_duration_ms: 5000, error_rate: 0.05, cost_per_execution: 0.25 }'
      },
      suggested_changes: {
        type: Sequelize.JSONB,
        allowNull: false,
        comment: 'Modified workflow definition with optimizations'
      },
      projected_improvements: {
        type: Sequelize.JSONB,
        defaultValue: {},
        comment: '{ duration_reduction: "40%", error_rate_improvement: "60%", cost_savings: "$100/month" }'
      },
      reasoning: { type: Sequelize.TEXT, allowNull: false },
      confidence_score: { type: Sequelize.INTEGER, comment: '0-100' },
      test_results: {
        type: Sequelize.JSONB,
        comment: 'Results from testing the optimized workflow'
      },
      status: {
        type: Sequelize.ENUM('pending', 'testing', 'approved', 'applied', 'rejected'),
        defaultValue: 'pending'
      },
      reviewed_by: { type: Sequelize.UUID },
      reviewed_at: { type: Sequelize.DATE },
      applied_at: { type: Sequelize.DATE },
      created_by: { type: Sequelize.UUID },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    });
    await queryInterface.addIndex('ai_workflow_optimizations', ['workflow_type', 'workflow_id']);
    await queryInterface.addIndex('ai_workflow_optimizations', ['status']);
    await queryInterface.addIndex('ai_workflow_optimizations', ['optimization_type']);

    // AI Decision Evaluations - Dynamic decision table execution
    await queryInterface.createTable('ai_decision_evaluations', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      execution_log_id: {
        type: Sequelize.UUID,
        references: { model: 'ai_execution_logs', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      decision_table_id: { type: Sequelize.UUID, allowNull: false },
      input_data: { type: Sequelize.JSONB, allowNull: false, comment: 'Input values for the decision' },
      ai_decision: { type: Sequelize.JSONB, allowNull: false, comment: 'AI-generated decision output' },
      rule_based_decision: { type: Sequelize.JSONB, comment: 'What the rules would have returned' },
      confidence_score: { type: Sequelize.INTEGER, comment: '0-100' },
      reasoning: { type: Sequelize.TEXT, comment: 'Why the AI made this decision' },
      factors_considered: {
        type: Sequelize.JSONB,
        defaultValue: [],
        comment: '[{ factor: "customer_history", weight: 0.8, value: "..." }]'
      },
      was_correct: { type: Sequelize.BOOLEAN, comment: 'Feedback on decision accuracy' },
      actual_outcome: { type: Sequelize.JSONB, comment: 'What actually happened' },
      feedback_provided_by: { type: Sequelize.UUID },
      feedback_provided_at: { type: Sequelize.DATE },
      created_at: { type: Sequelize.DATE, allowNull: false }
    });
    await queryInterface.addIndex('ai_decision_evaluations', ['decision_table_id', 'created_at']);
    await queryInterface.addIndex('ai_decision_evaluations', ['was_correct']);

    console.log('✅ AI Agent Core System created successfully!');
    console.log('');
    console.log('📋 Agent Templates: ai_agent_templates (reusable AI personas)');
    console.log('🔌 Provider Configs: ai_provider_configs (Anthropic, Ollama, custom)');
    console.log('⚙️  Agent Configurations: ai_agent_configurations (per-entity customization)');
    console.log('📊 Execution Logs: ai_execution_logs (tracking, costs, debugging)');
    console.log('🏗️  Schema Suggestions: ai_schema_suggestions (entity/table/column generation)');
    console.log('🔄 Data Transformations: ai_data_transformations (cleansing, enrichment)');
    console.log('💬 Conversations: ai_conversation_sessions + ai_conversation_messages');
    console.log('⚡ Workflow Optimizations: ai_workflow_optimizations (process improvements)');
    console.log('🎯 Decision Evaluations: ai_decision_evaluations (dynamic decision-making)');
    console.log('');
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('ai_decision_evaluations');
    await queryInterface.dropTable('ai_workflow_optimizations');
    await queryInterface.dropTable('ai_conversation_messages');
    await queryInterface.dropTable('ai_conversation_sessions');
    await queryInterface.dropTable('ai_data_transformations');
    await queryInterface.dropTable('ai_schema_suggestions');
    await queryInterface.dropTable('ai_execution_logs');
    await queryInterface.dropTable('ai_agent_configurations');
    await queryInterface.dropTable('ai_provider_configs');
    await queryInterface.dropTable('ai_agent_templates');
  }
};
