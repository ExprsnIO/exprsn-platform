const chalk = require('chalk');
const ora = require('ora');
const { NodeSSH } = require('node-ssh');
const fs = require('fs');
const path = require('path');

const ssh = new NodeSSH();

/**
 * Get EC2 instance configuration
 */
function getEC2Config(config) {
  return {
    InstanceType: config.instanceSize || 't3.medium',
    ImageId: 'ami-0c55b159cbfafe1f0', // Ubuntu 22.04 LTS in us-east-1 (update based on region)
    KeyName: config.keyPairName,
    SecurityGroupIds: config.securityGroups || [],
    SubnetId: config.subnetId,
    MinCount: 1,
    MaxCount: 1,
    TagSpecifications: [
      {
        ResourceType: 'instance',
        Tags: [
          { Key: 'Name', Value: config.name || 'exprsn-platform' },
          { Key: 'Environment', Value: config.environment || 'production' },
          { Key: 'ManagedBy', Value: 'exprsn-deploy-cli' }
        ]
      }
    ],
    UserData: Buffer.from(getUserData(config)).toString('base64')
  };
}

/**
 * Generate EC2 user data script
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

# Install AWS CLI
apt-get install -y awscli

# Create application directory
mkdir -p /opt/exprsn-platform
cd /opt/exprsn-platform

# Configure CloudWatch logging
cat > /etc/rsyslog.d/25-exprsn.conf << 'EOL'
if $programname == 'exprsn' then /var/log/exprsn.log
& stop
EOL
systemctl restart rsyslog

echo "EC2 instance setup complete"
`;
}

/**
 * Get security group configuration
 */
function getSecurityGroupConfig(config) {
  return {
    GroupName: config.securityGroupName || 'exprsn-platform-sg',
    Description: 'Security group for Exprsn Platform',
    VpcId: config.vpcId,
    IpPermissions: [
      // SSH
      {
        IpProtocol: 'tcp',
        FromPort: 22,
        ToPort: 22,
        IpRanges: [{ CidrIp: '0.0.0.0/0' }]
      },
      // HTTP
      {
        IpProtocol: 'tcp',
        FromPort: 80,
        ToPort: 80,
        IpRanges: [{ CidrIp: '0.0.0.0/0' }]
      },
      // HTTPS
      {
        IpProtocol: 'tcp',
        FromPort: 443,
        ToPort: 443,
        IpRanges: [{ CidrIp: '0.0.0.0/0' }]
      },
      // API
      {
        IpProtocol: 'tcp',
        FromPort: 3000,
        ToPort: 3000,
        IpRanges: [{ CidrIp: '0.0.0.0/0' }]
      },
      // Socket.io
      {
        IpProtocol: 'tcp',
        FromPort: 3001,
        ToPort: 3001,
        IpRanges: [{ CidrIp: '0.0.0.0/0' }]
      }
    ]
  };
}

/**
 * Deploy application to EC2 instance via SSH
 */
