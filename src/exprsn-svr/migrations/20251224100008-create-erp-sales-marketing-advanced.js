/**
 * Migration: ERP Advanced Features + Sales & Marketing
 *
 * Adds comprehensive ERP, Sales, and Marketing capabilities:
 *
 * ERP Manufacturing & Production:
 * - Bill of Materials (BOM)
 * - Work Orders & Production Orders
 * - Quality Control
 *
 * ERP Advanced Inventory:
 * - Warehouses & Locations
 * - Stock Transfers
 * - Lot & Serial Number Tracking
 * - Inventory Adjustments
 *
 * ERP Financial:
 * - Multi-currency support
 * - Tax rates and configurations
 * - Purchase Requisitions
 *
 * Sales Advanced:
 * - Deals & Pipeline Management
 * - Master Price Lists
 * - Customer-Specific Price Lists
 * - CPQ (Configure, Price, Quote)
 * - Sales Quotations
 * - Sales Proposals
 *
 * Marketing:
 * - NPS Surveys & Workflows
 * - Email Marketing Campaigns
 * - Marketing Sequences
 */

'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {

    // ============================================
    // ERP MANUFACTURING & PRODUCTION
    // ============================================

    // Bill of Materials (BOM)
    await queryInterface.createTable('bom_items', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      product_id: {
        type: Sequelize.UUID,
        allowNull: false,
        comment: 'The finished product'
      },
      name: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      version: {
        type: Sequelize.STRING(50),
        allowNull: false,
        defaultValue: '1.0'
      },
      bom_type: {
        type: Sequelize.ENUM('manufacturing', 'assembly', 'kit'),
        allowNull: false,
        defaultValue: 'manufacturing'
      },
      quantity: {
        type: Sequelize.DECIMAL(15, 4),
        allowNull: false,
        defaultValue: 1,
        comment: 'Quantity produced by this BOM'
      },
      // Components
      components: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: [],
        comment: 'Array of {productId, quantity, unitCost, scrapFactor, operationId}'
      },
      // Operations/Routing
      operations: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: [],
        comment: 'Manufacturing operations/steps'
      },
      // Costing
      total_component_cost: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0
      },
      labor_cost: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0
      },
      overhead_cost: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0
      },
      total_cost: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0
      },
      // Status
      status: {
        type: Sequelize.ENUM('draft', 'active', 'obsolete'),
        allowNull: false,
        defaultValue: 'draft'
      },
      is_default: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: 'Default BOM for this product'
      },
      effective_date: {
        type: Sequelize.DATE,
        allowNull: true
      },
      obsolete_date: {
        type: Sequelize.DATE,
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

    await queryInterface.addIndex('bom_items', ['product_id']);
    await queryInterface.addIndex('bom_items', ['status']);
    await queryInterface.addIndex('bom_items', ['is_default']);

    // Work Orders / Production Orders
    await queryInterface.createTable('work_orders', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      work_order_number: {
        type: Sequelize.STRING(100),
        allowNull: false,
        unique: true
      },
      product_id: {
        type: Sequelize.UUID,
        allowNull: false
      },
      bom_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'bom_items',
          key: 'id'
        }
      },
      quantity_to_produce: {
        type: Sequelize.DECIMAL(15, 4),
        allowNull: false
      },
      quantity_produced: {
        type: Sequelize.DECIMAL(15, 4),
        allowNull: false,
        defaultValue: 0
      },
      quantity_scrapped: {
        type: Sequelize.DECIMAL(15, 4),
        allowNull: false,
        defaultValue: 0
      },
      // Scheduling
      scheduled_start_date: {
        type: Sequelize.DATE,
        allowNull: true
      },
      scheduled_end_date: {
        type: Sequelize.DATE,
        allowNull: true
      },
      actual_start_date: {
        type: Sequelize.DATE,
        allowNull: true
      },
      actual_end_date: {
        type: Sequelize.DATE,
        allowNull: true
      },
      // Location
      warehouse_id: {
        type: Sequelize.UUID,
        allowNull: true
      },
      production_line: {
        type: Sequelize.STRING(100),
        allowNull: true
      },
      // Links
      sales_order_id: {
        type: Sequelize.UUID,
        allowNull: true,
        comment: 'If linked to a sales order'
      },
      project_id: {
        type: Sequelize.UUID,
        allowNull: true
      },
      // Status
      status: {
        type: Sequelize.ENUM('draft', 'released', 'in_progress', 'completed', 'cancelled'),
        allowNull: false,
        defaultValue: 'draft'
      },
      priority: {
        type: Sequelize.ENUM('low', 'medium', 'high', 'urgent'),
        allowNull: false,
        defaultValue: 'medium'
      },
      // Component consumption
      materials_issued: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: [],
        comment: 'Materials issued for this work order'
      },
      // Quality control
      qc_status: {
        type: Sequelize.ENUM('pending', 'passed', 'failed', 'not_required'),
        allowNull: false,
        defaultValue: 'not_required'
      },
      qc_notes: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      qc_inspected_by: {
        type: Sequelize.UUID,
        allowNull: true
      },
      qc_inspected_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      // Costing
      actual_material_cost: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0
      },
      actual_labor_cost: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0
      },
      actual_overhead_cost: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0
      },
      total_actual_cost: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0
      },
      created_by: {
        type: Sequelize.UUID,
        allowNull: false
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

    await queryInterface.addIndex('work_orders', ['work_order_number'], { unique: true });
    await queryInterface.addIndex('work_orders', ['product_id']);
    await queryInterface.addIndex('work_orders', ['bom_id']);
    await queryInterface.addIndex('work_orders', ['status']);
    await queryInterface.addIndex('work_orders', ['sales_order_id']);
    await queryInterface.addIndex('work_orders', ['scheduled_start_date']);

    // ============================================
    // ERP ADVANCED INVENTORY
    // ============================================

    // Warehouses
    await queryInterface.createTable('warehouses', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      code: {
        type: Sequelize.STRING(50),
        allowNull: false,
        unique: true
      },
      name: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      warehouse_type: {
        type: Sequelize.ENUM('main', 'retail', 'fulfillment', 'transit', 'dropship', 'manufacturing'),
        allowNull: false,
        defaultValue: 'main'
      },
      // Location
      address: {
        type: Sequelize.JSONB,
        allowNull: true,
        comment: 'Full address object'
      },
      latitude: {
        type: Sequelize.DECIMAL(10, 8),
        allowNull: true
      },
      longitude: {
        type: Sequelize.DECIMAL(11, 8),
        allowNull: true
      },
      // Configuration
      is_active: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      allow_negative_stock: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      requires_bin_location: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      // Contact
      manager_id: {
        type: Sequelize.UUID,
        allowNull: true
      },
      phone: {
        type: Sequelize.STRING(50),
        allowNull: true
      },
      email: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      // Settings
      default_for_sales: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      default_for_purchases: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      // Capacity
      total_capacity_cubic_meters: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: true
      },
      used_capacity_cubic_meters: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0
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

    await queryInterface.addIndex('warehouses', ['code'], { unique: true });
    await queryInterface.addIndex('warehouses', ['is_active']);
    await queryInterface.addIndex('warehouses', ['warehouse_type']);

    // Stock Locations / Bins (within warehouses)
    await queryInterface.createTable('stock_locations', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      warehouse_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'warehouses',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },
      location_code: {
        type: Sequelize.STRING(50),
        allowNull: false
      },
      name: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      location_type: {
        type: Sequelize.ENUM('shelf', 'bin', 'pallet', 'floor', 'rack', 'zone'),
        allowNull: false,
        defaultValue: 'bin'
      },
      parent_location_id: {
        type: Sequelize.UUID,
        allowNull: true,
        comment: 'For hierarchical locations'
      },
      // Position
      aisle: {
        type: Sequelize.STRING(20),
        allowNull: true
      },
      rack: {
        type: Sequelize.STRING(20),
        allowNull: true
      },
      level: {
        type: Sequelize.STRING(20),
        allowNull: true
      },
      position: {
        type: Sequelize.STRING(20),
        allowNull: true
      },
      // Capacity
      capacity_cubic_meters: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true
      },
      max_weight_kg: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true
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

    await queryInterface.addIndex('stock_locations', ['warehouse_id']);
    await queryInterface.addIndex('stock_locations', ['location_code']);
    await queryInterface.addIndex('stock_locations', ['warehouse_id', 'location_code'], { unique: true });

    // Inventory Items (multi-warehouse, lot tracking)
    await queryInterface.createTable('inventory_items', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      product_id: {
        type: Sequelize.UUID,
        allowNull: false
      },
      warehouse_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'warehouses',
          key: 'id'
        }
      },
      location_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'stock_locations',
          key: 'id'
        }
      },
      // Lot/Serial tracking
      lot_number: {
        type: Sequelize.STRING(100),
        allowNull: true
      },
      serial_number: {
        type: Sequelize.STRING(100),
        allowNull: true
      },
      // Quantities
      quantity_on_hand: {
        type: Sequelize.DECIMAL(15, 4),
        allowNull: false,
        defaultValue: 0
      },
      quantity_reserved: {
        type: Sequelize.DECIMAL(15, 4),
        allowNull: false,
        defaultValue: 0,
        comment: 'Reserved for sales orders'
      },
      quantity_available: {
        type: Sequelize.DECIMAL(15, 4),
        allowNull: false,
        defaultValue: 0,
        comment: 'On hand - reserved'
      },
      quantity_in_transit: {
        type: Sequelize.DECIMAL(15, 4),
        allowNull: false,
        defaultValue: 0
      },
      // Dates
      received_date: {
        type: Sequelize.DATE,
        allowNull: true
      },
      expiration_date: {
        type: Sequelize.DATE,
        allowNull: true
      },
      manufacture_date: {
        type: Sequelize.DATE,
        allowNull: true
      },
      // Costing
      unit_cost: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0
      },
      total_value: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0
      },
      // Reorder info
      reorder_point: {
        type: Sequelize.DECIMAL(15, 4),
        allowNull: true
      },
      reorder_quantity: {
        type: Sequelize.DECIMAL(15, 4),
        allowNull: true
      },
      max_stock_level: {
        type: Sequelize.DECIMAL(15, 4),
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

    await queryInterface.addIndex('inventory_items', ['product_id']);
    await queryInterface.addIndex('inventory_items', ['warehouse_id']);
    await queryInterface.addIndex('inventory_items', ['location_id']);
    await queryInterface.addIndex('inventory_items', ['lot_number']);
    await queryInterface.addIndex('inventory_items', ['serial_number']);
    await queryInterface.addIndex('inventory_items', ['product_id', 'warehouse_id']);

    // Stock Transfers
    await queryInterface.createTable('stock_transfers', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      transfer_number: {
        type: Sequelize.STRING(100),
        allowNull: false,
        unique: true
      },
      from_warehouse_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'warehouses',
          key: 'id'
        }
      },
      to_warehouse_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'warehouses',
          key: 'id'
        }
      },
      transfer_date: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW
      },
      expected_delivery_date: {
        type: Sequelize.DATE,
        allowNull: true
      },
      actual_delivery_date: {
        type: Sequelize.DATE,
        allowNull: true
      },
      // Items
      items: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: [],
        comment: 'Array of {productId, quantity, lotNumber, serialNumber}'
      },
      // Status
      status: {
        type: Sequelize.ENUM('draft', 'pending', 'in_transit', 'completed', 'cancelled'),
        allowNull: false,
        defaultValue: 'draft'
      },
      // Shipment
      carrier: {
        type: Sequelize.STRING(100),
        allowNull: true
      },
      tracking_number: {
        type: Sequelize.STRING(100),
        allowNull: true
      },
      shipping_cost: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: true
      },
      // Users
      created_by: {
        type: Sequelize.UUID,
        allowNull: false
      },
      approved_by: {
        type: Sequelize.UUID,
        allowNull: true
      },
      received_by: {
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

    await queryInterface.addIndex('stock_transfers', ['transfer_number'], { unique: true });
    await queryInterface.addIndex('stock_transfers', ['from_warehouse_id']);
    await queryInterface.addIndex('stock_transfers', ['to_warehouse_id']);
    await queryInterface.addIndex('stock_transfers', ['status']);
    await queryInterface.addIndex('stock_transfers', ['transfer_date']);

    // Inventory Adjustments
    await queryInterface.createTable('inventory_adjustments', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      adjustment_number: {
        type: Sequelize.STRING(100),
        allowNull: false,
        unique: true
      },
      warehouse_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'warehouses',
          key: 'id'
        }
      },
      adjustment_date: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW
      },
      adjustment_type: {
        type: Sequelize.ENUM('increase', 'decrease', 'cycle_count', 'damage', 'loss', 'found', 'other'),
        allowNull: false
      },
      reason: {
        type: Sequelize.STRING(500),
        allowNull: false
      },
      // Items adjusted
      items: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: [],
        comment: 'Array of {productId, oldQuantity, newQuantity, adjustmentQuantity, unitCost, totalValue, lotNumber}'
      },
      // Financial impact
      total_value_change: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0
      },
      status: {
        type: Sequelize.ENUM('draft', 'posted', 'cancelled'),
        allowNull: false,
        defaultValue: 'draft'
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

    await queryInterface.addIndex('inventory_adjustments', ['adjustment_number'], { unique: true });
    await queryInterface.addIndex('inventory_adjustments', ['warehouse_id']);
    await queryInterface.addIndex('inventory_adjustments', ['adjustment_date']);
    await queryInterface.addIndex('inventory_adjustments', ['status']);

    // ============================================
    // ERP FINANCIAL - MULTI-CURRENCY & TAX
    // ============================================

    // Currencies
    await queryInterface.createTable('currencies', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      code: {
        type: Sequelize.STRING(3),
        allowNull: false,
        unique: true,
        comment: 'ISO 4217 currency code (USD, EUR, GBP, etc.)'
      },
      name: {
        type: Sequelize.STRING(100),
        allowNull: false
      },
      symbol: {
        type: Sequelize.STRING(10),
        allowNull: false
      },
      decimal_places: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 2
      },
      is_base_currency: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      exchange_rate: {
        type: Sequelize.DECIMAL(15, 6),
        allowNull: false,
        defaultValue: 1.0,
        comment: 'Exchange rate relative to base currency'
      },
      last_updated: {
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

    await queryInterface.addIndex('currencies', ['code'], { unique: true });
    await queryInterface.addIndex('currencies', ['is_base_currency']);
    await queryInterface.addIndex('currencies', ['is_active']);

    // Exchange Rate History
    await queryInterface.createTable('exchange_rates', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      from_currency_code: {
        type: Sequelize.STRING(3),
        allowNull: false
      },
      to_currency_code: {
        type: Sequelize.STRING(3),
        allowNull: false
      },
      rate: {
        type: Sequelize.DECIMAL(15, 6),
        allowNull: false
      },
      effective_date: {
        type: Sequelize.DATE,
        allowNull: false
      },
      source: {
        type: Sequelize.STRING(100),
        allowNull: true,
        comment: 'API source or manual'
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    await queryInterface.addIndex('exchange_rates', ['from_currency_code', 'to_currency_code']);
    await queryInterface.addIndex('exchange_rates', ['effective_date']);

    // Tax Rates
    await queryInterface.createTable('tax_rates', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      code: {
        type: Sequelize.STRING(50),
        allowNull: false,
        unique: true
      },
      name: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      tax_type: {
        type: Sequelize.ENUM('sales_tax', 'vat', 'gst', 'excise', 'customs', 'other'),
        allowNull: false
      },
      rate: {
        type: Sequelize.DECIMAL(5, 2),
        allowNull: false,
        comment: 'Percentage rate'
      },
      // Geographic scope
      country_code: {
        type: Sequelize.STRING(2),
        allowNull: true
      },
      state_province: {
        type: Sequelize.STRING(100),
        allowNull: true
      },
      city: {
        type: Sequelize.STRING(100),
        allowNull: true
      },
      postal_code: {
        type: Sequelize.STRING(20),
        allowNull: true
      },
      // Account mapping
      tax_account_id: {
        type: Sequelize.UUID,
        allowNull: true,
        comment: 'GL account for tax collected'
      },
      is_compound: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: 'Tax calculated on top of other taxes'
      },
      effective_from: {
        type: Sequelize.DATE,
        allowNull: false
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

    await queryInterface.addIndex('tax_rates', ['code'], { unique: true });
    await queryInterface.addIndex('tax_rates', ['tax_type']);
    await queryInterface.addIndex('tax_rates', ['country_code']);
    await queryInterface.addIndex('tax_rates', ['is_active']);

    // Purchase Requisitions
    await queryInterface.createTable('purchase_requisitions', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      requisition_number: {
        type: Sequelize.STRING(100),
        allowNull: false,
        unique: true
      },
      requisition_date: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW
      },
      required_by_date: {
        type: Sequelize.DATE,
        allowNull: true
      },
      requested_by: {
        type: Sequelize.UUID,
        allowNull: false
      },
      department_id: {
        type: Sequelize.UUID,
        allowNull: true
      },
      warehouse_id: {
        type: Sequelize.UUID,
        allowNull: true
      },
      // Items requested
      items: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: [],
        comment: 'Array of {productId, description, quantity, estimatedUnitPrice, totalPrice, purpose}'
      },
      total_estimated_cost: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0
      },
      currency_code: {
        type: Sequelize.STRING(3),
        allowNull: false,
        defaultValue: 'USD'
      },
      // Approval workflow
      status: {
        type: Sequelize.ENUM('draft', 'submitted', 'approved', 'rejected', 'partially_ordered', 'fully_ordered', 'cancelled'),
        allowNull: false,
        defaultValue: 'draft'
      },
      approval_level: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      required_approval_levels: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 1
      },
      approved_by: {
        type: Sequelize.ARRAY(Sequelize.UUID),
        allowNull: true,
        defaultValue: []
      },
      rejected_by: {
        type: Sequelize.UUID,
        allowNull: true
      },
      rejection_reason: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      // Conversion
      purchase_orders: {
        type: Sequelize.ARRAY(Sequelize.UUID),
        allowNull: true,
        defaultValue: [],
        comment: 'POs created from this requisition'
      },
      purpose: {
        type: Sequelize.TEXT,
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

    await queryInterface.addIndex('purchase_requisitions', ['requisition_number'], { unique: true });
    await queryInterface.addIndex('purchase_requisitions', ['requested_by']);
    await queryInterface.addIndex('purchase_requisitions', ['status']);
    await queryInterface.addIndex('purchase_requisitions', ['requisition_date']);

    // ============================================
    // SALES ADVANCED - DEALS & PIPELINE
    // ============================================

    // Deals (separate from Opportunities - focused on pipeline management)
    await queryInterface.createTable('deals', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      deal_number: {
        type: Sequelize.STRING(100),
        allowNull: false,
        unique: true
      },
      name: {
        type: Sequelize.STRING(500),
        allowNull: false
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      // Related entities
      opportunity_id: {
        type: Sequelize.UUID,
        allowNull: true,
        comment: 'Link to CRM opportunity if applicable'
      },
      account_id: {
        type: Sequelize.UUID,
        allowNull: true,
        comment: 'Company/Account'
      },
      contact_id: {
        type: Sequelize.UUID,
        allowNull: true,
        comment: 'Primary contact'
      },
      // Pipeline
      pipeline_stage: {
        type: Sequelize.STRING(100),
        allowNull: false,
        defaultValue: 'prospecting'
      },
      stage_probability: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'Win probability percentage'
      },
      // Financial
      deal_value: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0
      },
      weighted_value: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0,
        comment: 'deal_value * stage_probability'
      },
      currency_code: {
        type: Sequelize.STRING(3),
        allowNull: false,
        defaultValue: 'USD'
      },
      // Dates
      expected_close_date: {
        type: Sequelize.DATE,
        allowNull: true
      },
      actual_close_date: {
        type: Sequelize.DATE,
        allowNull: true
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
      // Status
      status: {
        type: Sequelize.ENUM('open', 'won', 'lost', 'abandoned'),
        allowNull: false,
        defaultValue: 'open'
      },
      loss_reason: {
        type: Sequelize.STRING(500),
        allowNull: true
      },
      // Products/Services
      line_items: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: [],
        comment: 'Products/services in this deal'
      },
      // Source
      lead_source: {
        type: Sequelize.STRING(100),
        allowNull: true
      },
      campaign_id: {
        type: Sequelize.UUID,
        allowNull: true
      },
      // Activity tracking
      last_activity_date: {
        type: Sequelize.DATE,
        allowNull: true
      },
      next_step: {
        type: Sequelize.STRING(500),
        allowNull: true
      },
      next_step_date: {
        type: Sequelize.DATE,
        allowNull: true
      },
      tags: {
        type: Sequelize.ARRAY(Sequelize.STRING),
        allowNull: true,
        defaultValue: []
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

    await queryInterface.addIndex('deals', ['deal_number'], { unique: true });
    await queryInterface.addIndex('deals', ['opportunity_id']);
    await queryInterface.addIndex('deals', ['account_id']);
    await queryInterface.addIndex('deals', ['owner_id']);
    await queryInterface.addIndex('deals', ['status']);
    await queryInterface.addIndex('deals', ['pipeline_stage']);
    await queryInterface.addIndex('deals', ['expected_close_date']);

    // Continued in next message due to length...

    console.log('✅ Part 1 of ERP & Sales migration completed');
  },

  down: async (queryInterface, Sequelize) => {
    // Drop tables in reverse order
    await queryInterface.dropTable('deals');
    await queryInterface.dropTable('purchase_requisitions');
    await queryInterface.dropTable('tax_rates');
    await queryInterface.dropTable('exchange_rates');
    await queryInterface.dropTable('currencies');
    await queryInterface.dropTable('inventory_adjustments');
    await queryInterface.dropTable('stock_transfers');
    await queryInterface.dropTable('inventory_items');
    await queryInterface.dropTable('stock_locations');
    await queryInterface.dropTable('warehouses');
    await queryInterface.dropTable('work_orders');
    await queryInterface.dropTable('bom_items');

    console.log('✅ ERP & Sales migration rolled back');
  }
};
