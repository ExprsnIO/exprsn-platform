/**
 * ═══════════════════════════════════════════════════════════
 * Migration Generator Service
 * Generates Sequelize migration files from schema definitions
 * ═══════════════════════════════════════════════════════════
 */

const fs = require('fs').promises;
const path = require('path');

class MigrationGenerator {
  /**
   * Generate complete migration from schema
   */
  static async generateMigration(schema, options = {}) {
    const { tables = [], relationships = [] } = schema;
    const timestamp = options.timestamp || new Date().toISOString().replace(/[-:]/g, '').split('.')[0];
    const migrationName = options.name || `create-${schema.slug}-schema`;

    const upSql = this.generateUpSQL(tables, relationships, schema);
    const downSql = this.generateDownSQL(tables);

    const migrationContent = this.generateMigrationFile(upSql, downSql, migrationName);

    return {
      fileName: `${timestamp}-${migrationName}.js`,
      content: migrationContent,
      upSql,
      downSql
    };
  }

  /**
   * Generate UP migration SQL
   */
  static generateUpSQL(tables, relationships, schema) {
    let sql = '';

    // Create tables
    tables.forEach(table => {
      sql += this.generateCreateTable(table, schema);
      sql += '\n\n';
    });

    // Add indexes
    tables.forEach(table => {
      if (table.indexes && table.indexes.length > 0) {
        table.indexes.forEach(index => {
          sql += this.generateCreateIndex(table, index);
          sql += '\n';
        });
        sql += '\n';
      }
    });

    // Add foreign keys (after all tables exist)
    relationships.forEach(rel => {
      sql += this.generateAddForeignKey(rel, tables);
      sql += '\n';
    });

    return sql.trim();
  }

  /**
   * Generate DOWN migration SQL
   */
  static generateDownSQL(tables) {
    let sql = '';

    // Drop tables in reverse order
    const reversed = [...tables].reverse();
    reversed.forEach(table => {
      sql += `await queryInterface.dropTable('${table.name}');\n`;
    });

    return sql.trim();
  }

  /**
   * Generate CREATE TABLE statement
   */
  static generateCreateTable(table, schema) {
    const columns = table.columns || [];
    const schemaName = schema.schemaName === 'public' ? '' : `${schema.schemaName}.`;

    let sql = `await queryInterface.createTable('${schemaName}${table.name}', {\n`;

    // Add columns
    columns.forEach((col, index) => {
      sql += `  ${col.name}: {\n`;
      sql += `    type: Sequelize.${this.mapDataType(col.dataType, col)},\n`;

      if (col.isPrimaryKey) {
        sql += `    primaryKey: true,\n`;
      }

      if (!col.isNullable) {
        sql += `    allowNull: false,\n`;
      }

      if (col.isUnique) {
        sql += `    unique: true,\n`;
      }

      if (col.isAutoIncrement) {
        sql += `    autoIncrement: true,\n`;
      }

      if (col.defaultValue) {
        sql += `    defaultValue: ${this.formatDefaultValue(col.defaultValue, col.dataType)},\n`;
      }

      if (col.description) {
        sql += `    comment: '${col.description.replace(/'/g, "\\'")}',\n`;
      }

      // Remove trailing comma
      sql = sql.replace(/,\n$/, '\n');
      sql += `  }${index < columns.length - 1 ? ',' : ''}\n`;
    });

    // Add timestamps if audited
    if (table.isAudited) {
      sql += `,\n  created_at: {\n`;
      sql += `    type: Sequelize.DATE,\n`;
      sql += `    allowNull: false\n`;
      sql += `  },\n`;
      sql += `  updated_at: {\n`;
      sql += `    type: Sequelize.DATE,\n`;
      sql += `    allowNull: false\n`;
      sql += `  }`;
    }

    // Add soft delete
    if (table.isSoftDelete) {
      sql += `,\n  deleted_at: {\n`;
      sql += `    type: Sequelize.DATE\n`;
      sql += `  }`;
    }

    sql += `\n});`;

    return sql;
  }

  /**
   * Generate CREATE INDEX statement
   */
  static generateCreateIndex(table, index) {
    const indexName = index.name || `${table.name}_${index.columns.join('_')}_idx`;
    const unique = index.isUnique ? ', { unique: true }' : '';

    return `await queryInterface.addIndex('${table.name}', ${JSON.stringify(index.columns)}${unique});`;
  }

