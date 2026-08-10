require('dotenv').config();
const { sequelize, Connection } = require('../src/models');
const { encrypt } = require('../src/utils/encryption');

async function seed() {
  try {
    console.log('Seeding default data for exprsn-dbadmin...');

    // Create sample connection (localhost PostgreSQL)
    const existingConnection = await Connection.findOne({
      where: { name: 'Local PostgreSQL' }
    });

    if (!existingConnection) {
      await Connection.create({
        name: 'Local PostgreSQL',
        description: 'Default local PostgreSQL connection',
        host: 'localhost',
        port: 5432,
        database: 'postgres',
        username: 'postgres',
        password: encrypt('postgres'),
        sslEnabled: false,
        color: '#336791',
        userId: '00000000-0000-0000-0000-000000000000', // System user
        metadata: {
          createdBy: 'system',
          isDefault: true
        }
      });

      console.log('✓ Created default connection: Local PostgreSQL');
    } else {
      console.log('✓ Default connection already exists');
    }

    console.log('✓ Seeding completed successfully');
    process.exit(0);

  } catch (error) {
    console.error('✗ Seeding failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

seed();
