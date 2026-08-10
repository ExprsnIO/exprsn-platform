const chalk = require('chalk');
const ora = require('ora');
const { NodeSSH } = require('node-ssh');
const fs = require('fs');
const path = require('path');

const ssh = new NodeSSH();

/**
 * Get Azure VM configuration
 */
function getVMConfig(config) {
  return {
    location: config.region || 'eastus',
    hardwareProfile: {
      vmSize: config.instanceSize || 'Standard_B2s'
    },
    storageProfile: {
      imageReference: {
        publisher: 'Canonical',
        offer: 'UbuntuServer',
        sku: '22.04-LTS',
        version: 'latest'
      },
      osDisk: {
        name: `${config.name || 'exprsn-platform'}-osdisk`,
        caching: 'ReadWrite',
        createOption: 'FromImage',
        managedDisk: {
          storageAccountType: 'Premium_LRS'
        }
      }
    },
    osProfile: {
      computerName: config.name || 'exprsn-platform',
      adminUsername: 'azureuser',
      linuxConfiguration: {
        disablePasswordAuthentication: true,
        ssh: {
          publicKeys: [
            {
              path: '/home/azureuser/.ssh/authorized_keys',
              keyData: config.sshPublicKey
            }
          ]
        }
      },
      customData: Buffer.from(getUserData(config)).toString('base64')
    },
    networkProfile: {
      networkInterfaces: [
        {
          id: config.networkInterfaceId,
          properties: {
            primary: true
          }
        }
      ]
    },
    tags: {
      Environment: config.environment || 'production',
      ManagedBy: 'exprsn-deploy-cli'
    }
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

# Install Azure CLI
curl -sL https://aka.ms/InstallAzureCLIDeb | bash

# Create application directory
mkdir -p /opt/exprsn-platform
cd /opt/exprsn-platform

echo "Azure VM setup complete"
`;
}

/**
 * Get Network Security Group configuration
 */
function getNSGConfig(config) {
  return {
    location: config.region || 'eastus',
    securityRules: [
      {
        name: 'SSH',
        properties: {
          protocol: 'Tcp',
          sourcePortRange: '*',
          destinationPortRange: '22',
          sourceAddressPrefix: '*',
          destinationAddressPrefix: '*',
          access: 'Allow',
          priority: 1000,
          direction: 'Inbound'
        }
      },
      {
        name: 'HTTP',
        properties: {
          protocol: 'Tcp',
          sourcePortRange: '*',
          destinationPortRange: '80',
          sourceAddressPrefix: '*',
          destinationAddressPrefix: '*',
          access: 'Allow',
          priority: 1001,
          direction: 'Inbound'
        }
      },
      {
        name: 'HTTPS',
        properties: {
          protocol: 'Tcp',
          sourcePortRange: '*',
          destinationPortRange: '443',
          sourceAddressPrefix: '*',
          destinationAddressPrefix: '*',
          access: 'Allow',
          priority: 1002,
          direction: 'Inbound'
        }
      },
      {
        name: 'API',
        properties: {
          protocol: 'Tcp',
          sourcePortRange: '*',
          destinationPortRange: '3000',
          sourceAddressPrefix: '*',
          destinationAddressPrefix: '*',
          access: 'Allow',
          priority: 1003,
          direction: 'Inbound'
        }
      },
      {
        name: 'Socket',
        properties: {
          protocol: 'Tcp',
          sourcePortRange: '*',
          destinationPortRange: '3001',
          sourceAddressPrefix: '*',
          destinationAddressPrefix: '*',
          access: 'Allow',
          priority: 1004,
          direction: 'Inbound'
        }
      }
    ]
  };
}

/**
 * Deploy application to Azure VM via SSH
 */
async function deployToVM(host, config) {
  const spinner = ora('Connecting to Azure VM via SSH').start();

  try {
    // Expand tilde in SSH key path
    const sshKeyPath = config.sshKeyPath.replace(/^~/, require('os').homedir());

    await ssh.connect({
      host: host,
      username: 'azureuser', // Default for Azure VMs
      privateKey: sshKeyPath
    });

    spinner.succeed('Connected to Azure VM');

    // Upload project files
    const uploadSpinner = ora('Uploading project files').start();
    const localDir = process.cwd();
    const remoteDir = '/opt/exprsn-platform';

    try {
      await ssh.execCommand(`sudo mkdir -p ${remoteDir}`);
      await ssh.execCommand(`sudo chown azureuser:azureuser ${remoteDir}`);

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
        await ssh.execCommand('sudo pm2 startup systemd -u azureuser --hp /home/azureuser');
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
 * Deploy to Azure
 */
async function deploy(config) {
  console.log(chalk.blue('\n☁️  Deploying to Azure...\n'));

  if (!config.subscriptionId || !config.clientId || !config.clientSecret || !config.tenantId) {
    console.error(chalk.red('Azure credentials are required'));
    console.log(chalk.yellow('\nTo deploy to Azure, you need:'));
    console.log(chalk.yellow('  1. Azure Subscription ID'));
    console.log(chalk.yellow('  2. Service Principal (Client ID, Client Secret, Tenant ID)'));
    console.log(chalk.yellow('  3. SSH key pair'));
    console.log(chalk.yellow('  4. Resource Group\n'));
    console.log(chalk.gray('Get credentials at: https://portal.azure.com'));
    console.log(chalk.gray('Create Service Principal: az ad sp create-for-rbac --name exprsn-platform-sp\n'));
    return { success: false, error: new Error('Azure credentials required') };
  }

  console.log(chalk.yellow('Note: Full Azure integration requires the @azure/arm-compute package.'));
  console.log(chalk.yellow('Install with: npm install @azure/arm-compute @azure/identity\n'));

  try {
    // If we have an existing VM IP, deploy to it
    if (config.vmIp) {
      console.log(chalk.blue(`Deploying to existing Azure VM: ${config.vmIp}\n`));
      await deployToVM(config.vmIp, config);

      console.log(chalk.green('\n✓ Azure deployment complete!\n'));
      console.log(chalk.blue('📝 Your application is now running at:'));
      console.log(chalk.cyan(`   http://${config.vmIp}\n`));

      return { success: true, host: config.vmIp };
    } else {
      // Instructions for creating an Azure VM
      console.log(chalk.blue('Azure VM Configuration:\n'));
      const vmConfig = getVMConfig(config);
      console.log(chalk.gray(JSON.stringify(vmConfig, null, 2)));

      console.log(chalk.blue('\nNetwork Security Group Configuration:\n'));
      const nsgConfig = getNSGConfig(config);
      console.log(chalk.gray(JSON.stringify(nsgConfig, null, 2)));

      console.log(chalk.yellow('\n📋 Manual Setup Instructions:\n'));
      console.log(chalk.yellow('1. Create a resource group:'));
      console.log(chalk.cyan(`   az group create --name ${config.resourceGroup} --location ${config.region || 'eastus'}\n`));

      console.log(chalk.yellow('2. Create a virtual network:'));
      console.log(chalk.cyan(`   az network vnet create --resource-group ${config.resourceGroup} --name exprsn-vnet --subnet-name exprsn-subnet\n`));

      console.log(chalk.yellow('3. Create a network security group:'));
      console.log(chalk.cyan(`   az network nsg create --resource-group ${config.resourceGroup} --name exprsn-nsg\n`));

      console.log(chalk.yellow('4. Add security rules:'));
      console.log(chalk.cyan(`   az network nsg rule create --resource-group ${config.resourceGroup} --nsg-name exprsn-nsg --name SSH --priority 1000 --destination-port-ranges 22 --access Allow --protocol Tcp`));
      console.log(chalk.cyan(`   az network nsg rule create --resource-group ${config.resourceGroup} --nsg-name exprsn-nsg --name HTTP --priority 1001 --destination-port-ranges 80 --access Allow --protocol Tcp`));
      console.log(chalk.cyan(`   az network nsg rule create --resource-group ${config.resourceGroup} --nsg-name exprsn-nsg --name HTTPS --priority 1002 --destination-port-ranges 443 --access Allow --protocol Tcp\n`));

      console.log(chalk.yellow('5. Create a public IP:'));
      console.log(chalk.cyan(`   az network public-ip create --resource-group ${config.resourceGroup} --name exprsn-public-ip\n`));

      console.log(chalk.yellow('6. Create a network interface:'));
      console.log(chalk.cyan(`   az network nic create --resource-group ${config.resourceGroup} --name exprsn-nic --vnet-name exprsn-vnet --subnet exprsn-subnet --public-ip-address exprsn-public-ip --network-security-group exprsn-nsg\n`));

      console.log(chalk.yellow('7. Create the VM:'));
      console.log(chalk.cyan(`   az vm create --resource-group ${config.resourceGroup} --name exprsn-platform --nics exprsn-nic --image UbuntuLTS --size ${config.instanceSize || 'Standard_B2s'} --admin-username azureuser --ssh-key-values @~/.ssh/id_rsa.pub\n`));

      console.log(chalk.yellow('8. Get the public IP:'));
      console.log(chalk.cyan(`   az network public-ip show --resource-group ${config.resourceGroup} --name exprsn-public-ip --query ipAddress -o tsv\n`));

      console.log(chalk.yellow('9. Deploy with the VM IP:'));
      console.log(chalk.cyan(`   exprsn-deploy cloud --provider azure --vm-ip <PUBLIC_IP>\n`));

      return { success: true, message: 'Configuration generated. Follow manual setup instructions.' };
    }
  } catch (error) {
    console.error(chalk.red(`\n✖ Azure deployment failed: ${error.message}\n`));
    return { success: false, error };
  }
}

module.exports = {
  deploy,
  deployToVM,
  getVMConfig,
  getNSGConfig,
  getUserData
};
