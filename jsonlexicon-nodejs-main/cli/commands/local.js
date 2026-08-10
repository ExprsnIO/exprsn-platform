const chalk = require('chalk');
const ora = require('ora');
const os = require('os');

/**
 * Detect platform
 */
function detectPlatform() {
  const platform = os.platform();

  if (platform === 'darwin') {
    return 'macos';
  } else if (platform === 'linux') {
    // Try to detect Ubuntu vs Fedora
    const fs = require('fs');

    if (fs.existsSync('/etc/os-release')) {
      const osRelease = fs.readFileSync('/etc/os-release', 'utf8');

      if (osRelease.includes('Ubuntu')) {
        return 'ubuntu';
      } else if (osRelease.includes('Fedora')) {
        return 'fedora';
      }
    }

    // Default to Ubuntu for unknown Linux
    return 'ubuntu';
  }

  throw new Error(`Unsupported platform: ${platform}`);
}

/**
 * Local deployment command
 */
async function localCommand(options) {
  console.log(chalk.blue('\n💻 Local Deployment\n'));

  try {
    // Detect or validate platform
    let platform = options.platform;

    if (!platform || platform === 'auto') {
      const spinner = ora('Detecting platform').start();
      platform = detectPlatform();
      spinner.succeed(`Platform detected: ${chalk.cyan(platform)}`);
    }

    // Load appropriate deployer
    let deployer;

    switch (platform) {
      case 'ubuntu':
        deployer = require('../lib/deployers/ubuntu');
        break;
      case 'fedora':
        deployer = require('../lib/deployers/fedora');
        break;
      case 'macos':
        deployer = require('../lib/deployers/macos');
        break;
      default:
        throw new Error(`Unsupported platform: ${platform}`);
    }

    // Load configuration from file if exists
    const path = require('path');
    const fs = require('fs');
    const configPath = path.join(process.cwd(), `deployment-config.${options.env}.json`);

    let config = {
      environment: options.env,
      services: options.services,
      nginx: options.nginx,
      ssl: options.ssl,
      firewall: true,
      migrate: true
    };

    if (fs.existsSync(configPath)) {
      console.log(chalk.blue(`Loading configuration from ${configPath}\n`));
      const savedConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      config = { ...config, ...savedConfig };
    }

    // Load .env file
    const envPath = path.join(process.cwd(), '.env');
    const envFilePath = path.join(process.cwd(), `.env.${options.env}`);

    if (!fs.existsSync(envPath) && fs.existsSync(envFilePath)) {
      console.log(chalk.yellow(`⚠ .env file not found, copying from .env.${options.env}\n`));
      fs.copyFileSync(envFilePath, envPath);
    }

    // Confirm deployment
    const { confirmPrompt } = require('../lib/prompts');
    const confirmed = await confirmPrompt(
      `Deploy to ${platform} for ${options.env} environment?`,
      true
    );

    if (!confirmed) {
      console.log(chalk.yellow('\nDeployment cancelled\n'));
      return { success: false, cancelled: true };
    }

    // Deploy
    const result = await deployer.deploy(config);

    if (result.success) {
      console.log(chalk.green('\n✓ Local deployment successful!\n'));
      console.log(chalk.blue('📝 Next steps:'));
      console.log(chalk.gray('  1. Start the application: npm start'));
      console.log(chalk.gray('  2. Check status: exprsn-deploy status'));
      console.log(chalk.gray('  3. View logs: tail -f logs/app.log\n'));
    }

    return result;
  } catch (error) {
    console.error(chalk.red('\n✖ Local deployment failed:'), error.message);
    if (error.stack) {
      console.error(chalk.gray(error.stack));
    }
    return { success: false, error };
  }
}

module.exports = localCommand;
