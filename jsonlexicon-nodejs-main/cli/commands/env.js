const chalk = require('chalk');
const path = require('path');
const fs = require('fs');
const {
  databasePrompts,
  redisPrompts,
  rabbitmqPrompts,
  applicationPrompts,
  sslPrompts,
  confirmPrompt
} = require('../lib/prompts');
const {
  generateEnvFile,
  readEnvFile,
  mergeEnvConfigs
} = require('../lib/env-generator');

/**
 * Environment file generation command
 */
async function envCommand(options) {
  console.log(chalk.blue('\n📄 Environment File Generator\n'));

  try {
    const environment = options.env || 'production';
    const outputPath = options.output || path.join(process.cwd(), `.env.${environment}`);

    let config = { environment };

    // Copy from existing file if specified
    if (options.copyFrom) {
      console.log(chalk.blue(`Copying from ${options.copyFrom}...\n`));

      const sourcePath = path.resolve(options.copyFrom);
      if (!fs.existsSync(sourcePath)) {
        throw new Error(`Source file not found: ${sourcePath}`);
      }

      const sourceConfig = readEnvFile(sourcePath);
      console.log(chalk.green('✓ Loaded configuration from source file\n'));

      // Convert flat env vars to config structure
      config = {
        environment,
        database: {
          host: sourceConfig.DB_HOST || 'localhost',
          port: sourceConfig.DB_PORT || '5432',
          database: sourceConfig.DB_NAME || 'exprsn_platform',
          username: sourceConfig.DB_USER || 'postgres',
          password: sourceConfig.DB_PASSWORD || '',
          poolMin: sourceConfig.DB_POOL_MIN || '2',
          poolMax: sourceConfig.DB_POOL_MAX || '10',
          ssl: sourceConfig.DB_SSL === 'true'
        },
        redis: {
          host: sourceConfig.REDIS_HOST || 'localhost',
          port: sourceConfig.REDIS_PORT || '6379',
          password: sourceConfig.REDIS_PASSWORD || '',
          db: sourceConfig.REDIS_DB || '0',
          cacheTTL: sourceConfig.CACHE_TTL || '300',
          tokenCacheTTL: sourceConfig.TOKEN_CACHE_TTL || '60'
        },
        rabbitmq: {
          host: sourceConfig.RABBITMQ_HOST || 'localhost',
          port: sourceConfig.RABBITMQ_PORT || '5672',
          username: sourceConfig.RABBITMQ_USER || 'guest',
          password: sourceConfig.RABBITMQ_PASSWORD || 'guest',
          vhost: sourceConfig.RABBITMQ_VHOST || '/'
        },
        application: {
          apiPort: sourceConfig.PORT || '3000',
          socketPort: sourceConfig.SOCKET_PORT || '3001',
          host: sourceConfig.HOST || '0.0.0.0',
          corsOrigins: sourceConfig.CORS_ORIGIN || '*',
          jwtSecret: sourceConfig.JWT_SECRET || '',
          encryptionKey: sourceConfig.ENCRYPTION_KEY || '',
          sessionSecret: sourceConfig.SESSION_SECRET || '',
          logLevel: sourceConfig.LOG_LEVEL || 'info',
          enableMetrics: sourceConfig.ENABLE_METRICS !== 'false'
        },
        ssl: {
          caRootCertPath: sourceConfig.CA_ROOT_CERT_PATH,
          caRootKeyPath: sourceConfig.CA_ROOT_KEY_PATH,
          caIntermediateCertPath: sourceConfig.CA_INTERMEDIATE_CERT_PATH,
          caIntermediateKeyPath: sourceConfig.CA_INTERMEDIATE_KEY_PATH,
          serverCertPath: sourceConfig.SERVER_CERT_PATH,
          serverKeyPath: sourceConfig.SERVER_KEY_PATH,
          caValidityDays: sourceConfig.CA_VALIDITY_DAYS || '3650',
          serverValidityDays: sourceConfig.SERVER_VALIDITY_DAYS || '365'
        }
      };
    }
    // Interactive mode
    else if (options.interactive) {
      console.log(chalk.blue('Interactive Configuration Mode\n'));

      // Get database configuration
      const databaseConfig = await databasePrompts(config.database || {});

      // Get Redis configuration
      const redisConfig = await redisPrompts(config.redis || {});

      // Get RabbitMQ configuration
      const rabbitmqConfig = await rabbitmqPrompts(config.rabbitmq || {});

      // Get application configuration
      const applicationConfig = await applicationPrompts(config.application || {});

      // Get SSL configuration
      const sslConfig = await sslPrompts(config.ssl || {});

      config = {
        environment,
        database: databaseConfig,
        redis: redisConfig,
        rabbitmq: rabbitmqConfig,
        application: applicationConfig,
        ssl: sslConfig
      };
    }
    // Load from deployment config file if exists
    else {
      const deploymentConfigPath = path.join(process.cwd(), `deployment-config.${environment}.json`);

      if (fs.existsSync(deploymentConfigPath)) {
        console.log(chalk.blue(`Loading from ${deploymentConfigPath}...\n`));
        const deploymentConfig = JSON.parse(fs.readFileSync(deploymentConfigPath, 'utf8'));
        config = { ...deploymentConfig, environment };
        console.log(chalk.green('✓ Loaded configuration from deployment config\n'));
      } else {
        console.log(chalk.yellow('No configuration found. Using defaults.\n'));
        console.log(chalk.gray('Tip: Run "exprsn-deploy init" for interactive setup\n'));

        config = {
          environment,
          database: { host: 'localhost', port: '5432', database: 'exprsn_platform', username: 'postgres', password: 'changeme' },
          redis: { host: 'localhost', port: '6379' },
          rabbitmq: { host: 'localhost', port: '5672', username: 'guest', password: 'guest' },
          application: { apiPort: '3000', socketPort: '3001' },
          ssl: {}
        };
      }
    }

    // Check if output file exists
    if (fs.existsSync(outputPath)) {
      const overwrite = await confirmPrompt(
        `File ${outputPath} already exists. Overwrite?`,
        false
      );

      if (!overwrite) {
        console.log(chalk.yellow('\nOperation cancelled\n'));
        return { success: false, cancelled: true };
      }
    }

    // Generate environment file
    console.log(chalk.blue('Generating environment file...\n'));

    const generatedPath = await generateEnvFile(config, outputPath, {
      backup: true,
      overwrite: true
    });

    // Also copy to .env if it's not the main .env file and user confirms
    if (path.basename(outputPath) !== '.env') {
      const copyToMain = await confirmPrompt(
        'Copy to .env for immediate use?',
        true
      );

      if (copyToMain) {
        const mainEnvPath = path.join(process.cwd(), '.env');
        fs.copyFileSync(generatedPath, mainEnvPath);
        console.log(chalk.green(`✓ Copied to ${mainEnvPath}`));
      }
    }

    console.log(chalk.green('\n✓ Environment file generated successfully!\n'));

    console.log(chalk.blue('📝 Next steps:'));
    console.log(chalk.gray(`  1. Review the file: ${outputPath}`));
    console.log(chalk.gray('  2. Update any values as needed'));
    console.log(chalk.gray('  3. Deploy your application\n'));

    return { success: true, path: generatedPath };
  } catch (error) {
    console.error(chalk.red('\n✖ Environment file generation failed:'), error.message);
    if (error.stack) {
      console.error(chalk.gray(error.stack));
    }
    return { success: false, error };
  }
}

module.exports = envCommand;
