const jsonpatch = require('fast-json-patch');
const ddlGenerator = require('./ddlGenerator');
const { ForgeMigration, ForgeSchema, ForgeSchemaVersion } = require('../models');
const logger = require('../../utils/logger');

/**
 * Migration Generator Service
 *
 * Compares schema versions and generates migration scripts
 * Creates both forward (upgrade) and rollback (downgrade) SQL
 */

class MigrationGeneratorService {
  /**
   * Generate migration between two schema versions
   */
  async generateMigration(fromSchemaId, toSchemaId, options = {}) {
    try {
      const fromSchema = fromSchemaId
        ? await ForgeSchema.findByPk(fromSchemaId)
        : null;

      const toSchema = await ForgeSchema.findByPk(toSchemaId);

      if (!toSchema) {
        throw new Error(`Target schema not found: ${toSchemaId}`);
      }

      if (fromSchemaId && !fromSchema) {
        throw new Error(`Source schema not found: ${fromSchemaId}`);
      }

      // Generate migration name
      const migrationName = this.generateMigrationName(fromSchema, toSchema);

      // Check if migration already exists
      const existing = await ForgeMigration.findOne({
        where: { migrationName }
      });

      if (existing && !options.regenerate) {
        logger.info(`Migration already exists: ${migrationName}`);
        return existing;
      }

      // Compare schemas and generate DDL
      const { migrationSql, rollbackSql, description, isBreaking } = fromSchema
        ? await this.generateUpdateMigration(fromSchema, toSchema)
        : await this.generateCreateMigration(toSchema);

      // Create migration record
      const migration = await ForgeMigration.create({
        migrationName,
        description,
        fromSchemaId: fromSchema?.id || null,
        toSchemaId: toSchema.id,
        fromVersion: fromSchema?.version || null,
        toVersion: toSchema.version,
        migrationSql,
        rollbackSql,
        status: 'pending'
      });

      logger.info(`Migration generated: ${migrationName}`, {
        migrationId: migration.id,
        fromVersion: fromSchema?.version,
        toVersion: toSchema.version
      });

      return migration;
    } catch (error) {
      logger.error('Failed to generate migration', {
        error: error.message,
        fromSchemaId,
        toSchemaId
      });
      throw error;
    }
  }

  /**
   * Generate migration for initial table creation
   */
  async generateCreateMigration(toSchema) {
    const ddl = ddlGenerator.generateDDL(toSchema.schemaDefinition);

    return {
      migrationSql: ddl.sql,
      rollbackSql: ddlGenerator.generateDropTable(toSchema.tableName, true),
      description: `Create ${toSchema.name} table (${toSchema.version})`,
      isBreaking: false
    };
  }

  /**
   * Generate migration for schema update
   */
  async generateUpdateMigration(fromSchema, toSchema) {
    const fromDef = fromSchema.schemaDefinition;
    const toDef = toSchema.schemaDefinition;

    // Compare schema definitions
    const changes = this.compareSchemas(fromDef, toDef);

    if (changes.length === 0) {
      return {
        migrationSql: '-- No changes detected',
        rollbackSql: '-- No rollback needed',
        description: `No changes between ${fromSchema.version} and ${toSchema.version}`,
        isBreaking: false
      };
    }

    // Generate migration and rollback SQL
    const { migrationSql, rollbackSql, isBreaking } = this.generateMigrationSQL(
      fromDef,
      toDef,
      changes
    );

    const description = this.generateChangeDescription(changes, fromSchema, toSchema);

    return {
      migrationSql,
      rollbackSql,
      description,
      isBreaking
    };
  }

  /**
   * Compare two schema definitions
   */
  compareSchemas(fromDef, toDef) {
    const changes = [];
    const fromProps = fromDef.properties || {};
    const toProps = toDef.properties || {};

    // Check for added columns
    for (const [fieldName, fieldDef] of Object.entries(toProps)) {
      if (!fromProps[fieldName]) {
        changes.push({
          type: 'ADD_COLUMN',
          fieldName,
          fieldDef,
          breaking: fieldDef.database?.notNull && !fieldDef.database?.default
        });
      }
    }

    // Check for removed columns
    for (const [fieldName, fieldDef] of Object.entries(fromProps)) {
      if (!toProps[fieldName]) {
        changes.push({
          type: 'DROP_COLUMN',
          fieldName,
          fieldDef,
          breaking: true
        });
      }
    }

    // Check for modified columns
    for (const [fieldName, toFieldDef] of Object.entries(toProps)) {
      const fromFieldDef = fromProps[fieldName];

      if (fromFieldDef) {
        const columnChanges = this.compareColumnDefinitions(
          fieldName,
          fromFieldDef,
          toFieldDef
        );
        changes.push(...columnChanges);
      }
    }

    // Check for index changes
    const indexChanges = this.compareIndexes(fromDef, toDef);
    changes.push(...indexChanges);

    // Check for constraint changes
    const constraintChanges = this.compareConstraints(fromDef, toDef);
    changes.push(...constraintChanges);

    return changes;
  }

