#!/usr/bin/env node
/**
 * Complete CA Setup Programmatically
 */

const axios = require('axios');

const setupData = {
  app: {
    environment: 'development',
    port: 3000,
    host: '0.0.0.0',
    url: 'http://localhost:3000',
    clusterEnabled: false,
    clusterWorkers: 4
  },
  admin: {
    email: 'admin@exprsn.io',
    password: 'ExprnCA2025!', // Strong default password - user should change this
    firstName: 'System',
    lastName: 'Administrator'
  },
  ca: {
    name: 'Exprsn Root CA',
    domain: 'localhost',
    country: 'US',
    state: 'California',
    locality: 'San Francisco',
    organization: 'Exprsn IO',
    organizationalUnit: 'Certificate Authority',
    email: 'ca@exprsn.io',
    rootKeySize: 4096,
    intermediateKeySize: 4096,
    entityKeySize: 2048,
    rootValidityDays: 7300, // ~20 years
    intermediateValidityDays: 3650, // ~10 years
    entityValidityDays: 365, // 1 year
    createIntermediate: true
  },
  storage: {
    type: 'disk',
    diskPath: './data/ca',
    diskCertsPath: './data/ca/certs',
    diskKeysPath: './data/ca/keys',
    diskCrlPath: './data/ca/crl',
    diskOcspPath: './data/ca/ocsp'
  },
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT, 10) || 5432,
    database: process.env.DB_NAME || 'exprsn_ca',
    username: process.env.DB_USER || 'exprsn_ca_user',
    password: (process.env.DB_PASSWORD !== undefined && process.env.DB_PASSWORD !== '') ? process.env.DB_PASSWORD : ' '
  },
  redis: {
    enabled: process.env.REDIS_ENABLED === 'true',
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT, 10) || 6379,
    password: process.env.REDIS_PASSWORD || '',
    db: parseInt(process.env.REDIS_DB, 10) || 0
  },
  services: {
    // Enable core services
    auth: true,
    spark: false,
    timeline: false,
    prefetch: false,
    moderator: false,
    filevault: false,
    gallery: false,
    live: false
  }
};

async function runSetup() {
  try {
    console.log('Starting CA setup...\n');

    // Check if setup is already complete
    console.log('1. Checking setup status...');
    const statusResponse = await axios.get('http://localhost:3000/setup/status');

    if (statusResponse.data.setupComplete) {
      console.log('✓ Setup already complete!');
      process.exit(0);
    }

    console.log('ℹ Setup not complete, proceeding...\n');

    // Test database connection
    console.log('2. Testing database connection...');
    const dbTestResponse = await axios.post('http://localhost:3000/setup/test-database', setupData.database);

    if (!dbTestResponse.data.success) {
      console.error('✗ Database connection failed:', dbTestResponse.data.error);
      process.exit(1);
    }
    console.log('✓ Database connection successful\n');

    // Test Redis if enabled
    if (setupData.redis.enabled) {
      console.log('3. Testing Redis connection...');
      const redisTestResponse = await axios.post('http://localhost:3000/setup/test-redis', setupData.redis);

      if (!redisTestResponse.data.success) {
        console.warn('⚠  Redis connection failed:', redisTestResponse.data.error);
        console.warn('   Continuing without Redis caching...\n');
        setupData.redis.enabled = false;
      } else {
        console.log('✓ Redis connection successful\n');
      }
    } else {
      console.log('3. Redis disabled, skipping test\n');
    }

    // Run setup
    console.log('4. Running setup process...');
    console.log('   This may take a few moments while certificates are generated...');

    const setupResponse = await axios.post('http://localhost:3000/setup/run', setupData, {
      timeout: 60000 // 60 second timeout for certificate generation
    });

    if (setupResponse.data.success) {
      console.log('\n✓ Setup completed successfully!\n');
      console.log('Setup Summary:');
      console.log('  - Admin User ID:', setupResponse.data.data.adminUserId);
      console.log('  - Root Certificate ID:', setupResponse.data.data.rootCertId);
      if (setupResponse.data.data.intermediateCertId) {
        console.log('  - Intermediate Certificate ID:', setupResponse.data.data.intermediateCertId);
      }
      console.log('  - Groups Created:', setupResponse.data.data.groupsCreated);
      console.log('  - Roles Created:', setupResponse.data.data.rolesCreated);

      console.log('\n📋 Login Credentials:');
      console.log('  Email:', setupData.admin.email);
      console.log('  Password:', setupData.admin.password);
      console.log('\n⚠️  IMPORTANT: Change the default password immediately after logging in!\n');

      console.log('✓ CA setup complete! You can now access the CA at http://localhost:3000\n');

      process.exit(0);
    } else {
      console.error('✗ Setup failed');
      console.error(setupResponse.data);
      process.exit(1);
    }
  } catch (error) {
    console.error('\n✗ Setup failed with error:');

    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Error:', error.response.data);
    } else {
      console.error(error.message);
    }

    process.exit(1);
  }
}

runSetup();
