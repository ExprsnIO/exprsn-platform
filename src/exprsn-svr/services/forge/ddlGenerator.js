const logger = require('../../utils/logger');

/**
 * DDL Generator Service
 *
 * Converts JSON Schema definitions to PostgreSQL DDL
 * Handles table creation, indexes, constraints, and relationships
 */

// JSON Schema type to PostgreSQL type mapping
const TYPE_MAPPINGS = {
  string: 'VARCHAR',
  number: 'DOUBLE PRECISION',
  integer: 'INTEGER',
  boolean: 'BOOLEAN',
  array: 'JSONB',
  object: 'JSONB',
  null: 'VARCHAR'
};

// JSON Schema format to PostgreSQL type mapping
const FORMAT_MAPPINGS = {
  'date': 'DATE',
  'date-time': 'TIMESTAMPTZ',
  'time': 'TIME',
  'email': 'VARCHAR',
  'uuid': 'UUID',
  'uri': 'TEXT',
  'hostname': 'VARCHAR',
  'ipv4': 'INET',
  'ipv6': 'INET'
};

class DDLGeneratorService {
  /**
   * Generate complete DDL for a schema
   */
  generateDDL(schemaDefinition) {
    try {
      const statements = [];

      // Generate ENUM types first
      const enumStatements = this.generateEnums(schemaDefinition);
      statements.push...(...enumStatements);

      // Generate main table
      const createTableSQL = this.generateCreateTable(schemaDefinition);
      statements.push(createTableSQL);

      // Generate indexes
      const indexStatements = this.generateIndexes(schemaDefinition);
      statements.push(...indexStatements);

      // Generate foreign key constraints (added separately for better readability)
      const fkStatements = this.generateForeignKeyConstraints(schemaDefinition);
      statements.push(...fkStatements);

      return {
        sql: statements.filter(s => s).join('\n\n'),
        statements: statements.filter(s => s)
      };
    } catch (error) {
      logger.error('Failed to generate DDL', { error: error.message, schemaDefinition });
      throw error;
    }
  }

  /**
   * Generate CREATE TABLE statement
   */
  generateCreateTable(schemaDefinition) {
    const tableName = this.sanitizeIdentifier(schemaDefinition.table);
    const properties = schemaDefinition.properties || {};

    const columns = [];
    const constraints = [];

    // Generate column definitions
    for (const [fieldName, fieldDef] of Object.entries(properties)) {
      const columnDef = this.generateColumnDefinition(fieldName, fieldDef, schemaDefinition);
      columns.push(columnDef);
    }

    // Generate table-level constraints
    const tableLevelConstraints = this.generateTableLevelConstraints(schemaDefinition);
    if (tableLevelConstraints.length > 0) {
      constraints.push(...tableLevelConstraints);
    }

    // Combine columns and constraints
    const allDefinitions = [...columns, ...constraints];

    let sql = `CREATE TABLE ${tableName} (\n`;
    sql += allDefinitions.map(def => `  ${def}`).join(',\n');
    sql += '\n);';

    // Add table comment
    if (schemaDefinition.description) {
      sql += `\n\nCOMMENT ON TABLE ${tableName} IS ${this.escapeString(schemaDefinition.description)};`;
    }

    // Add column comments
    for (const [fieldName, fieldDef] of Object.entries(properties)) {
      if (fieldDef.description) {
        const columnName = this.sanitizeIdentifier(fieldName);
        sql += `\nCOMMENT ON COLUMN ${tableName}.${columnName} IS ${this.escapeString(fieldDef.description)};`;
      }
    }

    return sql;
  }

  /**
   * Generate column definition
   */
  generateColumnDefinition(fieldName, fieldDef, schemaDefinition) {
    const columnName = this.sanitizeIdentifier(fieldName);
    const dbConfig = fieldDef.database || {};

    // Determine PostgreSQL type
    let pgType = dbConfig.type || this.mapType(fieldDef);

    // Add length/precision/scale for appropriate types
    if (dbConfig.length && ['VARCHAR', 'CHAR'].includes(pgType.toUpperCase())) {
      pgType = `${pgType}(${dbConfig.length})`;
    } else if (dbConfig.precision && ['DECIMAL', 'NUMERIC'].includes(pgType.toUpperCase())) {
      if (dbConfig.scale) {
        pgType = `${pgType}(${dbConfig.precision}, ${dbConfig.scale})`;
      } else {
        pgType = `${pgType}(${dbConfig.precision})`;
      }
    }

    let definition = `${columnName} ${pgType}`;

    // Primary key
    if (dbConfig.primaryKey) {
      definition += ' PRIMARY KEY';
    }

    // NOT NULL constraint
    if (dbConfig.notNull && !dbConfig.primaryKey) {
      definition += ' NOT NULL';
    }

    // UNIQUE constraint
    if (dbConfig.unique && !dbConfig.primaryKey) {
      definition += ' UNIQUE';
    }

    // DEFAULT value
    if (dbConfig.default !== undefined) {
      definition += ` DEFAULT ${this.formatDefaultValue(dbConfig.default, pgType)}`;
    }

    // CHECK constraint
    if (dbConfig.check) {
      definition += ` CHECK (${dbConfig.check})`;
    }

    return definition;
  }

