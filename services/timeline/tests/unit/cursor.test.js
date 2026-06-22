/**
 * ═══════════════════════════════════════════════════════════
 * Cursor Utilities Tests
 * Test cursor encoding/decoding and pagination
 * ═══════════════════════════════════════════════════════════
 */

const {
  encodeCursor,
  decodeCursor,
  buildCursorResponse,
  buildCursorWhere,
  parsePaginationParams,
  isValidCursor
} = require('../../src/utils/cursor');

describe('Cursor Utilities', () => {
  describe('encodeCursor', () => {
    it('should encode a cursor from timestamp and ID', () => {
      const timestamp = new Date('2025-01-01T00:00:00Z');
      const id = 'test-id-123';

      const cursor = encodeCursor(timestamp, id);

      expect(cursor).toBeDefined();
      expect(typeof cursor).toBe('string');
      expect(cursor.length).toBeGreaterThan(0);
    });

    it('should return null for missing parameters', () => {
      expect(encodeCursor(null, 'id')).toBeNull();
      expect(encodeCursor(new Date(), null)).toBeNull();
      expect(encodeCursor(null, null)).toBeNull();
    });

    it('should handle string timestamps', () => {
      const timestamp = '2025-01-01T00:00:00Z';
      const id = 'test-id';

      const cursor = encodeCursor(timestamp, id);

      expect(cursor).toBeDefined();
    });
  });

  describe('decodeCursor', () => {
    it('should decode a valid cursor', () => {
      const timestamp = new Date('2025-01-01T00:00:00Z');
      const id = 'test-id-123';

      const cursor = encodeCursor(timestamp, id);
      const decoded = decodeCursor(cursor);

      expect(decoded).toBeDefined();
      expect(decoded.timestamp).toBeInstanceOf(Date);
      expect(decoded.timestamp.getTime()).toBe(timestamp.getTime());
      expect(decoded.id).toBe(id);
    });

    it('should return null for invalid cursor', () => {
      expect(decodeCursor('invalid-cursor')).toBeNull();
      expect(decodeCursor(null)).toBeNull();
      expect(decodeCursor('')).toBeNull();
    });

    it('should return null for malformed base64', () => {
      const malformed = Buffer.from('{"t":123}').toString('base64'); // Missing id
      expect(decodeCursor(malformed)).toBeNull();
    });
  });

  describe('buildCursorResponse', () => {
    it('should build response with next cursor', () => {
      const items = [
        { id: '1', createdAt: new Date('2025-01-03') },
        { id: '2', createdAt: new Date('2025-01-02') },
        { id: '3', createdAt: new Date('2025-01-01') }
      ];

      const response = buildCursorResponse(items, 2);

      expect(response.items).toHaveLength(2);
      expect(response.pagination.hasMore).toBe(true);
      expect(response.pagination.nextCursor).toBeDefined();
      expect(response.pagination.prevCursor).toBeDefined();
    });

    it('should indicate no more items when at end', () => {
      const items = [
        { id: '1', createdAt: new Date('2025-01-02') },
        { id: '2', createdAt: new Date('2025-01-01') }
      ];

      const response = buildCursorResponse(items, 5);

      expect(response.items).toHaveLength(2);
      expect(response.pagination.hasMore).toBe(false);
      expect(response.pagination.nextCursor).toBeNull();
    });

    it('should handle empty items array', () => {
      const response = buildCursorResponse([], 20);

      expect(response.items).toHaveLength(0);
      expect(response.pagination.hasMore).toBe(false);
      expect(response.pagination.nextCursor).toBeNull();
      expect(response.pagination.prevCursor).toBeNull();
    });
  });

  describe('buildCursorWhere', () => {
    it('should build where clause for "after" direction', () => {
      const timestamp = new Date('2025-01-01T00:00:00Z');
      const id = 'test-id';
      const cursor = encodeCursor(timestamp, id);

      const where = buildCursorWhere(cursor, 'after');

      expect(where).toBeDefined();
      expect(where.$or).toBeDefined();
      expect(where.$or).toHaveLength(2);
    });

    it('should build where clause for "before" direction', () => {
      const timestamp = new Date('2025-01-01T00:00:00Z');
      const id = 'test-id';
      const cursor = encodeCursor(timestamp, id);

      const where = buildCursorWhere(cursor, 'before');

      expect(where).toBeDefined();
      expect(where.$or).toBeDefined();
    });

    it('should return null for invalid cursor', () => {
      const where = buildCursorWhere('invalid', 'after');

      expect(where).toBeNull();
    });

    it('should support custom field names', () => {
      const timestamp = new Date('2025-01-01T00:00:00Z');
      const id = 'test-id';
      const cursor = encodeCursor(timestamp, id);

      const where = buildCursorWhere(cursor, 'after', 'updatedAt', 'uuid');

      expect(where).toBeDefined();
      expect(where.$or[0]).toHaveProperty('updatedAt');
    });
  });

  describe('parsePaginationParams', () => {
    it('should parse cursor-based pagination', () => {
      const cursor = encodeCursor(new Date(), 'test-id');
      const params = parsePaginationParams({ cursor, limit: 10 });

      expect(params.type).toBe('cursor');
      expect(params.cursor).toBe(cursor);
      expect(params.limit).toBe(11); // +1 for hasMore check
      expect(params.cursorData).toBeDefined();
    });

    it('should parse offset-based pagination', () => {
      const params = parsePaginationParams({ offset: 20, limit: 10 });

      expect(params.type).toBe('offset');
      expect(params.offset).toBe(20);
      expect(params.limit).toBe(10);
    });

    it('should parse page-based pagination', () => {
      const params = parsePaginationParams({ page: 3, limit: 10 });

      expect(params.type).toBe('offset');
      expect(params.offset).toBe(20); // (3-1) * 10
      expect(params.page).toBe(3);
    });

    it('should default to cursor pagination with no params', () => {
      const params = parsePaginationParams({});

      expect(params.type).toBe('cursor');
      expect(params.cursor).toBeNull();
      expect(params.limit).toBe(21); // 20 + 1
    });

    it('should enforce maximum limit', () => {
      const params = parsePaginationParams({ limit: 200 });

      expect(params.limit).toBe(101); // Max 100 + 1
    });
  });

  describe('isValidCursor', () => {
    it('should validate a valid cursor', () => {
      const cursor = encodeCursor(new Date(), 'test-id');

      expect(isValidCursor(cursor)).toBe(true);
    });

    it('should reject invalid cursors', () => {
      expect(isValidCursor('invalid')).toBe(false);
      expect(isValidCursor(null)).toBe(false);
      expect(isValidCursor(undefined)).toBe(false);
      expect(isValidCursor(123)).toBe(false);
    });
  });

  describe('round-trip encoding/decoding', () => {
    it('should preserve data through encode/decode cycle', () => {
      const originalTimestamp = new Date('2025-01-01T12:30:45.123Z');
      const originalId = 'test-uuid-12345';

      const cursor = encodeCursor(originalTimestamp, originalId);
      const decoded = decodeCursor(cursor);

      expect(decoded.timestamp.getTime()).toBe(originalTimestamp.getTime());
      expect(decoded.id).toBe(originalId);
    });

    it('should handle multiple encode/decode cycles', () => {
      let timestamp = new Date();
      let id = 'original-id';

      for (let i = 0; i < 10; i++) {
        const cursor = encodeCursor(timestamp, id);
        const decoded = decodeCursor(cursor);

        expect(decoded.timestamp.getTime()).toBe(timestamp.getTime());
        expect(decoded.id).toBe(id);

        timestamp = decoded.timestamp;
        id = decoded.id;
      }
    });
  });
});
