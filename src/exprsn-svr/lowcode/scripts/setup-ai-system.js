/**
 * Setup AI Agent System
 *
 * Runs migrations and seeders for the AI integration.
 */

const { execSync } = require('child_process');
const path = require('path');

console.log('\n🤖 Setting up AI Agent System...\n');

try {
  // Change to lowcode directory
  const lowcodeDir = path.join(__dirname, '..');
  process.chdir(lowcodeDir);

  console.log('📁 Working directory:', process.cwd());

  // Run migration
  console.log('\n📊 Step 1: Running AI system migration...');
  execSync('npx sequelize-cli db:migrate --migrations-path migrations --config config/config.json', {
    stdio: 'inherit',
  });

  // Run seeder
  console.log('\n🌱 Step 2: Seeding AI templates and providers...');
  execSync('npx sequelize-cli db:seed --seed 20251227120001-seed-ai-agent-system.js --seeders-path seeders', {
    stdio: 'inherit',
  });

  console.log('\n✅ AI Agent System setup complete!\n');
  console.log('📝 Next steps:');
  console.log('   1. Set ANTHROPIC_API_KEY in your .env file');
  console.log('   2. (Optional) Install Ollama for local models: https://ollama.ai');
  console.log('   3. Test AI endpoints: http://localhost:5001/lowcode/api/ai');
  console.log('\n');

} catch (error) {
  console.error('\n❌ Error setting up AI system:', error.message);
  process.exit(1);
}