  /**
   * Compare column definitions
   */
  compareColumnDefinitions(fieldName, fromDef, toDef) {
    const changes = [];
    const fromDb = fromDef.database || {};
    const toDb = toDef.database || {};

    // Check type change
    const fromType = fromDb.type || ddlGenerator.mapType(fromDef);
    const toType = toDb.type || ddlGenerator.mapType(toDef);

    if (fromType !== toType) {
      changes.push({
        type: 'ALTER_COLUMN_TYPE',
        fieldName,
        fromType,
        toType,
        breaking: !this.isCompatibleTypeChange(fromType, toType)
      });
    }

    // Check NOT NULL change
    if (fromDb.notNull !== toDb.notNull) {
      changes.push({
        type: 'ALTER_COLUMN_NULL',
        fieldName,
        notNull: toDb.notNull,
        breaking: toDb.notNull === true
      });
    }

    // Check DEFAULT change
    if (JSON.stringify(fromDb.default) !== JSON.stringify(toDb.default)) {
      changes.push({
        type: 'ALTER_COLUMN_DEFAULT',
        fieldName,
        fromDefault: fromDb.default,
        toDefault: toDb.default,
        breaking: false
      });
    }

    // Check UNIQUE constraint change
    if (fromDb.unique !== toDb.unique) {
      if (toDb.unique) {
        changes.push({
          type: 'ADD_UNIQUE_CONSTRAINT',
          fieldName,
          breaking: false
        });
      } else {
        changes.push({
          type: 'DROP_UNIQUE_CONSTRAINT',
          fieldName,
          breaking: true
        });
      }
    }

    return changes;
  }

  /**
   * Compare indexes
   */
  compareIndexes(fromDef, toDef) {
    const changes = [];
    const fromIndexes = fromDef.indexes || [];
    const toIndexes = toDef.indexes || [];

    // Convert to maps for easier comparison
    const fromIndexMap = new Map(fromIndexes.map(idx => [idx.name, idx]));
    const toIndexMap = new Map(toIndexes.map(idx => [idx.name, idx]));

    // Check for added indexes
    for (const [name, indexDef] of toIndexMap.entries()) {
      if (!fromIndexMap.has(name)) {
        changes.push({
          type: 'ADD_INDEX',
          indexDef,
          breaking: false
        });
      }
    }

    // Check for removed indexes
    for (const [name, indexDef] of fromIndexMap.entries()) {
      if (!toIndexMap.has(name)) {
        changes.push({
          type: 'DROP_INDEX',
          indexDef,
          breaking: false
        });
      }
    }

    // Check for modified indexes (drop and recreate)
    for (const [name, toIndexDef] of toIndexMap.entries()) {
      const fromIndexDef = fromIndexMap.get(name);
      if (fromIndexDef && JSON.stringify(fromIndexDef) !== JSON.stringify(toIndexDef)) {
        changes.push({
          type: 'DROP_INDEX',
          indexDef: fromIndexDef,
          breaking: false
        });
        changes.push({
          type: 'ADD_INDEX',
          indexDef: toIndexDef,
          breaking: false
        });
      }
    }

    return changes;
  }

  /**
   * Compare constraints (foreign keys, checks, etc.)
   */
  compareConstraints(fromDef, toDef) {
    const changes = [];
    const fromProps = fromDef.properties || {};
    const toProps = toDef.properties || {};

    // Check foreign key changes
    for (const [fieldName, toProp] of Object.entries(toProps)) {
      const fromProp = fromProps[fieldName];
      const fromFk = fromProp?.database?.foreignKey;
      const toFk = toProp?.database?.foreignKey;

      if (!fromFk && toFk) {
        // Foreign key added
        changes.push({
          type: 'ADD_FOREIGN_KEY',
          fieldName,
          foreignKey: toFk,
          breaking: false
        });
      } else if (fromFk && !toFk) {
        // Foreign key removed
        changes.push({
          type: 'DROP_FOREIGN_KEY',
          fieldName,
          foreignKey: fromFk,
          breaking: true
        });
      } else if (fromFk && toFk && JSON.stringify(fromFk) !== JSON.stringify(toFk)) {
        // Foreign key modified
        changes.push({
          type: 'DROP_FOREIGN_KEY',
          fieldName,
          foreignKey: fromFk,
          breaking: true
        });
        changes.push({
          type: 'ADD_FOREIGN_KEY',
          fieldName,
          foreignKey: toFk,
          breaking: false
        });
      }
    }

    return changes;
  }

