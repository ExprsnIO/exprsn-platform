/**
 * Configuration Module
 * Interactive configuration wizard for Exprsn
 */

const path = require('path');
const fs = require('fs');
const chalk = require('chalk');
const inquirer = require('inquirer');
const ora = require('ora');

const EXPRSN_ROOT = path.resolve(__dirname, '../..');
const ENV_FILE = path.join(EXPRSN_ROOT, '.env');

const DEFAULT_CONFIG = {
  // Database
  DB_HOST: 'localhost',
  DB_PORT: '5432',
  DB_USER: 'postgres',
  DB_PASSWORD: '',
  DB_SSL: 'false',
  
  // Redis
  REDIS_HOST: 'localhost',
  REDIS_PORT: '6379',
  REDIS_ENABLED: 'true',
  REDIS_PASSWORD: '',
  
  // Environment
  NODE_ENV: 'development',
  AUTO_START_SERVICES: 'ca,setup,timeline,bridge',
  
  // CA
  CA_NAME: 'Exprsn Root CA',
  CA_DOMAIN: 'localhost',
  OCSP_ENABLED: 'true',
  OCSP_PORT: '2560',
  CRL_ENABLED: 'true',
  
  // Security
  BCRYPT_ROUNDS: '12',
  SESSION_SECRET: '',
  
  // Elasticsearch (optional)
  ELASTICSEARCH_ENABLED: 'false',
  ELASTICSEARCH_URL: 'http://localhost:9200'
};

async function configure(options) {
  console.log(chalk.bold.blue('\n⚙️  Exprsn Configuration Wizard\n'));
  
  let config = { ...DEFAULT_CONFIG };
  
  // Load existing config if present
  if (fs.existsSync(ENV_FILE)) {
    const existing = fs.readFileSync(ENV_FILE, 'utf8');
    existing.split('\n').forEach(line => {
      const [key, ...valueParts] = line.split('=');
      if (key && valueParts.length > 0) {
        config[key.trim()] = valueParts.join('=').trim();
      }
    });
    console.log(chalk.green('✓ Loaded existing configuration\n'));
  }
  
  if (options.interactive) {
    // Interactive configuration
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'DB_HOST',
        message: 'PostgreSQL host:',
        default: config.DB_HOST
      },
      {
        type: 'input',
        name: 'DB_PORT',
        message: 'PostgreSQL port:',
        default: config.DB_PORT
      },
      {
        type: 'input',
        name: 'DB_USER',
        message: 'PostgreSQL user:',
        default: config.DB_USER
      },
      {
        type: 'password',
        name: 'DB_PASSWORD',
        message: 'PostgreSQL password:',
        default: config.DB_PASSWORD
      },
      {
        type: 'input',
        name: 'REDIS_HOST',
        message: 'Redis host:',
        default: config.REDIS_HOST
      },
      {
        type: 'input',
        name: 'REDIS_PORT',
        message: 'Redis port:',
        default: config.REDIS_PORT
      },
      {
        type: 'list',
        name: 'NODE_ENV',
        message: 'Environment:',
        choices: ['development', 'production', 'test'],
        default: config.NODE_ENV
      },
      {
        type: 'input',
        name: 'AUTO_START_SERVICES',
        message: 'Auto-start services (comma-separated):',
        default: config.AUTO_START_SERVICES
      },
      {
        type: 'confirm',
        name: 'ELASTICSEARCH_ENABLED',
        message: 'Enable Elasticsearch?',
        default: config.ELASTICSEARCH_ENABLED === 'true'
      }
    ]);
    
    config = { ...config, ...answers };
    config.ELASTICSEARCH_ENABLED = config.ELASTICSEARCH_ENABLED ? 'true' : 'false';
  }
  
  // Generate session secret if not present
  if (!config.SESSION_SECRET) {
    const crypto = require('crypto');
    config.SESSION_SECRET = crypto.randomBytes(32).toString('hex');
    console.log(chalk.green('\n✓ Generated session secret'));
  }
  
  // Write config file
  const spinner = ora('Writing configuration...').start();
  
  const envContent = Object.entries(config)
    .map(([key, value]) => key + '=' + value)
    .join('\n');
  
  fs.writeFileSync(ENV_FILE, envContent);
  spinner.succeed('Configuration saved to .env');
  
  console.log(chalk.green('\n✨ Configuration complete!\n'));
}

module.exports = {
  configure
};
