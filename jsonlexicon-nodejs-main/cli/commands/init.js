const chalk = require('chalk');
const ora = require('ora');
const path = require('path');
const fs = require('fs');
const {
  deploymentPrompts,
  databasePrompts,
  redisPrompts,
  rabbitmqPrompts,
  applicationPrompts,
  sslPrompts,
  cloudProviderPrompts,
  confirmPrompt
} = require('../lib/prompts');
const { generateEnvFile } = require('../lib/env-generator');
const { validateConfiguration } = require('../lib/validators');

/**
 * Initialize deployment configuration
 */
async function initCommand(options) {
  console.log(chalk.blue('\n🚀 Exprsn Platform Deployment Initialization\n'));

  try {
    // Get deployment configuration
    const deploymentConfig = await deploymentPrompts();

    // Get database configuration
    const databaseConfig = await databasePrompts({
      host: 'localhost',
      port: '5432',
      database: 'exprsn_platform',
      username: 'postgres'
    });

    // Get Redis configuration
    const redisConfig = await redisPrompts({
      host: 'localhost',
      port: '6379'
    });

    // Get RabbitMQ configuration
    const rabbitmqConfig = await rabbitmqPrompts({
      host: 'localhost',
      port: '5672',
      username: 'guest',
      password: 'guest'
    });

    // Get application configuration
    const applicationConfig = await applicationPrompts({
      apiPort: '3000',
      socketPort: '3001',
      corsOrigins: '*',
      logLevel: 'info',
      enableMetrics: true
    });

    // Get SSL configuration
    const sslConfig = await sslPrompts({
      generateCerts: true,
      caValidityDays: '3650',
      serverValidityDays: '365',
      country: 'US',
      organization: 'Exprsn Platform'
    });

    // Get cloud provider configuration if cloud deployment
    let cloudConfig = {};
    if (deploymentConfig.deploymentType === 'cloud') {
      cloudConfig = await cloudProviderPrompts(deploymentConfig.cloudProvider);
    }

    // Combine all configurations
    const fullConfig = {
      environment: deploymentConfig.environment || options.env,
      deploymentType: deploymentConfig.deploymentType,
      platform: deploymentConfig.platform,
      cloudProvider: deploymentConfig.cloudProvider,
      database: databaseConfig,
      redis: redisConfig,
      rabbitmq: rabbitmqConfig,
      application: applicationConfig,
      ssl: sslConfig,
      cloud: cloudConfig
    };

    // Validate configuration
    console.log(chalk.blue('\n🔍 Validating configuration...\n'));
    const validateSpinner = ora('Validating configuration').start();

    try {
      validateConfiguration(fullConfig);
      validateSpinner.succeed('Configuration is valid');
    } catch (error) {
      validateSpinner.fail('Configuration validation failed');
      console.error(chalk.red(error.message));
      return;
    }

    // Generate .env file
    console.log(chalk.blue('\n📝 Generating environment file...\n'));

    const outputPath = path.join(
      options.output || process.cwd(),
      `.env.${fullConfig.environment}`
    );

    await generateEnvFile(fullConfig, outputPath, { backup: true, overwrite: true });

    // Save configuration to JSON file
    const configPath = path.join(
      options.output || process.cwd(),
      `deployment-config.${fullConfig.environment}.json`
    );

    fs.writeFileSync(configPath, JSON.stringify(fullConfig, null, 2));
    console.log(chalk.green(`✓ Configuration saved: ${configPath}`));

    // Print next steps
    console.log(chalk.blue('\n✨ Initialization complete!\n'));
    console.log(chalk.blue('📋 Next Steps:\n'));

    switch (deploymentConfig.deploymentType) {
      case 'local':
        console.log(chalk.gray(`  1. Review configuration: ${configPath}`));
        console.log(chalk.gray(`  2. Review environment file: ${outputPath}`));
        console.log(chalk.cyan(`  3. Deploy: exprsn-deploy local --env ${fullConfig.environment}`));
        break;

      case 'container':
        console.log(chalk.gray(`  1. Review configuration: ${configPath}`));
        console.log(chalk.gray(`  2. Review environment file: ${outputPath}`));
        console.log(chalk.gray(`  3. Copy .env file: cp ${outputPath} .env`));
        console.log(chalk.cyan(`  4. Deploy: exprsn-deploy container --env ${fullConfig.environment}`));
        break;

      case 'cloud':
        console.log(chalk.gray(`  1. Review configuration: ${configPath}`));
        console.log(chalk.gray(`  2. Review environment file: ${outputPath}`));
        console.log(chalk.cyan(`  3. Deploy: exprsn-deploy cloud --provider ${fullConfig.cloudProvider} --env ${fullConfig.environment}`));
        break;
    }

    console.log('');

    // Test connections if requested
    if (databaseConfig.testConnection) {
      const { testDatabaseConnection } = require('../lib/status');
      await testDatabaseConnection(databaseConfig);
    }

    if (redisConfig.testConnection) {
      const { testRedisConnection } = require('../lib/status');
      await testRedisConnection(redisConfig);
    }

    return { success: true, config: fullConfig };
  } catch (error) {
    console.error(chalk.red('\n✖ Initialization failed:'), error.message);
    if (error.stack) {
      console.error(chalk.gray(error.stack));
    }
    return { success: false, error };
  }
}

module.exports = initCommand;
