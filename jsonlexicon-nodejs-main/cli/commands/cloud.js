const chalk = require('chalk');
const path = require('path');
const fs = require('fs');

/**
 * Cloud deployment command
 */
async function cloudCommand(options) {
  console.log(chalk.blue('\n☁️  Cloud Deployment\n'));

  try {
    // Validate provider
    const provider = options.provider;
    const validProviders = ['digitalocean', 'aws', 'azure'];

    if (!validProviders.includes(provider)) {
      throw new Error(`Invalid provider: ${provider}. Must be one of: ${validProviders.join(', ')}`);
    }

    // Load appropriate deployer
    let deployer;

    switch (provider) {
      case 'digitalocean':
        deployer = require('../lib/deployers/digitalocean');
        break;
      case 'aws':
        deployer = require('../lib/deployers/aws');
        break;
      case 'azure':
        deployer = require('../lib/deployers/azure');
        break;
    }

    // Load configuration from file if exists
    const configPath = path.join(process.cwd(), `deployment-config.${options.env}.json`);

    let config = {
      environment: options.env,
      provider: provider,
      region: options.region,
      instanceSize: options.size,
      sshKeyPath: options.sshKey || '~/.ssh/id_rsa'
    };

    if (fs.existsSync(configPath)) {
      console.log(chalk.blue(`Loading configuration from ${configPath}\n`));
      const savedConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      config = { ...config, ...savedConfig, ...savedConfig.cloud };
    } else {
      // Prompt for cloud-specific configuration
      const { cloudProviderPrompts } = require('../lib/prompts');
      const cloudConfig = await cloudProviderPrompts(provider, config);
      config = { ...config, ...cloudConfig };
    }

    // Add provider-specific config from options
    if (provider === 'digitalocean') {
      config.dropletIp = options.dropletIp;
    } else if (provider === 'aws') {
      config.instanceIp = options.instanceIp;
    } else if (provider === 'azure') {
      config.vmIp = options.vmIp;
    }

    // Check .env file
    const envPath = path.join(process.cwd(), '.env');
    const envFilePath = path.join(process.cwd(), `.env.${options.env}`);

    if (!fs.existsSync(envPath)) {
      if (fs.existsSync(envFilePath)) {
        console.log(chalk.blue(`Preparing .env file from .env.${options.env}\n`));
        fs.copyFileSync(envFilePath, envPath);
      } else {
        console.log(chalk.yellow(`⚠ Warning: .env file not found. Run 'exprsn-deploy env' first.\n`));
      }
    }

    // Confirm deployment
    const { confirmPrompt } = require('../lib/prompts');
    const confirmed = await confirmPrompt(
      `Deploy to ${provider} for ${options.env} environment?`,
      true
    );

    if (!confirmed) {
      console.log(chalk.yellow('\nDeployment cancelled\n'));
      return { success: false, cancelled: true };
    }

    // Deploy
    const result = await deployer.deploy(config);

    return result;
  } catch (error) {
    console.error(chalk.red('\n✖ Cloud deployment failed:'), error.message);
    if (error.stack) {
      console.error(chalk.gray(error.stack));
    }
    return { success: false, error };
  }
}

module.exports = cloudCommand;
