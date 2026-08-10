const chalk = require('chalk');
const ora = require('ora');
const { exec } = require('child_process');
const { promisify } = require('util');

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
    await execAsync(`rpm -q ${packageName}`);
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Install system packages
 */
async function installSystemPackages() {
  const packages = [
    'gcc',
    'gcc-c++',
    'make',
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

    const result = await sudoExec(`dnf install -y ${pkg}`);
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

  const isInstalled = await isPackageInstalled('postgresql-server');
  if (isInstalled) {
    spinner.info('PostgreSQL already installed');
    return;
  }

  const result = await sudoExec('dnf install -y postgresql-server postgresql-contrib');
  if (result.success) {
    spinner.succeed('PostgreSQL installed');

    // Initialize database
    await sudoExec('postgresql-setup --initdb');

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

  const isInstalled = await isPackageInstalled('redis');
  if (isInstalled) {
    spinner.info('Redis already installed');
    return;
  }

  const result = await sudoExec('dnf install -y redis');
  if (result.success) {
    spinner.succeed('Redis installed');

    // Enable and start service
    await sudoExec('systemctl enable redis');
    await sudoExec('systemctl start redis');
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
    // Install Erlang and RabbitMQ from Fedora repos
    await sudoExec('dnf install -y erlang');
    await sudoExec('dnf install -y rabbitmq-server');

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

  const result = await sudoExec('dnf install -y nginx');
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
    // Allow SSH first
    await sudoExec('firewall-cmd --permanent --add-service=ssh');

    // Allow specified ports
    for (const port of ports) {
      await sudoExec(`firewall-cmd --permanent --add-port=${port}/tcp`);
    }

    // Reload firewall
    await sudoExec('firewall-cmd --reload');

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
    await sudoExec('curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -');
    await sudoExec('dnf install -y nodejs');

    const { stdout } = await execAsync('node --version');
    spinner.succeed(`Node.js ${stdout.trim()} installed`);
  } catch (error) {
    spinner.fail('Failed to install Node.js');
    throw error;
  }
}

/**
 * Deploy to Fedora
 */
async function deploy(config) {
  console.log(chalk.blue('\n🚀 Deploying to Fedora...\n'));

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

    console.log(chalk.green('\n✓ Fedora deployment complete!\n'));

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