async function deployToEC2(host, config) {
  const spinner = ora('Connecting to EC2 instance via SSH').start();

  try {
    // Expand tilde in SSH key path
    const sshKeyPath = config.sshKeyPath.replace(/^~/, require('os').homedir());

    await ssh.connect({
      host: host,
      username: 'ubuntu', // Default for Ubuntu AMIs
      privateKey: sshKeyPath
    });

    spinner.succeed('Connected to EC2 instance');

    // Upload project files
    const uploadSpinner = ora('Uploading project files').start();
    const localDir = process.cwd();
    const remoteDir = '/opt/exprsn-platform';

    try {
      await ssh.execCommand(`sudo mkdir -p ${remoteDir}`);
      await ssh.execCommand(`sudo chown ubuntu:ubuntu ${remoteDir}`);

      // Upload files
      await ssh.putDirectory(localDir, remoteDir, {
        recursive: true,
        concurrency: 5,
        validate: (itemPath) => {
          const basename = path.basename(itemPath);
          return !['node_modules', '.git', '.env', 'logs', 'certs'].includes(basename);
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

    // Start application
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
      const startSpinner = ora('Starting application with PM2').start();

      await ssh.execCommand('sudo npm install -g pm2');
      await ssh.execCommand('pm2 stop all', { cwd: remoteDir });
      const startResult = await ssh.execCommand('pm2 start src/index.js --name exprsn-api -i max', { cwd: remoteDir });

      if (startResult.code === 0) {
        await ssh.execCommand('pm2 save');
        await ssh.execCommand('sudo pm2 startup systemd -u ubuntu --hp /home/ubuntu');
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
 * Deploy to AWS
 */
async function deploy(config) {
  console.log(chalk.blue('\n☁️  Deploying to AWS...\n'));

  if (!config.accessKeyId || !config.secretAccessKey) {
    console.error(chalk.red('AWS credentials are required'));
    console.log(chalk.yellow('\nTo deploy to AWS, you need:'));
    console.log(chalk.yellow('  1. AWS Access Key ID'));
    console.log(chalk.yellow('  2. AWS Secret Access Key'));
    console.log(chalk.yellow('  3. EC2 Key Pair'));
    console.log(chalk.yellow('  4. VPC and Subnet (optional)\n'));
    console.log(chalk.gray('Get credentials at: https://console.aws.amazon.com/iam/home#/security_credentials'));
    console.log(chalk.gray('Manage EC2 Key Pairs at: https://console.aws.amazon.com/ec2/home#KeyPairs\n'));
    return { success: false, error: new Error('AWS credentials required') };
  }

  console.log(chalk.yellow('Note: Full AWS integration requires the @aws-sdk/client-ec2 package.'));
  console.log(chalk.yellow('Install with: npm install @aws-sdk/client-ec2\n'));

  try {
    // If we have an existing instance IP, deploy to it
    if (config.instanceIp) {
      console.log(chalk.blue(`Deploying to existing EC2 instance: ${config.instanceIp}\n`));
      await deployToEC2(config.instanceIp, config);

      console.log(chalk.green('\n✓ AWS deployment complete!\n'));
      console.log(chalk.blue('📝 Your application is now running at:'));
      console.log(chalk.cyan(`   http://${config.instanceIp}\n`));

      return { success: true, host: config.instanceIp };
    } else {
      // Instructions for creating an EC2 instance
      console.log(chalk.blue('EC2 Instance Configuration:\n'));
      const ec2Config = getEC2Config(config);
      console.log(chalk.gray(JSON.stringify(ec2Config, null, 2)));

      console.log(chalk.blue('\nSecurity Group Configuration:\n'));
      const sgConfig = getSecurityGroupConfig(config);
      console.log(chalk.gray(JSON.stringify(sgConfig, null, 2)));

      console.log(chalk.yellow('\n📋 Manual Setup Instructions:\n'));
      console.log(chalk.yellow('1. Create a security group with the configuration above'));
      console.log(chalk.yellow('2. Launch an EC2 instance with the configuration above at:'));
      console.log(chalk.gray('   https://console.aws.amazon.com/ec2/home#LaunchInstances\n'));
      console.log(chalk.yellow('3. Once running, deploy with the instance public IP:'));
      console.log(chalk.cyan(`   exprsn-deploy cloud --provider aws --instance-ip <PUBLIC_IP>\n`));

      console.log(chalk.blue('Or use AWS CLI:\n'));
      console.log(chalk.gray('  # Create security group'));
      console.log(chalk.gray(`  aws ec2 create-security-group --group-name exprsn-platform-sg --description "Exprsn Platform" ${config.vpcId ? `--vpc-id ${config.vpcId}` : ''}`));
      console.log(chalk.gray('  # Authorize ingress rules'));
      console.log(chalk.gray('  aws ec2 authorize-security-group-ingress --group-name exprsn-platform-sg --protocol tcp --port 22 --cidr 0.0.0.0/0'));
      console.log(chalk.gray('  aws ec2 authorize-security-group-ingress --group-name exprsn-platform-sg --protocol tcp --port 80 --cidr 0.0.0.0/0'));
      console.log(chalk.gray('  aws ec2 authorize-security-group-ingress --group-name exprsn-platform-sg --protocol tcp --port 443 --cidr 0.0.0.0/0\n'));

      return { success: true, message: 'Configuration generated. Follow manual setup instructions.' };
    }
  } catch (error) {
    console.error(chalk.red(`\n✖ AWS deployment failed: ${error.message}\n`));
    return { success: false, error };
  }
}

module.exports = {
  deploy,
  deployToEC2,
  getEC2Config,
  getSecurityGroupConfig,
  getUserData
};
