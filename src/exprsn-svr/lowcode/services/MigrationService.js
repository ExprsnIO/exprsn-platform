const crypto = require('crypto');

/**
 * ═══════════════════════════════════════════════════════════
 * Migration Service
 * Generates database migration SQL based on entity schema changes
 * ═══════════════════════════════════════════════════════════
 */

class MigrationService {
  /**
   * Generate migration SQL based on schema changes
   * @param {Object} currentSchema - Current entity schema
   * @param {Object} previousSchema - Previous entity schema (for alter)
   * @param {Object} options - Migration options
   * @returns {Object} { sql, rollbackSql, type, checksum, changes }
   */
  static async generateMigration(currentSchema, previousSchema, options = {}) {
    const {
      type = 'auto',
      safeMode = true,
      generateRollback = true,
      backupData = false
    } = options;

    let sql = '';
    let rollbackSql = '';
    let detectedType = type;
    let changes = null;

    if (type === 'auto') {
      // Auto-detect changes
      changes = this.detectSchemaChanges(currentSchema, previousSchema);
      detectedType = this.inferMigrationType(changes);

      if (detectedType === 'create_table') {
        sql = this.generateCreateTableSQL(currentSchema, safeMode);
        rollbackSql = `DROP TABLE IF EXISTS ${currentSchema.tableName};`;
      } else if (detectedType === 'alter_table') {
        sql = this.generateAlterTableSQL(currentSchema, changes, safeMode);
        if (generateRollback) {
          rollbackSql = this.generateRollbackSQL(currentSchema, changes, previousSchema);
        }
      }
    } else if (type === 'create_table') {
      sql = this.generateCreateTableSQL(currentSchema, safeMode);
      rollbackSql = `DROP TABLE IF EXISTS ${currentSchema.tableName};`;
    } else if (type === 'alter_table' || type === 'add_column' || type === 'drop_column' || type === 'modify_column') {
      changes = this.detectSchemaChanges(currentSchema, previousSchema);
      sql = this.generateAlterTableSQL(currentSchema, changes, safeMode, type);
      rollbackSql = this.generateRollbackSQL(currentSchema, changes, previousSchema);
    } else if (type === 'add_index') {
      sql = this.generateAddIndexSQL(currentSchema, safeMode);
      rollbackSql = this.generateDropIndexSQL(currentSchema);
    } else if (type === 'drop_index') {
      sql = this.generateDropIndexSQL(currentSchema);
      rollbackSql = this.generateAddIndexSQL(currentSchema, safeMode);
    } else if (type === 'drop_table') {
      sql = `DROP TABLE IF EXISTS ${currentSchema.tableName};`;
      if (generateRollback && previousSchema) {
        rollbackSql = this.generateCreateTableSQL(previousSchema, safeMode);
      }
    }

    // Add backup data commands if requested
    if (backupData && detectedType !== 'create_table') {
      const backupSql = this.generateBackupSQL(currentSchema);
      sql = backupSql + '\n\n' + sql;
    }

    // Generate checksum for integrity verification
    const checksum = crypto.createHash('sha256').update(sql).digest('hex');

    return {
      sql,
      rollbackSql,
      type: detectedType,
      checksum,
      changes
    };
  }

  /**
   * Generate CREATE TABLE SQL
   */
  static generateCreateTableSQL(schema, safeMode = true) {
    const { tableName, fields = [], indexes = [] } = schema;

    let sql = safeMode ? 'BEGIN;\n\n' : '';

    // CREATE TABLE statement
    sql += `CREATE TABLE IF NOT EXISTS ${tableName} (\n`;

    // Add fields
    const fieldDefinitions = fields.map(field => {
      return `  ${field.name} ${this.getPostgreSQLType(field)}${this.getFieldConstraints(field)}`;
    });

    sql += fieldDefinitions.join(',\n');

    // Add primary key constraint
    const primaryKeys = fields.filter(f => f.primaryKey || f.validation?.primaryKey);
    if (primaryKeys.length > 0) {
      sql += `,\n  PRIMARY KEY (${primaryKeys.map(f => f.name).join(', ')})`;
    }

    sql += '\n);\n\n';

    // Add indexes
    indexes.forEach(index => {
      sql += this.generateCreateIndexSQL(tableName, index);
    });

    // Add comments
    if (schema.description) {
      sql += `COMMENT ON TABLE ${tableName} IS '${schema.description.replace(/'/g, "''")}';\n`;
    }

    fields.forEach(field => {
      if (field.description) {
        sql += `COMMENT ON COLUMN ${tableName}.${field.name} IS '${field.description.replace(/'/g, "''")}';\n`;
      }
    });

    if (safeMode) {
      sql += '\nCOMMIT;';
    }

    return sql;
  }

