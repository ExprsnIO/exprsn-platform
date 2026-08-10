#!/usr/bin/env node
/**
 * Lexicon Validation Script
 * Validates all lexicon files for JSON syntax and schema compliance
 */

const fs = require('fs');
const path = require('path');

const lexiconDir = path.join(__dirname, 'src/config/lexicons');
const errors = [];
const warnings = [];

console.log('🔍 Validating JSONLex files...\n');
console.log(`Directory: ${lexiconDir}\n`);

// Get all .json files
const files = fs.readdirSync(lexiconDir).filter(f => f.endsWith('.json'));

console.log(`Found ${files.length} lexicon file(s):\n`);

files.forEach((file, index) => {
  const filePath = path.join(lexiconDir, file);
  console.log(`${index + 1}. ${file}`);

  try {
    // Read and parse JSON
    const content = fs.readFileSync(filePath, 'utf8');
    const lexicon = JSON.parse(content);

    // Basic validation
    if (!lexicon.lexicon) {
      errors.push(`${file}: Missing 'lexicon' root property`);
      console.log(`   ❌ INVALID: Missing 'lexicon' root property`);
      return;
    }

    if (!lexicon.lexicon.version) {
      warnings.push(`${file}: Missing version`);
      console.log(`   ⚠️  WARNING: Missing version`);
    }

    if (!lexicon.lexicon.service) {
      errors.push(`${file}: Missing service information`);
      console.log(`   ❌ INVALID: Missing service information`);
      return;
    }

    if (!lexicon.lexicon.routes || !Array.isArray(lexicon.lexicon.routes)) {
      errors.push(`${file}: Missing or invalid routes array`);
      console.log(`   ❌ INVALID: Missing or invalid routes array`);
      return;
    }

    const routeCount = lexicon.lexicon.routes.length;
    console.log(`   ✅ VALID: ${routeCount} route(s)`);
    console.log(`   📦 Service: ${lexicon.lexicon.service.name} v${lexicon.lexicon.service.version}`);

    // Validate each route
    let routeErrors = 0;
    lexicon.lexicon.routes.forEach((route, idx) => {
      if (!route.path) {
        errors.push(`${file}: Route ${idx + 1} missing path`);
        routeErrors++;
      }
      if (!route.method) {
        errors.push(`${file}: Route ${idx + 1} missing method`);
        routeErrors++;
      }
      if (!route.target || !route.target.service || !route.target.path) {
        errors.push(`${file}: Route ${idx + 1} invalid target`);
        routeErrors++;
      }
    });

    if (routeErrors > 0) {
      console.log(`   ⚠️  ${routeErrors} route validation error(s)`);
    }

  } catch (error) {
    if (error instanceof SyntaxError) {
      errors.push(`${file}: JSON syntax error - ${error.message}`);
      console.log(`   ❌ INVALID: JSON syntax error`);
      console.log(`      ${error.message}`);
    } else {
      errors.push(`${file}: ${error.message}`);
      console.log(`   ❌ ERROR: ${error.message}`);
    }
  }

  console.log('');
});

// Summary
console.log('═══════════════════════════════════════════════════════════');
console.log('VALIDATION SUMMARY\n');

if (errors.length === 0 && warnings.length === 0) {
  console.log('✅ All lexicon files are valid!\n');
  console.log(`Total files: ${files.length}`);
  console.log(`Status: PASS`);
  process.exit(0);
} else {
  if (errors.length > 0) {
    console.log(`❌ ERRORS (${errors.length}):\n`);
    errors.forEach(err => console.log(`   - ${err}`));
    console.log('');
  }

  if (warnings.length > 0) {
    console.log(`⚠️  WARNINGS (${warnings.length}):\n`);
    warnings.forEach(warn => console.log(`   - ${warn}`));
    console.log('');
  }

  console.log(`Total files: ${files.length}`);
  console.log(`Valid: ${files.length - errors.length}`);
  console.log(`Invalid: ${errors.length}`);
  console.log(`Status: ${errors.length > 0 ? 'FAIL' : 'PASS WITH WARNINGS'}`);

  process.exit(errors.length > 0 ? 1 : 0);
}
