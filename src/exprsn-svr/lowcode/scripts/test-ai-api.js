/**
 * AI API End-to-End Test
 *
 * Tests AI endpoints with actual HTTP requests.
 * Requires the server to be running.
 *
 * Usage:
 *   node scripts/test-ai-api.js
 *   node scripts/test-ai-api.js --with-real-ai  # Test with actual AI API
 */

const http = require('http');
const { v4: uuidv4 } = require('uuid');

// Configuration
const BASE_URL = process.env.BASE_URL || 'http://localhost:5001';
const API_BASE = '/lowcode/api';
const WITH_REAL_AI = process.argv.includes('--with-real-ai');

// ANSI colors
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

let results = { passed: 0, failed: 0, total: 0 };

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSuccess(test) {
  console.log(`${colors.green}✓${colors.reset} ${test}`);
  results.passed++;
  results.total++;
}

function logFailure(test, error) {
  console.log(`${colors.red}✗${colors.reset} ${test}`);
  console.log(`  ${colors.red}${error}${colors.reset}`);
  results.failed++;
  results.total++;
}

function logSection(title) {
  console.log('');
  console.log(`${colors.bright}${colors.blue}${'='.repeat(70)}${colors.reset}`);
  console.log(`${colors.bright}${colors.blue}  ${title}${colors.reset}`);
  console.log(`${colors.bright}${colors.blue}${'='.repeat(70)}${colors.reset}`);
  console.log('');
}

/**
 * Make HTTP request
 */
function makeRequest(method, path, data = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      method,
      hostname: url.hostname,
      port: url.port || 80,
      path: url.pathname + url.search,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          resolve({ status: res.statusCode, data: parsed, headers: res.headers });
        } catch (e) {
          resolve({ status: res.statusCode, data: body, headers: res.headers });
        }
      });
    });

    req.on('error', reject);

    if (data) {
      req.write(JSON.stringify(data));
    }

    req.setTimeout(30000); // 30 second timeout
    req.end();
  });
}

/**
 * Test suite
 */
