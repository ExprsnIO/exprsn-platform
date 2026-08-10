const inquirer = require('inquirer');
const chalk = require('chalk');

/**
 * Deployment initialization prompts
 */
async function deploymentPrompts(defaults = {}) {
  console.log(chalk.blue('\n📋 Deployment Configuration\n'));

  return inquirer.prompt([
    {
      type: 'list',
      name: 'environment',
      message: 'Select environment:',
      choices: ['production', 'staging', 'dev', 'testing'],
      default: defaults.environment || 'production'
    },
    {
      type: 'list',
      name: 'deploymentType',
      message: 'Select deployment type:',
      choices: [
        { name: 'Local (Native)', value: 'local' },
        { name: 'Container (Docker)', value: 'container' },
        { name: 'Cloud (DigitalOcean/AWS/Azure)', value: 'cloud' }
      ],
      default: defaults.deploymentType || 'container'
    },
    {
      type: 'list',
      name: 'platform',
      message: 'Select local platform:',
      choices: ['ubuntu', 'fedora', 'macos', 'auto-detect'],
      when: (answers) => answers.deploymentType === 'local',
      default: 'auto-detect'
    },
    {
      type: 'list',
      name: 'cloudProvider',
      message: 'Select cloud provider:',
      choices: ['digitalocean', 'aws', 'azure'],
      when: (answers) => answers.deploymentType === 'cloud',
      default: defaults.cloudProvider || 'digitalocean'
    }
  ]);
}

/**
 * Database configuration prompts
 */
async function databasePrompts(defaults = {}) {
  console.log(chalk.blue('\n🗄️  Database Configuration\n'));

  return inquirer.prompt([
    {
      type: 'input',
      name: 'host',
      message: 'PostgreSQL host:',
      default: defaults.host || 'localhost'
    },
    {
      type: 'input',
      name: 'port',
      message: 'PostgreSQL port:',
      default: defaults.port || '5432',
      validate: (input) => {
        const port = parseInt(input);
        return !isNaN(port) && port > 0 && port < 65536 ? true : 'Please enter a valid port number';
      }
    },
    {
      type: 'input',
      name: 'database',
      message: 'Database name:',
      default: defaults.database || 'exprsn_platform'
    },
    {
      type: 'input',
      name: 'username',
      message: 'Database username:',
      default: defaults.username || 'postgres'
    },
    {
      type: 'password',
      name: 'password',
      message: 'Database password:',
      mask: '*',
      default: defaults.password
    },
    {
      type: 'input',
      name: 'poolMin',
      message: 'Connection pool minimum:',
      default: defaults.poolMin || '2',
      validate: (input) => !isNaN(parseInt(input)) ? true : 'Please enter a number'
    },
    {
      type: 'input',
      name: 'poolMax',
      message: 'Connection pool maximum:',
      default: defaults.poolMax || '10',
      validate: (input) => !isNaN(parseInt(input)) ? true : 'Please enter a number'
    },
    {
      type: 'confirm',
      name: 'ssl',
      message: 'Enable SSL connection?',
      default: defaults.ssl || false
    },
    {
      type: 'confirm',
      name: 'testConnection',
      message: 'Test database connection?',
      default: true
    }
  ]);
}

/**
 * Redis configuration prompts
 */
async function redisPrompts(defaults = {}) {
  console.log(chalk.blue('\n🔴 Redis Configuration\n'));

  return inquirer.prompt([
    {
      type: 'input',
      name: 'host',
      message: 'Redis host:',
      default: defaults.host || 'localhost'
    },
    {
      type: 'input',
      name: 'port',
      message: 'Redis port:',
      default: defaults.port || '6379',
      validate: (input) => {
        const port = parseInt(input);
        return !isNaN(port) && port > 0 && port < 65536 ? true : 'Please enter a valid port number';
      }
    },
    {
      type: 'password',
      name: 'password',
      message: 'Redis password (leave empty if none):',
      mask: '*',
      default: defaults.password || ''
    },
    {
      type: 'input',
      name: 'db',
      message: 'Redis database number:',
      default: defaults.db || '0',
      validate: (input) => {
        const db = parseInt(input);
        return !isNaN(db) && db >= 0 && db < 16 ? true : 'Please enter a valid database number (0-15)';
      }
    },
    {
      type: 'input',
      name: 'cacheTTL',
      message: 'Default cache TTL (seconds):',
      default: defaults.cacheTTL || '300',
      validate: (input) => !isNaN(parseInt(input)) ? true : 'Please enter a number'
    },
    {
      type: 'input',
      name: 'tokenCacheTTL',
      message: 'Token cache TTL (seconds):',
      default: defaults.tokenCacheTTL || '60',
      validate: (input) => !isNaN(parseInt(input)) ? true : 'Please enter a number'
    },
    {
      type: 'confirm',
      name: 'testConnection',
      message: 'Test Redis connection?',
      default: true
    }
  ]);
}

