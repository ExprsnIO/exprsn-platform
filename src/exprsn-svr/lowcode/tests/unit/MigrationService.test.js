/**
 * Unit Tests for Migration Service
 * Tests SQL generation, schema diff detection, and migration creation
 */

const MigrationService = require('../../services/MigrationService');

describe('MigrationService', () => {
  describe('generateCreateTableSQL()', () => {
    test('should generate basic CREATE TABLE statement', () => {
      const schema = {
        tableName: 'users',
        fields: [
          { name: 'id', type: 'UUID', primaryKey: true },
          { name: 'email', type: 'String', required: true, unique: true },
          { name: 'created_at', type: 'Timestamp' }
        ],
        indexes: []
      };

      const sql = MigrationService.generateCreateTableSQL(schema, false);

      expect(sql).toContain('CREATE TABLE IF NOT EXISTS users');
      expect(sql).toContain('id UUID');
      expect(sql).toContain('email VARCHAR(255) NOT NULL UNIQUE');
      expect(sql).toContain('PRIMARY KEY (id)');
    });

    test('should wrap in transaction when safeMode is true', () => {
      const schema = {
        tableName: 'products',
        fields: [{ name: 'id', type: 'UUID', primaryKey: true }],
        indexes: []
      };

      const sql = MigrationService.generateCreateTableSQL(schema, true);

      expect(sql).toContain('BEGIN;');
      expect(sql).toContain('COMMIT;');
    });

    test('should include DEFAULT values', () => {
      const schema = {
        tableName: 'settings',
        fields: [
          { name: 'id', type: 'UUID', primaryKey: true },
          { name: 'enabled', type: 'Boolean', defaultValue: true },
          { name: 'count', type: 'Integer', defaultValue: 0 }
        ],
        indexes: []
      };

      const sql = MigrationService.generateCreateTableSQL(schema, false);

      expect(sql).toContain('enabled BOOLEAN DEFAULT TRUE');
      expect(sql).toContain('count INTEGER DEFAULT 0');
    });

    test('should generate indexes', () => {
      const schema = {
        tableName: 'posts',
        fields: [
          { name: 'id', type: 'UUID', primaryKey: true },
          { name: 'title', type: 'String' },
          { name: 'status', type: 'String' }
        ],
        indexes: [
          {
            name: 'idx_posts_status',
            type: 'btree',
            fields: [{ name: 'status', order: 'ASC' }]
          }
        ]
      };

      const sql = MigrationService.generateCreateTableSQL(schema, false);

      expect(sql).toContain('CREATE INDEX IF NOT EXISTS idx_posts_status ON posts (status ASC)');
    });

    test('should handle composite primary keys', () => {
      const schema = {
        tableName: 'user_roles',
        fields: [
          { name: 'user_id', type: 'UUID', primaryKey: true },
          { name: 'role_id', type: 'UUID', primaryKey: true }
        ],
        indexes: []
      };

      const sql = MigrationService.generateCreateTableSQL(schema, false);

      expect(sql).toContain('PRIMARY KEY (user_id, role_id)');
    });

    test('should generate CHECK constraints for enums', () => {
      const schema = {
        tableName: 'tasks',
        fields: [
          { name: 'id', type: 'UUID', primaryKey: true },
          {
            name: 'status',
            type: 'Enum',
            config: {
              enumValues: [
                { value: 'pending' },
                { value: 'in_progress' },
                { value: 'completed' }
              ]
            }
          }
        ],
        indexes: []
      };

      const sql = MigrationService.generateCreateTableSQL(schema, false);

      expect(sql).toContain("CHECK (status IN ('pending', 'in_progress', 'completed'))");
    });
  });

  describe('generateAlterTableSQL()', () => {
    test('should generate ADD COLUMN statements', () => {
      const schema = { tableName: 'users' };
      const changes = {
        addedFields: [
          { name: 'phone', type: 'String' },
          { name: 'age', type: 'Integer' }
        ]
      };

      const sql = MigrationService.generateAlterTableSQL(schema, changes, false);

      expect(sql).toContain('ALTER TABLE users ADD COLUMN phone VARCHAR(255)');
      expect(sql).toContain('ALTER TABLE users ADD COLUMN age INTEGER');
    });

    test('should generate DROP COLUMN statements', () => {
      const schema = { tableName: 'products' };
      const changes = {
        removedFields: [
          { name: 'old_price' },
          { name: 'deprecated_field' }
        ]
      };

      const sql = MigrationService.generateAlterTableSQL(schema, changes, false);

      expect(sql).toContain('ALTER TABLE products DROP COLUMN IF EXISTS old_price');
      expect(sql).toContain('ALTER TABLE products DROP COLUMN IF EXISTS deprecated_field');
    });

    test('should generate ALTER COLUMN TYPE statements', () => {
      const schema = { tableName: 'orders' };
      const changes = {
        modifiedFields: [
          {
            field: { name: 'quantity', type: 'BigInt' },
            changes: { type: { from: 'Integer', to: 'BigInt' } }
          }
        ]
      };

      const sql = MigrationService.generateAlterTableSQL(schema, changes, false);

      expect(sql).toContain('ALTER TABLE orders ALTER COLUMN quantity TYPE BIGINT');
    });

    test('should generate SET/DROP NOT NULL statements', () => {
      const schema = { tableName: 'profiles' };
      const changes = {
        modifiedFields: [
          {
            field: { name: 'bio', required: false },
            changes: { nullable: { from: false, to: true } }
          }
        ]
      };

      const sql = MigrationService.generateAlterTableSQL(schema, changes, false);

      expect(sql).toContain('ALTER TABLE profiles ALTER COLUMN bio DROP NOT NULL');
    });

    test('should generate DEFAULT value changes', () => {
      const schema = { tableName: 'settings' };
      const changes = {
        modifiedFields: [
          {
            field: { name: 'theme', defaultValue: 'dark' },
            changes: { default: { from: 'light', to: 'dark' } }
          }
        ]
      };

      const sql = MigrationService.generateAlterTableSQL(schema, changes, false);

      expect(sql).toContain("ALTER TABLE settings ALTER COLUMN theme SET DEFAULT 'dark'");
    });

    test('should generate index creation statements', () => {
      const schema = { tableName: 'posts' };
      const changes = {
        addedIndexes: [
          {
            name: 'idx_posts_user_created',
            type: 'btree',
            fields: [{ name: 'user_id' }, { name: 'created_at', order: 'DESC' }]
          }
        ]
      };

      const sql = MigrationService.generateAlterTableSQL(schema, changes, false);

      expect(sql).toContain('CREATE INDEX IF NOT EXISTS idx_posts_user_created ON posts (user_id, created_at DESC)');
    });

    test('should generate index drop statements', () => {
      const schema = { tableName: 'users' };
      const changes = {
        removedIndexes: [
          { name: 'idx_old_field' }
        ]
      };

      const sql = MigrationService.generateAlterTableSQL(schema, changes, false);

      expect(sql).toContain('DROP INDEX IF EXISTS idx_old_field');
    });
  });

  describe('detectSchemaChanges()', () => {
    test('should detect added fields', () => {
      const current = {
        fields: [
          { name: 'id', type: 'UUID' },
          { name: 'email', type: 'String' },
          { name: 'phone', type: 'String' }
        ]
      };

      const previous = {
        fields: [
          { name: 'id', type: 'UUID' },
          { name: 'email', type: 'String' }
        ]
      };

      const changes = MigrationService.detectSchemaChanges(current, previous);

      expect(changes.addedFields).toHaveLength(1);
      expect(changes.addedFields[0].name).toBe('phone');
    });

    test('should detect removed fields', () => {
      const current = {
        fields: [
          { name: 'id', type: 'UUID' },
          { name: 'email', type: 'String' }
        ]
      };

      const previous = {
        fields: [
          { name: 'id', type: 'UUID' },
          { name: 'email', type: 'String' },
          { name: 'old_field', type: 'String' }
        ]
      };

      const changes = MigrationService.detectSchemaChanges(current, previous);

      expect(changes.removedFields).toHaveLength(1);
      expect(changes.removedFields[0].name).toBe('old_field');
    });

    test('should detect modified field types', () => {
      const current = {
        fields: [
          { name: 'id', type: 'UUID' },
          { name: 'count', type: 'BigInt' }
        ]
      };

      const previous = {
        fields: [
          { name: 'id', type: 'UUID' },
          { name: 'count', type: 'Integer' }
        ]
      };

      const changes = MigrationService.detectSchemaChanges(current, previous);

      expect(changes.modifiedFields).toHaveLength(1);
      expect(changes.modifiedFields[0].field.name).toBe('count');
      expect(changes.modifiedFields[0].changes.type).toEqual({
        from: 'Integer',
        to: 'BigInt'
      });
    });

    test('should detect nullable changes', () => {
      const current = {
        fields: [
          { name: 'bio', type: 'Text', required: false }
        ]
      };

      const previous = {
        fields: [
          { name: 'bio', type: 'Text', required: true }
        ]
      };

      const changes = MigrationService.detectSchemaChanges(current, previous);

      expect(changes.modifiedFields[0].changes.nullable).toBeDefined();
    });

    test('should detect default value changes', () => {
      const current = {
        fields: [
          { name: 'status', type: 'String', defaultValue: 'inactive' }
        ]
      };

      const previous = {
        fields: [
          { name: 'status', type: 'String', defaultValue: 'active' }
        ]
      };

      const changes = MigrationService.detectSchemaChanges(current, previous);

      expect(changes.modifiedFields[0].changes.default).toEqual({
        from: 'active',
        to: 'inactive'
      });
    });

    test('should return create type for new schema', () => {
      const current = {
        fields: [
          { name: 'id', type: 'UUID' }
        ]
      };

      const changes = MigrationService.detectSchemaChanges(current, null);

      expect(changes.type).toBe('create');
      expect(changes.addedFields).toEqual(current.fields);
    });
  });

  describe('getPostgreSQLType()', () => {
    test('should map String to VARCHAR(255)', () => {
      const field = { type: 'String' };
      expect(MigrationService.getPostgreSQLType(field)).toBe('VARCHAR(255)');
    });

    test('should map Text to TEXT', () => {
      const field = { type: 'Text' };
      expect(MigrationService.getPostgreSQLType(field)).toBe('TEXT');
    });

    test('should map Integer to INTEGER', () => {
      const field = { type: 'Integer' };
      expect(MigrationService.getPostgreSQLType(field)).toBe('INTEGER');
    });

    test('should map Decimal with precision and scale', () => {
      const field = {
        type: 'Decimal',
        validation: { precision: 10, scale: 2 }
      };
      expect(MigrationService.getPostgreSQLType(field)).toBe('DECIMAL(10, 2)');
    });

    test('should map UUID to UUID', () => {
      const field = { type: 'UUID' };
      expect(MigrationService.getPostgreSQLType(field)).toBe('UUID');
    });

    test('should map JSONB to JSONB', () => {
      const field = { type: 'JSONB' };
      expect(MigrationService.getPostgreSQLType(field)).toBe('JSONB');
    });

    test('should map DateTime to TIMESTAMP', () => {
      const field = { type: 'DateTime' };
      expect(MigrationService.getPostgreSQLType(field)).toBe('TIMESTAMP');
    });

    test('should map Boolean to BOOLEAN', () => {
      const field = { type: 'Boolean' };
      expect(MigrationService.getPostgreSQLType(field)).toBe('BOOLEAN');
    });

    test('should map Array to TEXT[]', () => {
      const field = { type: 'Array' };
      expect(MigrationService.getPostgreSQLType(field)).toBe('TEXT[]');
    });
  });

  describe('generateCreateIndexSQL()', () => {
    test('should generate basic index', () => {
      const sql = MigrationService.generateCreateIndexSQL('users', {
        name: 'idx_users_email',
        type: 'btree',
        fields: [{ name: 'email' }]
      });

      expect(sql).toBe('CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);\n');
    });

    test('should generate unique index', () => {
      const sql = MigrationService.generateCreateIndexSQL('users', {
        name: 'idx_users_username',
        type: 'btree',
        fields: [{ name: 'username' }],
        unique: true
      });

      expect(sql).toBe('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users (username);\n');
    });

    test('should include USING clause for non-btree indexes', () => {
      const sql = MigrationService.generateCreateIndexSQL('posts', {
        name: 'idx_posts_tags',
        type: 'gin',
        fields: [{ name: 'tags' }]
      });

      expect(sql).toContain('USING GIN');
    });

    test('should generate composite index with ordering', () => {
      const sql = MigrationService.generateCreateIndexSQL('posts', {
        name: 'idx_posts_user_created',
        type: 'btree',
        fields: [
          { name: 'user_id', order: 'ASC' },
          { name: 'created_at', order: 'DESC' }
        ]
      });

      expect(sql).toContain('(user_id ASC, created_at DESC)');
    });

    test('should generate partial index with WHERE clause', () => {
      const sql = MigrationService.generateCreateIndexSQL('posts', {
        name: 'idx_published_posts',
        type: 'btree',
        fields: [{ name: 'created_at' }],
        partial: 'status = \'published\''
      });

      expect(sql).toContain("WHERE status = 'published'");
    });
  });

  describe('generateRollbackSQL()', () => {
    test('should reverse added fields to dropped fields', () => {
      const schema = { tableName: 'users' };
      const changes = {
        addedFields: [
          { name: 'phone', type: 'String' }
        ]
      };

      const sql = MigrationService.generateRollbackSQL(schema, changes);

      expect(sql).toContain('ALTER TABLE users DROP COLUMN IF EXISTS phone');
    });

    test('should reverse dropped fields to added fields', () => {
      const schema = { tableName: 'products' };
      const changes = {
        removedFields: [
          { name: 'old_price', type: 'Decimal' }
        ]
      };

      const sql = MigrationService.generateRollbackSQL(schema, changes);

      expect(sql).toContain('ALTER TABLE products ADD COLUMN old_price');
    });

    test('should wrap in transaction', () => {
      const schema = { tableName: 'posts' };
      const changes = { addedFields: [{ name: 'likes', type: 'Integer' }] };

      const sql = MigrationService.generateRollbackSQL(schema, changes);

      expect(sql).toContain('BEGIN;');
      expect(sql).toContain('COMMIT;');
    });
  });

  describe('generateMigration()', () => {
    test('should generate complete migration object', async () => {
      const current = {
        name: 'user',
        tableName: 'users',
        fields: [
          { name: 'id', type: 'UUID', primaryKey: true },
          { name: 'email', type: 'String', required: true, unique: true },
          { name: 'phone', type: 'String' }
        ],
        indexes: []
      };

      const previous = {
        name: 'user',
        tableName: 'users',
        fields: [
          { name: 'id', type: 'UUID', primaryKey: true },
          { name: 'email', type: 'String', required: true, unique: true }
        ],
        indexes: []
      };

      const migration = await MigrationService.generateMigration(
        current,
        previous,
        { type: 'auto', safeMode: true, generateRollback: true }
      );

      expect(migration.sql).toBeTruthy();
      expect(migration.rollbackSql).toBeTruthy();
      expect(migration.type).toBeDefined();
      expect(migration.checksum).toHaveLength(64); // SHA-256 hex string
    });

    test('should detect type as alter_table for schema changes', async () => {
      const current = {
        fields: [{ name: 'id', type: 'UUID' }, { name: 'new_field', type: 'String' }]
      };
      const previous = {
        fields: [{ name: 'id', type: 'UUID' }]
      };

      const migration = await MigrationService.generateMigration(current, previous);

      expect(['alter_table', 'add_column']).toContain(migration.type);
    });

    test('should generate checksum for SQL integrity', async () => {
      const schema = {
        name: 'test',
        tableName: 'test_table',
        fields: [{ name: 'id', type: 'UUID' }],
        indexes: []
      };

      const migration = await MigrationService.generateMigration(schema, null, {
        type: 'create_table'
      });

      expect(migration.checksum).toMatch(/^[a-f0-9]{64}$/);
    });
  });
});
