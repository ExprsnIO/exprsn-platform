/**
 * Seeder: AI Agent System Default Data
 *
 * Seeds:
 * 1. AI Provider Configurations (Anthropic Claude, Ollama local models)
 * 2. AI Agent Templates (Schema Designer, Code Generator, etc.)
 */

'use strict';

const { v4: uuidv4 } = require('uuid');

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const now = new Date();

    // ═══════════════════════════════════════════════════════════
    // 1. AI Provider Configurations
    // ═══════════════════════════════════════════════════════════

    const providers = [
      {
        id: uuidv4(),
        provider_name: 'anthropic-claude',
        provider_type: 'anthropic',
        display_name: 'Anthropic Claude',
        base_url: 'https://api.anthropic.com',
        api_key_env_var: 'ANTHROPIC_API_KEY',
        default_model: 'claude-sonnet-4',
        available_models: JSON.stringify([
          {
            id: 'claude-sonnet-4',
            name: 'Claude Sonnet 4',
            contextWindow: 200000,
            outputTokens: 8192,
          },
          {
            id: 'claude-opus-4',
            name: 'Claude Opus 4',
            contextWindow: 200000,
            outputTokens: 8192,
          },
          {
            id: 'claude-haiku-4',
            name: 'Claude Haiku 4',
            contextWindow: 200000,
            outputTokens: 8192,
          },
        ]),
        config: JSON.stringify({
          apiVersion: '2023-06-01',
          headers: {
            'anthropic-version': '2023-06-01',
          },
        }),
        rate_limits: JSON.stringify({
          rpm: 50, // requests per minute
          rpd: 10000, // requests per day
          tpm: 100000, // tokens per minute
        }),
        cost_config: JSON.stringify({
          input_token_cost: 0.003, // $0.003 per 1K input tokens (Sonnet 4)
          output_token_cost: 0.015, // $0.015 per 1K output tokens
        }),
        is_active: true,
        is_default: true,
        priority: 10,
        health_check_url: 'https://api.anthropic.com',
        health_status: 'healthy',
        created_at: now,
        updated_at: now,
      },
      {
        id: uuidv4(),
        provider_name: 'ollama-local',
        provider_type: 'ollama',
        display_name: 'Ollama (Local Models)',
        base_url: 'http://localhost:11434',
        api_key_env_var: null, // Ollama doesn't need API key
        default_model: 'llama3',
        available_models: JSON.stringify([
          {
            id: 'llama3',
            name: 'Llama 3 (8B)',
            contextWindow: 8192,
            outputTokens: 2048,
          },
          {
            id: 'codellama',
            name: 'Code Llama (7B)',
            contextWindow: 16384,
            outputTokens: 4096,
          },
          {
            id: 'mistral',
            name: 'Mistral (7B)',
            contextWindow: 8192,
            outputTokens: 2048,
          },
        ]),
        config: JSON.stringify({}),
        rate_limits: JSON.stringify({
          rpm: 1000,
          rpd: 100000,
          tpm: 1000000,
        }),
        cost_config: JSON.stringify({
          input_token_cost: 0, // Free (local)
          output_token_cost: 0,
        }),
        is_active: false, // Disabled by default (user must have Ollama installed)
        is_default: false,
        priority: 50,
        health_check_url: 'http://localhost:11434',
        health_status: 'unavailable',
        created_at: now,
        updated_at: now,
      },
    ];

    await queryInterface.bulkInsert('ai_provider_configs', providers);

    // ═══════════════════════════════════════════════════════════
    // 2. AI Agent Templates
    // ═══════════════════════════════════════════════════════════

    const templates = [
      // ─────────────────────────────────────────────────────────
      // Schema Designer Template
      // ─────────────────────────────────────────────────────────
      {
        id: uuidv4(),
        name: 'schema-designer',
        display_name: 'Entity Schema Designer',
        description: 'AI agent for designing database schemas from natural language',
        category: 'schema_design',
        capabilities: JSON.stringify({
          schema_generation: true,
          entity_design: true,
          relationship_mapping: true,
          validation_rules: true
        }),
        system_prompt: `You are an expert database schema designer for a low-code platform. Your job is to convert natural language descriptions into complete, production-ready entity schemas.

RULES:
1. Always return valid JSON with the structure below
2. Use appropriate data types (string, text, integer, decimal, boolean, date, datetime, uuid, json)
3. Suggest appropriate field validations (required, unique, min, max, pattern, enum)
4. Include reasonable default values where applicable
5. Add indexes for fields that will be frequently queried
6. Create relationships between entities when logical
7. Follow naming conventions: snake_case for database, camelCase for application layer
8. Always include created_at and updated_at timestamp fields
9. Use UUIDs for primary keys

RESPONSE FORMAT (JSON):
{
  "entityName": "customer",
  "displayName": "Customer",
  "tableName": "customers",
  "description": "Customer entity for CRM",
  "fields": [
    {
      "name": "firstName",
      "type": "string",
      "dbType": "VARCHAR(100)",
      "required": true,
      "unique": false,
      "index": true,
      "defaultValue": null,
      "validation": {
        "min": 1,
        "max": 100
      },
      "description": "Customer first name"
    }
  ],
  "indexes": [
    {
      "name": "idx_customer_email",
      "fields": ["email"],
      "unique": true
    }
  ],
  "relationships": [
    {
      "type": "hasMany",
      "targetEntity": "order",
      "foreignKey": "customerId",
      "onDelete": "CASCADE"
    }
  ],
  "confidence": 95,
  "reasoning": "Created standard customer entity with common fields for e-commerce"
}`,
        examples: JSON.stringify([
          {
            input: 'Create a product entity with name, description, price, and stock quantity',
            output: {
              entityName: 'product',
              displayName: 'Product',
              tableName: 'products',
              fields: [
                {
                  name: 'name',
                  type: 'string',
                  dbType: 'VARCHAR(255)',
                  required: true,
                  index: true,
                },
                {
                  name: 'description',
                  type: 'text',
                  dbType: 'TEXT',
                  required: false,
                },
                {
                  name: 'price',
                  type: 'decimal',
                  dbType: 'DECIMAL(10,2)',
                  required: true,
                },
                {
                  name: 'stockQuantity',
                  type: 'integer',
                  dbType: 'INTEGER',
                  required: true,
                  defaultValue: 0,
                },
              ],
            },
          },
        ]),
        tools: JSON.stringify([]),
        rate_limit: JSON.stringify({
          requests_per_minute: 60,
          requests_per_hour: 1000
        }),
        default_model: 'claude-sonnet-4',
        temperature: 0.3, // Low temperature for consistency
        max_tokens: 4096,
        response_format: 'json',
        is_system: true,
        is_active: true,
        version: '1.0.0',
        created_by: null,
        created_at: now,
        updated_at: now,
      },

      // ─────────────────────────────────────────────────────────
      // Code Generator Template
      // ─────────────────────────────────────────────────────────
      {
        id: uuidv4(),
        name: 'code-generator',
        display_name: 'Code Generator',
        description: 'AI agent for generating JavaScript code, validation rules, and formulas',
        category: 'schema_design',
        capabilities: JSON.stringify({
          code_generation: true,
          validation_rules: true,
          formula_creation: true,
          javascript_functions: true
        }),
        system_prompt: `You are an expert JavaScript developer specializing in low-code platforms. Generate clean, efficient, well-documented code.

RULES:
1. Write production-ready JavaScript (ES6+)
2. Include JSDoc comments for functions
3. Handle edge cases and errors gracefully
4. Use async/await for asynchronous operations
5. Follow best practices and security guidelines
6. Avoid using eval() or dangerous functions
7. Return code as a string in JSON format

RESPONSE FORMAT (JSON):
{
  "code": "function calculateDiscount(price, percentage) {\\n  // Code here\\n}",
  "language": "javascript",
  "description": "Calculate discount based on price and percentage",
  "dependencies": ["lodash"],
  "tests": [
    {
      "input": { "price": 100, "percentage": 10 },
      "expected": 90
    }
  ],
  "confidence": 90
}`,
        examples: JSON.stringify([
          {
            input: 'Generate a function to validate email addresses',
            output: {
              code: 'function validateEmail(email) {\n  const regex = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;\n  return regex.test(email);\n}',
              language: 'javascript',
              description: 'Validates email using regex pattern',
            },
          },
        ]),
        tools: JSON.stringify([]),
        rate_limit: JSON.stringify({
          requests_per_minute: 60,
          requests_per_hour: 1000
        }),
        default_model: 'claude-sonnet-4',
        temperature: 0.4,
        max_tokens: 4096,
        response_format: 'json',
        is_system: true,
        is_active: true,
        version: '1.0.0',
        created_by: null,
        created_at: now,
        updated_at: now,
      },

      // ─────────────────────────────────────────────────────────
      // Data Transformer Template
      // ─────────────────────────────────────────────────────────
      {
        id: uuidv4(),
        name: 'data-transformer',
        display_name: 'Data Transformer',
        description: 'AI agent for data cleansing, normalization, and enrichment',
        category: 'data_transformation',
        capabilities: JSON.stringify({
          data_cleansing: true,
          data_normalization: true,
          data_enrichment: true,
          quality_analysis: true
        }),
        system_prompt: `You are a data transformation expert. Analyze data and suggest transformation rules.

RULES:
1. Identify data quality issues (missing values, duplicates, inconsistencies)
2. Suggest normalization strategies
3. Propose enrichment opportunities
4. Provide SQL or JavaScript transformation logic
5. Estimate impact on data quality

RESPONSE FORMAT (JSON):
{
  "transformationType": "data_cleansing",
  "issues": [
    {
      "field": "email",
      "issue": "inconsistent_case",
      "severity": "medium",
      "affectedRecords": 150
    }
  ],
  "transformations": [
    {
      "field": "email",
      "operation": "toLowerCase",
      "sql": "UPDATE table SET email = LOWER(email)",
      "javascript": "record.email = record.email.toLowerCase()"
    }
  ],
  "confidence": 85
}`,
        examples: JSON.stringify([]),
        tools: JSON.stringify([]),
        rate_limit: JSON.stringify({
          requests_per_minute: 60,
          requests_per_hour: 1000
        }),
        default_model: 'claude-sonnet-4',
        temperature: 0.4,
        max_tokens: 4096,
        response_format: 'json',
        is_system: true,
        is_active: true,
        version: '1.0.0',
        created_by: null,
        created_at: now,
        updated_at: now,
      },

      // ─────────────────────────────────────────────────────────
      // Workflow Optimizer Template
      // ─────────────────────────────────────────────────────────
      {
        id: uuidv4(),
        name: 'workflow-optimizer',
        display_name: 'Workflow Optimizer',
        description: 'AI agent for analyzing and optimizing workflows',
        category: 'workflow_automation',
        capabilities: JSON.stringify({
          workflow_analysis: true,
          performance_optimization: true,
          bottleneck_detection: true,
          parallelization_suggestions: true
        }),
        system_prompt: `You are a workflow optimization expert. Analyze workflows and suggest improvements.

RULES:
1. Identify bottlenecks and inefficiencies
2. Suggest parallelization opportunities
3. Recommend error handling improvements
4. Propose simplifications
5. Ensure security best practices

RESPONSE FORMAT (JSON):
{
  "optimizationType": "performance",
  "findings": [
    {
      "step": "send_email",
      "issue": "blocking_operation",
      "impact": "high",
      "recommendation": "Move to background queue"
    }
  ],
  "suggestedChanges": [
    {
      "step": "send_email",
      "change": "async_execution",
      "implementation": "Use Bull queue for async processing"
    }
  ],
  "estimatedImprovement": "50% faster execution",
  "confidence": 90
}`,
        examples: JSON.stringify([]),
        tools: JSON.stringify([]),
        rate_limit: JSON.stringify({
          requests_per_minute: 60,
          requests_per_hour: 1000
        }),
        default_model: 'claude-sonnet-4',
        temperature: 0.4,
        max_tokens: 4096,
        response_format: 'json',
        is_system: true,
        is_active: true,
        version: '1.0.0',
        created_by: null,
        created_at: now,
        updated_at: now,
      },

      // ─────────────────────────────────────────────────────────
      // Query Builder Template
      // ─────────────────────────────────────────────────────────
      {
        id: uuidv4(),
        name: 'query-builder',
        display_name: 'Query Builder',
        description: 'AI agent for generating SQL queries from natural language',
        category: 'schema_design',
        capabilities: JSON.stringify({
          sql_generation: true,
          query_optimization: true,
          natural_language_to_sql: true,
          query_validation: true
        }),
        system_prompt: `You are a SQL expert. Convert natural language queries into optimized SQL.

RULES:
1. Generate PostgreSQL-compatible SQL
2. Use parameterized queries to prevent SQL injection
3. Optimize with appropriate indexes
4. Include JOINs when needed
5. Add EXPLAIN PLAN comments for complex queries

RESPONSE FORMAT (JSON):
{
  "sql": "SELECT * FROM customers WHERE email = $1",
  "parameters": ["email"],
  "description": "Find customer by email",
  "expectedPerformance": "O(log n) with index on email",
  "confidence": 95
}`,
        examples: JSON.stringify([]),
        tools: JSON.stringify([]),
        rate_limit: JSON.stringify({
          requests_per_minute: 60,
          requests_per_hour: 1000
        }),
        default_model: 'claude-sonnet-4',
        temperature: 0.3,
        max_tokens: 4096,
        response_format: 'json',
        is_system: true,
        is_active: true,
        version: '1.0.0',
        created_by: null,
        created_at: now,
        updated_at: now,
      },

      // ─────────────────────────────────────────────────────────
      // Validation Creator Template
      // ─────────────────────────────────────────────────────────
      {
        id: uuidv4(),
        name: 'validation-creator',
        display_name: 'Validation Rule Creator',
        description: 'AI agent for creating validation rules',
        category: 'validation',
        capabilities: JSON.stringify({
          validation_rules: true,
          input_validation: true,
          error_messages: true,
          regex_patterns: true
        }),
        system_prompt: `You are a validation expert. Create comprehensive validation rules.

RULES:
1. Cover all edge cases
2. Provide clear error messages
3. Use industry best practices
4. Consider user experience
5. Support both client and server-side validation

RESPONSE FORMAT (JSON):
{
  "field": "email",
  "validations": [
    {
      "type": "format",
      "rule": "email",
      "message": "Please enter a valid email address"
    },
    {
      "type": "required",
      "message": "Email is required"
    }
  ],
  "clientSideCode": "Joi.string().email().required()",
  "serverSideCode": "validateEmail(value)",
  "confidence": 95
}`,
        examples: JSON.stringify([]),
        tools: JSON.stringify([]),
        rate_limit: JSON.stringify({
          requests_per_minute: 60,
          requests_per_hour: 1000
        }),
        default_model: 'claude-sonnet-4',
        temperature: 0.3,
        max_tokens: 4096,
        response_format: 'json',
        is_system: true,
        is_active: true,
        version: '1.0.0',
        created_by: null,
        created_at: now,
        updated_at: now,
      },

      // ─────────────────────────────────────────────────────────
      // General Assistant Template
      // ─────────────────────────────────────────────────────────
      {
        id: uuidv4(),
        name: 'general-assistant',
        display_name: 'General Assistant',
        description: 'AI agent for general low-code platform assistance',
        category: 'conversational',
        capabilities: JSON.stringify({
          general_assistance: true,
          feature_explanation: true,
          troubleshooting: true,
          best_practices: true
        }),
        system_prompt: `You are a helpful assistant for a low-code development platform. Assist users with:
- Understanding platform features
- Troubleshooting issues
- Best practices
- Architecture recommendations
- Performance optimization

Be concise, helpful, and provide actionable guidance.`,
        examples: JSON.stringify([]),
        tools: JSON.stringify([]),
        rate_limit: JSON.stringify({
          requests_per_minute: 60,
          requests_per_hour: 1000
        }),
        default_model: 'claude-sonnet-4',
        temperature: 0.7, // Higher temperature for conversation
        max_tokens: 2048,
        response_format: 'text',
        is_system: true,
        is_active: true,
        version: '1.0.0',
        created_by: null,
        created_at: now,
        updated_at: now,
      },
    ];

    await queryInterface.bulkInsert('ai_agent_templates', templates);

    console.log('✅ AI Agent System seeded with:');
    console.log(`   - ${providers.length} providers`);
    console.log(`   - ${templates.length} templates`);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.bulkDelete('ai_agent_templates', null, {});
    await queryInterface.bulkDelete('ai_provider_configs', null, {});
    console.log('✅ AI Agent System seed data removed');
  },
};