  /**
   * Generate ALTER TABLE SQL
   */
  static generateAlterTableSQL(schema, changes, safeMode = true, specificType = null) {
    const { tableName } = schema;
    let sql = safeMode ? 'BEGIN;\n\n' : '';

    // Filter changes based on specific type
    if (specificType === 'add_column' && changes.addedFields) {
      changes.addedFields.forEach(field => {
        sql += `ALTER TABLE ${tableName} ADD COLUMN ${field.name} ${this.getPostgreSQLType(field)}${this.getFieldConstraints(field)};\n`;
        if (field.description) {
          sql += `COMMENT ON COLUMN ${tableName}.${field.name} IS '${field.description.replace(/'/g, "''")}';\n`;
        }
      });
    } else if (specificType === 'drop_column' && changes.removedFields) {
      changes.removedFields.forEach(field => {
        sql += `ALTER TABLE ${tableName} DROP COLUMN IF EXISTS ${field.name};\n`;
      });
    } else if (specificType === 'modify_column' && changes.modifiedFields) {
      changes.modifiedFields.forEach(({ field, changes: fieldChanges }) => {
        this.generateModifyColumnSQL(tableName, field, fieldChanges, sql);
      });
    } else {
      // Add columns
      if (changes.addedFields && changes.addedFields.length > 0) {
        changes.addedFields.forEach(field => {
          sql += `ALTER TABLE ${tableName} ADD COLUMN ${field.name} ${this.getPostgreSQLType(field)}${this.getFieldConstraints(field)};\n`;
          if (field.description) {
            sql += `COMMENT ON COLUMN ${tableName}.${field.name} IS '${field.description.replace(/'/g, "''")}';\n`;
          }
        });
      }

      // Drop columns
      if (changes.removedFields && changes.removedFields.length > 0) {
        changes.removedFields.forEach(field => {
          sql += `ALTER TABLE ${tableName} DROP COLUMN IF EXISTS ${field.name};\n`;
        });
      }

      // Modify columns
      if (changes.modifiedFields && changes.modifiedFields.length > 0) {
        changes.modifiedFields.forEach(({ field, changes: fieldChanges }) => {
          if (fieldChanges.type) {
            const pgType = this.getPostgreSQLType(field);
            sql += `ALTER TABLE ${tableName} ALTER COLUMN ${field.name} TYPE ${pgType} USING ${field.name}::${pgType};\n`;
          }
          if (fieldChanges.nullable !== undefined) {
            sql += `ALTER TABLE ${tableName} ALTER COLUMN ${field.name} ${field.required ? 'SET NOT NULL' : 'DROP NOT NULL'};\n`;
          }
          if (fieldChanges.default !== undefined) {
            if (field.defaultValue !== null && field.defaultValue !== undefined) {
              sql += `ALTER TABLE ${tableName} ALTER COLUMN ${field.name} SET DEFAULT ${this.formatDefaultValue(field.defaultValue, field.type)};\n`;
            } else {
              sql += `ALTER TABLE ${tableName} ALTER COLUMN ${field.name} DROP DEFAULT;\n`;
            }
          }
        });
      }

      // Add indexes
      if (changes.addedIndexes && changes.addedIndexes.length > 0) {
        changes.addedIndexes.forEach(index => {
          sql += this.generateCreateIndexSQL(tableName, index);
        });
      }

      // Drop indexes
      if (changes.removedIndexes && changes.removedIndexes.length > 0) {
        changes.removedIndexes.forEach(index => {
          sql += `DROP INDEX IF EXISTS ${index.name};\n`;
        });
      }
    }

    if (safeMode) {
      sql += '\nCOMMIT;';
    }

    return sql;
  }

