const { sequelize } = require('../config/database');

beforeAll(async () => {
  // Ensure test database is set up
  await sequelize.sync({ force: true });
  console.log('Test database initialized');
});

afterAll(async () => {
  // Close database connection
  await sequelize.close();
  console.log('Test database connection closed');
});

// Set test environment
process.env.NODE_ENV = 'test';
process.env.DB_NAME = 'exprsn_bluesky_test';
process.env.REDIS_ENABLED = 'false';
