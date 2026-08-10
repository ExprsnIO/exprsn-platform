const chalk = require('chalk');
const path = require('path');
const fs = require('fs');

/**
 * Container deployment command
 */
async function containerCommand(options) {
  console.log(chalk.blue('\n🐳 Container Deployment\n'));

  try {
    // Load deployer
    const deployer = require('../lib/deployers/docker');

    // Load configuration from file if exists
    const configPath = path.join(process.cwd(), `deployment-config.${options.env}.json`);

    let config = {
      environment: options.env,
      mode: options.mode || 'up',
      logs: options.logs,
      rebuild: options.mode === 'rebuild',
      migrate: true,
      ssl: true
    };

    if (fs.existsSync(configPath)) {
      console.log(chalk.blue(`Loading configuration from ${configPath}\n`));
      const savedConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      config = { ...config, ...savedConfig };
    }

    // Check .env file
    const envPath = path.join(process.cwd(), '.env');
    const envFilePath = path.join(process.cwd(), `.env.${options.env}`);

    if (!fs.existsSync(envPath)) {
      if (fs.existsSync(envFilePath)) {
        console.log(chalk.yellow(`⚠ .env file not found, copying from .env.${options.env}\n`));
        fs.copyFileSync(envFilePath, envPath);
      } else {
        console.log(chalk.yellow(`⚠ Warning: .env file not found. Run 'exprsn-deploy init' or 'exprsn-deploy env' first.\n`));
      }
    }

    // Confirm deployment for destructive operations
    if (['down', 'rebuild'].includes(config.mode)) {
      const { confirmPrompt } = require('../lib/prompts');
      const confirmed = await confirmPrompt(
        `Are you sure you want to ${config.mode} containers?`,
        false
      );

      if (!confirmed) {
        console.log(chalk.yellow('\nOperation cancelled\n'));
        return { success: false, cancelled: true };
      }
    }

    // Deploy
    const result = await deployer.deploy(config);

    return result;
  } catch (error) {
    console.error(chalk.red('\n✖ Container deployment failed:'), error.message);
    if (error.stack) {
      console.error(chalk.gray(error.stack));
    }
    return { success: false, error };
  }
}

module.exports = containerCommand;
