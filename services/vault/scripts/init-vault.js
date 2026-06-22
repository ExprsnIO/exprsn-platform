/**
 * Initialize Exprsn Vault
 * Creates database tables and default encryption key
 */

require('dotenv').config();
const { sequelize, EncryptionKey } = require('../src/models');
const keyService = require('../src/services/keyService');
const logger = require('../src/utils/logger');

async function initVault() {
  try {
    logger.info('Initializing Exprsn Vault...');

    // Test database connection
    await sequelize.authenticate();
    logger.info('Database connection established');

    // Sync database (create tables)
    logger.info('Creating database tables...');
    await sequelize.sync({ force: false });
    logger.info('Database tables created');

    // Check if default encryption key exists
    const existingKey = await EncryptionKey.findOne({
      where: { name: 'default', status: 'active' }
    });

    if (existingKey) {
      logger.info('Default encryption key already exists');
    } else {
      // Create default encryption key
      logger.info('Creating default encryption key...');
      const defaultKey = await keyService.createKey(
        {
          name: 'default',
          purpose: 'general',
          metadata: {
            description: 'Default encryption key for secrets',
            createdBy: 'init-script'
          }
        },
        'system'
      );
      logger.info('Default encryption key created:', { keyId: defaultKey.id });
    }

    logger.info('Vault initialization complete!');
    logger.info('');
    logger.info('Next steps:');
    logger.info('1. Start the vault service: npm start');
    logger.info('2. Access the dashboard at: http://localhost:3013/dashboard');
    logger.info('');

    process.exit(0);
  } catch (error) {
    logger.error('Vault initialization failed:', { error: error.message, stack: error.stack });
    process.exit(1);
  }
}

initVault();
