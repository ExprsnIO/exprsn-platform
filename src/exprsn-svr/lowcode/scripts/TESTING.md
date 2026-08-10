# AI Integration Testing Guide

## Overview

This directory contains comprehensive test suites for validating the AI Assistant integration in the Exprsn Low-Code Platform.

## Test Scripts

### 1. `test-ai-integration.js` - Infrastructure Tests

**What it tests:**
- ✅ File structure (models, routes, services, UI components)
- ✅ Database schema (table existence)
- ✅ Seeded data (providers, templates)
- ✅ Model loading (Sequelize models)
- ✅ Service initialization (AIAgentService)
- ✅ Route registration
- ✅ Environment configuration
- ✅ Frontend integration
- ✅ Documentation

**Run it:**
```bash
cd /Users/rickholland/Downloads/Exprsn/src/exprsn-svr/lowcode
node scripts/test-ai-integration.js
```

**Sample output:**
```
🤖 AI ASSISTANT INTEGRATION TEST SUITE
Testing Exprsn Low-Code Platform AI Features

======================================================================
  1. File Structure Validation
======================================================================

✓ File exists: AI models index
✓ File exists: AI provider config model
✓ File exists: AI agent template model
...

TEST SUMMARY
Total Tests:     26
Passed:          24
Failed:          2
Skipped:         0
Pass Rate:       92%
```

**Expected results:**
- **Fresh install**: 20-22 tests pass (DB tests fail until migrations run)
- **After migrations**: 24-25 tests pass (only API key test may fail)
- **Fully configured**: 26/26 tests pass 🎉

---

### 2. `test-ai-api.js` - API Endpoint Tests

**What it tests:**
- ✅ Server health check
- ✅ AI provider listing
- ✅ Entity schema suggestion endpoint
- ✅ Suggestion management
- ✅ AI conversation endpoint
- ✅ Usage statistics
- ✅ Execution logs

**Run it (without AI calls):**
```bash
cd /Users/rickholland/Downloads/Exprsn/src/exprsn-svr/lowcode

# Start server first
LOW_CODE_DEV_AUTH=true PORT=5001 npm run start:svr

# In another terminal:
node scripts/test-ai-api.js
```

**Run it (with real AI - costs ~$0.01):**
```bash
# Make sure ANTHROPIC_API_KEY is set in .env
node scripts/test-ai-api.js --with-real-ai
```

**Sample output:**
```
🧪 AI API END-TO-END TEST SUITE
Testing: http://localhost:5001/lowcode/api
With Real AI: NO (Mock Mode)

======================================================================
  1. Server Health
======================================================================

✓ Server is running
  Service: low-code-platform
  Version: 1.0.0
  Auth: development-bypass

======================================================================
  2. AI Providers
======================================================================

✓ List AI providers (2 found)
  • Anthropic Claude (anthropic)
    Default: true, Active: true, Health: healthy
  • Ollama (Local Models) (ollama)
    Default: false, Active: false, Health: unavailable

TEST SUMMARY
Total Tests:     7
Passed:          7
Failed:          0
Pass Rate:       100%

🎉 ALL API TESTS PASSED!
```

**Expected results:**
- **Mock mode** (no `--with-real-ai`): Tests endpoints without AI calls
- **Real AI mode**: Actually generates schemas and costs ~$0.01 per run

---

## Test Workflow

### Step 1: Pre-Migration Tests

Before running any database migrations:

```bash
node scripts/test-ai-integration.js
```

**Expected:** ~14 tests pass (file structure only)

---

### Step 2: Run Migrations

```bash
cd /Users/rickholland/Downloads/Exprsn/src/exprsn-svr

# Run all migrations
npx sequelize-cli db:migrate
```

---

### Step 3: Post-Migration Tests

```bash
cd lowcode
node scripts/test-ai-integration.js
```

**Expected:** ~20 tests pass (file structure + database schema)

---

### Step 4: Run Seeders

```bash
npx sequelize-cli db:seed --seed lowcode/seeders/20251227120001-seed-ai-agent-system.js
```

---

### Step 5: Post-Seeder Tests

```bash
node scripts/test-ai-integration.js
```

**Expected:** ~24 tests pass (everything except API key)

---

### Step 6: Set API Key

Add to `.env`:
```bash
ANTHROPIC_API_KEY=sk-ant-api03-your-key-here
```

---

### Step 7: Final Validation

```bash
node scripts/test-ai-integration.js
```

**Expected:** 26/26 tests pass ✅

---

### Step 8: API Tests (Server Running)

Terminal 1:
```bash
LOW_CODE_DEV_AUTH=true PORT=5001 npm run start:svr
```

Terminal 2:
```bash
cd lowcode
node scripts/test-ai-api.js
```

**Expected:** 7/7 API tests pass

---

### Step 9: Real AI Test (Optional)

**⚠️ This costs real money (~$0.01 per run)**

```bash
node scripts/test-ai-api.js --with-real-ai
```

This will:
1. Generate an actual entity schema using AI
2. Test conversation endpoint
3. Show real token usage and costs
4. Validate the full AI pipeline

---

## Troubleshooting

### ❌ Database connection failed

**Error:**
```
✗ Connect to database
  Error: Cannot find module '../config/config.json'
```

**Fix:**
```bash
# Make sure you're in the lowcode directory
cd /Users/rickholland/Downloads/Exprsn/src/exprsn-svr/lowcode

# Check config exists
ls config/config.json

# If missing, copy from exprsn-svr
cp ../config/config.json config/
```

