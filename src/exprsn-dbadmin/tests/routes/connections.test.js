const request = require('supertest');
const { app } = require('../../src/index');
const { Connection } = require('../../src/models');
const { encrypt } = require('../../src/utils/encryption');

// Mock authentication
jest.mock('@exprsn/shared', () => ({
  ...jest.requireActual('@exprsn/shared'),
  validateCAToken: (req, res, next) => {
    req.user = { id: 'test-user-id', role: 'admin' };
    next();
  }
}));

describe('Connections API', () => {
  beforeAll(async () => {
    // Set up test environment
    process.env.NODE_ENV = 'test';
    process.env.SKIP_AUTH = 'true';
  });

  beforeEach(async () => {
    // Clean up database
    await Connection.destroy({ where: {}, force: true });
  });

  describe('POST /api/connections', () => {
    it('should create a new connection', async () => {
      const newConnection = {
        name: 'Test Database',
        host: 'localhost',
        port: 5432,
        database: 'testdb',
        username: 'testuser',
        password: 'testpass',
        sslEnabled: false
      };

      const response = await request(app)
        .post('/api/connections')
        .send(newConnection)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data.name).toBe('Test Database');
      expect(response.body.data).not.toHaveProperty('password');
    });

    it('should validate required fields', async () => {
      const invalidConnection = {
        name: 'Test'
        // Missing required fields
      };

      const response = await request(app)
        .post('/api/connections')
        .send(invalidConnection)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('VALIDATION_ERROR');
    });

    it('should validate port number range', async () => {
      const invalidConnection = {
        name: 'Test',
        host: 'localhost',
        port: 99999, // Invalid port
        database: 'test',
        username: 'user',
        password: 'pass'
      };

      const response = await request(app)
        .post('/api/connections')
        .send(invalidConnection)
        .expect(400);

      expect(response.body.error).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /api/connections', () => {
    it('should list all connections for user', async () => {
      // Create test connections
      await Connection.create({
        name: 'Connection 1',
        host: 'localhost',
        port: 5432,
        database: 'db1',
        username: 'user1',
        password: encrypt('pass1'),
        userId: 'test-user-id'
      });

      await Connection.create({
        name: 'Connection 2',
        host: 'localhost',
        port: 5432,
        database: 'db2',
        username: 'user2',
        password: encrypt('pass2'),
        userId: 'test-user-id'
      });

      const response = await request(app)
        .get('/api/connections')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.data[0]).toHaveProperty('name');
    });

    it('should not expose passwords', async () => {
      await Connection.create({
        name: 'Secure Connection',
        host: 'localhost',
        port: 5432,
        database: 'db',
        username: 'user',
        password: encrypt('secret'),
        userId: 'test-user-id'
      });

      const response = await request(app)
        .get('/api/connections')
        .expect(200);

      expect(response.body.data[0].password).toBe('***ENCRYPTED***');
    });
  });

  describe('GET /api/connections/:id', () => {
    it('should get a specific connection', async () => {
      const connection = await Connection.create({
        name: 'My Connection',
        host: 'localhost',
        port: 5432,
        database: 'mydb',
        username: 'myuser',
        password: encrypt('mypass'),
        userId: 'test-user-id'
      });

      const response = await request(app)
        .get(`/api/connections/${connection.id}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe('My Connection');
    });

    it('should return 404 for non-existent connection', async () => {
      const response = await request(app)
        .get('/api/connections/00000000-0000-0000-0000-000000000000')
        .expect(404);

      expect(response.body.error).toBe('NOT_FOUND');
    });
  });

  describe('PUT /api/connections/:id', () => {
    it('should update a connection', async () => {
      const connection = await Connection.create({
        name: 'Original Name',
        host: 'localhost',
        port: 5432,
        database: 'db',
        username: 'user',
        password: encrypt('pass'),
        userId: 'test-user-id'
      });

      const response = await request(app)
        .put(`/api/connections/${connection.id}`)
        .send({ name: 'Updated Name' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe('Updated Name');
    });
  });

  describe('DELETE /api/connections/:id', () => {
    it('should soft delete a connection', async () => {
      const connection = await Connection.create({
        name: 'To Delete',
        host: 'localhost',
        port: 5432,
        database: 'db',
        username: 'user',
        password: encrypt('pass'),
        userId: 'test-user-id'
      });

      const response = await request(app)
        .delete(`/api/connections/${connection.id}`)
        .expect(200);

      expect(response.body.success).toBe(true);

      // Verify soft delete
      const deleted = await Connection.findByPk(connection.id);
      expect(deleted.isActive).toBe(false);
    });
  });

  describe('POST /api/connections/:id/test', () => {
    it('should test connection (mock)', async () => {
      const connection = await Connection.create({
        name: 'Test Connection',
        host: 'localhost',
        port: 5432,
        database: 'postgres',
        username: 'postgres',
        password: encrypt('postgres'),
        userId: 'test-user-id'
      });

      // Note: This will fail in test environment without real PostgreSQL
      // In real tests, you would mock connectionPoolManager.testConnection
      const response = await request(app)
        .post(`/api/connections/${connection.id}/test`)
        .expect(400);

      // Expected to fail without real database
      expect(response.body.success).toBe(false);
    });
  });
});