  /**
   * Generate CREATE INDEX SQL
   */
  static generateCreateIndexSQL(tableName, index) {
    const { name, type = 'btree', fields, unique = false, partial = null, include = null } = index;

    const indexType = type.toLowerCase();
    const uniqueKeyword = unique ? 'UNIQUE ' : '';
    const method = indexType !== 'btree' ? ` USING ${indexType.toUpperCase()}` : '';

    // Handle field objects with order
    const fieldList = fields.map(f => {
      if (typeof f === 'object' && f.name) {
        return `${f.name}${f.order ? ` ${f.order}` : ''}`;
      }
      return f;
    }).join(', ');

    let sql = `CREATE ${uniqueKeyword}INDEX IF NOT EXISTS ${name} ON ${tableName}${method} (${fieldList})`;

    // Include columns (for covering indexes)
    if (include && include.length > 0) {
      const includeFields = Array.isArray(include) ? include.join(', ') : include;
      sql += ` INCLUDE (${includeFields})`;
    }

    // Partial index WHERE clause
    if (partial) {
      sql += ` WHERE ${partial}`;
    }

    sql += ';\n';

    return sql;
  }

  /**
   * Generate backup SQL
   */
  static generateBackupSQL(schema) {
    const { tableName } = schema;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupTableName = `${tableName}_backup_${timestamp}`;

    return `-- Backup existing data\nCREATE TABLE ${backupTableName} AS SELECT * FROM ${tableName};\n`;
  }

  /**
   * Generate SQL to add indexes
   */
  static generateAddIndexSQL(schema, safeMode = true) {
    const { tableName, indexes = [] } = schema;
    let sql = safeMode ? 'BEGIN;\n\n' : '';

    indexes.forEach(index => {
      sql += this.generateCreateIndexSQL(tableName, index);
    });

    if (safeMode) {
      sql += '\nCOMMIT;';
    }

    return sql;
  }

  /**
   * Generate SQL to drop indexes
   */
  static generateDropIndexSQL(schema) {
    const { indexes = [] } = schema;
    let sql = 'BEGIN;\n\n';

    indexes.forEach(index => {
      sql += `DROP INDEX IF EXISTS ${index.name};\n`;
    });

    sql += '\nCOMMIT;';
    return sql;
  }

  /**
   * Detect schema changes between two versions
   */
  static detectSchemaChanges(current, previous) {
    if (!previous) {
      return {
        type: 'create',
        addedFields: current.fields || [],
        addedIndexes: current.indexes || []
      };
    }

    const changes = {
      addedFields: [],
      removedFields: [],
      modifiedFields: [],
      addedIndexes: [],
      removedIndexes: []
    };

    // Detect field changes
    const currentFieldMap = new Map((current.fields || []).map(f => [f.name, f]));
    const previousFieldMap = new Map((previous.fields || []).map(f => [f.name, f]));

    // Added fields
    currentFieldMap.forEach((field, name) => {
      if (!previousFieldMap.has(name)) {
        changes.addedFields.push(field);
      }
    });

    // Removed fields
    previousFieldMap.forEach((field, name) => {
      if (!currentFieldMap.has(name)) {
        changes.removedFields.push(field);
      }
    });

    // Modified fields
    currentFieldMap.forEach((field, name) => {
      if (previousFieldMap.has(name)) {
        const prevField = previousFieldMap.get(name);
        const fieldChanges = this.compareFields(field, prevField);
        if (Object.keys(fieldChanges).length > 0) {
          changes.modifiedFields.push({ field, changes: fieldChanges });
        }
      }
    });

    // Detect index changes
    const currentIndexMap = new Map((current.indexes || []).map(i => [i.name, i]));
    const previousIndexMap = new Map((previous.indexes || []).map(i => [i.name, i]));

    // Added indexes
    currentIndexMap.forEach((index, name) => {
      if (!previousIndexMap.has(name)) {
        changes.addedIndexes.push(index);
      }
    });

    // Removed indexes
    previousIndexMap.forEach((index, name) => {
      if (!currentIndexMap.has(name)) {
        changes.removedIndexes.push(index);
      }
    });

    return changes;
  }

  /**
   * Infer migration type from changes
   */
  static inferMigrationType(changes) {
    if (changes.type === 'create') {
      return 'create_table';
    }

    if (changes.addedFields.length > 0 || changes.removedFields.length > 0 ||
        changes.modifiedFields.length > 0 || changes.addedIndexes.length > 0 ||
        changes.removedIndexes.length > 0) {
      return 'alter_table';
    }

    return 'no_changes';
  }