async function runTests() {
  log('\n🧪 AI API END-TO-END TEST SUITE', 'bright');
  log(`Testing: ${BASE_URL}${API_BASE}`, 'cyan');
  log(`With Real AI: ${WITH_REAL_AI ? 'YES' : 'NO (Mock Mode)'}`, 'cyan');
  console.log('');

  // ─────────────────────────────────────────────────────────
  // 1. Health Check
  // ─────────────────────────────────────────────────────────
  logSection('1. Server Health');

  try {
    const res = await makeRequest('GET', `${API_BASE}/health`);
    if (res.status === 200 && res.data.success) {
      logSuccess('Server is running');
      log(`  Service: ${res.data.service}`, 'cyan');
      log(`  Version: ${res.data.version}`, 'cyan');
      log(`  Auth: ${res.data.authentication}`, 'cyan');
    } else {
      logFailure('Server health check', `Status: ${res.status}`);
      return;
    }
  } catch (error) {
    logFailure('Server health check', `Cannot connect to ${BASE_URL}. Is the server running?`);
    log('\nStart the server with:', 'yellow');
    log('  LOW_CODE_DEV_AUTH=true PORT=5001 npm run start:svr', 'cyan');
    return;
  }

  // ─────────────────────────────────────────────────────────
  // 2. AI Providers
  // ─────────────────────────────────────────────────────────
  logSection('2. AI Providers');

  try {
    const res = await makeRequest('GET', `${API_BASE}/ai/providers`);
    if (res.status === 200 && res.data.success) {
      const providers = res.data.data;
      logSuccess(`List AI providers (${providers.length} found)`);

      providers.forEach((p) => {
        log(`  • ${p.displayName} (${p.providerType})`, 'cyan');
        log(`    Default: ${p.isDefault}, Active: ${p.isActive}, Health: ${p.healthStatus}`, 'cyan');
      });

      if (providers.length === 0) {
        log('  ⚠️  No providers found. Run seeders!', 'yellow');
      }
    } else {
      logFailure('List AI providers', `Status: ${res.status}, Message: ${res.data.message || 'Unknown'}`);
    }
  } catch (error) {
    logFailure('List AI providers', error.message);
  }

  // ─────────────────────────────────────────────────────────
  // 3. Schema Suggestions (Mock)
  // ─────────────────────────────────────────────────────────
  logSection('3. Entity Schema Suggestions');

  if (!WITH_REAL_AI) {
    log('⚠️  Skipping real AI tests (use --with-real-ai to enable)', 'yellow');
    log('   This would cost ~$0.005 per test', 'yellow');
    console.log('');

    // Test the endpoint structure without making AI call
    try {
      const res = await makeRequest('POST', `${API_BASE}/ai/suggest/entity`, {
        prompt: 'Test prompt (will fail without AI key)',
        applicationId: uuidv4(),
      });

      // We expect this to fail without API key, but should get proper error
      if (res.status === 500 && res.data.error === 'AI_NOT_CONFIGURED') {
        logSuccess('Schema suggestion endpoint exists (needs AI setup)');
        log('  Expected error: AI templates not seeded', 'cyan');
      } else if (res.status === 400 && res.data.error === 'VALIDATION_ERROR') {
        logSuccess('Schema suggestion endpoint validates input');
      } else {
        log(`  ℹ️  Unexpected response: ${res.status}`, 'cyan');
        log(`     ${JSON.stringify(res.data)}`, 'cyan');
      }
    } catch (error) {
      logFailure('Schema suggestion endpoint', error.message);
    }
  } else {
    // Real AI test
    log('🤖 Testing with REAL AI (this will cost money!)', 'yellow');

    try {
      const testPrompt = 'Create a simple product entity with name, price, and description';
      const res = await makeRequest('POST', `${API_BASE}/ai/suggest/entity`, {
        prompt: testPrompt,
        applicationId: uuidv4(),
        context: {},
      });

      if (res.status === 200 && res.data.success) {
        logSuccess('Generate entity schema with AI');
        log(`  Suggestion ID: ${res.data.data.suggestionId}`, 'cyan');
        log(`  Confidence: ${res.data.data.confidenceScore}%`, 'cyan');
        log(`  Cost: $${res.data.data.cost.toFixed(4)}`, 'cyan');
        log(`  Tokens: ${res.data.data.usage.inputTokens + res.data.data.usage.outputTokens}`, 'cyan');

        const schema = res.data.data.schema;
        log(`  Generated Entity: ${schema.entityName}`, 'cyan');
        log(`  Fields: ${schema.fields?.length || 0}`, 'cyan');
      } else {
        logFailure('Generate entity schema', `Status: ${res.status}, Error: ${res.data.error || res.data.message}`);
      }
    } catch (error) {
      logFailure('Generate entity schema', error.message);
    }
  }

  // ─────────────────────────────────────────────────────────
  // 4. List Suggestions
  // ─────────────────────────────────────────────────────────
  logSection('4. Suggestion Management');

  try {
    const res = await makeRequest('GET', `${API_BASE}/ai/suggestions?limit=10`);

    if (res.status === 200 && res.data.success) {
      logSuccess(`List schema suggestions (${res.data.data.length} found)`);
      if (res.data.data.length > 0) {
        log('  Recent suggestions:', 'cyan');
        res.data.data.slice(0, 3).forEach((s) => {
          log(`    • ${s.suggestionType} - ${s.status}`, 'cyan');
        });
      }
    } else {
      logFailure('List suggestions', `Status: ${res.status}`);
    }
  } catch (error) {
    logFailure('List suggestions', error.message);
  }

  // ─────────────────────────────────────────────────────────
  // 5. Conversation (Mock)
  // ─────────────────────────────────────────────────────────
  logSection('5. AI Conversation');

  if (!WITH_REAL_AI) {
    log('⚠️  Skipping conversation test (use --with-real-ai)', 'yellow');
  } else {
    try {
      const res = await makeRequest('POST', `${API_BASE}/ai/chat`, {
        message: 'How do I create a many-to-many relationship?',
        sessionType: 'general_assistant',
      });

      if (res.status === 200 && res.data.success) {
        logSuccess('AI conversation');
        log(`  Session ID: ${res.data.data.sessionId}`, 'cyan');
        log(`  Response length: ${res.data.data.response?.length || 0} chars`, 'cyan');
        log(`  Cost: $${res.data.data.cost.toFixed(4)}`, 'cyan');
      } else {
        logFailure('AI conversation', `Status: ${res.status}, Error: ${res.data.error}`);
      }
    } catch (error) {
      logFailure('AI conversation', error.message);
    }
  }

  // ─────────────────────────────────────────────────────────
  // 6. Statistics
  // ─────────────────────────────────────────────────────────
  logSection('6. Usage Statistics');

  try {
    const res = await makeRequest('GET', `${API_BASE}/ai/stats`);

    if (res.status === 200 && res.data.success) {
      logSuccess('Get AI usage statistics');
      if (res.data.data.length > 0) {
        log('  Statistics by type:', 'cyan');
        res.data.data.forEach((stat) => {
          log(`    • ${stat.execution_type}: ${stat.count} executions, $${stat.totalCost || 0}`, 'cyan');
        });
      } else {
        log('  No AI usage yet', 'cyan');
      }
    } else {
      logFailure('Get usage statistics', `Status: ${res.status}`);
    }
  } catch (error) {
    logFailure('Get usage statistics', error.message);
  }

  // ─────────────────────────────────────────────────────────
  // 7. Execution Logs
  // ─────────────────────────────────────────────────────────
  logSection('7. Execution Logs');

  try {
    const res = await makeRequest('GET', `${API_BASE}/ai/execution-logs?limit=5`);

    if (res.status === 200 && res.data.success) {
      logSuccess(`Get execution logs (${res.data.data.length} found)`);
      if (res.data.data.length > 0) {
        log('  Recent executions:', 'cyan');
        res.data.data.forEach((log) => {
          log(`    • ${log.executionType} - ${log.status} (${log.durationMs}ms)`, 'cyan');
        });
      }
    } else {
      logFailure('Get execution logs', `Status: ${res.status}`);
    }
  } catch (error) {
    logFailure('Get execution logs', error.message);
  }

  // ─────────────────────────────────────────────────────────
  // SUMMARY
  // ─────────────────────────────────────────────────────────
  console.log('\n');
  log('='.repeat(70), 'bright');
  log('  TEST SUMMARY', 'bright');
  log('='.repeat(70), 'bright');
  console.log('');

  const passRate = results.total > 0 ? Math.round((results.passed / results.total) * 100) : 0;

  log(`Total Tests:     ${results.total}`, 'cyan');
  log(`Passed:          ${results.passed}`, 'green');
  log(`Failed:          ${results.failed}`, results.failed > 0 ? 'red' : 'cyan');
  log(`Pass Rate:       ${passRate}%`, passRate >= 80 ? 'green' : 'yellow');

  console.log('');

  if (results.failed === 0) {
    log('🎉 ALL API TESTS PASSED!', 'green');
    if (!WITH_REAL_AI) {
      console.log('');
      log('ℹ️  To test with real AI:', 'cyan');
      log('   1. Set ANTHROPIC_API_KEY in .env', 'cyan');
      log('   2. Run: node scripts/test-ai-api.js --with-real-ai', 'cyan');
      log('   3. Cost: ~$0.01 per full test run', 'cyan');
    }
  } else {
    log(`⚠️  ${results.failed} TEST(S) FAILED`, 'yellow');
    console.log('');
    log('Common issues:', 'bright');
    log('• Server not running: npm run start:svr', 'cyan');
    log('• Missing migrations: npx sequelize-cli db:migrate', 'cyan');
    log('• Missing seeders: npx sequelize-cli db:seed --seed 20251227120001-seed-ai-agent-system.js', 'cyan');
  }

  console.log('');
  process.exit(results.failed > 0 ? 1 : 0);
}

// Run tests
runTests().catch((error) => {
  console.error('');
  log('FATAL ERROR:', 'red');
  console.error(error);
  console.error('');
  process.exit(1);
});