  /**
   * Map JSON Schema type to PostgreSQL type
   */
  mapType(fieldDef) {
    // Check for format first
    if (fieldDef.format && FORMAT_MAPPINGS[fieldDef.format]) {
      return FORMAT_MAPPINGS[fieldDef.format];
    }

    // Check for enum (create custom enum type)
    if (fieldDef.enum && fieldDef.database?.enumType) {
      return fieldDef.database.type || 'VARCHAR';
    }

    // Use type mapping
    if (fieldDef.type && TYPE_MAPPINGS[fieldDef.type]) {
      return TYPE_MAPPINGS[fieldDef.type];
    }

    // Default to VARCHAR
    return 'VARCHAR';
  }

  /**
   * Format default value
   */
  formatDefaultValue(value, pgType) {
    if (value === null) {
      return 'NULL';
    }

    if (typeof value === 'string') {
      // Check if it's a PostgreSQL function
      if (value.includes('()') || value.includes('NOW') || value.includes('uuid_')) {
        return value;
      }
      return this.escapeString(value);
    }

    if (typeof value === 'boolean') {
      return value ? 'TRUE' : 'FALSE';
    }

    if (typeof value === 'number') {
      return String(value);
    }

    if (typeof value === 'object') {
      return this.escapeString(JSON.stringify(value));
    }

    return this.escapeString(String(value));
  }

  /**
   * Generate table-level constraints
   */
  generateTableLevelConstraints(schemaDefinition) {
    const constraints = [];
    const properties = schemaDefinition.properties || {};

    // Composite unique constraints
    if (schemaDefinition.uniqueConstraints) {
      for (const constraint of schemaDefinition.uniqueConstraints) {
        const columns = constraint.columns.map(c => this.sanitizeIdentifier(c)).join(', ');
        const name = constraint.name || `uq_${schemaDefinition.table}_${constraint.columns.join('_')}`;
        constraints.push(`CONSTRAINT ${this.sanitizeIdentifier(name)} UNIQUE (${columns})`);
      }
    }

    return constraints;
  }

  /**
   * Generate ENUM types
   */
  generateEnums(schemaDefinition) {
    const statements = [];
    const properties = schemaDefinition.properties || {};

    for (const [fieldName, fieldDef] of Object.entries(properties)) {
      if (fieldDef.enum && fieldDef.database?.enumType) {
        const enumTypeName = fieldDef.database.type || `${schemaDefinition.table}_${fieldName}_enum`;
        const enumValues = fieldDef.enum.map(v => this.escapeString(v)).join(', ');

        statements.push(
          `CREATE TYPE ${this.sanitizeIdentifier(enumTypeName)} AS ENUM (${enumValues});`
        );
      }
    }

    return statements;
  }

  /**
   * Generate indexes
   */
  generateIndexes(schemaDefinition) {
    const statements = [];
    const tableName = this.sanitizeIdentifier(schemaDefinition.table);
    const indexes = schemaDefinition.indexes || [];
    const properties = schemaDefinition.properties || {};

    // Generate indexes from schema indexes array
    for (const indexDef of indexes) {
      const sql = this.generateCreateIndex(tableName, indexDef);
      statements.push(sql);
    }

    // Generate indexes from individual field index flags
    for (const [fieldName, fieldDef] of Object.entries(properties)) {
      if (fieldDef.database?.index && !fieldDef.database.primaryKey) {
        const indexName = `idx_${schemaDefinition.table}_${fieldName}`;
        const columnName = this.sanitizeIdentifier(fieldName);

        statements.push(
          `CREATE INDEX ${this.sanitizeIdentifier(indexName)} ON ${tableName} (${columnName});`
        );
      }
    }

    return statements;
  }

  /**
   * Generate CREATE INDEX statement
   */
  generateCreateIndex(tableName, indexDef) {
    const indexName = this.sanitizeIdentifier(indexDef.name);
    const columns = indexDef.columns.map(c => this.sanitizeIdentifier(c)).join(', ');
    const unique = indexDef.unique ? 'UNIQUE ' : '';
    const method = indexDef.method ? `USING ${indexDef.method.toUpperCase()}` : '';

    return `CREATE ${unique}INDEX ${indexName} ON ${tableName} ${method} (${columns});`.trim();
  }

  /**
   * Generate foreign key constraints
   */
  generateForeignKeyConstraints(schemaDefinition) {
    const statements = [];
    const tableName = this.sanitizeIdentifier(schemaDefinition.table);
    const properties = schemaDefinition.properties || {};

    for (const [fieldName, fieldDef] of Object.entries(properties)) {
      const fk = fieldDef.database?.foreignKey;

      if (fk) {
        const columnName = this.sanitizeIdentifier(fieldName);
        const refTable = this.sanitizeIdentifier(fk.table);
        const refColumn = this.sanitizeIdentifier(fk.column);
        const constraintName = `fk_${schemaDefinition.table}_${fieldName}`;

        let sql = `ALTER TABLE ${tableName} ADD CONSTRAINT ${this.sanitizeIdentifier(constraintName)} `;
        sql += `FOREIGN KEY (${columnName}) REFERENCES ${refTable} (${refColumn})`;

        if (fk.onDelete) {
          sql += ` ON DELETE ${fk.onDelete}`;
        }

        if (fk.onUpdate) {
          sql += ` ON UPDATE ${fk.onUpdate}`;
        }

        sql += ';';
        statements.push(sql);
      }
    }

    return statements;
  }

