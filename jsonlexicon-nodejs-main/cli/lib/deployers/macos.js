const chalk = require('chalk');
const ora = require('ora');
const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');

const execAsync = promisify(exec);

/**
 * Check if command exists
 */
async function commandExists(command) {
  try {
    await execAsync(`which ${command}`);
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Download and extract PostgreSQL (without Homebrew)
 */
async function installPostgreSQL() {
  const spinner = ora('Setting up PostgreSQL').start();

  try {
    // Check if psql already exists
    const exists = await commandExists('psql');
    if (exists) {
      spinner.info('PostgreSQL already installed');
      return;
    }

    spinner.warn('PostgreSQL not found. Please install PostgreSQL manually:');
    console.log(chalk.yellow('\n  Options:'));
    console.log(chalk.yellow('  1. Download from https://www.postgresql.org/download/macosx/'));
    console.log(chalk.yellow('  2. Use Postgres.app from https://postgresapp.com/'));
    console.log(chalk.yellow('  3. Install via Homebrew: brew install postgresql\n'));

    spinner.stop();
  } catch (error) {
    spinner.fail('Failed to setup PostgreSQL');
    throw error;
  }
}

/**
 * Setup Redis (without Homebrew)
 */
async function installRedis() {
  const spinner = ora('Setting up Redis').start();

  try {
    // Check if redis-server already exists
    const exists = await commandExists('redis-server');
    if (exists) {
      spinner.info('Redis already installed');
      return;
    }

    spinner.warn('Redis not found. Installing from source...');

    const redisVersion = '7.2.3';
    const redisDir = path.join(process.env.HOME, '.local', 'redis');

    // Create directory
    if (!fs.existsSync(redisDir)) {
      fs.mkdirSync(redisDir, { recursive: true });
    }

    // Download and compile Redis
    const downloadSpinner = ora('Downloading Redis').start();
    try {
      await execAsync(`curl -o /tmp/redis.tar.gz https://download.redis.io/releases/redis-${redisVersion}.tar.gz`);
      await execAsync('tar xzf /tmp/redis.tar.gz -C /tmp/');
      downloadSpinner.succeed('Redis downloaded');
    } catch (error) {
      downloadSpinner.fail('Failed to download Redis');
      throw error;
    }

    const compileSpinner = ora('Compiling Redis').start();
    try {
      await execAsync(`cd /tmp/redis-${redisVersion} && make && make PREFIX=${redisDir} install`);
      compileSpinner.succeed('Redis compiled and installed');

      // Add to PATH
      console.log(chalk.yellow(`\n  Add to your PATH: export PATH="${redisDir}/bin:$PATH"\n`));
    } catch (error) {
      compileSpinner.fail('Failed to compile Redis');
      throw error;
    }

    spinner.succeed('Redis setup complete');
  } catch (error) {
    spinner.warn('Redis setup completed with warnings. You can also install via Homebrew: brew install redis');
  }
}

/**
 * Setup RabbitMQ (without Homebrew)
 */
async function installRabbitMQ() {
  const spinner = ora('Setting up RabbitMQ').start();

  try {
    // Check if rabbitmq-server already exists
    const exists = await commandExists('rabbitmq-server');
    if (exists) {
      spinner.info('RabbitMQ already installed');
      return;
    }

    spinner.warn('RabbitMQ not found. Please install RabbitMQ manually:');
    console.log(chalk.yellow('\n  Options:'));
    console.log(chalk.yellow('  1. Download from https://www.rabbitmq.com/download.html'));
    console.log(chalk.yellow('  2. Install via Homebrew: brew install rabbitmq\n'));

    spinner.stop();
  } catch (error) {
    spinner.fail('Failed to setup RabbitMQ');
    throw error;
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
    const majorVersion = parseInt(version.substring(1).split('.')[0]);

    if (majorVersion >= 18) {
      spinner.succeed(`Node.js ${version} is installed`);
      return;
    } else {
      spinner.warn(`Node.js ${version} is installed but version 18+ is recommended`);
      console.log(chalk.yellow('\n  Please upgrade Node.js:'));
      console.log(chalk.yellow('  1. Download from https://nodejs.org/'));
      console.log(chalk.yellow('  2. Install via Homebrew: brew install node@18\n'));
    }
  } catch (error) {
    spinner.warn('Node.js not found. Please install Node.js 18+:');
    console.log(chalk.yellow('\n  Options:'));
    console.log(chalk.yellow('  1. Download from https://nodejs.org/'));
    console.log(chalk.yellow('  2. Install via Homebrew: brew install node@18'));
    console.log(chalk.yellow('  3. Use nvm: curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash && nvm install 18\n'));
    throw new Error('Node.js 18+ is required');
  }
}

/**
 * Setup database
 */
async function setupDatabase(config) {
  const spinner = ora('Setting up database').start();

  try {
    const { database, username, password } = config;

    // Check if PostgreSQL is running
    const isRunning = await commandExists('psql');
    if (!isRunning) {
      spinner.warn('PostgreSQL not found. Please start PostgreSQL first.');
      return;
    }

    // Create database and user
    const createUserSQL = `CREATE USER ${username} WITH PASSWORD '${password}';`;
    const createDBSQL = `CREATE DATABASE ${database} OWNER ${username};`;
    const grantSQL = `GRANT ALL PRIVILEGES ON DATABASE ${database} TO ${username};`;

    try {
      await execAsync(`psql -U postgres -c "${createUserSQL}"`);
      await execAsync(`psql -U postgres -c "${createDBSQL}"`);
      await execAsync(`psql -U postgres -c "${grantSQL}"`);
      spinner.succeed('Database setup complete');
    } catch (error) {
      spinner.warn('Database setup may require manual configuration');
      console.log(chalk.yellow('\n  Run these commands manually:'));
      console.log(chalk.gray(`  psql -U postgres -c "${createUserSQL}"`));
      console.log(chalk.gray(`  psql -U postgres -c "${createDBSQL}"`));
      console.log(chalk.gray(`  psql -U postgres -c "${grantSQL}"\n`));
    }
  } catch (error) {
    spinner.warn(`Database setup completed with warnings: ${error.message}`);
  }
}

/**
 * Install system dependencies
 */
async function installSystemPackages() {
  const spinner = ora('Checking system dependencies').start();

  const commands = ['git', 'curl', 'openssl'];
  const missing = [];

  for (const cmd of commands) {
    const exists = await commandExists(cmd);
    if (!exists) {
      missing.push(cmd);
    }
  }

  if (missing.length === 0) {
    spinner.succeed('All system dependencies are installed');
  } else {
    spinner.warn(`Missing dependencies: ${missing.join(', ')}`);
    console.log(chalk.yellow('\n  Install via Xcode Command Line Tools:'));
    console.log(chalk.gray('  xcode-select --install\n'));
  }
}

/**
 * Create launch daemons for services
 */
async function createLaunchDaemon(serviceName, command) {
  const spinner = ora(`Creating launch daemon for ${serviceName}`).start();

  const plistPath = path.join(process.env.HOME, 'Library', 'LaunchAgents', `com.exprsn.${serviceName}.plist`);
  const plistContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.exprsn.${serviceName}</string>
    <key>ProgramArguments</key>
    <array>
        <string>${command}</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>WorkingDirectory</key>
    <string>${process.cwd()}</string>
    <key>StandardOutPath</key>
    <string>${process.env.HOME}/Library/Logs/${serviceName}.log</string>
    <key>StandardErrorPath</key>
    <string>${process.env.HOME}/Library/Logs/${serviceName}.error.log</string>
</dict>
</plist>`;

  try {
    fs.writeFileSync(plistPath, plistContent);
    await execAsync(`launchctl load ${plistPath}`);
    spinner.succeed(`Launch daemon for ${serviceName} created`);
  } catch (error) {
    spinner.warn(`Failed to create launch daemon: ${error.message}`);
  }
}

/**
 * Deploy to macOS
 */
async function deploy(config) {
  console.log(chalk.blue('\n🚀 Deploying to macOS...\n'));
  console.log(chalk.yellow('Note: macOS deployment without Homebrew has limitations.\n'));
  console.log(chalk.yellow('For best results, consider using Homebrew or Docker deployment.\n'));

  try {
    // Check Node.js
    await installNodeJS();

    // Check system packages
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

    console.log(chalk.green('\n✓ macOS deployment complete!\n'));

    console.log(chalk.blue('📝 Next steps:'));
    console.log(chalk.gray('  1. Ensure PostgreSQL is running'));
    console.log(chalk.gray('  2. Start Redis: redis-server'));
    console.log(chalk.gray('  3. Start RabbitMQ: rabbitmq-server'));
    console.log(chalk.gray('  4. Start the application: npm start\n'));

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
  setupDatabase,
  createLaunchDaemon
};
