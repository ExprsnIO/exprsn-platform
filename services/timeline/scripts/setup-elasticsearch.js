#!/usr/bin/env node

/**
 * ═══════════════════════════════════════════════════════════
 * ElasticSearch Setup Script
 * Initialize indices and mappings for Timeline service
 * ═══════════════════════════════════════════════════════════
 */

require('dotenv').config();
const elasticsearchService = require('../src/services/elasticsearchService');
const logger = require('../src/utils/logger');

async function setup() {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  Exprsn Timeline - ElasticSearch Setup');
  console.log('═══════════════════════════════════════════════════════════\n');

  try {
    // Initialize client
    console.log('1. Initializing ElasticSearch client...');
    const client = elasticsearchService.initClient();

    if (!client) {
      console.error('✗ ElasticSearch is disabled or client failed to initialize');
      console.error('  Set ELASTICSEARCH_ENABLED=true in .env to enable');
      process.exit(1);
    }

    console.log('✓ ElasticSearch client initialized\n');

    // Check cluster health
    console.log('2. Checking cluster health...');
    const health = await elasticsearchService.checkHealth();

    if (!health.healthy) {
      console.error('✗ ElasticSearch cluster is unhealthy');
      console.error(`  Status: ${health.cluster?.status || 'unknown'}`);
      console.error(`  Error: ${health.error || 'Unknown error'}`);
      process.exit(1);
    }

    console.log('✓ Cluster is healthy');
    console.log(`  Cluster: ${health.cluster.name}`);
    console.log(`  Status: ${health.cluster.status}`);
    console.log(`  Nodes: ${health.cluster.numberOfNodes}`);
    console.log(`  Data Nodes: ${health.cluster.numberOfDataNodes}\n`);

    // Create posts index
    console.log('3. Creating posts index...');
    const indexResult = await elasticsearchService.createPostsIndex();

    if (!indexResult.success) {
      console.error('✗ Failed to create posts index');
      console.error(`  Error: ${indexResult.error}`);
      process.exit(1);
    }

    if (indexResult.exists) {
      console.log('✓ Posts index already exists');
    } else if (indexResult.created) {
      console.log('✓ Posts index created successfully');
    }

    console.log(`  Index: ${process.env.ELASTICSEARCH_POSTS_INDEX || 'exprsn_posts'}\n`);

    // Verify setup
    console.log('4. Verifying setup...');
    const verifyHealth = await elasticsearchService.checkHealth();

    if (verifyHealth.indices.posts === 'exists') {
      console.log('✓ Posts index verified');
    } else {
      console.error('✗ Posts index not found after creation');
      process.exit(1);
    }

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('  ElasticSearch Setup Complete!');
    console.log('═══════════════════════════════════════════════════════════\n');

    console.log('Next steps:');
    console.log('  1. Start the Timeline service: npm start');
    console.log('  2. Posts will be indexed automatically on creation');
    console.log('  3. Use search API: GET /api/search/posts?q=query\n');

    await elasticsearchService.closeClient();
    process.exit(0);
  } catch (error) {
    console.error('\n✗ Setup failed:', error.message);
    logger.error('ElasticSearch setup failed', {
      error: error.message,
      stack: error.stack
    });

    await elasticsearchService.closeClient();
    process.exit(1);
  }
}

// Handle process signals
process.on('SIGINT', async () => {
  console.log('\n\nSetup interrupted');
  await elasticsearchService.closeClient();
  process.exit(1);
});

process.on('SIGTERM', async () => {
  console.log('\n\nSetup terminated');
  await elasticsearchService.closeClient();
  process.exit(1);
});

// Run setup
setup();