/**
 * RabbitMQ configuration prompts
 */
async function rabbitmqPrompts(defaults = {}) {
  console.log(chalk.blue('\n🐰 RabbitMQ Configuration\n'));

  return inquirer.prompt([
    {
      type: 'input',
      name: 'host',
      message: 'RabbitMQ host:',
      default: defaults.host || 'localhost'
    },
    {
      type: 'input',
      name: 'port',
      message: 'RabbitMQ port:',
      default: defaults.port || '5672',
      validate: (input) => {
        const port = parseInt(input);
        return !isNaN(port) && port > 0 && port < 65536 ? true : 'Please enter a valid port number';
      }
    },
    {
      type: 'input',
      name: 'username',
      message: 'RabbitMQ username:',
      default: defaults.username || 'guest'
    },
    {
      type: 'password',
      name: 'password',
      message: 'RabbitMQ password:',
      mask: '*',
      default: defaults.password || 'guest'
    },
    {
      type: 'input',
      name: 'vhost',
      message: 'Virtual host:',
      default: defaults.vhost || '/'
    }
  ]);
}

/**
 * Application configuration prompts
 */
async function applicationPrompts(defaults = {}) {
  console.log(chalk.blue('\n⚙️  Application Configuration\n'));

  return inquirer.prompt([
    {
      type: 'input',
      name: 'apiPort',
      message: 'API server port:',
      default: defaults.apiPort || '3000',
      validate: (input) => {
        const port = parseInt(input);
        return !isNaN(port) && port > 0 && port < 65536 ? true : 'Please enter a valid port number';
      }
    },
    {
      type: 'input',
      name: 'socketPort',
      message: 'Socket.io server port:',
      default: defaults.socketPort || '3001',
      validate: (input) => {
        const port = parseInt(input);
        return !isNaN(port) && port > 0 && port < 65536 ? true : 'Please enter a valid port number';
      }
    },
    {
      type: 'input',
      name: 'corsOrigins',
      message: 'CORS allowed origins (comma-separated):',
      default: defaults.corsOrigins || '*',
      filter: (input) => input.split(',').map(s => s.trim()).join(',')
    },
    {
      type: 'input',
      name: 'jwtSecret',
      message: 'JWT secret key (leave empty to auto-generate):',
      default: defaults.jwtSecret || ''
    },
    {
      type: 'input',
      name: 'encryptionKey',
      message: 'Encryption key (leave empty to auto-generate):',
      default: defaults.encryptionKey || ''
    },
    {
      type: 'list',
      name: 'logLevel',
      message: 'Log level:',
      choices: ['error', 'warn', 'info', 'debug'],
      default: defaults.logLevel || 'info'
    },
    {
      type: 'confirm',
      name: 'enableMetrics',
      message: 'Enable Prometheus metrics?',
      default: defaults.enableMetrics !== false
    }
  ]);
}

/**
 * Cloud provider configuration prompts
 */
