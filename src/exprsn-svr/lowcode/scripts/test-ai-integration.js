/**
 * AI Integration Test Suite
 *
 * Comprehensive validation of the AI Assistant integration.
 * Tests database, models, services, routes, and UI components.
 */

const path = require('path');
const fs = require('fs');

// ANSI color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

// Test results tracker
const results = {
  passed: 0,
  failed: 0,
  skipped: 0,
  tests: [],
};

// Helper functions
function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSuccess(message) {
  console.log(`${colors.green}✓${colors.reset} ${message}`);
  results.passed++;
}

function logFailure(message, error) {
  console.log(`${colors.red}✗${colors.reset} ${message}`);
  if (error) {
    console.log(`  ${colors.red}Error: ${error.message}${colors.reset}`);
  }
  results.failed++;
}

function logWarning(message) {
  console.log(`${colors.yellow}⚠${colors.reset} ${message}`);
}

function logSkipped(message) {
  console.log(`${colors.cyan}○${colors.reset} ${message}`);
  results.skipped++;
}

function logSection(title) {
  console.log('');
  console.log(`${colors.bright}${colors.blue}${'='.repeat(70)}${colors.reset}`);
  console.log(`${colors.bright}${colors.blue}  ${title}${colors.reset}`);
  console.log(`${colors.bright}${colors.blue}${'='.repeat(70)}${colors.reset}`);
  console.log('');
}

function fileExists(filePath) {
  return fs.existsSync(filePath);
}

async function runTest(name, testFn) {
  const test = { name, status: 'pending', error: null };
  results.tests.push(test);

  try {
    await testFn();
    test.status = 'passed';
    logSuccess(name);
  } catch (error) {
    test.status = 'failed';
    test.error = error.message;
    logFailure(name, error);
  }
}

// ═══════════════════════════════════════════════════════════
// TEST SUITE
// ═══════════════════════════════════════════════════════════

