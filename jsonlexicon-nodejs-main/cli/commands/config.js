const chalk = require('chalk');
const ora = require('ora');
const {
  databasePrompts,
  redisPrompts,
  rabbitmqPrompts
} = require('../lib/prompts');
const {
  testDatabaseConnection,
  testRedisConnection,
  testRabbitMQConnection
} = require('../lib/status');

/**
 * Configuration command
 */
async function configCommand(options) {
  console.log(chalk.blue('\n⚙️  Service Configuration\n'));

  try {
    const type = options.type || 'all';
    const results = {};

    // Database configuration
    if (type === 'all' || type === 'database') {
      console.log(chalk.blue('Configuring Database...\n'));

      const dbConfig = await databasePrompts({
        host: options.host || 'localhost',
        port: options.port || '5432',
        database: 'exprsn_platform',
        username: options.user || 'postgres',
        password: options.password
      });

      // Test connection if requested
      if (options.test || dbConfig.testConnection) {
        const testResult = await testDatabaseConnection(dbConfig);
        results.database = { config: dbConfig, connectionTest: testResult };
      } else {
        results.database = { config: dbConfig };
      }
    }

    // Redis configuration
    if (type === 'all' || type === 'redis') {
      console.log(chalk.blue('\nConfiguring Redis...\n'));

      const redisConfig = await redisPrompts({
        host: options.host || 'localhost',
        port: options.port || '6379',
        password: options.password
      });

      // Test connection if requested
      if (options.test || redisConfig.testConnection) {
        const testResult = await testRedisConnection(redisConfig);
        results.redis = { config: redisConfig, connectionTest: testResult };
      } else {
        results.redis = { config: redisConfig };
      }
    }

    // RabbitMQ configuration
    if (type === 'all' || type === 'rabbitmq') {
      console.log(chalk.blue('\nConfiguring RabbitMQ...\n'));

      const rabbitmqConfig = await rabbitmqPrompts({
        host: options.host || 'localhost',
        port: options.port || '5672',
        username: options.user || 'guest',
        password: options.password || 'guest'
      });

      // Test connection if requested
      if (options.test) {
        const testResult = await testRabbitMQConnection(rabbitmqConfig);
        results.rabbitmq = { config: rabbitmqConfig, connectionTest: testResult };
      } else {
        results.rabbitmq = { config: rabbitmqConfig };
      }
    }

    // Save configuration
    const fs = require('fs');
    const path = require('path');
    const configPath = path.join(process.cwd(), `service-config.${options.env}.json`);

    fs.writeFileSync(configPath, JSON.stringify(results, null, 2));

    console.log(chalk.green(`\n✓ Configuration saved: ${configPath}\n`));

    // Update .env file with new configuration
    const { confirmPrompt } = require('../lib/prompts');
    const updateEnv = await confirmPrompt('Update .env file with this configuration?', true);

    if (updateEnv) {
      const { readEnvFile, generateEnvContent, writeEnvFile } = require('../lib/env-generator');
      const envPath = path.join(process.cwd(), `.env.${options.env}`);

      let existingConfig = {};
      if (fs.existsSync(envPath)) {
        try {
          const envData = readEnvFile(envPath);
          // Convert flat env vars to config structure
          existingConfig = {
            environment: options.env,
            database: results.database?.config || {},
            redis: results.redis?.config || {},
            rabbitmq: results.rabbitmq?.config || {}
          };
        } catch (error) {
          console.warn(chalk.yellow('Warning: Could not read existing .env file'));
        }
      }

      const updatedConfig = {
        environment: options.env,
        database: results.database?.config || existingConfig.database,
        redis: results.redis?.config || existingConfig.redis,
        rabbitmq: results.rabbitmq?.config || existingConfig.rabbitmq
      };

      const content = generateEnvContent(updatedConfig);
      writeEnvFile(envPath, content, { backup: true, overwrite: true });
    }

    console.log(chalk.blue('📝 Configuration complete!\n'));

    return { success: true, results };
  } catch (error) {
    console.error(chalk.red('\n✖ Configuration failed:'), error.message);
    if (error.stack) {
      console.error(chalk.gray(error.stack));
    }
    return { success: false, error };
  }
}

module.exports = configCommand;
