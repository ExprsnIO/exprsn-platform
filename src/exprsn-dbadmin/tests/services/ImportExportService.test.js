const ImportExportService = require('../../src/services/ImportExportService');
const connectionPoolManager = require('../../src/services/ConnectionPoolManager');

jest.mock('../../src/services/ConnectionPoolManager');

describe('ImportExportService', () => {
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

  describe('exportToCSV', () => {
    it('should export table data to CSV format', async () => {
      const mockData = {
        rows: [
          { id: 1, name: 'Alice', email: 'alice@example.com' },
          { id: 2, name: 'Bob', email: 'bob@example.com' }
        ]
      };

      connectionPoolManager.executeQuery.mockResolvedValue(mockData);

      const result = await ImportExportService.exportToCSV(
        mockConnection,
        'public',
        'users'
      );

      expect(result.success).toBe(true);
      expect(result.data).toContain('id,name,email');
      expect(result.data).toContain('Alice');
      expect(result.data).toContain('Bob');
      expect(result.rowCount).toBe(2);
      expect(result.format).toBe('csv');
    });

    it('should apply WHERE clause when provided', async () => {
      connectionPoolManager.executeQuery.mockResolvedValue({ rows: [] });

      await ImportExportService.exportToCSV(
        mockConnection,
        'public',
        'users',
        { where: "status = 'active'" }
      );

      expect(connectionPoolManager.executeQuery).toHaveBeenCalledWith(
        mockConnection,
        expect.stringContaining("WHERE status = 'active'")
      );
    });

    it('should apply LIMIT when provided', async () => {
      connectionPoolManager.executeQuery.mockResolvedValue({ rows: [] });

      await ImportExportService.exportToCSV(
        mockConnection,
        'public',
        'users',
        { limit: 100 }
      );

      expect(connectionPoolManager.executeQuery).toHaveBeenCalledWith(
        mockConnection,
        expect.stringContaining('LIMIT 100')
      );
    });
  });

  describe('exportToJSON', () => {
    it('should export table data to JSON format', async () => {
      const mockData = {
        rows: [
          { id: 1, name: 'Alice' },
          { id: 2, name: 'Bob' }
        ]
      };

      connectionPoolManager.executeQuery.mockResolvedValue(mockData);

      const result = await ImportExportService.exportToJSON(
        mockConnection,
        'public',
        'users'
      );

      expect(result.success).toBe(true);
      expect(result.format).toBe('json');

      const parsed = JSON.parse(result.data);
      expect(parsed).toHaveLength(2);
      expect(parsed[0]).toHaveProperty('name', 'Alice');
    });

    it('should pretty-print JSON when requested', async () => {
      const mockData = {
        rows: [{ id: 1, name: 'Alice' }]
      };

      connectionPoolManager.executeQuery.mockResolvedValue(mockData);

      const result = await ImportExportService.exportToJSON(
        mockConnection,
        'public',
        'users',
        { pretty: true }
      );

      expect(result.data).toContain('\n');
      expect(result.data).toContain('  ');
    });
  });

  describe('importFromCSV', () => {
    it('should import CSV data into table', async () => {
      const csvData = `name,email
Alice,alice@example.com
Bob,bob@example.com`;

      connectionPoolManager.executeQuery.mockResolvedValue({ rowCount: 1 });

      const result = await ImportExportService.importFromCSV(
        mockConnection,
        'public',
        'users',
        csvData,
        { hasHeader: true }
      );

      expect(result.success).toBe(true);
      expect(result.inserted).toBe(2);
      expect(connectionPoolManager.executeQuery).toHaveBeenCalled();
    });

    it('should truncate table when requested', async () => {
      const csvData = 'name,email\nAlice,alice@example.com';

      connectionPoolManager.executeQuery.mockResolvedValue({ rowCount: 1 });

      await ImportExportService.importFromCSV(
        mockConnection,
        'public',
        'users',
        csvData,
        { truncate: true }
      );

      expect(connectionPoolManager.executeQuery).toHaveBeenCalledWith(
        mockConnection,
        expect.stringContaining('TRUNCATE TABLE')
      );
    });

    it('should handle empty CSV gracefully', async () => {
      const csvData = '';

      const result = await ImportExportService.importFromCSV(
        mockConnection,
        'public',
        'users',
        csvData
      );

      expect(result.success).toBe(true);
      expect(result.inserted).toBe(0);
    });
  });

  describe('importFromJSON', () => {
    it('should import JSON array into table', async () => {
      const jsonData = [
        { name: 'Alice', email: 'alice@example.com' },
        { name: 'Bob', email: 'bob@example.com' }
      ];

      connectionPoolManager.executeQuery.mockResolvedValue({ rowCount: 1 });

      const result = await ImportExportService.importFromJSON(
        mockConnection,
        'public',
        'users',
        jsonData
      );

      expect(result.success).toBe(true);
      expect(result.inserted).toBe(2);
    });

    it('should parse JSON string', async () => {
      const jsonData = '[{"name":"Alice"}]';

      connectionPoolManager.executeQuery.mockResolvedValue({ rowCount: 1 });

      const result = await ImportExportService.importFromJSON(
        mockConnection,
        'public',
        'users',
        jsonData
      );

      expect(result.success).toBe(true);
      expect(result.inserted).toBe(1);
    });

    it('should use custom batch size', async () => {
      const jsonData = Array.from({ length: 2500 }, (_, i) => ({
        name: `User ${i}`
      }));

      connectionPoolManager.executeQuery.mockResolvedValue({ rowCount: 1 });

      await ImportExportService.importFromJSON(
        mockConnection,
        'public',
        'users',
        jsonData,
        { batchSize: 500 }
      );

      // Should make 5 batch calls (2500 / 500)
      expect(connectionPoolManager.executeQuery).toHaveBeenCalledTimes(5);
    });
  });

  describe('exportToSQL', () => {
    it('should export table schema and data as SQL', async () => {
      const mockSchema = {
        rows: [{
          '?column?': 'CREATE TABLE public.users (id UUID, name VARCHAR(255));'
        }]
      };

      const mockData = {
        rows: [
          { id: 'abc-123', name: 'Alice' }
        ]
      };

      connectionPoolManager.executeQuery
        .mockResolvedValueOnce(mockSchema)
        .mockResolvedValueOnce(mockData);

      const result = await ImportExportService.exportToSQL(
        mockConnection,
        'public',
        'users',
        { includeSchema: true, includeData: true }
      );

      expect(result.success).toBe(true);
      expect(result.data).toContain('CREATE TABLE');
      expect(result.data).toContain('INSERT INTO');
      expect(result.data).toContain('Alice');
    });

    it('should export only schema when data is disabled', async () => {
      const mockSchema = {
        rows: [{
          '?column?': 'CREATE TABLE public.users (id UUID);'
        }]
      };

      connectionPoolManager.executeQuery.mockResolvedValue(mockSchema);

      const result = await ImportExportService.exportToSQL(
        mockConnection,
        'public',
        'users',
        { includeSchema: true, includeData: false }
      );

      expect(result.data).toContain('CREATE TABLE');
      expect(result.data).not.toContain('INSERT INTO');
    });
  });
});