  /**
   * Generate migration SQL from changes
   */
  generateMigrationSQL(fromDef, toDef, changes) {
    const tableName = toDef.table;
    const migrationStatements = [];
    const rollbackStatements = [];
    let isBreaking = false;

    for (const change of changes) {
      if (change.breaking) {
        isBreaking = true;
      }

      const { forward, rollback } = this.generateChangeSQL(tableName, change, fromDef, toDef);

      if (forward) migrationStatements.push(forward);
      if (rollback) rollbackStatements.unshift(rollback); // Reverse order for rollback
    }

    return {
      migrationSql: migrationStatements.join('\n\n'),
      rollbackSql: rollbackStatements.join('\n\n'),
      isBreaking
    };
  }

  /**
   * Generate SQL for a single change
   */
  generateChangeSQL(tableName, change, fromDef, toDef) {
    const table = ddlGenerator.sanitizeIdentifier(tableName);

    switch (change.type) {
      case 'ADD_COLUMN': {
        const forward = ddlGenerator.generateAlterTable(tableName, [{
          type: 'ADD_COLUMN',
          columnName: change.fieldName,
          columnDef: change.fieldDef
        }])[0];

        const rollback = ddlGenerator.generateAlterTable(tableName, [{
          type: 'DROP_COLUMN',
          columnName: change.fieldName,
          cascade: true
        }])[0];

        return { forward, rollback };
      }

      case 'DROP_COLUMN': {
        const forward = ddlGenerator.generateAlterTable(tableName, [{
          type: 'DROP_COLUMN',
          columnName: change.fieldName,
          cascade: true
        }])[0];

        const rollback = ddlGenerator.generateAlterTable(tableName, [{
          type: 'ADD_COLUMN',
          columnName: change.fieldName,
          columnDef: change.fieldDef
        }])[0];

        return { forward, rollback };
      }

      case 'ALTER_COLUMN_TYPE': {
        const forward = ddlGenerator.generateAlterTable(tableName, [{
          type: 'ALTER_COLUMN_TYPE',
          columnName: change.fieldName,
          newType: change.toType,
          using: this.generateUsingClause(change.fromType, change.toType, change.fieldName)
        }])[0];

        const rollback = ddlGenerator.generateAlterTable(tableName, [{
          type: 'ALTER_COLUMN_TYPE',
          columnName: change.fieldName,
          newType: change.fromType,
          using: this.generateUsingClause(change.toType, change.fromType, change.fieldName)
        }])[0];

        return { forward, rollback };
      }

      case 'ALTER_COLUMN_NULL': {
        const forward = ddlGenerator.generateAlterTable(tableName, [{
          type: 'ALTER_COLUMN_NULL',
          columnName: change.fieldName,
          notNull: change.notNull
        }])[0];

        const rollback = ddlGenerator.generateAlterTable(tableName, [{
          type: 'ALTER_COLUMN_NULL',
          columnName: change.fieldName,
          notNull: !change.notNull
        }])[0];

        return { forward, rollback };
      }

      case 'ALTER_COLUMN_DEFAULT': {
        const forward = ddlGenerator.generateAlterTable(tableName, [{
          type: 'ALTER_COLUMN_DEFAULT',
          columnName: change.fieldName,
          newDefault: change.toDefault,
          columnType: change.toType
        }])[0];

        const rollback = ddlGenerator.generateAlterTable(tableName, [{
          type: 'ALTER_COLUMN_DEFAULT',
          columnName: change.fieldName,
          newDefault: change.fromDefault,
          columnType: change.fromType
        }])[0];

        return { forward, rollback };
      }

      case 'ADD_INDEX': {
        const forward = ddlGenerator.generateCreateIndex(table, change.indexDef);
        const indexName = ddlGenerator.sanitizeIdentifier(change.indexDef.name);
        const rollback = `DROP INDEX IF EXISTS ${indexName};`;

        return { forward, rollback };
      }

      case 'DROP_INDEX': {
        const indexName = ddlGenerator.sanitizeIdentifier(change.indexDef.name);
        const forward = `DROP INDEX IF EXISTS ${indexName};`;
        const rollback = ddlGenerator.generateCreateIndex(table, change.indexDef);

        return { forward, rollback };
      }

      case 'ADD_FOREIGN_KEY': {
        const constraintName = `fk_${tableName}_${change.fieldName}`;
        const columnName = ddlGenerator.sanitizeIdentifier(change.fieldName);
        const refTable = ddlGenerator.sanitizeIdentifier(change.foreignKey.table);
        const refColumn = ddlGenerator.sanitizeIdentifier(change.foreignKey.column);

        let forward = `ALTER TABLE ${table} ADD CONSTRAINT ${ddlGenerator.sanitizeIdentifier(constraintName)} `;
        forward += `FOREIGN KEY (${columnName}) REFERENCES ${refTable} (${refColumn})`;

        if (change.foreignKey.onDelete) {
          forward += ` ON DELETE ${change.foreignKey.onDelete}`;
        }

        if (change.foreignKey.onUpdate) {
          forward += ` ON UPDATE ${change.foreignKey.onUpdate}`;
        }

        forward += ';';

        const rollback = `ALTER TABLE ${table} DROP CONSTRAINT IF EXISTS ${ddlGenerator.sanitizeIdentifier(constraintName)};`;

        return { forward, rollback };
      }

      case 'DROP_FOREIGN_KEY': {
        const constraintName = `fk_${tableName}_${change.fieldName}`;

        const forward = `ALTER TABLE ${table} DROP CONSTRAINT IF EXISTS ${ddlGenerator.sanitizeIdentifier(constraintName)};`;

        const columnName = ddlGenerator.sanitizeIdentifier(change.fieldName);
        const refTable = ddlGenerator.sanitizeIdentifier(change.foreignKey.table);
        const refColumn = ddlGenerator.sanitizeIdentifier(change.foreignKey.column);

        let rollback = `ALTER TABLE ${table} ADD CONSTRAINT ${ddlGenerator.sanitizeIdentifier(constraintName)} `;
        rollback += `FOREIGN KEY (${columnName}) REFERENCES ${refTable} (${refColumn})`;

        if (change.foreignKey.onDelete) {
          rollback += ` ON DELETE ${change.foreignKey.onDelete}`;
        }

        if (change.foreignKey.onUpdate) {
          rollback += ` ON UPDATE ${change.foreignKey.onUpdate}`;
        }

        rollback += ';';

        return { forward, rollback };
      }

      default:
        logger.warn(`Unknown change type: ${change.type}`);
        return { forward: null, rollback: null };
    }
  }