---

### ❌ Tables not found

**Error:**
```
✗ Table exists: ai_provider_configs
  Error: Table ai_provider_configs does not exist
```

**Fix:**
```bash
# Run migrations
cd /Users/rickholland/Downloads/Exprsn/src/exprsn-svr
npx sequelize-cli db:migrate
```

---

### ❌ No AI providers found

**Error:**
```
✗ AI providers seeded
  Error: No AI providers found. Run seeders first.
```

**Fix:**
```bash
# Run seeder
npx sequelize-cli db:seed --seed lowcode/seeders/20251227120001-seed-ai-agent-system.js
```

---

### ❌ API key not configured

**Error:**
```
✗ Check ANTHROPIC_API_KEY
  Error: ANTHROPIC_API_KEY not configured
```

**Fix:**
```bash
# Add to .env file
echo "ANTHROPIC_API_KEY=sk-ant-api03-your-key" >> .env

# Or export temporarily
export ANTHROPIC_API_KEY=sk-ant-api03-your-key

# Test again
node scripts/test-ai-integration.js
```

---

### ❌ Server not running (API tests)

**Error:**
```
✗ Server health check
  Cannot connect to http://localhost:5001
```

**Fix:**
```bash
# Start the server
cd /Users/rickholland/Downloads/Exprsn
LOW_CODE_DEV_AUTH=true PORT=5001 npm run start:svr
```

---

## Test Coverage

### Infrastructure Tests (test-ai-integration.js)

| Category | Tests | Description |
|----------|-------|-------------|
| File Structure | 14 | Validates all required files exist |
| Database | 11 | Checks tables, indexes, constraints |
| Seeded Data | 4 | Verifies providers and templates |
| Models | 1 | Ensures Sequelize models load |
| Services | 2 | Tests AIAgentService |
| Routes | 2 | Validates route registration |
| Environment | 1 | Checks API key configuration |
| Frontend | 2 | Validates UI integration |
| Documentation | 1 | Confirms docs exist |
| **Total** | **26** | **Comprehensive validation** |

### API Tests (test-ai-api.js)

| Category | Tests | Description |
|----------|-------|-------------|
| Health | 1 | Server connectivity |
| Providers | 1 | List AI providers |
| Suggestions | 2 | Generate + list schemas |
| Conversation | 1 | AI chat interface |
| Statistics | 1 | Usage analytics |
| Logs | 1 | Execution history |
| **Total** | **7** | **End-to-end validation** |

---

## Continuous Integration

### GitHub Actions Example

```yaml
name: AI Integration Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest

    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: exprsn_svr_test
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        run: npm install

      - name: Run migrations
        run: npx sequelize-cli db:migrate
        env:
          NODE_ENV: test

      - name: Run seeders
        run: npx sequelize-cli db:seed:all
        env:
          NODE_ENV: test

      - name: Run infrastructure tests
        run: node src/exprsn-svr/lowcode/scripts/test-ai-integration.js

      - name: Start server
        run: npm run start:svr &
        env:
          LOW_CODE_DEV_AUTH: true
          PORT: 5001

      - name: Wait for server
        run: sleep 10

      - name: Run API tests
        run: node src/exprsn-svr/lowcode/scripts/test-ai-api.js
```

---

## Cost Estimation

### Test Costs (with --with-real-ai)

| Test Type | API Calls | Input Tokens | Output Tokens | Cost |
|-----------|-----------|--------------|---------------|------|
| Entity Generation | 1 | ~1,200 | ~600 | $0.0045 |
| Conversation | 1 | ~800 | ~400 | $0.0030 |
| **Total per run** | **2** | **~2,000** | **~1,000** | **~$0.008** |

**Monthly estimates:**
- Daily testing (30 runs): **$0.24/month**
- CI/CD (100 runs): **$0.80/month**
- Development (500 runs): **$4.00/month**

---

## Best Practices

### 1. Run Tests Before Deployment

```bash
# Full test suite
node scripts/test-ai-integration.js
node scripts/test-ai-api.js

# If all pass, deploy
```

### 2. Test in Isolation

```bash
# Test specific category
grep -A 50 "Database Connection" scripts/test-ai-integration.js | node
```

### 3. Monitor Costs

```bash
# Check AI usage
curl http://localhost:5001/lowcode/api/ai/stats | jq

# Output:
{
  "success": true,
  "data": [
    {
      "count": 42,
      "totalCost": 0.17,
      "avgDuration": 1250
    }
  ]
}
```

### 4. Use Mock Mode for Development

```bash
# No AI calls = no cost
node scripts/test-ai-api.js
```

### 5. Enable Real AI Only When Needed

```bash
# Only run real AI tests before major releases
node scripts/test-ai-api.js --with-real-ai
```

---

## Next Steps

After all tests pass:

1. ✅ Test in browser: http://localhost:5001/lowcode
2. ✅ Open Entity Designer Pro
3. ✅ Click "AI Assist" button
4. ✅ Generate your first entity!

---

## Support

Questions? Issues?

1. Check test output for specific errors
2. Review `AI_ASSISTANT_INTEGRATION.md` for setup guide
3. Check logs: `src/logs/lowcode.log`
4. Open GitHub issue with test output

---

**Built with:** Node.js, Sequelize, Anthropic Claude, PostgreSQL
**Last Updated:** December 27, 2025
**Version:** 1.0.0
