const chalk = require('chalk');
const ora = require('ora');
const { exec } = require('child_process');
const { promisify } = require('util');
const net = require('net');

const execAsync = promisify(exec);

/**
 * Check if a port is in use
 */
async function checkPort(port, host = 'localhost') {
  return new Promise((resolve) => {
    const socket = new net.Socket();

    socket.setTimeout(1000);

    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });

    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });

    socket.on('error', () => {
      resolve(false);
    });

    socket.connect(port, host);
  });
}

/**
 * Check service status
 */
async function checkServiceStatus(serviceName) {
  try {
    const { stdout } = await execAsync(`systemctl is-active ${serviceName}`);
    return stdout.trim() === 'active';
  } catch (error) {
    return false;
  }
}

/**
 * Check Docker container status
 */
async function checkDockerStatus() {
  try {
    const { stdout } = await execAsync('docker ps --format "{{.Names}}:{{.Status}}"');
    const containers = stdout.trim().split('\n').filter(Boolean).map(line => {
      const [name, status] = line.split(':');
      return { name, status, running: status.includes('Up') };
    });
    return { available: true, containers };
  } catch (error) {
    return { available: false, containers: [] };
  }
}

/**
 * Check database connection
 */
async function checkDatabaseConnection(config) {
  const { Client } = require('pg');
  const client = new Client({
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.username,
    password: config.password,
    ssl: config.ssl ? { rejectUnauthorized: false } : false,
    connectionTimeoutMillis: 5000
  });

  try {
    await client.connect();
    await client.query('SELECT 1');
    await client.end();
    return { connected: true, error: null };
  } catch (error) {
    return { connected: false, error: error.message };
  }
}

/**
 * Check Redis connection
 */
async function checkRedisConnection(config) {
  const Redis = require('ioredis');
  const client = new Redis({
    host: config.host,
    port: config.port,
    password: config.password || undefined,
    db: config.db || 0,
    connectTimeout: 5000,
    retryStrategy: () => null
  });

  try {
    await client.ping();
    await client.quit();
    return { connected: true, error: null };
  } catch (error) {
    return { connected: false, error: error.message };
  }
}

/**
 * Check RabbitMQ connection
 */
async function checkRabbitMQConnection(config) {
  const amqp = require('amqplib');

  try {
    const connection = await amqp.connect({
      hostname: config.host,
      port: config.port,
      username: config.username,
      password: config.password,
      vhost: config.vhost || '/',
      timeout: 5000
    });

    await connection.close();
    return { connected: true, error: null };
  } catch (error) {
    return { connected: false, error: error.message };
  }
}

/**
 * Check overall system status
 */
