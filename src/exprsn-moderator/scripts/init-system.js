/**
 * ═══════════════════════════════════════════════════════════
 * System Initialization Script
 * Initialize database, run migrations, and seed default data
 * ═══════════════════════════════════════════════════════════
 */

require('dotenv').config();
const { execSync } = require('child_process');
const path = require('path');
const logger = require('../src/utils/logger');

async function initializeSystem() {
  logger.info('═══════════════════════════════════════════════════════════');
  logger.info('Exprsn Moderator - System Initialization');
  logger.info('═══════════════════════════════════════════════════════════\n');

  try {
    // Step 1: Run migrations
    logger.info('[1/3] Running database migrations...');
    execSync('npx sequelize-cli db:migrate', {
      cwd: __dirname + '/..',
      stdio: 'inherit'
    });
    logger.info('✓ Migrations completed\n');

    // Step 2: Run seeders
    logger.info('[2/3] Seeding default data...');
    execSync('npx sequelize-cli db:seed:all', {
      cwd: __dirname + '/..',
      stdio: 'inherit'
    });
    logger.info('✓ Seeders completed\n');

    // Step 3: Initialize agent framework
    logger.info('[3/3] Initializing AI agent framework...');
    const agentFramework = require('../services/agentFramework');

    // Register agent implementations
    const TextModerationAgent = require('../services/agents/TextModerationAgent');
    const ImageModerationAgent = require('../services/agents/ImageModerationAgent');
    const VideoModerationAgent = require('../services/agents/VideoModerationAgent');
    const RateLimitDetectionAgent = require('../services/agents/RateLimitDetectionAgent');

    agentFramework.registerAgentImplementation(TextModerationAgent);
    agentFramework.registerAgentImplementation(ImageModerationAgent);
    agentFramework.registerAgentImplementation(VideoModerationAgent);
    agentFramework.registerAgentImplementation(RateLimitDetectionAgent);

    await agentFramework.initialize();
    logger.info('✓ Agent framework initialized\n');

    logger.info('═══════════════════════════════════════════════════════════');
    logger.info('✓ System initialization completed successfully!');
    logger.info('═══════════════════════════════════════════════════════════\n');

    logger.info('Next steps:');
    logger.info('1. Configure AI provider API keys in .env');
    logger.info('2. Configure email settings in .env');
    logger.info('3. Start the service: npm start');
    logger.info('4. Access setup interface: http://localhost:3006/setup\n');

    process.exit(0);

  } catch (error) {
    logger.error('System initialization failed:', { error: error.message });
    logger.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

// Run initialization
initializeSystem();