  /**
   * Generate USING clause for type conversion
   */
  generateUsingClause(fromType, toType, fieldName) {
    const column = ddlGenerator.sanitizeIdentifier(fieldName);

    // Common type conversions
    if (fromType === 'VARCHAR' && toType === 'INTEGER') {
      return `${column}::INTEGER`;
    }

    if (fromType === 'VARCHAR' && toType === 'UUID') {
      return `${column}::UUID`;
    }

    if (fromType === 'INTEGER' && toType === 'VARCHAR') {
      return `${column}::VARCHAR`;
    }

    if (fromType.includes('TIMESTAMP') && toType === 'DATE') {
      return `${column}::DATE`;
    }

    // Default: try direct cast
    return `${column}::${toType}`;
  }

  /**
   * Check if type change is compatible (non-breaking)
   */
  isCompatibleTypeChange(fromType, toType) {
    const compatible = [
      ['VARCHAR', 'TEXT'],
      ['INTEGER', 'BIGINT'],
      ['DATE', 'TIMESTAMPTZ'],
      ['TIME', 'TIMETZ']
    ];

    return compatible.some(
      ([from, to]) => fromType.includes(from) && toType.includes(to)
    );
  }

  /**
   * Generate human-readable description of changes
   */
  generateChangeDescription(changes, fromSchema, toSchema) {
    const summaries = [];

    const addedColumns = changes.filter(c => c.type === 'ADD_COLUMN').length;
    const droppedColumns = changes.filter(c => c.type === 'DROP_COLUMN').length;
    const alteredColumns = changes.filter(c => c.type.startsWith('ALTER_COLUMN')).length;
    const addedIndexes = changes.filter(c => c.type === 'ADD_INDEX').length;
    const droppedIndexes = changes.filter(c => c.type === 'DROP_INDEX').length;

    if (addedColumns > 0) summaries.push(`${addedColumns} column(s) added`);
    if (droppedColumns > 0) summaries.push(`${droppedColumns} column(s) dropped`);
    if (alteredColumns > 0) summaries.push(`${alteredColumns} column(s) altered`);
    if (addedIndexes > 0) summaries.push(`${addedIndexes} index(es) added`);
    if (droppedIndexes > 0) summaries.push(`${droppedIndexes} index(es) dropped`);

    const summary = summaries.join(', ');

    return `Migrate ${fromSchema.name} from ${fromSchema.version} to ${toSchema.version}: ${summary}`;
  }

  /**
   * Generate migration name
   */
  generateMigrationName(fromSchema, toSchema) {
    const timestamp = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14);
    const modelId = toSchema.modelId.toLowerCase();

    if (fromSchema) {
      return `${timestamp}_migrate_${modelId}_${fromSchema.version.replace(/\./g, '_')}_to_${toSchema.version.replace(/\./g, '_')}`;
    } else {
      return `${timestamp}_create_${modelId}_${toSchema.version.replace(/\./g, '_')}`;
    }
  }
}

module.exports = new MigrationGeneratorService();
