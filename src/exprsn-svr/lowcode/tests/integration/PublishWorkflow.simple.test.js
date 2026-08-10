/**
 * Simplified Integration Tests for Migration Service
 * Tests migration execution against real PostgreSQL database
 */

const { Pool } = require('pg');
const MigrationService = require('../../services/MigrationService');

// Test database connection
const testPool = new Pool({
  host: process.env.TEST_DB_HOST || 'localhost',
  port: process.env.TEST_DB_PORT || 5432,
  database: 'exprsn_svr_test',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || ''
});

describe('Migration Service Integration Tests', () => {
  beforeAll(async () => {
    // Verify database connection
    const result = await testPool.query('SELECT NOW()');
    expect(result.rows).toHaveLength(1);
  });

  afterAll(async () => {
    // Cleanup and close connection
    await testPool.end();
  });

  describe('CREATE TABLE Migration Execution', () => {
    const testTableName = 'test_users_' + Date.now();

    afterEach(async () => {
      // Cleanup: drop test table
      try {
        await testPool.query(`DROP TABLE IF EXISTS ${testTableName} CASCADE`);
      } catch (err) {
        // Ignore errors
      }
    });

    test('should execute CREATE TABLE migration successfully', async () => {
      const schema = {
        tableName: testTableName,
        fields: [
          { name: 'id', type: 'UUID', primaryKey: true },
          { name: 'email', type: 'String', required: true, unique: true },
          { name: 'name', type: 'String' },
          { name: 'created_at', type: 'Timestamp' }
        ],
        indexes: [
          {
            name: `idx_${testTableName}_email`,
            type: 'btree',
            fields: [{ name: 'email' }]
          }
        ]
      };

      // Generate migration
      const migration = await MigrationService.generateMigration(schema, null);

      expect(migration.type).toBe('create_table');
      expect(migration.sql).toContain(`CREATE TABLE IF NOT EXISTS ${testTableName}`);
      expect(migration.checksum).toHaveLength(64);

      // Execute migration
      await testPool.query(migration.sql);

      // Verify table was created
      const tableCheck = await testPool.query(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = $1
      `, [testTableName]);

      expect(tableCheck.rows).toHaveLength(1);
      expect(tableCheck.rows[0].table_name).toBe(testTableName);

      // Verify columns
      const columnsCheck = await testPool.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = $1
        ORDER BY ordinal_position
      `, [testTableName]);

      expect(columnsCheck.rows).toHaveLength(4);
      expect(columnsCheck.rows[0].column_name).toBe('id');
      expect(columnsCheck.rows[1].column_name).toBe('email');
      expect(columnsCheck.rows[1].is_nullable).toBe('NO'); // required field
    });

    test('should create indexes correctly', async () => {
      const schema = {
        tableName: testTableName,
        fields: [
          { name: 'id', type: 'UUID', primaryKey: true },
          { name: 'status', type: 'String' },
          { name: 'priority', type: 'Integer' }
        ],
        indexes: [
          {
            name: `idx_${testTableName}_status`,
            type: 'btree',
            fields: [{ name: 'status' }]
          },
          {
            name: `idx_${testTableName}_priority`,
            type: 'btree',
            fields: [{ name: 'priority' }]
          }
        ]
      };

      const migration = await MigrationService.generateMigration(schema, null);
      await testPool.query(migration.sql);

      // Verify indexes
      const indexCheck = await testPool.query(`
        SELECT indexname
        FROM pg_indexes
        WHERE tablename = $1
      `, [testTableName]);

      expect(indexCheck.rows.length).toBeGreaterThanOrEqual(3); // 2 custom + 1 primary key
    });
  });

  describe('ALTER TABLE Migration Execution', () => {
    const testTableName = 'test_products_' + Date.now();

    beforeEach(async () => {
      // Create initial table
      await testPool.query(`
        CREATE TABLE ${testTableName} (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name VARCHAR(255) NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
      `);
    });

    afterEach(async () => {
      await testPool.query(`DROP TABLE IF EXISTS ${testTableName} CASCADE`);
    });

    test('should add columns via ALTER TABLE', async () => {
      const currentSchema = {
        tableName: testTableName,
        fields: [
          { name: 'id', type: 'UUID', primaryKey: true },
          { name: 'name', type: 'String', required: true },
          { name: 'price', type: 'Decimal', validation: { precision: 10, scale: 2 } }, // NEW
          { name: 'created_at', type: 'Timestamp' }
        ],
        indexes: []
      };

      const previousSchema = {
        tableName: testTableName,
        fields: [
          { name: 'id', type: 'UUID', primaryKey: true },
          { name: 'name', type: 'String', required: true },
          { name: 'created_at', type: 'Timestamp' }
        ],
        indexes: []
      };

      const changes = MigrationService.detectSchemaChanges(currentSchema, previousSchema);
      expect(changes.addedFields).toHaveLength(1);
      expect(changes.addedFields[0].name).toBe('price');

      const migration = await MigrationService.generateMigration(currentSchema, previousSchema);
      expect(migration.type).toBe('alter_table');

      // Execute ALTER TABLE migration
      await testPool.query(migration.sql);

      // Verify column was added
      const columnsCheck = await testPool.query(`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_name = $1 AND column_name = 'price'
      `, [testTableName]);

      expect(columnsCheck.rows).toHaveLength(1);
      expect(columnsCheck.rows[0].data_type).toBe('numeric');
    });

    test('should drop columns via ALTER TABLE', async () => {
      const currentSchema = {
        tableName: testTableName,
        fields: [
          { name: 'id', type: 'UUID', primaryKey: true },
          { name: 'created_at', type: 'Timestamp' }
          // 'name' field removed
        ],
        indexes: []
      };

      const previousSchema = {
        tableName: testTableName,
        fields: [
          { name: 'id', type: 'UUID', primaryKey: true },
          { name: 'name', type: 'String', required: true },
          { name: 'created_at', type: 'Timestamp' }
        ],
        indexes: []
      };

      const changes = MigrationService.detectSchemaChanges(currentSchema, previousSchema);
      expect(changes.removedFields).toHaveLength(1);

      const migration = await MigrationService.generateMigration(currentSchema, previousSchema);
      await testPool.query(migration.sql);

      // Verify column was dropped
      const columnsCheck = await testPool.query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = $1 AND column_name = 'name'
      `, [testTableName]);

      expect(columnsCheck.rows).toHaveLength(0);
    });
  });

  describe('Migration Rollback', () => {
    const testTableName = 'test_rollback_' + Date.now();

    afterEach(async () => {
      await testPool.query(`DROP TABLE IF EXISTS ${testTableName} CASCADE`);
    });

    test('should rollback CREATE TABLE migration', async () => {
      const schema = {
        tableName: testTableName,
        fields: [
          { name: 'id', type: 'UUID', primaryKey: true },
          { name: 'data', type: 'String' }
        ],
        indexes: []
      };

      const migration = await MigrationService.generateMigration(schema, null);

      // Execute migration
      await testPool.query(migration.sql);

      // Verify table exists
      let tableCheck = await testPool.query(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_name = $1
      `, [testTableName]);
      expect(tableCheck.rows).toHaveLength(1);

      // Execute rollback
      await testPool.query(migration.rollbackSql);

      // Verify table was dropped
      tableCheck = await testPool.query(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_name = $1
      `, [testTableName]);
      expect(tableCheck.rows).toHaveLength(0);
    });
  });

  describe('Complex Field Types', () => {
    const testTableName = 'test_complex_' + Date.now();

    afterEach(async () => {
      await testPool.query(`DROP TABLE IF EXISTS ${testTableName} CASCADE`);
    });

    test('should handle JSONB fields correctly', async () => {
      const schema = {
        tableName: testTableName,
        fields: [
          { name: 'id', type: 'UUID', primaryKey: true },
          { name: 'metadata', type: 'JSONB' }
        ],
        indexes: []
      };

      const migration = await MigrationService.generateMigration(schema, null);
      await testPool.query(migration.sql);

      // Insert test data
      await testPool.query(`
        INSERT INTO ${testTableName} (id, metadata)
        VALUES (gen_random_uuid(), $1)
      `, [JSON.stringify({ tags: ['test'], count: 42 })]);

      // Query and verify JSONB
      const result = await testPool.query(`SELECT metadata FROM ${testTableName}`);
      expect(result.rows[0].metadata).toHaveProperty('tags');
      expect(result.rows[0].metadata.count).toBe(42);
    });

    test('should handle Boolean fields with defaults', async () => {
      const schema = {
        tableName: testTableName,
        fields: [
          { name: 'id', type: 'UUID', primaryKey: true },
          { name: 'active', type: 'Boolean', defaultValue: true },
          { name: 'verified', type: 'Boolean', defaultValue: false }
        ],
        indexes: []
      };

      const migration = await MigrationService.generateMigration(schema, null);
      await testPool.query(migration.sql);

      // Insert without specifying boolean values
      await testPool.query(`
        INSERT INTO ${testTableName} (id) VALUES (gen_random_uuid())
      `);

      // Verify defaults
      const result = await testPool.query(`SELECT active, verified FROM ${testTableName}`);
      expect(result.rows[0].active).toBe(true);
      expect(result.rows[0].verified).toBe(false);
    });

    test('should handle Array fields correctly', async () => {
      const schema = {
        tableName: testTableName,
        fields: [
          { name: 'id', type: 'UUID', primaryKey: true },
          { name: 'tags', type: 'Array' }
        ],
        indexes: []
      };

      const migration = await MigrationService.generateMigration(schema, null);
      await testPool.query(migration.sql);

      // Insert array data
      await testPool.query(`
        INSERT INTO ${testTableName} (id, tags)
        VALUES (gen_random_uuid(), $1)
      `, [['tag1', 'tag2', 'tag3']]);

      const result = await testPool.query(`SELECT tags FROM ${testTableName}`);
      expect(result.rows[0].tags).toEqual(['tag1', 'tag2', 'tag3']);
    });
  });
});