async function runTests() {
  log('\n🤖 AI ASSISTANT INTEGRATION TEST SUITE', 'bright');
  log('Testing Exprsn Low-Code Platform AI Features\n', 'cyan');

  // ─────────────────────────────────────────────────────────
  // 1. File Structure Tests
  // ─────────────────────────────────────────────────────────
  logSection('1. File Structure Validation');

  const requiredFiles = [
    // Models
    { path: 'models/ai/index.js', desc: 'AI models index' },
    { path: 'models/ai/AIProviderConfig.js', desc: 'AI provider config model' },
    { path: 'models/ai/AIAgentTemplate.js', desc: 'AI agent template model' },
    { path: 'models/ai/AIExecutionLog.js', desc: 'AI execution log model' },
    { path: 'models/ai/AISchemaSuggestion.js', desc: 'AI schema suggestion model' },
    { path: 'models/ai/AIConversationSession.js', desc: 'AI conversation session model' },

    // Services
    { path: 'services/ai/AIAgentService.js', desc: 'AI agent service' },
    { path: 'services/ai/RateLimiter.js', desc: 'Rate limiter service' },

    // Routes
    { path: 'routes/ai.js', desc: 'AI API routes' },

    // Frontend
    { path: 'public/js/entity-ai-assistant.js', desc: 'Entity AI assistant UI' },

    // Migrations
    { path: '../migrations/20251226000000-create-ai-agent-core-system.js', desc: 'AI migration (main)' },
    { path: 'migrations/20251227120000-create-ai-agent-system.js', desc: 'AI migration (lowcode)' },

    // Seeders
    { path: 'seeders/20251227120001-seed-ai-agent-system.js', desc: 'AI seeder' },

    // Scripts
    { path: 'scripts/setup-ai-system.js', desc: 'AI setup script' },
  ];

  const lowcodeDir = path.join(__dirname, '..');

  for (const file of requiredFiles) {
    const fullPath = path.join(lowcodeDir, file.path);
    await runTest(
      `File exists: ${file.desc}`,
      async () => {
        if (!fileExists(fullPath)) {
          throw new Error(`File not found: ${file.path}`);
        }
      }
    );
  }

  // ─────────────────────────────────────────────────────────
  // 2. Database Connection Test
  // ─────────────────────────────────────────────────────────
  logSection('2. Database Connection');

  let sequelize;
  await runTest('Connect to database', async () => {
    process.chdir(lowcodeDir);
    const { Sequelize } = require('sequelize');
    // Use parent config directory (exprsn-svr/config)
    const configPath = path.join(lowcodeDir, '../config/config.json');
    const config = require(configPath);
    const env = process.env.NODE_ENV || 'development';
    const dbConfig = config[env];

    sequelize = new Sequelize(
      dbConfig.database,
      dbConfig.username,
      dbConfig.password,
      {
        host: dbConfig.host,
        dialect: dbConfig.dialect,
        logging: false,
      }
    );

    await sequelize.authenticate();
  });

  // ─────────────────────────────────────────────────────────
  // 3. Database Schema Tests
  // ─────────────────────────────────────────────────────────
  logSection('3. Database Schema Validation');

  const requiredTables = [
    'ai_provider_configs',
    'ai_agent_templates',
    'ai_agent_configurations',
    'ai_execution_logs',
    'ai_schema_suggestions',
    'ai_data_transformations',
    'ai_conversation_sessions',
    'ai_conversation_messages',
    'ai_workflow_optimizations',
    'ai_decision_evaluations',
  ];

  if (sequelize) {
    for (const table of requiredTables) {
      await runTest(`Table exists: ${table}`, async () => {
        const [results] = await sequelize.query(`
          SELECT EXISTS (
            SELECT FROM information_schema.tables
            WHERE table_schema = 'public'
            AND table_name = '${table}'
          ) as exists;
        `);

        if (!results[0].exists) {
          throw new Error(`Table ${table} does not exist. Run migrations first.`);
        }
      });
    }
  } else {
    logSkipped('Database schema tests (no DB connection)');
  }

  // ─────────────────────────────────────────────────────────
  // 4. Seeded Data Tests
  // ─────────────────────────────────────────────────────────
  logSection('4. Seeded Data Validation');

  if (sequelize) {
    await runTest('AI providers seeded', async () => {
      const [results] = await sequelize.query(`
        SELECT COUNT(*) as count FROM ai_provider_configs;
      `);

      const count = parseInt(results[0].count);
      if (count === 0) {
        throw new Error('No AI providers found. Run seeders first.');
      }

      log(`  Found ${count} AI provider(s)`, 'cyan');
    });

    await runTest('Anthropic provider configured', async () => {
      const [results] = await sequelize.query(`
        SELECT * FROM ai_provider_configs
        WHERE provider_name = 'anthropic-claude'
        LIMIT 1;
      `);

      if (results.length === 0) {
        throw new Error('Anthropic provider not found');
      }

      const provider = results[0];
      log(`  Provider: ${provider.display_name}`, 'cyan');
      log(`  Default Model: ${provider.default_model}`, 'cyan');
      log(`  Active: ${provider.is_active}`, 'cyan');
      log(`  Default: ${provider.is_default}`, 'cyan');
    });

    await runTest('AI agent templates seeded', async () => {
      const [results] = await sequelize.query(`
        SELECT COUNT(*) as count FROM ai_agent_templates;
      `);

      const count = parseInt(results[0].count);
      if (count === 0) {
        throw new Error('No AI templates found. Run seeders first.');
      }

      log(`  Found ${count} AI template(s)`, 'cyan');
    });

    await runTest('Schema designer template exists', async () => {
      const [results] = await sequelize.query(`
        SELECT * FROM ai_agent_templates
        WHERE category = 'schema_design'
        AND is_system = true
        LIMIT 1;
      `);

      if (results.length === 0) {
        throw new Error('Schema designer template not found');
      }

      const template = results[0];
      log(`  Template: ${template.display_name}`, 'cyan');
      log(`  Model: ${template.default_model}`, 'cyan');
      log(`  Temperature: ${template.temperature}`, 'cyan');
    });
  } else {
    logSkipped('Seeded data tests (no DB connection)');
  }

  // ─────────────────────────────────────────────────────────
  // 5. Model Loading Tests
  // ─────────────────────────────────────────────────────────
  logSection('5. Sequelize Models');

  await runTest('Load AI models', async () => {
    const aiModels = require('../models/ai');

    const expectedModels = [
      'AIProviderConfig',
      'AIAgentTemplate',
      'AIAgentConfiguration',
      'AIExecutionLog',
      'AISchemaSuggestion',
      'AIDataTransformation',
      'AIConversationSession',
      'AIConversationMessage',
      'AIWorkflowOptimization',
      'AIDecisionEvaluation',
    ];

    for (const modelName of expectedModels) {
      if (!aiModels[modelName]) {
        throw new Error(`Model ${modelName} not exported from models/ai/index.js`);
      }
    }

    log(`  Loaded ${expectedModels.length} AI models`, 'cyan');
  });

  // ─────────────────────────────────────────────────────────
  // 6. Service Layer Tests
  // ─────────────────────────────────────────────────────────
  logSection('6. AI Service Layer');

  await runTest('Load AIAgentService', async () => {
    const { getInstance, AIAgentService } = require('../services/ai/AIAgentService');

    if (!getInstance || !AIAgentService) {
      throw new Error('AIAgentService not properly exported');
    }

    const service = getInstance();
    if (!service) {
      throw new Error('Failed to get AIAgentService instance');
    }

    log('  AIAgentService loaded successfully', 'cyan');
  });

  await runTest('Initialize AIAgentService', async () => {
    if (!sequelize) {
      throw new Error('Cannot test without database connection');
    }

    const { getInstance } = require('../services/ai/AIAgentService');
    const service = getInstance();

    // Try to initialize (may fail if no providers in DB)
    try {
      await service.initialize();
      log('  AIAgentService initialized', 'cyan');
      log(`  Providers loaded: ${service.providers.size}`, 'cyan');
    } catch (error) {
      if (error.message.includes('No AI providers')) {
        throw new Error('No providers found. Run seeders first.');
      }
      throw error;
    }
  });

  // ─────────────────────────────────────────────────────────
  // 7. API Routes Tests
  // ─────────────────────────────────────────────────────────
  logSection('7. API Routes');

  await runTest('Load AI routes', async () => {
    const aiRouter = require('../routes/ai');

    if (!aiRouter || typeof aiRouter !== 'function') {
      throw new Error('AI router not properly exported');
    }

    log('  AI routes loaded', 'cyan');
  });

  await runTest('AI routes registered in index', async () => {
    const indexPath = path.join(lowcodeDir, 'routes/index.js');
    const indexContent = fs.readFileSync(indexPath, 'utf-8');

    if (!indexContent.includes("require('./ai')")) {
      throw new Error('AI routes not imported in routes/index.js');
    }

    if (!indexContent.includes("router.use('/ai', aiRouter)")) {
      throw new Error('AI routes not mounted in routes/index.js');
    }

    log('  AI routes registered at /lowcode/api/ai', 'cyan');
  });

  // ─────────────────────────────────────────────────────────
  // 8. Environment Configuration
  // ─────────────────────────────────────────────────────────
  logSection('8. Environment Configuration');

  await runTest('Check ANTHROPIC_API_KEY', async () => {
    const apiKey = process.env.ANTHROPIC_API_KEY;

    if (!apiKey) {
      logWarning('  ANTHROPIC_API_KEY not set in environment');
      logWarning('  AI requests will fail without an API key');
      logWarning('  Set it in .env: ANTHROPIC_API_KEY=sk-ant-api03-...');
      throw new Error('ANTHROPIC_API_KEY not configured');
    }

    if (!apiKey.startsWith('sk-ant-')) {
      throw new Error('ANTHROPIC_API_KEY has invalid format');
    }

    log(`  API key configured: ${apiKey.substring(0, 15)}...`, 'cyan');
  });

  // ─────────────────────────────────────────────────────────
  // 9. Frontend Integration
  // ─────────────────────────────────────────────────────────
  logSection('9. Frontend Integration');

  await runTest('Entity Designer Pro has AI assistant', async () => {
    const viewPath = path.join(lowcodeDir, 'views/entity-designer-pro.ejs');
    const viewContent = fs.readFileSync(viewPath, 'utf-8');

    if (!viewContent.includes('entity-ai-assistant.js')) {
      throw new Error('entity-ai-assistant.js not included in entity-designer-pro.ejs');
    }

    log('  AI assistant script included in Entity Designer', 'cyan');
  });

  await runTest('AI assistant JavaScript syntax', async () => {
    const jsPath = path.join(lowcodeDir, 'public/js/entity-ai-assistant.js');
    const jsContent = fs.readFileSync(jsPath, 'utf-8');

    // Basic syntax checks
    if (!jsContent.includes('class EntityAIAssistant')) {
      throw new Error('EntityAIAssistant class not found');
    }

    if (!jsContent.includes('generateSchema')) {
      throw new Error('generateSchema method not found');
    }

    if (!jsContent.includes('/lowcode/api/ai/suggest/entity')) {
      throw new Error('API endpoint not referenced');
    }

    log('  AI assistant class structure valid', 'cyan');
  });

  // ─────────────────────────────────────────────────────────
  // 10. Documentation
  // ─────────────────────────────────────────────────────────
  logSection('10. Documentation');

  await runTest('AI integration documentation exists', async () => {
    const docPath = path.join(__dirname, '../../../../AI_ASSISTANT_INTEGRATION.md');

    if (!fileExists(docPath)) {
      throw new Error('AI_ASSISTANT_INTEGRATION.md not found');
    }

    const stats = fs.statSync(docPath);
    log(`  Documentation size: ${Math.round(stats.size / 1024)}KB`, 'cyan');
  });

  // ─────────────────────────────────────────────────────────
  // SUMMARY
  // ─────────────────────────────────────────────────────────
  console.log('\n');
  log('='.repeat(70), 'bright');
  log('  TEST SUMMARY', 'bright');
  log('='.repeat(70), 'bright');
  console.log('');

  const total = results.passed + results.failed + results.skipped;
  const passRate = total > 0 ? Math.round((results.passed / total) * 100) : 0;

  log(`Total Tests:     ${total}`, 'cyan');
  log(`Passed:          ${results.passed}`, 'green');
  log(`Failed:          ${results.failed}`, results.failed > 0 ? 'red' : 'cyan');
  log(`Skipped:         ${results.skipped}`, 'yellow');
  log(`Pass Rate:       ${passRate}%`, passRate >= 80 ? 'green' : 'yellow');

  console.log('');

  if (results.failed === 0) {
    log('🎉 ALL TESTS PASSED!', 'green');
    log('The AI Assistant integration is ready to use.', 'green');
    console.log('');
    log('Next steps:', 'bright');
    log('1. Set ANTHROPIC_API_KEY in .env', 'cyan');
    log('2. Start the server: npm run start:svr', 'cyan');
    log('3. Visit: http://localhost:5001/lowcode', 'cyan');
    log('4. Open Entity Designer → Click "AI Assist"', 'cyan');
  } else {
    log(`⚠️  ${results.failed} TEST(S) FAILED`, 'yellow');
    log('Please review the errors above.', 'yellow');
    console.log('');
    log('Common issues:', 'bright');
    log('• Run migrations: npx sequelize-cli db:migrate', 'cyan');
    log('• Run seeders: npx sequelize-cli db:seed --seed 20251227120001-seed-ai-agent-system.js', 'cyan');
    log('• Set API key: export ANTHROPIC_API_KEY=sk-ant-...', 'cyan');
  }

  console.log('');

  // Close database connection
  if (sequelize) {
    await sequelize.close();
  }

  // Exit with appropriate code
  process.exit(results.failed > 0 ? 1 : 0);
}

// ═══════════════════════════════════════════════════════════
// RUN TESTS
// ═══════════════════════════════════════════════════════════

runTests().catch((error) => {
  console.error('');
  log('FATAL ERROR:', 'red');
  console.error(error);
  console.error('');
  process.exit(1);
});
