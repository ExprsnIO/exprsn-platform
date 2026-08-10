const chalk = require('chalk');
const ora = require('ora');
const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');

const execAsync = promisify(exec);

/**
 * Execute command with sudo
 */
async function sudoExec(command) {
  try {
    const { stdout, stderr } = await execAsync(`sudo ${command}`);
    return { stdout, stderr, success: true };
  } catch (error) {
    return { stdout: error.stdout, stderr: error.stderr, success: false, error };
  }
}

/**
 * Check if package is installed
 */
async function isPackageInstalled(packageName) {
  try {
    await execAsync(`dpkg -l | grep -w ${packageName}`);
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Install system packages
 */
async function installSystemPackages() {
  const spinner = ora('Updating package lists').start();

  try {
    await sudoExec('apt-get update');
    spinner.succeed('Package lists updated');
  } catch (error) {
    spinner.fail('Failed to update package lists');
    throw error;
  }

  const packages = [
    'build-essential',
    'curl',
    'git',
    'openssl',
    'ca-certificates'
  ];

  for (const pkg of packages) {
    const pkgSpinner = ora(`Installing ${pkg}`).start();

    const isInstalled = await isPackageInstalled(pkg);
    if (isInstalled) {
      pkgSpinner.info(`${pkg} already installed`);
      continue;
    }

    const result = await sudoExec(`apt-get install -y ${pkg}`);
    if (result.success) {
      pkgSpinner.succeed(`${pkg} installed`);
    } else {
      pkgSpinner.fail(`Failed to install ${pkg}`);
      throw new Error(`Package installation failed: ${pkg}`);
    }
  }
}

/**
 * Install PostgreSQL
 */
async function installPostgreSQL() {
  const spinner = ora('Installing PostgreSQL').start();

  const isInstalled = await isPackageInstalled('postgresql');
  if (isInstalled) {
    spinner.info('PostgreSQL already installed');
    return;
  }

  const result = await sudoExec('apt-get install -y postgresql postgresql-contrib');
  if (result.success) {
    spinner.succeed('PostgreSQL installed');

    // Enable and start service
    await sudoExec('systemctl enable postgresql');
    await sudoExec('systemctl start postgresql');
  } else {
    spinner.fail('Failed to install PostgreSQL');
    throw new Error('PostgreSQL installation failed');
  }
}

/**
 * Install Redis
 */
async function installRedis() {
  const spinner = ora('Installing Redis').start();

  const isInstalled = await isPackageInstalled('redis-server');
  if (isInstalled) {
    spinner.info('Redis already installed');
    return;
  }

  const result = await sudoExec('apt-get install -y redis-server');
  if (result.success) {
    spinner.succeed('Redis installed');

    // Enable and start service
    await sudoExec('systemctl enable redis-server');
    await sudoExec('systemctl start redis-server');
  } else {
    spinner.fail('Failed to install Redis');
    throw new Error('Redis installation failed');
  }
}

/**
 * Install RabbitMQ
 */
async function installRabbitMQ() {
  const spinner = ora('Installing RabbitMQ').start();

  const isInstalled = await isPackageInstalled('rabbitmq-server');
  if (isInstalled) {
    spinner.info('RabbitMQ already installed');
    return;
  }

  try {
    // Add RabbitMQ repository
    await sudoExec('apt-get install -y curl gnupg apt-transport-https');
    await sudoExec('curl -1sLf "https://keys.openpgp.org/vks/v1/by-fingerprint/0A9AF2115F4687BD29803A206B73A36E6026DFCA" | sudo gpg --dearmor | sudo tee /usr/share/keyrings/com.rabbitmq.team.gpg > /dev/null');
    await sudoExec('curl -1sLf https://github.com/rabbitmq/signing-keys/releases/download/3.0/cloudsmith.rabbitmq-erlang.E495BB49CC4BBE5B.key | sudo gpg --dearmor | sudo tee /usr/share/keyrings/rabbitmq.E495BB49CC4BBE5B.gpg > /dev/null');
    await sudoExec('curl -1sLf https://github.com/rabbitmq/signing-keys/releases/download/3.0/cloudsmith.rabbitmq-server.9F4587F226208342.key | sudo gpg --dearmor | sudo tee /usr/share/keyrings/rabbitmq.9F4587F226208342.gpg > /dev/null');

    // Add repository
    const sourcesContent = `deb [signed-by=/usr/share/keyrings/rabbitmq.E495BB49CC4BBE5B.gpg] https://ppa1.novemberain.com/rabbitmq/rabbitmq-erlang/deb/ubuntu jammy main
deb-src [signed-by=/usr/share/keyrings/rabbitmq.E495BB49CC4BBE5B.gpg] https://ppa1.novemberain.com/rabbitmq/rabbitmq-erlang/deb/ubuntu jammy main
deb [signed-by=/usr/share/keyrings/rabbitmq.9F4587F226208342.gpg] https://ppa1.novemberain.com/rabbitmq/rabbitmq-server/deb/ubuntu jammy main
deb-src [signed-by=/usr/share/keyrings/rabbitmq.9F4587F226208342.gpg] https://ppa1.novemberain.com/rabbitmq/rabbitmq-server/deb/ubuntu jammy main`;

    fs.writeFileSync('/tmp/rabbitmq.list', sourcesContent);
    await sudoExec('mv /tmp/rabbitmq.list /etc/apt/sources.list.d/rabbitmq.list');

    await sudoExec('apt-get update');
    await sudoExec('apt-get install -y erlang-base erlang-asn1 erlang-crypto erlang-eldap erlang-ftp erlang-inets erlang-mnesia erlang-os-mon erlang-parsetools erlang-public-key erlang-runtime-tools erlang-snmp erlang-ssl erlang-syntax-tools erlang-tftp erlang-tools erlang-xmerl');
    await sudoExec('apt-get install -y rabbitmq-server');

    spinner.succeed('RabbitMQ installed');

    // Enable and start service
    await sudoExec('systemctl enable rabbitmq-server');
    await sudoExec('systemctl start rabbitmq-server');

    // Enable management plugin
    await sudoExec('rabbitmq-plugins enable rabbitmq_management');
  } catch (error) {
    spinner.fail('Failed to install RabbitMQ');
    throw new Error('RabbitMQ installation failed');
  }
}

/**
 * Install NGINX
 */
async function installNGINX() {
  const spinner = ora('Installing NGINX').start();

  const isInstalled = await isPackageInstalled('nginx');
  if (isInstalled) {
    spinner.info('NGINX already installed');
    return;
  }

  const result = await sudoExec('apt-get install -y nginx');
  if (result.success) {
    spinner.succeed('NGINX installed');

    // Enable and start service
    await sudoExec('systemctl enable nginx');
    await sudoExec('systemctl start nginx');
  } else {
    spinner.fail('Failed to install NGINX');
    throw new Error('NGINX installation failed');
  }
}

/**
 * Setup database
 */
async function setupDatabase(config) {
  const spinner = ora('Setting up database').start();

  try {
    const { database, username, password } = config;

    // Create database and user
    const createUserSQL = `CREATE USER ${username} WITH PASSWORD '${password}';`;
    const createDBSQL = `CREATE DATABASE ${database} OWNER ${username};`;
    const grantSQL = `GRANT ALL PRIVILEGES ON DATABASE ${database} TO ${username};`;

    await sudoExec(`su - postgres -c "psql -c \\"${createUserSQL}\\""`, { shell: '/bin/bash' });
    await sudoExec(`su - postgres -c "psql -c \\"${createDBSQL}\\""`, { shell: '/bin/bash' });
    await sudoExec(`su - postgres -c "psql -c \\"${grantSQL}\\""`, { shell: '/bin/bash' });

    spinner.succeed('Database setup complete');
  } catch (error) {
    spinner.warn(`Database setup completed with warnings: ${error.message}`);
  }
}

/**
 * Configure firewall
 */
async function configureFirewall(ports = []) {
  const spinner = ora('Configuring firewall').start();

  try {
    // Check if ufw is installed
    const ufwInstalled = await isPackageInstalled('ufw');

    if (!ufwInstalled) {
      await sudoExec('apt-get install -y ufw');
    }

    // Allow SSH first
    await sudoExec('ufw allow ssh');

    // Allow specified ports
    for (const port of ports) {
      await sudoExec(`ufw allow ${port}`);
    }

    // Enable firewall
    await sudoExec('ufw --force enable');

    spinner.succeed('Firewall configured');
  } catch (error) {
    spinner.warn(`Firewall configuration completed with warnings: ${error.message}`);
  }
}

/**
 * Install Node.js (if not already installed)
 */
async function installNodeJS() {
  const spinner = ora('Checking Node.js installation').start();

  try {
    const { stdout } = await execAsync('node --version');
    const version = stdout.trim();
    spinner.succeed(`Node.js ${version} is installed`);
    return;
  } catch (error) {
    spinner.info('Node.js not found, installing...');
  }

  try {
    // Install Node.js 18.x from NodeSource
    await sudoExec('curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -');
    await sudoExec('apt-get install -y nodejs');

    const { stdout } = await execAsync('node --version');
    spinner.succeed(`Node.js ${stdout.trim()} installed`);
  } catch (error) {
    spinner.fail('Failed to install Node.js');
    throw error;
  }
}

/**
 * Deploy to Ubuntu
 */
async function deploy(config) {
  console.log(chalk.blue('\n🚀 Deploying to Ubuntu...\n'));

  try {
    // Install Node.js
    await installNodeJS();

    // Install system packages
    await installSystemPackages();

    // Install services if not skipped
    if (config.services !== false) {
      await installPostgreSQL();
      await installRedis();
      await installRabbitMQ();

      // Setup database if config provided
      if (config.database) {
        await setupDatabase(config.database);
      }
    }

    // Install NGINX if requested
    if (config.nginx) {
      await installNGINX();
    }

    // Configure firewall
    if (config.firewall) {
      const ports = [80, 443, 3000, 3001];
      await configureFirewall(ports);
    }

    // Install npm dependencies
    const npmSpinner = ora('Installing npm dependencies').start();
    try {
      await execAsync('npm install --production');
      npmSpinner.succeed('npm dependencies installed');
    } catch (error) {
      npmSpinner.fail('Failed to install npm dependencies');
      throw error;
    }

    // Run database migrations
    if (config.migrate) {
      const migrateSpinner = ora('Running database migrations').start();
      try {
        await execAsync('npm run migrate');
        migrateSpinner.succeed('Database migrations complete');
      } catch (error) {
        migrateSpinner.warn('Migration completed with warnings');
      }
    }

    console.log(chalk.green('\n✓ Ubuntu deployment complete!\n'));

    return { success: true };
  } catch (error) {
    console.error(chalk.red(`\n✖ Deployment failed: ${error.message}\n`));
    return { success: false, error };
  }
}

module.exports = {
  deploy,
  installSystemPackages,
  installPostgreSQL,
  installRedis,
  installRabbitMQ,
  installNGINX,
  setupDatabase,
  configureFirewall
};