  /**
   * Map entity field type to PostgreSQL type
   */
  static getPostgreSQLType(field) {
    const typeMap = {
      'String': 'VARCHAR(255)',
      'Text': 'TEXT',
      'Char': `CHAR(${field.validation?.maxLength || field.config?.maxLength || 1})`,
      'Integer': 'INTEGER',
      'BigInt': 'BIGINT',
      'Decimal': `DECIMAL(${field.validation?.precision || field.config?.precision || 10}, ${field.validation?.scale || field.config?.scale || 2})`,
      'Float': 'REAL',
      'Double': 'DOUBLE PRECISION',
      'Boolean': 'BOOLEAN',
      'Date': 'DATE',
      'DateTime': 'TIMESTAMP',
      'Time': 'TIME',
      'Timestamp': 'TIMESTAMP WITH TIME ZONE',
      'UUID': 'UUID',
      'JSON': 'JSON',
      'JSONB': 'JSONB',
      'Enum': 'VARCHAR(50)',
      'Array': 'TEXT[]',
      'Color': 'VARCHAR(50)',
      'Email': 'VARCHAR(255)',
      'URL': 'TEXT',
      'Phone': 'VARCHAR(20)',
      'Binary': 'BYTEA',
      'Blob': 'BYTEA'
    };

    // Handle custom max length for String types
    if (field.type === 'String' && (field.validation?.maxLength || field.config?.maxLength)) {
      return `VARCHAR(${field.validation?.maxLength || field.config?.maxLength})`;
    }

    return typeMap[field.type] || 'TEXT';
  }

  /**
   * Get field constraints (NOT NULL, DEFAULT, CHECK, etc.)
   */
  static getFieldConstraints(field) {
    let constraints = '';

    // NOT NULL
    if (field.required || field.validation?.required) {
      constraints += ' NOT NULL';
    }

    // DEFAULT
    if (field.defaultValue !== undefined && field.defaultValue !== null) {
      constraints += ` DEFAULT ${this.formatDefaultValue(field.defaultValue, field.type)}`;
    }

    // UNIQUE
    if (field.unique || field.validation?.unique) {
      constraints += ' UNIQUE';
    }

    // CHECK constraints for enums
    if (field.type === 'Enum' && field.config?.enumValues) {
      const values = field.config.enumValues.map(v => {
        const val = typeof v === 'object' ? v.value : v;
        return `'${val}'`;
      }).join(', ');
      constraints += ` CHECK (${field.name} IN (${values}))`;
    }

    // CHECK constraints for min/max values
    if (field.validation?.minValue !== undefined || field.validation?.maxValue !== undefined) {
      const checks = [];
      if (field.validation.minValue !== undefined) {
        checks.push(`${field.name} >= ${field.validation.minValue}`);
      }
      if (field.validation.maxValue !== undefined) {
        checks.push(`${field.name} <= ${field.validation.maxValue}`);
      }
      if (checks.length > 0) {
        constraints += ` CHECK (${checks.join(' AND ')})`;
      }
    }

    return constraints;
  }

  /**
   * Format default value for SQL
   */
  static formatDefaultValue(value, type) {
    if (value === null) return 'NULL';

    if (type === 'Boolean') {
      return value ? 'TRUE' : 'FALSE';
    }

    if (type === 'UUID' && (value === 'gen_random_uuid()' || value === 'uuid_generate_v4()')) {
      return 'gen_random_uuid()';
    }

    if ((type === 'Timestamp' || type === 'DateTime') && (value === 'CURRENT_TIMESTAMP' || value === 'NOW()')) {
      return 'CURRENT_TIMESTAMP';
    }

    if (type === 'Date' && value === 'CURRENT_DATE') {
      return 'CURRENT_DATE';
    }

    if (typeof value === 'number') {
      return value;
    }

    // String types - escape single quotes
    return `'${String(value).replace(/'/g, "''")}'`;
  }

  /**
   * Compare two field definitions
   */
  static compareFields(current, previous) {
    const changes = {};

    if (current.type !== previous.type) {
      changes.type = { from: previous.type, to: current.type };
    }

    if (current.required !== previous.required) {
      changes.nullable = { from: !previous.required, to: !current.required };
    }

    if (current.defaultValue !== previous.defaultValue) {
      changes.default = { from: previous.defaultValue, to: current.defaultValue };
    }

    if (current.unique !== previous.unique) {
      changes.unique = { from: previous.unique, to: current.unique };
    }

    // Check validation changes
    const currentMax = current.validation?.maxLength || current.config?.maxLength;
    const prevMax = previous.validation?.maxLength || previous.config?.maxLength;
    if (currentMax !== prevMax) {
      changes.maxLength = { from: prevMax, to: currentMax };
    }

    return changes;
  }

