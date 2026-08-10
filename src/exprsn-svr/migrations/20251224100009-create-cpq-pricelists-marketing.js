/**
 * Migration: CPQ, Price Lists, and Marketing Automation
 *
 * Adds:
 * - Master Price Lists
 * - Customer-Specific Price Lists
 * - CPQ (Configure, Price, Quote) System
 * - Sales Quotations & Proposals
 * - NPS Surveys & Workflows
 * - Email Marketing Campaigns
 * - Marketing Sequences
 */

'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {

    // ============================================
    // PRICE LISTS - MASTER & CUSTOMER-SPECIFIC
    // ============================================

    // Master Price Lists (catalog pricing)
    await queryInterface.createTable('master_price_lists', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      name: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      code: {
        type: Sequelize.STRING(50),
        allowNull: false,
        unique: true
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      currency_code: {
        type: Sequelize.STRING(3),
        allowNull: false,
        defaultValue: 'USD'
      },
      // Type and scope
      price_list_type: {
        type: Sequelize.ENUM('standard', 'promotional', 'wholesale', 'retail', 'contract', 'volume'),
        allowNull: false,
        defaultValue: 'standard'
      },
      is_default: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      // Validity
      effective_from: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW
      },
      effective_to: {
        type: Sequelize.DATE,
        allowNull: true
      },
      // Geographic scope
      applicable_countries: {
        type: Sequelize.ARRAY(Sequelize.STRING),
        allowNull: true,
        comment: 'Country codes where this price list applies'
      },
      applicable_regions: {
        type: Sequelize.ARRAY(Sequelize.STRING),
        allowNull: true
      },
      // Status
      is_active: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      // Rounding
      rounding_method: {
        type: Sequelize.ENUM('none', 'nearest', 'up', 'down'),
        allowNull: false,
        defaultValue: 'nearest'
      },
      rounding_precision: {
        type: Sequelize.DECIMAL(5, 2),
        allowNull: false,
        defaultValue: 0.01
      },
      created_by: {
        type: Sequelize.UUID,
        allowNull: false
      },
      metadata: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {}
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

    await queryInterface.addIndex('master_price_lists', ['code'], { unique: true });
    await queryInterface.addIndex('master_price_lists', ['is_active']);
    await queryInterface.addIndex('master_price_lists', ['is_default']);
    await queryInterface.addIndex('master_price_lists', ['effective_from', 'effective_to']);

    // Master Price List Items
    await queryInterface.createTable('master_price_list_items', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      price_list_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'master_price_lists',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      product_id: {
        type: Sequelize.UUID,
        allowNull: false
      },
      // Pricing
      list_price: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false
      },
      cost_price: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: true
      },
      margin_percent: {
        type: Sequelize.DECIMAL(5, 2),
        allowNull: true
      },
      // Discounts
      discount_percent: {
        type: Sequelize.DECIMAL(5, 2),
        allowNull: false,
        defaultValue: 0
      },
      discount_amount: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0
      },
      final_price: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false
      },
      // Volume pricing tiers
      volume_tiers: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: [],
        comment: 'Array of {minQuantity, maxQuantity, price, discountPercent}'
      },
      // Unit of measure
      uom: {
        type: Sequelize.STRING(50),
        allowNull: true,
        comment: 'Unit of measure for this price'
      },
      // Validity
      effective_from: {
        type: Sequelize.DATE,
        allowNull: true
      },
      effective_to: {
        type: Sequelize.DATE,
        allowNull: true
      },
      metadata: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {}
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

    await queryInterface.addIndex('master_price_list_items', ['price_list_id']);
    await queryInterface.addIndex('master_price_list_items', ['product_id']);
    await queryInterface.addIndex('master_price_list_items', ['price_list_id', 'product_id'], { unique: true });

    // Customer-Specific Price Lists
    await queryInterface.createTable('customer_price_lists', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      name: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      // Link to customer/account
      customer_id: {
        type: Sequelize.UUID,
        allowNull: true,
        comment: 'Specific customer'
      },
      account_id: {
        type: Sequelize.UUID,
        allowNull: true,
        comment: 'Customer account/company'
      },
      customer_segment: {
        type: Sequelize.STRING(100),
        allowNull: true,
        comment: 'If applies to customer segment rather than individual'
      },
      // Base price list
      master_price_list_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'master_price_lists',
          key: 'id'
        },
        comment: 'Base price list to override'
      },
      currency_code: {
        type: Sequelize.STRING(3),
        allowNull: false,
        defaultValue: 'USD'
      },
      // Validity
      effective_from: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW
      },
      effective_to: {
        type: Sequelize.DATE,
        allowNull: true
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      // Payment terms
      payment_terms: {
        type: Sequelize.STRING(100),
        allowNull: true
      },
      credit_limit: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: true
      },
      // Auto-apply rules
      auto_apply: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      priority: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'Higher priority wins if multiple price lists apply'
      },
      created_by: {
        type: Sequelize.UUID,
        allowNull: false
      },
      approved_by: {
        type: Sequelize.UUID,
        allowNull: true
      },
      notes: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      metadata: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {}
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

    await queryInterface.addIndex('customer_price_lists', ['customer_id']);
    await queryInterface.addIndex('customer_price_lists', ['account_id']);
    await queryInterface.addIndex('customer_price_lists', ['master_price_list_id']);
    await queryInterface.addIndex('customer_price_lists', ['is_active']);
    await queryInterface.addIndex('customer_price_lists', ['effective_from', 'effective_to']);

    // Customer Price List Items
    await queryInterface.createTable('customer_price_list_items', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      price_list_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'customer_price_lists',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      product_id: {
        type: Sequelize.UUID,
        allowNull: false
      },
      override_price: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: true,
        comment: 'Custom price for this customer'
      },
      discount_percent: {
        type: Sequelize.DECIMAL(5, 2),
        allowNull: true,
        comment: 'Discount off master price list'
      },
      discount_amount: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: true
      },
      final_price: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false
      },
      minimum_quantity: {
        type: Sequelize.DECIMAL(15, 4),
        allowNull: true
      },
      maximum_quantity: {
        type: Sequelize.DECIMAL(15, 4),
        allowNull: true
      },
      uom: {
        type: Sequelize.STRING(50),
        allowNull: true
      },
      notes: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      metadata: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {}
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

    await queryInterface.addIndex('customer_price_list_items', ['price_list_id']);
    await queryInterface.addIndex('customer_price_list_items', ['product_id']);
    await queryInterface.addIndex('customer_price_list_items', ['price_list_id', 'product_id'], { unique: true });

    // ============================================
    // CPQ - CONFIGURE, PRICE, QUOTE
    // ============================================

    // Product Configurations (for CPQ)
    await queryInterface.createTable('product_configurations', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      product_id: {
        type: Sequelize.UUID,
        allowNull: false
      },
      name: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      // Configuration options
      configuration_schema: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {},
        comment: 'JSON Schema defining available configuration options'
      },
      // Pricing rules
      base_price: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false
      },
      pricing_rules: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: [],
        comment: 'Rules for calculating price based on configuration'
      },
      // Validation rules
      validation_rules: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: [],
        comment: 'Rules for validating configuration combinations'
      },
      // Dependencies
      option_dependencies: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {},
        comment: 'Dependencies between configuration options'
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      version: {
        type: Sequelize.STRING(50),
        allowNull: false,
        defaultValue: '1.0'
      },
      metadata: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {}
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

    await queryInterface.addIndex('product_configurations', ['product_id']);
    await queryInterface.addIndex('product_configurations', ['is_active']);

    // CPQ Quotes
    await queryInterface.createTable('cpq_quotes', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      quote_number: {
        type: Sequelize.STRING(100),
        allowNull: false,
        unique: true
      },
      quote_name: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      // Customer
      account_id: {
        type: Sequelize.UUID,
        allowNull: true
      },
      contact_id: {
        type: Sequelize.UUID,
        allowNull: true
      },
      opportunity_id: {
        type: Sequelize.UUID,
        allowNull: true
      },
      deal_id: {
        type: Sequelize.UUID,
        allowNull: true
      },
      // Dates
      quote_date: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW
      },
      expiration_date: {
        type: Sequelize.DATE,
        allowNull: true
      },
      // Line items with configurations
      line_items: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: [],
        comment: 'Array of configured products with pricing'
      },
      // Pricing
      subtotal: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0
      },
      discount_amount: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0
      },
      discount_percent: {
        type: Sequelize.DECIMAL(5, 2),
        allowNull: false,
        defaultValue: 0
      },
      tax_amount: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0
      },
      shipping_amount: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0
      },
      total_amount: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0
      },
      currency_code: {
        type: Sequelize.STRING(3),
        allowNull: false,
        defaultValue: 'USD'
      },
      // Terms
      payment_terms: {
        type: Sequelize.STRING(100),
        allowNull: true
      },
      delivery_terms: {
        type: Sequelize.STRING(100),
        allowNull: true
      },
      warranty_terms: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      // Status
      status: {
        type: Sequelize.ENUM('draft', 'pending_review', 'approved', 'sent', 'accepted', 'rejected', 'expired', 'cancelled'),
        allowNull: false,
        defaultValue: 'draft'
      },
      // Approval workflow
      requires_approval: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      approved_by: {
        type: Sequelize.UUID,
        allowNull: true
      },
      approved_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      // Customer response
      accepted_by_customer: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      accepted_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      customer_signature: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Base64 signature or e-signature ID'
      },
      rejection_reason: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      // Conversion
      sales_order_id: {
        type: Sequelize.UUID,
        allowNull: true,
        comment: 'If converted to sales order'
      },
      // Assignment
      owner_id: {
        type: Sequelize.UUID,
        allowNull: false
      },
      created_by: {
        type: Sequelize.UUID,
        allowNull: false
      },
      // Document generation
      pdf_url: {
        type: Sequelize.STRING(1000),
        allowNull: true
      },
      pdf_generated_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      template_id: {
        type: Sequelize.UUID,
        allowNull: true
      },
      // Versioning
      version: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 1
      },
      previous_version_id: {
        type: Sequelize.UUID,
        allowNull: true
      },
      notes: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      internal_notes: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Notes not visible to customer'
      },
      metadata: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {}
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

    await queryInterface.addIndex('cpq_quotes', ['quote_number'], { unique: true });
    await queryInterface.addIndex('cpq_quotes', ['account_id']);
    await queryInterface.addIndex('cpq_quotes', ['opportunity_id']);
    await queryInterface.addIndex('cpq_quotes', ['deal_id']);
    await queryInterface.addIndex('cpq_quotes', ['owner_id']);
    await queryInterface.addIndex('cpq_quotes', ['status']);
    await queryInterface.addIndex('cpq_quotes', ['quote_date']);
    await queryInterface.addIndex('cpq_quotes', ['expiration_date']);

    // Sales Proposals (more detailed than quotes)
    await queryInterface.createTable('sales_proposals', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      proposal_number: {
        type: Sequelize.STRING(100),
        allowNull: false,
        unique: true
      },
      title: {
        type: Sequelize.STRING(500),
        allowNull: false
      },
      // Customer
      account_id: {
        type: Sequelize.UUID,
        allowNull: true
      },
      contact_id: {
        type: Sequelize.UUID,
        allowNull: true
      },
      opportunity_id: {
        type: Sequelize.UUID,
        allowNull: true
      },
      deal_id: {
        type: Sequelize.UUID,
        allowNull: true
      },
      cpq_quote_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'cpq_quotes',
          key: 'id'
        }
      },
      // Dates
      proposal_date: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW
      },
      expiration_date: {
        type: Sequelize.DATE,
        allowNull: true
      },
      presentation_date: {
        type: Sequelize.DATE,
        allowNull: true
      },
      // Content sections
      executive_summary: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      problem_statement: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      proposed_solution: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      implementation_plan: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      pricing_summary: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      terms_and_conditions: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      case_studies: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: []
      },
      testimonials: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: []
      },
      // Pricing
      total_investment: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0
      },
      currency_code: {
        type: Sequelize.STRING(3),
        allowNull: false,
        defaultValue: 'USD'
      },
      // Status
      status: {
        type: Sequelize.ENUM('draft', 'pending_review', 'approved', 'sent', 'presented', 'accepted', 'rejected', 'expired'),
        allowNull: false,
        defaultValue: 'draft'
      },
      // Tracking
      sent_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      opened_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      view_count: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      // Assignment
      owner_id: {
        type: Sequelize.UUID,
        allowNull: false
      },
      team_members: {
        type: Sequelize.ARRAY(Sequelize.UUID),
        allowNull: true,
        defaultValue: []
      },
      // Documents
      attachments: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: []
      },
      pdf_url: {
        type: Sequelize.STRING(1000),
        allowNull: true
      },
      template_id: {
        type: Sequelize.UUID,
        allowNull: true
      },
      version: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 1
      },
      metadata: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {}
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

    await queryInterface.addIndex('sales_proposals', ['proposal_number'], { unique: true });
    await queryInterface.addIndex('sales_proposals', ['account_id']);
    await queryInterface.addIndex('sales_proposals', ['opportunity_id']);
    await queryInterface.addIndex('sales_proposals', ['deal_id']);
    await queryInterface.addIndex('sales_proposals', ['cpq_quote_id']);
    await queryInterface.addIndex('sales_proposals', ['status']);

    // ============================================
    // MARKETING - NPS SURVEYS
    // ============================================

    // NPS Surveys
    await queryInterface.createTable('nps_surveys', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      name: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      // Survey question
      question: {
        type: Sequelize.TEXT,
        allowNull: false,
        defaultValue: 'How likely are you to recommend us to a friend or colleague?'
      },
      follow_up_question_promoter: {
        type: Sequelize.TEXT,
        allowNull: true,
        defaultValue: 'What do you like most about us?'
      },
      follow_up_question_passive: {
        type: Sequelize.TEXT,
        allowNull: true,
        defaultValue: 'What could we do to improve?'
      },
      follow_up_question_detractor: {
        type: Sequelize.TEXT,
        allowNull: true,
        defaultValue: 'What would make your experience better?'
      },
      // Trigger conditions
      trigger_type: {
        type: Sequelize.ENUM('manual', 'post_purchase', 'post_support', 'periodic', 'milestone', 'workflow'),
        allowNull: false,
        defaultValue: 'manual'
      },
      trigger_config: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {},
        comment: 'Configuration for automated triggers'
      },
      // Targeting
      target_segment: {
        type: Sequelize.STRING(100),
        allowNull: true
      },
      target_customer_types: {
        type: Sequelize.ARRAY(Sequelize.STRING),
        allowNull: true
      },
      // Workflow integration
      on_response_workflow_id: {
        type: Sequelize.UUID,
        allowNull: true
      },
      on_promoter_workflow_id: {
        type: Sequelize.UUID,
        allowNull: true
      },
      on_detractor_workflow_id: {
        type: Sequelize.UUID,
        allowNull: true
      },
      // Status
      is_active: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      start_date: {
        type: Sequelize.DATE,
        allowNull: true
      },
      end_date: {
        type: Sequelize.DATE,
        allowNull: true
      },
      // Statistics
      total_sent: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      total_responses: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      response_rate: {
        type: Sequelize.DECIMAL(5, 2),
        allowNull: false,
        defaultValue: 0
      },
      nps_score: {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: 'Overall NPS score (-100 to 100)'
      },
      promoter_count: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      passive_count: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      detractor_count: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      created_by: {
        type: Sequelize.UUID,
        allowNull: false
      },
      metadata: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {}
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

    await queryInterface.addIndex('nps_surveys', ['is_active']);
    await queryInterface.addIndex('nps_surveys', ['trigger_type']);
    await queryInterface.addIndex('nps_surveys', ['start_date', 'end_date']);

    // NPS Responses
    await queryInterface.createTable('nps_responses', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      survey_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'nps_surveys',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      // Respondent
      contact_id: {
        type: Sequelize.UUID,
        allowNull: true
      },
      account_id: {
        type: Sequelize.UUID,
        allowNull: true
      },
      email: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      // Response
      score: {
        type: Sequelize.INTEGER,
        allowNull: false,
        comment: 'Score from 0-10'
      },
      category: {
        type: Sequelize.ENUM('detractor', 'passive', 'promoter'),
        allowNull: false,
        comment: 'Detractor (0-6), Passive (7-8), Promoter (9-10)'
      },
      feedback: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      // Tracking
      sent_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      responded_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW
      },
      response_token: {
        type: Sequelize.STRING(255),
        allowNull: true,
        unique: true
      },
      ip_address: {
        type: Sequelize.STRING(45),
        allowNull: true
      },
      user_agent: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      // Follow-up
      follow_up_contacted: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      follow_up_contacted_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      follow_up_notes: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      // Tags for analysis
      tags: {
        type: Sequelize.ARRAY(Sequelize.STRING),
        allowNull: true,
        defaultValue: []
      },
      sentiment_score: {
        type: Sequelize.DECIMAL(3, 2),
        allowNull: true,
        comment: 'AI-analyzed sentiment (-1 to 1)'
      },
      metadata: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {}
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    await queryInterface.addIndex('nps_responses', ['survey_id']);
    await queryInterface.addIndex('nps_responses', ['contact_id']);
    await queryInterface.addIndex('nps_responses', ['account_id']);
    await queryInterface.addIndex('nps_responses', ['category']);
    await queryInterface.addIndex('nps_responses', ['responded_at']);
    await queryInterface.addIndex('nps_responses', ['response_token'], { unique: true });

    // ============================================
    // MARKETING - EMAIL CAMPAIGNS
    // ============================================

    // Email Marketing Campaigns
    await queryInterface.createTable('email_campaigns', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      name: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      campaign_type: {
        type: Sequelize.ENUM('newsletter', 'promotional', 'announcement', 'drip', 'transactional', 'nps', 'nurture'),
        allowNull: false
      },
      // Email content
      subject_line: {
        type: Sequelize.STRING(500),
        allowNull: false
      },
      preview_text: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      from_name: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      from_email: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      reply_to_email: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      // Content
      html_content: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      text_content: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      template_id: {
        type: Sequelize.UUID,
        allowNull: true
      },
      // Targeting
      segment_criteria: {
        type: Sequelize.JSONB,
        allowNull: true,
        comment: 'Criteria for selecting recipients'
      },
      recipient_list_ids: {
        type: Sequelize.ARRAY(Sequelize.UUID),
        allowNull: true
      },
      // A/B Testing
      ab_test_enabled: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      ab_test_config: {
        type: Sequelize.JSONB,
        allowNull: true,
        comment: 'A/B test variants and settings'
      },
      // Scheduling
      send_type: {
        type: Sequelize.ENUM('immediate', 'scheduled', 'drip'),
        allowNull: false,
        defaultValue: 'immediate'
      },
      scheduled_send_time: {
        type: Sequelize.DATE,
        allowNull: true
      },
      timezone: {
        type: Sequelize.STRING(100),
        allowNull: true
      },
      // Status
      status: {
        type: Sequelize.ENUM('draft', 'scheduled', 'sending', 'sent', 'paused', 'cancelled'),
        allowNull: false,
        defaultValue: 'draft'
      },
      sent_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      // Statistics
      total_recipients: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      total_sent: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      total_delivered: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      total_opened: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      total_clicked: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      total_bounced: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      total_unsubscribed: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      total_spam_reports: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      open_rate: {
        type: Sequelize.DECIMAL(5, 2),
        allowNull: false,
        defaultValue: 0
      },
      click_rate: {
        type: Sequelize.DECIMAL(5, 2),
        allowNull: false,
        defaultValue: 0
      },
      bounce_rate: {
        type: Sequelize.DECIMAL(5, 2),
        allowNull: false,
        defaultValue: 0
      },
      // Links tracking
      tracked_links: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: [],
        comment: 'Links with click tracking'
      },
      // Workflow integration
      on_send_workflow_id: {
        type: Sequelize.UUID,
        allowNull: true
      },
      on_open_workflow_id: {
        type: Sequelize.UUID,
        allowNull: true
      },
      on_click_workflow_id: {
        type: Sequelize.UUID,
        allowNull: true
      },
      created_by: {
        type: Sequelize.UUID,
        allowNull: false
      },
      metadata: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {}
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

    await queryInterface.addIndex('email_campaigns', ['campaign_type']);
    await queryInterface.addIndex('email_campaigns', ['status']);
    await queryInterface.addIndex('email_campaigns', ['scheduled_send_time']);
    await queryInterface.addIndex('email_campaigns', ['sent_at']);

    // Email Campaign Sends (individual send records)
    await queryInterface.createTable('email_campaign_sends', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      campaign_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'email_campaigns',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      contact_id: {
        type: Sequelize.UUID,
        allowNull: true
      },
      email: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      // Send details
      sent_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      delivered_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      // Engagement
      opened_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      first_clicked_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      open_count: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      click_count: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      clicked_links: {
        type: Sequelize.ARRAY(Sequelize.STRING),
        allowNull: true,
        defaultValue: []
      },
      // Failures
      bounced_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      bounce_type: {
        type: Sequelize.ENUM('soft', 'hard', 'complaint'),
        allowNull: true
      },
      bounce_reason: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      unsubscribed_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      spam_reported_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      // Tracking
      tracking_id: {
        type: Sequelize.STRING(255),
        allowNull: true,
        unique: true
      },
      ip_address: {
        type: Sequelize.STRING(45),
        allowNull: true
      },
      user_agent: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      metadata: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {}
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    await queryInterface.addIndex('email_campaign_sends', ['campaign_id']);
    await queryInterface.addIndex('email_campaign_sends', ['contact_id']);
    await queryInterface.addIndex('email_campaign_sends', ['email']);
    await queryInterface.addIndex('email_campaign_sends', ['tracking_id'], { unique: true });
    await queryInterface.addIndex('email_campaign_sends', ['sent_at']);
    await queryInterface.addIndex('email_campaign_sends', ['opened_at']);

    // Marketing Sequences (Drip campaigns)
    await queryInterface.createTable('marketing_sequences', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      name: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      // Steps in sequence
      steps: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: [],
        comment: 'Array of {stepNumber, delayDays, campaignId, action, conditions}'
      },
      // Enrollment
      enrollment_trigger: {
        type: Sequelize.ENUM('manual', 'form_submission', 'tag_added', 'list_added', 'workflow', 'event'),
        allowNull: false
      },
      enrollment_config: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {}
      },
      // Exit conditions
      exit_conditions: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: [],
        comment: 'Conditions to exit sequence'
      },
      // Status
      is_active: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      // Statistics
      total_enrolled: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      total_completed: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      total_active: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      completion_rate: {
        type: Sequelize.DECIMAL(5, 2),
        allowNull: false,
        defaultValue: 0
      },
      created_by: {
        type: Sequelize.UUID,
        allowNull: false
      },
      metadata: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {}
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

    await queryInterface.addIndex('marketing_sequences', ['is_active']);
    await queryInterface.addIndex('marketing_sequences', ['enrollment_trigger']);

    // Marketing Sequence Enrollments
    await queryInterface.createTable('marketing_sequence_enrollments', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      sequence_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'marketing_sequences',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      contact_id: {
        type: Sequelize.UUID,
        allowNull: false
      },
      enrolled_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW
      },
      current_step: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 1
      },
      status: {
        type: Sequelize.ENUM('active', 'paused', 'completed', 'exited'),
        allowNull: false,
        defaultValue: 'active'
      },
      completed_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      exited_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      exit_reason: {
        type: Sequelize.STRING(500),
        allowNull: true
      },
      // Step history
      completed_steps: {
        type: Sequelize.ARRAY(Sequelize.INTEGER),
        allowNull: true,
        defaultValue: []
      },
      next_step_date: {
        type: Sequelize.DATE,
        allowNull: true
      },
      metadata: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {}
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

    await queryInterface.addIndex('marketing_sequence_enrollments', ['sequence_id']);
    await queryInterface.addIndex('marketing_sequence_enrollments', ['contact_id']);
    await queryInterface.addIndex('marketing_sequence_enrollments', ['status']);
    await queryInterface.addIndex('marketing_sequence_enrollments', ['next_step_date']);
    await queryInterface.addIndex('marketing_sequence_enrollments', ['sequence_id', 'contact_id'], { unique: true });

    console.log('✅ CPQ, Price Lists, and Marketing Automation migration completed');
  },

  down: async (queryInterface, Sequelize) => {
    // Drop tables in reverse order
    await queryInterface.dropTable('marketing_sequence_enrollments');
    await queryInterface.dropTable('marketing_sequences');
    await queryInterface.dropTable('email_campaign_sends');
    await queryInterface.dropTable('email_campaigns');
    await queryInterface.dropTable('nps_responses');
    await queryInterface.dropTable('nps_surveys');
    await queryInterface.dropTable('sales_proposals');
    await queryInterface.dropTable('cpq_quotes');
    await queryInterface.dropTable('product_configurations');
    await queryInterface.dropTable('customer_price_list_items');
    await queryInterface.dropTable('customer_price_lists');
    await queryInterface.dropTable('master_price_list_items');
    await queryInterface.dropTable('master_price_lists');

    console.log('✅ CPQ, Price Lists, and Marketing Automation migration rolled back');
  }
};