  /**
   * Generate DROP TABLE statement
   */
  generateDropTable(tableName, cascade = false) {
    const identifier = this.sanitizeIdentifier(tableName);
    return `DROP TABLE IF EXISTS ${identifier}${cascade ? ' CASCADE' : ''};`;
  }

  /**
   * Generate ALTER TABLE statements
   */
  generateAlterTable(tableName, alterations) {
    const statements = [];
    const table = this.sanitizeIdentifier(tableName);

    for (const alteration of alterations) {
      let sql = `ALTER TABLE ${table} `;

      switch (alteration.type) {
        case 'ADD_COLUMN':
          sql += `ADD COLUMN ${this.generateColumnDefinition(
            alteration.columnName,
            alteration.columnDef,
            { table: tableName }
          )};`;
          break;

        case 'DROP_COLUMN':
          sql += `DROP COLUMN ${this.sanitizeIdentifier(alteration.columnName)}${alteration.cascade ? ' CASCADE' : ''};`;
          break;

        case 'ALTER_COLUMN_TYPE':
          sql += `ALTER COLUMN ${this.sanitizeIdentifier(alteration.columnName)} TYPE ${alteration.newType}`;
          if (alteration.using) {
            sql += ` USING ${alteration.using}`;
          }
          sql += ';';
          break;

        case 'ALTER_COLUMN_DEFAULT':
          if (alteration.newDefault === null) {
            sql += `ALTER COLUMN ${this.sanitizeIdentifier(alteration.columnName)} DROP DEFAULT;`;
          } else {
            sql += `ALTER COLUMN ${this.sanitizeIdentifier(alteration.columnName)} SET DEFAULT ${this.formatDefaultValue(alteration.newDefault, alteration.columnType)};`;
          }
          break;

        case 'ALTER_COLUMN_NULL':
          if (alteration.notNull) {
            sql += `ALTER COLUMN ${this.sanitizeIdentifier(alteration.columnName)} SET NOT NULL;`;
          } else {
            sql += `ALTER COLUMN ${this.sanitizeIdentifier(alteration.columnName)} DROP NOT NULL;`;
          }
          break;

        case 'RENAME_COLUMN':
          sql += `RENAME COLUMN ${this.sanitizeIdentifier(alteration.oldName)} TO ${this.sanitizeIdentifier(alteration.newName)};`;
          break;

        case 'ADD_CONSTRAINT':
          sql += `ADD CONSTRAINT ${this.sanitizeIdentifier(alteration.constraintName)} ${alteration.constraintDef};`;
          break;

        case 'DROP_CONSTRAINT':
          sql += `DROP CONSTRAINT ${this.sanitizeIdentifier(alteration.constraintName)}${alteration.cascade ? ' CASCADE' : ''};`;
          break;

        default:
          logger.warn(`Unknown alteration type: ${alteration.type}`);
          continue;
      }

      statements.push(sql);
    }

    return statements;
  }

  /**
   * Sanitize identifier (prevent SQL injection)
   */
  sanitizeIdentifier(identifier) {
    if (!identifier || typeof identifier !== 'string') {
      throw new Error('Invalid identifier');
    }

    // Check if valid PostgreSQL identifier
    if (!/^[a-zA-Z_][a-zA-Z0-9_$]*$/.test(identifier)) {
      throw new Error(`Invalid identifier: ${identifier}`);
    }

    // Quote identifier to handle reserved keywords
    return `"${identifier.replace(/"/g, '""')}"`;
  }

  /**
   * Escape string value for SQL
   */
  escapeString(value) {
    if (typeof value !== 'string') {
      value = String(value);
    }

    return `'${value.replace(/'/g, "''")}'`;
  }

  /**
   * Generate complete schema with timestamps
   */
  generateTableWithTimestamps(schemaDefinition) {
    // Add created_at and updated_at if not present
    const properties = schemaDefinition.properties || {};

    if (!properties.createdAt && !properties.created_at) {
      properties.createdAt = {
        type: 'string',
        format: 'date-time',
        database: {
          type: 'TIMESTAMPTZ',
          notNull: true,
          default: 'NOW()'
        }
      };
    }

    if (!properties.updatedAt && !properties.updated_at) {
      properties.updatedAt = {
        type: 'string',
        format: 'date-time',
        database: {
          type: 'TIMESTAMPTZ',
          notNull: true,
          default: 'NOW()'
        }
      };
    }

    schemaDefinition.properties = properties;

    return this.generateDDL(schemaDefinition);
  }
}

module.exports = new DDLGeneratorService();
