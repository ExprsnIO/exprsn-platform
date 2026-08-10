/**
 * Seed demonstration schema data with JSONLex calculated fields
 */

const { Pool } = require('pg');

const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: 'exprsn_svr',
  password: process.env.DB_PASSWORD || '',
  port: process.env.DB_PORT || 5432
});

async function seedData() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    console.log('Creating E-Commerce demo schema...');

    // Create schema definition
    const schemaResult = await client.query(`
      INSERT INTO schema_definitions (id, name, slug, description, database_name, status, created_at, updated_at)
      VALUES (gen_random_uuid(), 'E-Commerce Platform', 'ecommerce', 'Complete e-commerce schema with products, orders, and customers', 'exprsn_ecommerce', 'active', NOW(), NOW())
      RETURNING id
    `);
    const schemaId = schemaResult.rows[0].id;

    // Create Products table
    const productsTableResult = await client.query(`
      INSERT INTO schema_tables (id, schema_id, name, display_name, description, position_x, position_y, color, icon, created_at, updated_at)
      VALUES (gen_random_uuid(), $1, 'products', 'Products', 'Product catalog', 100, 100, '#4CAF50', 'bi-box-seam', NOW(), NOW())
      RETURNING id
    `, [schemaId]);
    const productsTableId = productsTableResult.rows[0].id;

    // Products columns
    await client.query(`
      INSERT INTO schema_columns (id, table_id, name, display_name, data_type, is_primary_key, is_nullable, "position", created_at, updated_at)
      VALUES
        (gen_random_uuid(), $1, 'id', 'ID', 'UUID', true, false, 1, NOW(), NOW()),
        (gen_random_uuid(), $1, 'sku', 'SKU', 'VARCHAR', false, false, 2, NOW(), NOW()),
        (gen_random_uuid(), $1, 'name', 'Name', 'VARCHAR', false, false, 3, NOW(), NOW()),
        (gen_random_uuid(), $1, 'description', 'Description', 'TEXT', false, true, 4, NOW(), NOW()),
        (gen_random_uuid(), $1, 'base_price', 'Base Price', 'DECIMAL', false, false, 5, NOW(), NOW()),
        (gen_random_uuid(), $1, 'tax_rate', 'Tax Rate', 'DECIMAL', false, false, 6, NOW(), NOW()),
        (gen_random_uuid(), $1, 'discount_percent', 'Discount %', 'DECIMAL', false, true, 7, NOW(), NOW()),
        (gen_random_uuid(), $1, 'stock_quantity', 'Stock Quantity', 'INTEGER', false, false, 8, NOW(), NOW()),
        (gen_random_uuid(), $1, 'created_at', 'Created At', 'TIMESTAMP', false, false, 9, NOW(), NOW()),
        (gen_random_uuid(), $1, 'updated_at', 'Updated At', 'TIMESTAMP', false, false, 10, NOW(), NOW())
    `, [productsTableId]);

    // Get column IDs for calculated fields
    const priceCol = await client.query(`SELECT id FROM schema_columns WHERE table_id = $1 AND name = 'base_price'`, [productsTableId]);
    const taxCol = await client.query(`SELECT id FROM schema_columns WHERE table_id = $1 AND name = 'tax_rate'`, [productsTableId]);
    const discountCol = await client.query(`SELECT id FROM schema_columns WHERE table_id = $1 AND name = 'discount_percent'`, [productsTableId]);

    // Add calculated columns for products
    const finalPriceResult = await client.query(`
      INSERT INTO schema_columns (
        id, table_id, name, display_name, data_type, is_generated, is_calculated,
        calculation_type, jsonlex_expression, "position", created_at, updated_at
      )
      VALUES (
        gen_random_uuid(), $1, 'final_price', 'Final Price', 'DECIMAL', false, true, 'client',
        '{"operator": "multiply", "operands": [{"operator": "subtract", "operands": ["$base_price", {"operator": "multiply", "operands": ["$base_price", {"operator": "divide", "operands": ["$discount_percent", 100]}]}]}, {"operator": "add", "operands": [1, {"operator": "divide", "operands": ["$tax_rate", 100]}]}]}'::jsonb,
        11, NOW(), NOW()
      )
      RETURNING id
    `, [productsTableId]);

    const inStockResult = await client.query(`
      INSERT INTO schema_columns (
        id, table_id, name, display_name, data_type, is_generated, is_calculated,
        calculation_type, jsonlex_expression, "position", created_at, updated_at
      )
      VALUES (
        gen_random_uuid(), $1, 'in_stock', 'In Stock', 'BOOLEAN', false, true, 'client',
        '{"operator": "greaterThan", "operands": ["$stock_quantity", 0]}'::jsonb,
        12, NOW(), NOW()
      )
      RETURNING id
    `, [productsTableId]);

    // Create Orders table
    const ordersTableResult = await client.query(`
      INSERT INTO schema_tables (schema_id, name, display_name, description, position_x, position_y, color, icon)
      VALUES ($1, 'orders', 'Orders', 'Customer orders', 400, 100, '#2196F3', 'bi-cart')
      RETURNING id
    `, [schemaId]);
    const ordersTableId = ordersTableResult.rows[0].id;

    // Orders columns
    await client.query(`
      INSERT INTO schema_columns (table_id, name, display_name, data_type, is_primary_key, is_nullable, "position")
      VALUES
        ($1, 'id', 'ID', 'UUID', true, false, 1),
        ($1, 'order_number', 'Order #', 'VARCHAR', false, false, 2),
        ($1, 'customer_id', 'Customer ID', 'UUID', false, false, 3),
        ($1, 'subtotal', 'Subtotal', 'DECIMAL', false, false, 4),
        ($1, 'tax_amount', 'Tax Amount', 'DECIMAL', false, false, 5),
        ($1, 'shipping_cost', 'Shipping Cost', 'DECIMAL', false, false, 6),
        ($1, 'discount_amount', 'Discount Amount', 'DECIMAL', false, true, 7),
        ($1, 'status', 'Status', 'VARCHAR', false, false, 8),
        ($1, 'created_at', 'Created At', 'TIMESTAMP', false, false, 9)
    `, [ordersTableId]);

    // Add calculated total for orders
    await client.query(`
      INSERT INTO schema_columns (
        table_id, name, display_name, data_type, is_calculated,
        calculation_type, jsonlex_expression, "position"
      )
      VALUES (
        $1, 'grand_total', 'Grand Total', 'DECIMAL', true, 'client',
        '{"operator": "subtract", "operands": [{"operator": "add", "operands": ["$subtotal", "$tax_amount", "$shipping_cost"]}, {"operator": "if", "operands": [{"operator": "greaterThan", "operands": ["$discount_amount", 0]}, "$discount_amount", 0]}]}'::jsonb,
        10
      )
    `, [ordersTableId]);

    // Create Customers table
    const customersTableResult = await client.query(`
      INSERT INTO schema_tables (schema_id, name, display_name, description, position_x, position_y, color, icon)
      VALUES ($1, 'customers', 'Customers', 'Customer information', 100, 400, '#FF9800', 'bi-people')
      RETURNING id
    `, [schemaId]);
    const customersTableId = customersTableResult.rows[0].id;

    // Customers columns
    await client.query(`
      INSERT INTO schema_columns (table_id, name, display_name, data_type, is_primary_key, is_nullable, "position")
      VALUES
        ($1, 'id', 'ID', 'UUID', true, false, 1),
        ($1, 'first_name', 'First Name', 'VARCHAR', false, false, 2),
        ($1, 'last_name', 'Last Name', 'VARCHAR', false, false, 3),
        ($1, 'email', 'Email', 'VARCHAR', false, false, 4),
        ($1, 'phone', 'Phone', 'VARCHAR', false, true, 5),
        ($1, 'created_at', 'Created At', 'TIMESTAMP', false, false, 6)
    `, [customersTableId]);

    // Add calculated full name
    await client.query(`
      INSERT INTO schema_columns (
        table_id, name, display_name, data_type, is_calculated,
        calculation_type, jsonlex_expression, "position"
      )
      VALUES (
        $1, 'full_name', 'Full Name', 'VARCHAR', true, 'client',
        '{"operator": "concat", "operands": ["$first_name", " ", "$last_name"]}'::jsonb,
        7
      )
    `, [customersTableId]);

    // Create relationships
    await client.query(`
      INSERT INTO schema_relationships (
        schema_id, name, source_table_id, source_column_id, target_table_id,
        relationship_type, on_delete, on_update
      )
      SELECT
        $1,
        'orders_customer',
        $2,
        (SELECT id FROM schema_columns WHERE table_id = $2 AND name = 'customer_id'),
        $3,
        'many_to_one',
        'CASCADE',
        'CASCADE'
    `, [schemaId, ordersTableId, customersTableId]);

    // Create validation rules
    await client.query(`
      INSERT INTO schema_validation_rules (
        schema_id, name, display_name, description, jsonlex_expression,
        error_message, applicable_types
      )
      VALUES (
        $1,
        'positive_price',
        'Positive Price',
        'Price must be greater than zero',
        '{"operator": "greaterThan", "operands": ["$value", 0]}'::jsonb,
        'Price must be a positive number',
        '["DECIMAL", "FLOAT", "INTEGER"]'::jsonb
      ),
      (
        $1,
        'valid_percentage',
        'Valid Percentage',
        'Percentage must be between 0 and 100',
        '{"operator": "and", "operands": [{"operator": "greaterThanOrEqual", "operands": ["$value", 0]}, {"operator": "lessThanOrEqual", "operands": ["$value", 100]}]}'::jsonb,
        'Must be between 0 and 100',
        '["DECIMAL", "FLOAT", "INTEGER"]'::jsonb
      )
    `, [schemaId]);

    // Create expression functions
    await client.query(`
      INSERT INTO schema_expression_functions (
        schema_id, name, display_name, description, parameters,
        jsonlex_expression, return_type, category, examples
      )
      VALUES (
        $1,
        'calculateTax',
        'Calculate Tax',
        'Calculate tax amount from base price and tax rate',
        '[{"name": "price", "type": "DECIMAL", "required": true}, {"name": "taxRate", "type": "DECIMAL", "required": true}]'::jsonb,
        '{"operator": "multiply", "operands": ["$price", {"operator": "divide", "operands": ["$taxRate", 100]}]}'::jsonb,
        'DECIMAL',
        'business',
        '[{"input": {"price": 100, "taxRate": 8.5}, "output": 8.5}]'::jsonb
      ),
      (
        $1,
        'applyDiscount',
        'Apply Discount',
        'Apply percentage discount to price',
        '[{"name": "price", "type": "DECIMAL", "required": true}, {"name": "discountPercent", "type": "DECIMAL", "required": true, "defaultValue": 0}]'::jsonb,
        '{"operator": "subtract", "operands": ["$price", {"operator": "multiply", "operands": ["$price", {"operator": "divide", "operands": ["$discountPercent", 100]}]}]}'::jsonb,
        'DECIMAL',
        'business',
        '[{"input": {"price": 100, "discountPercent": 20}, "output": 80}]'::jsonb
      )
    `, [schemaId]);

    await client.query('COMMIT');
    console.log('✓ E-Commerce demo schema created successfully!');
    console.log(`  Schema ID: ${schemaId}`);
    console.log(`  Tables: products, orders, customers`);
    console.log(`  Calculated fields: final_price, in_stock, grand_total, full_name`);
    console.log(`  Validation rules: positive_price, valid_percentage`);
    console.log(`  Functions: calculateTax, applyDiscount`);

    process.exit(0);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error seeding data:', error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seedData();
