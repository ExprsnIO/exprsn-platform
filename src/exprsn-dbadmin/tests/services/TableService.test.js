const TableService = require('../../src/services/TableService');
const connectionPoolManager = require('../../src/services/ConnectionPoolManager');

// Mock the connection pool manager
jest.mock('../../src/services/ConnectionPoolManager');

describe('TableService', () => {
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

  describe('listTables', () => {
    it('should list all tables in a schema', async () => {
      const mockResult = {
        rows: [
          {
            schema: 'public',
            name: 'users',
            column_count: 5,
            row_count_estimate: 1000
          },
          {
            schema: 'public',
            name: 'posts',
            column_count: 8,
            row_count_estimate: 5000
          }
        ]
      };

      connectionPoolManager.executeQuery.mockResolvedValue(mockResult);

      const result = await TableService.listTables(mockConnection, 'public');

      expect(result).toEqual(mockResult.rows);
      expect(connectionPoolManager.executeQuery).toHaveBeenCalledWith(
        mockConnection,
        expect.stringContaining('FROM information_schema.tables'),
        ['public']
      );
    });

    it('should handle errors gracefully', async () => {
      connectionPoolManager.executeQuery.mockRejectedValue(new Error('Database error'));

      await expect(
        TableService.listTables(mockConnection, 'public')
      ).rejects.toThrow('Database error');
    });
  });

  describe('getTableDetails', () => {
    it('should return comprehensive table details', async () => {
      const mockTableData = {
        rows: [{
          schema: 'public',
          name: 'users',
          owner: 'postgres'
        }]
      };

      const mockColumns = {
        rows: [
          { name: 'id', data_type: 'uuid', nullable: false },
          { name: 'email', data_type: 'varchar', nullable: false }
        ]
      };

      const mockIndexes = {
        rows: [
          { name: 'users_pkey', is_primary: true }
        ]
      };

      const mockConstraints = { rows: [] };
      const mockTriggers = { rows: [] };

      connectionPoolManager.executeQuery
        .mockResolvedValueOnce(mockTableData)
        .mockResolvedValueOnce(mockColumns)
        .mockResolvedValueOnce(mockIndexes)
        .mockResolvedValueOnce(mockConstraints)
        .mockResolvedValueOnce(mockTriggers);

      const result = await TableService.getTableDetails(mockConnection, 'public', 'users');

      expect(result).toHaveProperty('table');
      expect(result).toHaveProperty('columns');
      expect(result).toHaveProperty('indexes');
      expect(result).toHaveProperty('constraints');
      expect(result).toHaveProperty('triggers');

      expect(result.columns).toHaveLength(2);
      expect(result.indexes).toHaveLength(1);
    });
  });

  describe('createTable', () => {
    it('should create a new table with columns', async () => {
      const columns = [
        { name: 'id', dataType: 'UUID', primaryKey: true },
        { name: 'email', dataType: 'VARCHAR(255)', notNull: true, unique: true }
      ];

      connectionPoolManager.executeQuery.mockResolvedValue({ rowCount: 0 });

      const result = await TableService.createTable(
        mockConnection,
        'public',
        'test_table',
        columns
      );

      expect(result.success).toBe(true);
      expect(result.message).toContain('created successfully');
      expect(connectionPoolManager.executeQuery).toHaveBeenCalledWith(
        mockConnection,
        expect.stringContaining('CREATE TABLE')
      );
    });
  });

  describe('dropTable', () => {
    it('should drop a table', async () => {
      connectionPoolManager.executeQuery.mockResolvedValue({ rowCount: 0 });

      const result = await TableService.dropTable(
        mockConnection,
        'public',
        'test_table'
      );

      expect(result.success).toBe(true);
      expect(connectionPoolManager.executeQuery).toHaveBeenCalledWith(
        mockConnection,
        expect.stringContaining('DROP TABLE')
      );
    });

    it('should drop table with CASCADE option', async () => {
      connectionPoolManager.executeQuery.mockResolvedValue({ rowCount: 0 });

      await TableService.dropTable(mockConnection, 'public', 'test_table', true);

      expect(connectionPoolManager.executeQuery).toHaveBeenCalledWith(
        mockConnection,
        expect.stringContaining('CASCADE')
      );
    });
  });

  describe('insertRow', () => {
    it('should insert a row into table', async () => {
      const mockResult = {
        rows: [{ id: '123', email: 'test@example.com' }]
      };

      connectionPoolManager.executeQuery.mockResolvedValue(mockResult);

      const data = { email: 'test@example.com', name: 'Test User' };
      const result = await TableService.insertRow(
        mockConnection,
        'public',
        'users',
        data
      );

      expect(result).toEqual(mockResult.rows[0]);
      expect(connectionPoolManager.executeQuery).toHaveBeenCalledWith(
        mockConnection,
        expect.stringContaining('INSERT INTO'),
        expect.arrayContaining(['test@example.com', 'Test User'])
      );
    });
  });

  describe('updateRow', () => {
    it('should update a row in table', async () => {
      const mockResult = {
        rows: [{ id: '123', email: 'updated@example.com' }]
      };

      connectionPoolManager.executeQuery.mockResolvedValue(mockResult);

      const data = { email: 'updated@example.com' };
      const result = await TableService.updateRow(
        mockConnection,
        'public',
        'users',
        data,
        'id = $2',
        ['123']
      );

      expect(result).toEqual(mockResult.rows[0]);
      expect(connectionPoolManager.executeQuery).toHaveBeenCalledWith(
        mockConnection,
        expect.stringContaining('UPDATE'),
        expect.arrayContaining(['updated@example.com', '123'])
      );
    });
  });

  describe('deleteRow', () => {
    it('should delete a row from table', async () => {
      const mockResult = {
        rows: [{ id: '123' }]
      };

      connectionPoolManager.executeQuery.mockResolvedValue(mockResult);

      const result = await TableService.deleteRow(
        mockConnection,
        'public',
        'users',
        'id = $1',
        ['123']
      );

      expect(result).toEqual(mockResult.rows[0]);
      expect(connectionPoolManager.executeQuery).toHaveBeenCalledWith(
        mockConnection,
        expect.stringContaining('DELETE FROM'),
        ['123']
      );
    });
  });

  describe('getTableData', () => {
    it('should retrieve table data with pagination', async () => {
      const mockData = {
        rows: [
          { id: 1, name: 'User 1' },
          { id: 2, name: 'User 2' }
        ]
      };

      const mockCount = {
        rows: [{ total: '100' }]
      };

      connectionPoolManager.executeQuery
        .mockResolvedValueOnce(mockData)
        .mockResolvedValueOnce(mockCount);

      const result = await TableService.getTableData(
        mockConnection,
        'public',
        'users',
        { limit: 2, offset: 0 }
      );

      expect(result.rows).toHaveLength(2);
      expect(result.total).toBe(100);
      expect(result.hasMore).toBe(true);
    });

    it('should apply WHERE clause filtering', async () => {
      const mockData = { rows: [] };
      const mockCount = { rows: [{ total: '0' }] };

      connectionPoolManager.executeQuery
        .mockResolvedValueOnce(mockData)
        .mockResolvedValueOnce(mockCount);

      await TableService.getTableData(
        mockConnection,
        'public',
        'users',
        { where: "status = 'active'", limit: 10 }
      );

      expect(connectionPoolManager.executeQuery).toHaveBeenCalledWith(
        mockConnection,
        expect.stringContaining("WHERE status = 'active'")
      );
    });
  });

  describe('vacuumTable', () => {
    it('should vacuum a table', async () => {
      connectionPoolManager.executeQuery.mockResolvedValue({ rowCount: 0 });

      const result = await TableService.vacuumTable(
        mockConnection,
        'public',
        'users'
      );

      expect(result.success).toBe(true);
      expect(connectionPoolManager.executeQuery).toHaveBeenCalledWith(
        mockConnection,
        expect.stringContaining('VACUUM ANALYZE')
      );
    });

    it('should perform FULL vacuum when requested', async () => {
      connectionPoolManager.executeQuery.mockResolvedValue({ rowCount: 0 });

      await TableService.vacuumTable(mockConnection, 'public', 'users', true);

      expect(connectionPoolManager.executeQuery).toHaveBeenCalledWith(
        mockConnection,
        expect.stringContaining('VACUUM FULL')
      );
    });
  });
});
