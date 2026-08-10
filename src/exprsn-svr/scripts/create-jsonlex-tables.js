/**
 * Manually create JSONLex tables
 */

const { sequelize } = require('../models');

async function createTables() {
  try {
    console.log('Creating JSONLex support tables...');

    // Add missing columns to schema_columns
    await sequelize.query(`
      ALTER TABLE schema_columns
      ADD COLUMN IF NOT EXISTS is_calculated BOOLEAN DEFAULT FALSE;
    `);

    await sequelize.query(`
      DO $$ BEGIN
        CREATE TYPE enum_schema_columns_calculation_type AS ENUM ('client', 'database', 'virtual');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await sequelize.query(`
      ALTER TABLE schema_columns
      ADD COLUMN IF NOT EXISTS calculation_type enum_schema_columns_calculation_type;
    `);

    // Add missing column to schema_tables
    await sequelize.query(`
      ALTER TABLE schema_tables
      ADD COLUMN IF NOT EXISTS table_constraints JSONB DEFAULT '[]';
    `);

    // Create schema_calculated_fields table
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS schema_calculated_fields (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        schema_id UUID NOT NULL REFERENCES schema_definitions(id) ON DELETE CASCADE,
        table_id UUID NOT NULL REFERENCES schema_tables(id) ON DELETE CASCADE,
        column_id UUID REFERENCES schema_columns(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        display_name VARCHAR(255) NOT NULL,
        description TEXT,
        jsonlex_expression JSONB NOT NULL,
        calculation_type VARCHAR(50) DEFAULT 'client',
        return_type VARCHAR(255),
        dependencies JSONB DEFAULT '[]',
        cache_ttl INTEGER,
        is_active BOOLEAN DEFAULT TRUE,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);

    // Create schema_validation_rules table
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS schema_validation_rules (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        schema_id UUID NOT NULL REFERENCES schema_definitions(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        display_name VARCHAR(255) NOT NULL,
        description TEXT,
        jsonlex_expression JSONB NOT NULL,
        error_message VARCHAR(255),
        severity VARCHAR(50) DEFAULT 'error',
        is_reusable BOOLEAN DEFAULT TRUE,
        applicable_types JSONB DEFAULT '[]',
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);

    // Create schema_expression_functions table
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS schema_expression_functions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        schema_id UUID NOT NULL REFERENCES schema_definitions(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        display_name VARCHAR(255) NOT NULL,
        description TEXT,
        parameters JSONB DEFAULT '[]',
        jsonlex_expression JSONB NOT NULL,
        return_type VARCHAR(255),
        category VARCHAR(255),
        is_pure BOOLEAN DEFAULT TRUE,
        examples JSONB DEFAULT '[]',
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);

    // Create indexes
    await sequelize.query(`CREATE INDEX IF NOT EXISTS idx_calc_fields_schema ON schema_calculated_fields(schema_id);`);
    await sequelize.query(`CREATE INDEX IF NOT EXISTS idx_calc_fields_table ON schema_calculated_fields(table_id);`);
    await sequelize.query(`CREATE INDEX IF NOT EXISTS idx_calc_fields_column ON schema_calculated_fields(column_id);`);

    await sequelize.query(`CREATE INDEX IF NOT EXISTS idx_validation_rules_schema ON schema_validation_rules(schema_id);`);
    await sequelize.query(`CREATE INDEX IF NOT EXISTS idx_validation_rules_name ON schema_validation_rules(name);`);

    await sequelize.query(`CREATE INDEX IF NOT EXISTS idx_expr_functions_schema ON schema_expression_functions(schema_id);`);
    await sequelize.query(`CREATE INDEX IF NOT EXISTS idx_expr_functions_name ON schema_expression_functions(name);`);
    await sequelize.query(`CREATE INDEX IF NOT EXISTS idx_expr_functions_category ON schema_expression_functions(category);`);

    console.log('✓ JSONLex tables created successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Error creating tables:', error);
    process.exit(1);
  }
}

createTables();
