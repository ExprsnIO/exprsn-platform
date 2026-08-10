const chalk = require('chalk');
const ora = require('ora');
const { NodeSSH } = require('node-ssh');
const fs = require('fs');
const path = require('path');

const ssh = new NodeSSH();

/**
 * Create droplet configuration
 */
function getDropletConfig(config) {
  return {
    name: config.name || 'exprsn-platform',
    region: config.region || 'nyc3',
    size: config.instanceSize || 's-2vcpu-4gb',
    image: 'ubuntu-22-04-x64',
    ssh_keys: [config.sshKeyId],
    tags: ['exprsn-platform', config.environment || 'production'],
    user_data: getUserData(config)
  };
}

/**
 * Generate cloud-init user data script
 */
function getUserData(config) {
  return `#!/bin/bash
set -e

# Update system
apt-get update
apt-get upgrade -y

# Install Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt-get install -y nodejs

# Install Docker
curl -fsSL https://get.docker.com | sh
systemctl enable docker
systemctl start docker

# Install Docker Compose
curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose

# Create application directory
mkdir -p /opt/exprsn-platform
cd /opt/exprsn-platform

# Set up firewall
ufw allow 22
ufw allow 80
ufw allow 443
ufw --force enable

echo "Droplet setup complete"
`;
}

/**
 * Deploy application to droplet via SSH
 */
async function deployToDroplet(host, config) {
  const spinner = ora('Connecting to droplet via SSH').start();

  try {
    // Expand tilde in SSH key path
    const sshKeyPath = config.sshKeyPath.replace(/^~/, require('os').homedir());

    await ssh.connect({
      host: host,
      username: 'root',
      privateKey: sshKeyPath
    });

    spinner.succeed('Connected to droplet');

    // Upload project files
    const uploadSpinner = ora('Uploading project files').start();
    const localDir = process.cwd();
    const remoteDir = '/opt/exprsn-platform';

    try {
      await ssh.execCommand(`mkdir -p ${remoteDir}`);

      // Upload files (excluding node_modules, .git, etc.)
      await ssh.putDirectory(localDir, remoteDir, {
        recursive: true,
        concurrency: 5,
        validate: (itemPath) => {
          const basename = path.basename(itemPath);
          return !['node_modules', '.git', '.env', 'logs', 'certs'].includes(basename);
        },
        tick: (localPath, remotePath, error) => {
          if (error) {
            console.error(chalk.red(`Failed to upload ${localPath}: ${error.message}`));
          }
        }
      });

      uploadSpinner.succeed('Project files uploaded');
    } catch (error) {
      uploadSpinner.fail('Failed to upload files');
      throw error;
    }

    // Upload .env file
    const envSpinner = ora('Uploading environment configuration').start();
    const envPath = path.join(localDir, '.env');
    if (fs.existsSync(envPath)) {
      await ssh.putFile(envPath, `${remoteDir}/.env`);
      envSpinner.succeed('Environment configuration uploaded');
    } else {
      envSpinner.warn('.env file not found');
    }

    // Install dependencies
    const depsSpinner = ora('Installing dependencies').start();
    const installResult = await ssh.execCommand('npm install --production', { cwd: remoteDir });
    if (installResult.code === 0) {
      depsSpinner.succeed('Dependencies installed');
    } else {
      depsSpinner.fail('Failed to install dependencies');
      console.error(chalk.red(installResult.stderr));
    }

    // Start application with Docker
    if (config.useDocker) {
      const dockerSpinner = ora('Starting Docker containers').start();
      const dockerResult = await ssh.execCommand('docker-compose up -d', { cwd: remoteDir });
      if (dockerResult.code === 0) {
        dockerSpinner.succeed('Docker containers started');
      } else {
        dockerSpinner.fail('Failed to start Docker containers');
        console.error(chalk.red(dockerResult.stderr));
      }
    } else {
      // Start with PM2 or systemd
      const startSpinner = ora('Starting application').start();

      // Install PM2 globally
      await ssh.execCommand('npm install -g pm2');

      // Start with PM2
      await ssh.execCommand('pm2 stop all', { cwd: remoteDir });
      const startResult = await ssh.execCommand('pm2 start src/index.js --name exprsn-api -i max', { cwd: remoteDir });

      if (startResult.code === 0) {
        // Save PM2 configuration
        await ssh.execCommand('pm2 save');
        await ssh.execCommand('pm2 startup systemd -u root --hp /root');

        startSpinner.succeed('Application started');
      } else {
        startSpinner.fail('Failed to start application');
        console.error(chalk.red(startResult.stderr));
      }
    }

    ssh.dispose();

    return { success: true, host };
  } catch (error) {
    spinner.fail('Deployment failed');
    ssh.dispose();
    throw error;
  }
}

/**
 * Deploy to DigitalOcean
 */
async function deploy(config) {
  console.log(chalk.blue('\n🌊 Deploying to DigitalOcean...\n'));

  if (!config.apiToken) {
    console.error(chalk.red('DigitalOcean API token is required'));
    console.log(chalk.yellow('\nTo deploy to DigitalOcean, you need:'));
    console.log(chalk.yellow('  1. DigitalOcean API token'));
    console.log(chalk.yellow('  2. SSH key uploaded to DigitalOcean'));
    console.log(chalk.yellow('  3. SSH key ID from DigitalOcean\n'));
    console.log(chalk.gray('Get your API token at: https://cloud.digitalocean.com/account/api/tokens'));
    console.log(chalk.gray('Manage SSH keys at: https://cloud.digitalocean.com/account/security\n'));
    return { success: false, error: new Error('API token required') };
  }

  console.log(chalk.yellow('Note: Full DigitalOcean API integration requires the @digitalocean/api package.'));
  console.log(chalk.yellow('Install with: npm install @digitalocean/api\n'));

  try {
    // If we have an existing droplet IP, deploy to it
    if (config.dropletIp) {
      console.log(chalk.blue(`Deploying to existing droplet: ${config.dropletIp}\n`));
      await deployToDroplet(config.dropletIp, config);

      console.log(chalk.green('\n✓ DigitalOcean deployment complete!\n'));
      console.log(chalk.blue('📝 Your application is now running at:'));
      console.log(chalk.cyan(`   http://${config.dropletIp}\n`));

      return { success: true, host: config.dropletIp };
    } else {
      // Instructions for creating a droplet
      console.log(chalk.blue('Droplet Configuration:\n'));
      const dropletConfig = getDropletConfig(config);
      console.log(chalk.gray(JSON.stringify(dropletConfig, null, 2)));

      console.log(chalk.yellow('\n📋 Manual Setup Instructions:\n'));
      console.log(chalk.yellow('1. Create a droplet with the configuration above at:'));
      console.log(chalk.gray('   https://cloud.digitalocean.com/droplets/new\n'));
      console.log(chalk.yellow('2. Once created, deploy with the droplet IP:'));
      console.log(chalk.cyan(`   exprsn-deploy cloud --provider digitalocean --droplet-ip <DROPLET_IP>\n`));

      return { success: true, message: 'Configuration generated. Follow manual setup instructions.' };
    }
  } catch (error) {
    console.error(chalk.red(`\n✖ DigitalOcean deployment failed: ${error.message}\n`));
    return { success: false, error };
  }
}

module.exports = {
  deploy,
  deployToDroplet,
  getDropletConfig,
  getUserData
};
