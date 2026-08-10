const JSONLexService = require('../../src/services/JSONLexService');
const connectionPoolManager = require('../../src/services/ConnectionPoolManager');

jest.mock('../../src/services/ConnectionPoolManager');

describe('JSONLexService', () => {
  const mockConnection = {
    host: 'localhost',
    port: 5432,
    database: 'test_db',
    username: 'test_user',
    password: 'test_password'
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('validate', () => {
    it('should validate JSON data against schema', async () => {
      const data = {
        name: 'Alice',
        age: 30,
        email: 'alice@example.com'
      };

      const schema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'integer' },
          email: { type: 'string', format: 'email' }
        },
        required: ['name', 'email']
      };

      const result = await JSONLexService.validate(data, schema);

      expect(result.valid).toBe(true);
      expect(result.data).toEqual(data);
    });

    it('should return validation errors for invalid data', async () => {
      const data = {
        name: 123, // Should be string
        email: 'invalid-email' // Invalid email format
      };

      const schema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          email: { type: 'string', format: 'email' }
        }
      };

      const result = await JSONLexService.validate(data, schema);

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should validate nested objects', async () => {
      const data = {
        user: {
          name: 'Alice',
          address: {
            city: 'New York',
            zip: '10001'
          }
        }
      };

      const schema = {
        type: 'object',
        properties: {
          user: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              address: {
                type: 'object',
                properties: {
                  city: { type: 'string' },
                  zip: { type: 'string' }
                }
              }
            }
          }
        }
      };

      const result = await JSONLexService.validate(data, schema);

      expect(result.valid).toBe(true);
    });
  });

  describe('inferSchema', () => {
    it('should infer schema from sample data', () => {
      const data = {
        name: 'Alice',
        age: 30,
        active: true,
        tags: ['developer', 'admin']
      };

      const schema = JSONLexService.inferSchema(data);

      expect(schema.type).toBe('object');
      expect(schema.properties.name.type).toBe('string');
      expect(schema.properties.age.type).toBe('integer');
      expect(schema.properties.active.type).toBe('boolean');
      expect(schema.properties.tags.type).toBe('array');
    });

    it('should infer array schema', () => {
      const data = [
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' }
      ];

      const schema = JSONLexService.inferSchema(data);

      expect(schema.type).toBe('array');
      expect(schema.items.type).toBe('object');
      expect(schema.items.properties.id.type).toBe('integer');
      expect(schema.items.properties.name.type).toBe('string');
    });

    it('should handle null values', () => {
      const schema = JSONLexService.inferSchema(null);

      expect(schema.type).toBe('any');
    });
  });

  describe('queryJSONColumn', () => {
    it('should query and transform JSON column data', async () => {
      const mockData = {
        rows: [
          {
            id: 1,
            _json_data: { name: 'Alice', age: 30 }
          },
          {
            id: 2,
            _json_data: { name: 'Bob', age: 25 }
          }
        ]
      };

      connectionPoolManager.executeQuery.mockResolvedValue(mockData);

      const result = await JSONLexService.queryJSONColumn(
        mockConnection,
        'public',
        'users',
        'metadata',
        '$.name'
      );

      expect(result.success).toBe(true);
      expect(result.rows).toHaveLength(2);
    });

    it('should handle JSONata errors gracefully', async () => {
      const mockData = {
        rows: [
          {
            id: 1,
            _json_data: { name: 'Alice' }
          }
        ]
      };

      connectionPoolManager.executeQuery.mockResolvedValue(mockData);

      const result = await JSONLexService.queryJSONColumn(
        mockConnection,
        'public',
        'users',
        'metadata',
        'invalid{expression'
      );

      expect(result.rows[0]).toHaveProperty('_jsonata_error');
    });
  });

  describe('getJSONColumnStats', () => {
    it('should return statistics for JSON column', async () => {
      const mockStats = {
        rows: [{
          total_rows: '1000',
          non_null_rows: '950',
          avg_size_bytes: 256
        }]
      };

      connectionPoolManager.executeQuery.mockResolvedValue(mockStats);

      const result = await JSONLexService.getJSONColumnStats(
        mockConnection,
        'public',
        'users',
        'metadata'
      );

      expect(result.success).toBe(true);
      expect(result.stats.total_rows).toBe('1000');
      expect(result.stats.non_null_rows).toBe('950');
    });
  });

  describe('updateJSONColumn', () => {
    it('should update JSON column with transformation', async () => {
      const mockSelect = {
        rows: [
          {
            id: 1,
            metadata: { count: 5 }
          }
        ]
      };

      const mockUpdate = { rowCount: 1 };

      connectionPoolManager.executeQuery
        .mockResolvedValueOnce(mockSelect)
        .mockResolvedValueOnce(mockUpdate);

      const result = await JSONLexService.updateJSONColumn(
        mockConnection,
        'public',
        'users',
        'metadata',
        '{ "count": count + 1 }',
        "id = 1"
      );

      expect(result.success).toBe(true);
      expect(result.updated).toBe(1);
    });

    it('should return 0 updates when no rows match', async () => {
      const mockSelect = { rows: [] };

      connectionPoolManager.executeQuery.mockResolvedValue(mockSelect);

      const result = await JSONLexService.updateJSONColumn(
        mockConnection,
        'public',
        'users',
        'metadata',
        '{}',
        "id = 999"
      );

      expect(result.success).toBe(true);
      expect(result.updated).toBe(0);
    });
  });
});