  /**
   * Generate ADD CONSTRAINT (foreign key) statement
   */
  static generateAddForeignKey(relationship, tables) {
    const sourceTable = tables.find(t => t.id === relationship.sourceTableId);
    const targetTable = tables.find(t => t.id === relationship.targetTableId);
    const sourceColumn = sourceTable?.columns?.find(c => c.id === relationship.sourceColumnId);

    if (!sourceTable || !targetTable || !sourceColumn) return '';

    const constraintName = `fk_${sourceTable.name}_${sourceColumn.name}`;

    let sql = `await queryInterface.addConstraint('${sourceTable.name}', {\n`;
    sql += `  fields: ['${sourceColumn.name}'],\n`;
    sql += `  type: 'foreign key',\n`;
    sql += `  name: '${constraintName}',\n`;
    sql += `  references: {\n`;
    sql += `    table: '${targetTable.name}',\n`;
    sql += `    field: 'id'\n`;
    sql += `  },\n`;
    sql += `  onDelete: '${relationship.onDelete}',\n`;
    sql += `  onUpdate: '${relationship.onUpdate}'\n`;
    sql += `});`;

    return sql;
  }

  /**
   * Generate complete migration file
   */
  static generateMigrationFile(upSql, downSql, migrationName) {
    return `/**
 * Migration: ${migrationName}
 * Generated by Exprsn Schema Designer
 * Date: ${new Date().toISOString()}
 */

'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
${this.indentCode(upSql, 4)}
  },

  down: async (queryInterface, Sequelize) => {
${this.indentCode(downSql, 4)}
  }
};
`;
  }

  /**
   * Map schema data type to Sequelize type
   */
  static mapDataType(dataType, column) {
    const typeMap = {
      'UUID': 'UUID',
      'VARCHAR': column.length ? `STRING(${column.length})` : 'STRING',
      'TEXT': 'TEXT',
      'INTEGER': 'INTEGER',
      'BIGINT': 'BIGINT',
      'DECIMAL': column.precision && column.scale
        ? `DECIMAL(${column.precision}, ${column.scale})`
        : 'DECIMAL',
      'FLOAT': 'FLOAT',
      'DOUBLE': 'DOUBLE',
      'BOOLEAN': 'BOOLEAN',
      'DATE': 'DATEONLY',
      'TIMESTAMP': 'DATE',
      'TIMESTAMPTZ': 'DATE',
      'JSONB': 'JSONB',
      'JSON': 'JSON',
      'ARRAY': 'ARRAY(Sequelize.STRING)',
      'ENUM': 'ENUM',
      'GEOMETRY': 'GEOMETRY',
      'GEOGRAPHY': 'GEOGRAPHY'
    };

    return typeMap[dataType.toUpperCase()] || 'STRING';
  }

  /**
   * Format default value for migration
   */
  static formatDefaultValue(value, dataType) {
    if (value === 'NOW()' || value === 'CURRENT_TIMESTAMP') {
      return 'Sequelize.NOW';
    }

    if (value === 'UUID()' || value === 'gen_random_uuid()') {
      return 'Sequelize.UUIDV4';
    }

    if (dataType === 'BOOLEAN') {
      return value === 'true' || value === '1' ? 'true' : 'false';
    }

    if (dataType === 'INTEGER' || dataType === 'BIGINT' || dataType === 'DECIMAL') {
      return value;
    }

    if (dataType === 'JSONB' || dataType === 'JSON') {
      return `'${value}'`;
    }

    return `'${value}'`;
  }

  /**
   * Indent code block
   */
  static indentCode(code, spaces) {
    const indent = ' '.repeat(spaces);
    return code.split('\n').map(line => indent + line).join('\n');
  }

  /**
   * Save migration file to disk
   */
  static async saveMigrationFile(migration, migrationsDir) {
    const filePath = path.join(migrationsDir, migration.fileName);
    await fs.mkdir(migrationsDir, { recursive: true });
    await fs.writeFile(filePath, migration.content, 'utf8');
    return filePath;
  }
}

module.exports = MigrationGenerator;