async function cloudProviderPrompts(provider, defaults = {}) {
  console.log(chalk.blue(`\n☁️  ${provider.toUpperCase()} Configuration\n`));

  const commonQuestions = [
    {
      type: 'input',
      name: 'region',
      message: 'Region:',
      default: defaults.region || (provider === 'digitalocean' ? 'nyc3' : provider === 'aws' ? 'us-east-1' : 'eastus')
    },
    {
      type: 'input',
      name: 'instanceSize',
      message: 'Instance size:',
      default: defaults.instanceSize || (provider === 'digitalocean' ? 's-2vcpu-4gb' : provider === 'aws' ? 't3.medium' : 'Standard_B2s')
    },
    {
      type: 'input',
      name: 'sshKeyPath',
      message: 'SSH private key path:',
      default: defaults.sshKeyPath || '~/.ssh/id_rsa'
    }
  ];

  const providerSpecific = {
    digitalocean: [
      {
        type: 'input',
        name: 'apiToken',
        message: 'DigitalOcean API token:',
        validate: (input) => input.length > 0 ? true : 'API token is required'
      },
      {
        type: 'input',
        name: 'sshKeyId',
        message: 'SSH key ID (from DigitalOcean):',
        validate: (input) => !isNaN(parseInt(input)) ? true : 'Please enter a valid key ID'
      }
    ],
    aws: [
      {
        type: 'input',
        name: 'accessKeyId',
        message: 'AWS Access Key ID:',
        validate: (input) => input.length > 0 ? true : 'Access Key ID is required'
      },
      {
        type: 'password',
        name: 'secretAccessKey',
        message: 'AWS Secret Access Key:',
        mask: '*',
        validate: (input) => input.length > 0 ? true : 'Secret Access Key is required'
      },
      {
        type: 'input',
        name: 'keyPairName',
        message: 'EC2 Key Pair name:',
        validate: (input) => input.length > 0 ? true : 'Key pair name is required'
      },
      {
        type: 'input',
        name: 'vpcId',
        message: 'VPC ID (leave empty for default):',
        default: ''
      }
    ],
    azure: [
      {
        type: 'input',
        name: 'subscriptionId',
        message: 'Azure Subscription ID:',
        validate: (input) => input.length > 0 ? true : 'Subscription ID is required'
      },
      {
        type: 'input',
        name: 'resourceGroup',
        message: 'Resource Group name:',
        default: defaults.resourceGroup || 'exprsn-platform-rg'
      },
      {
        type: 'input',
        name: 'clientId',
        message: 'Service Principal Client ID:',
        validate: (input) => input.length > 0 ? true : 'Client ID is required'
      },
      {
        type: 'password',
        name: 'clientSecret',
        message: 'Service Principal Client Secret:',
        mask: '*',
        validate: (input) => input.length > 0 ? true : 'Client Secret is required'
      },
      {
        type: 'input',
        name: 'tenantId',
        message: 'Tenant ID:',
        validate: (input) => input.length > 0 ? true : 'Tenant ID is required'
      }
    ]
  };

  return inquirer.prompt([
    ...commonQuestions,
    ...(providerSpecific[provider] || [])
  ]);
}

/**
 * SSL/TLS configuration prompts
 */
async function sslPrompts(defaults = {}) {
  console.log(chalk.blue('\n🔒 SSL/TLS Configuration\n'));

  return inquirer.prompt([
    {
      type: 'confirm',
      name: 'generateCerts',
      message: 'Generate self-signed certificates?',
      default: defaults.generateCerts !== false
    },
    {
      type: 'input',
      name: 'caValidityDays',
      message: 'CA certificate validity (days):',
      default: defaults.caValidityDays || '3650',
      when: (answers) => answers.generateCerts,
      validate: (input) => !isNaN(parseInt(input)) ? true : 'Please enter a number'
    },
    {
      type: 'input',
      name: 'serverValidityDays',
      message: 'Server certificate validity (days):',
      default: defaults.serverValidityDays || '365',
      when: (answers) => answers.generateCerts,
      validate: (input) => !isNaN(parseInt(input)) ? true : 'Please enter a number'
    },
    {
      type: 'input',
      name: 'country',
      message: 'Country code (2 letters):',
      default: defaults.country || 'US',
      when: (answers) => answers.generateCerts,
      validate: (input) => input.length === 2 ? true : 'Please enter a 2-letter country code'
    },
    {
      type: 'input',
      name: 'organization',
      message: 'Organization name:',
      default: defaults.organization || 'Exprsn Platform',
      when: (answers) => answers.generateCerts
    }
  ]);
}

/**
 * Confirmation prompt
 */
async function confirmPrompt(message, defaultValue = false) {
  const answer = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirmed',
      message,
      default: defaultValue
    }
  ]);
  return answer.confirmed;
}

module.exports = {
  deploymentPrompts,
  databasePrompts,
  redisPrompts,
  rabbitmqPrompts,
  applicationPrompts,
  cloudProviderPrompts,
  sslPrompts,
  confirmPrompt
};