  /**
   * Generate rollback SQL
   */
  static generateRollbackSQL(schema, changes, previousSchema) {
    const { tableName } = schema;
    let sql = 'BEGIN;\n\n';

    // Rollback is opposite of forward migration

    // Reverse added fields -> drop them
    if (changes.addedFields && changes.addedFields.length > 0) {
      changes.addedFields.forEach(field => {
        sql += `ALTER TABLE ${tableName} DROP COLUMN IF EXISTS ${field.name};\n`;
      });
    }

    // Reverse removed fields -> add them back
    if (changes.removedFields && changes.removedFields.length > 0) {
      changes.removedFields.forEach(field => {
        sql += `ALTER TABLE ${tableName} ADD COLUMN ${field.name} ${this.getPostgreSQLType(field)}${this.getFieldConstraints(field)};\n`;
      });
    }

    // Reverse modified fields
    if (changes.modifiedFields && changes.modifiedFields.length > 0 && previousSchema) {
      const previousFieldMap = new Map((previousSchema.fields || []).map(f => [f.name, f]));

      changes.modifiedFields.forEach(({ field, changes: fieldChanges }) => {
        const prevField = previousFieldMap.get(field.name);
        if (prevField) {
          if (fieldChanges.type) {
            const pgType = this.getPostgreSQLType(prevField);
            sql += `ALTER TABLE ${tableName} ALTER COLUMN ${field.name} TYPE ${pgType} USING ${field.name}::${pgType};\n`;
          }
          if (fieldChanges.nullable !== undefined) {
            sql += `ALTER TABLE ${tableName} ALTER COLUMN ${field.name} ${prevField.required ? 'SET NOT NULL' : 'DROP NOT NULL'};\n`;
          }
          if (fieldChanges.default !== undefined) {
            if (prevField.defaultValue !== null && prevField.defaultValue !== undefined) {
              sql += `ALTER TABLE ${tableName} ALTER COLUMN ${field.name} SET DEFAULT ${this.formatDefaultValue(prevField.defaultValue, prevField.type)};\n`;
            } else {
              sql += `ALTER TABLE ${tableName} ALTER COLUMN ${field.name} DROP DEFAULT;\n`;
            }
          }
        }
      });
    }

    // Reverse added indexes -> drop them
    if (changes.addedIndexes && changes.addedIndexes.length > 0) {
      changes.addedIndexes.forEach(index => {
        sql += `DROP INDEX IF EXISTS ${index.name};\n`;
      });
    }

    // Reverse removed indexes -> add them back
    if (changes.removedIndexes && changes.removedIndexes.length > 0) {
      changes.removedIndexes.forEach(index => {
        sql += this.generateCreateIndexSQL(tableName, index);
      });
    }

    sql += '\nCOMMIT;';
    return sql;
  }

  /**
   * Validate migration SQL
   */
  static validateMigration(sql) {
    const errors = [];

    // Check for dangerous operations
    if (sql.includes('DROP TABLE') && !sql.includes('IF EXISTS')) {
      errors.push('DROP TABLE without IF EXISTS is dangerous');
    }

    // Check for missing transaction wrapper in safe mode
    if (!sql.includes('BEGIN') && sql.includes('ALTER TABLE')) {
      errors.push('Missing transaction wrapper for ALTER TABLE operations');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Generate migration metadata
   */
  static generateMigrationMetadata(schema, migrationData, options = {}) {
    const { version, description, type } = options;
    const timestamp = new Date().toISOString();
    const migrationId = `mig_${Date.now()}_${schema.tableName}`;

    return {
      id: migrationId,
      version: version || '1.0.0',
      type: migrationData.type,
      description: description || `Migration for ${schema.tableName}`,
      sql: migrationData.sql,
      rollbackSql: migrationData.rollbackSql,
      checksum: migrationData.checksum,
      appliedAt: null,
      appliedBy: null,
      status: 'pending',
      dependencies: [],
      createdAt: timestamp,
      changes: migrationData.changes
    };
  }

  /**
   * Auto-increment version number
   */
  static incrementVersion(currentVersion, incrementType = 'patch') {
    const [major, minor, patch] = currentVersion.split('.').map(Number);

    switch (incrementType) {
      case 'major':
        return `${major + 1}.0.0`;
      case 'minor':
        return `${major}.${minor + 1}.0`;
      case 'patch':
      default:
        return `${major}.${minor}.${patch + 1}`;
    }
  }
}

module.exports = MigrationService;