async function checkStatus(options = {}) {
  console.log(chalk.blue('\n🔍 Checking System Status...\n'));

  const checks = [];

  // Check Node.js version
  const nodeSpinner = ora('Checking Node.js version').start();
  try {
    const { stdout } = await execAsync('node --version');
    const version = stdout.trim();
    nodeSpinner.succeed(`Node.js: ${chalk.green(version)}`);
  } catch (error) {
    nodeSpinner.fail(`Node.js: ${chalk.red('Not found')}`);
  }

  // Check npm version
  const npmSpinner = ora('Checking npm version').start();
  try {
    const { stdout } = await execAsync('npm --version');
    const version = stdout.trim();
    npmSpinner.succeed(`npm: ${chalk.green(version)}`);
  } catch (error) {
    npmSpinner.fail(`npm: ${chalk.red('Not found')}`);
  }

  // Check Docker
  const dockerSpinner = ora('Checking Docker').start();
  const dockerStatus = await checkDockerStatus();
  if (dockerStatus.available) {
    dockerSpinner.succeed(`Docker: ${chalk.green('Available')} (${dockerStatus.containers.length} containers)`);

    if (options.verbose && dockerStatus.containers.length > 0) {
      console.log(chalk.gray('   Containers:'));
      dockerStatus.containers.forEach(container => {
        const statusColor = container.running ? chalk.green : chalk.red;
        console.log(chalk.gray(`   - ${container.name}: ${statusColor(container.status)}`));
      });
    }
  } else {
    dockerSpinner.warn(`Docker: ${chalk.yellow('Not available')}`);
  }

  // Check services
  const services = ['postgresql', 'redis', 'rabbitmq-server'];

  for (const service of services) {
    const serviceSpinner = ora(`Checking ${service}`).start();
    const isActive = await checkServiceStatus(service);

    if (isActive) {
      serviceSpinner.succeed(`${service}: ${chalk.green('Active')}`);
    } else {
      serviceSpinner.warn(`${service}: ${chalk.yellow('Not running')}`);
    }
  }

  // Check ports
  const ports = [
    { port: 3000, name: 'API Server' },
    { port: 3001, name: 'Socket.io Server' },
    { port: 5432, name: 'PostgreSQL' },
    { port: 6379, name: 'Redis' },
    { port: 5672, name: 'RabbitMQ' },
    { port: 80, name: 'HTTP' },
    { port: 443, name: 'HTTPS' }
  ];

  console.log(chalk.blue('\n📡 Checking Ports...\n'));

  for (const { port, name } of ports) {
    const portSpinner = ora(`Checking port ${port} (${name})`).start();
    const isOpen = await checkPort(port);

    if (isOpen) {
      portSpinner.succeed(`Port ${port} (${name}): ${chalk.green('Open')}`);
    } else {
      portSpinner.info(`Port ${port} (${name}): ${chalk.gray('Closed')}`);
    }
  }

  // Check environment file
  console.log(chalk.blue('\n📄 Checking Configuration...\n'));

  const envSpinner = ora('Checking .env file').start();
  const fs = require('fs');
  const path = require('path');
  const envPath = path.resolve(process.cwd(), '.env');

  if (fs.existsSync(envPath)) {
    envSpinner.succeed(`.env file: ${chalk.green('Found')}`);

    if (options.verbose) {
      try {
        const { readEnvFile, validateEnvFile } = require('./env-generator');
        const config = readEnvFile(envPath);
        validateEnvFile(config);
        console.log(chalk.green('   ✓ Configuration is valid'));
      } catch (error) {
        console.log(chalk.yellow(`   ⚠ Configuration warning: ${error.message}`));
      }
    }
  } else {
    envSpinner.warn(`.env file: ${chalk.yellow('Not found')}`);
  }

  console.log(chalk.blue('\n✓ Status check complete\n'));
}

/**
 * Test database connection
 */
async function testDatabaseConnection(config) {
  const spinner = ora('Testing database connection').start();

  try {
    const result = await checkDatabaseConnection(config);

    if (result.connected) {
      spinner.succeed(chalk.green('Database connection successful'));
      return true;
    } else {
      spinner.fail(chalk.red(`Database connection failed: ${result.error}`));
      return false;
    }
  } catch (error) {
    spinner.fail(chalk.red(`Database connection failed: ${error.message}`));
    return false;
  }
}

/**
 * Test Redis connection
 */
async function testRedisConnection(config) {
  const spinner = ora('Testing Redis connection').start();

  try {
    const result = await checkRedisConnection(config);

    if (result.connected) {
      spinner.succeed(chalk.green('Redis connection successful'));
      return true;
    } else {
      spinner.fail(chalk.red(`Redis connection failed: ${result.error}`));
      return false;
    }
  } catch (error) {
    spinner.fail(chalk.red(`Redis connection failed: ${error.message}`));
    return false;
  }
}

/**
 * Test RabbitMQ connection
 */
async function testRabbitMQConnection(config) {
  const spinner = ora('Testing RabbitMQ connection').start();

  try {
    const result = await checkRabbitMQConnection(config);

    if (result.connected) {
      spinner.succeed(chalk.green('RabbitMQ connection successful'));
      return true;
    } else {
      spinner.fail(chalk.red(`RabbitMQ connection failed: ${result.error}`));
      return false;
    }
  } catch (error) {
    spinner.fail(chalk.red(`RabbitMQ connection failed: ${error.message}`));
    return false;
  }
}

module.exports = {
  checkPort,
  checkServiceStatus,
  checkDockerStatus,
  checkDatabaseConnection,
  checkRedisConnection,
  checkRabbitMQConnection,
  checkStatus,
  testDatabaseConnection,
  testRedisConnection,
  testRabbitMQConnection
};
