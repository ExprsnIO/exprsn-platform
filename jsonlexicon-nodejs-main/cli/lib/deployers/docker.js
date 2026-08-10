const chalk = require('chalk');
const ora = require('ora');
const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');

const execAsync = promisify(exec);

/**
 * Check if Docker is installed and running
 */
async function checkDocker() {
  const spinner = ora('Checking Docker installation').start();

  try {
    await execAsync('docker --version');
    spinner.succeed('Docker is installed');
  } catch (error) {
    spinner.fail('Docker is not installed');
    throw new Error('Docker is required for container deployment');
  }

  try {
    await execAsync('docker ps');
    spinner.succeed('Docker is running');
  } catch (error) {
    spinner.fail('Docker is not running');
    throw new Error('Please start Docker and try again');
  }
}

/**
 * Check if Docker Compose is installed
 */
async function checkDockerCompose() {
  const spinner = ora('Checking Docker Compose').start();

  try {
    await execAsync('docker-compose --version');
    spinner.succeed('Docker Compose is installed');
    return true;
  } catch (error) {
    // Try docker compose (v2)
    try {
      await execAsync('docker compose version');
      spinner.succeed('Docker Compose V2 is installed');
      return true;
    } catch (error2) {
      spinner.fail('Docker Compose is not installed');
      throw new Error('Docker Compose is required for container deployment');
    }
  }
}

/**
 * Get Docker Compose command
 */
async function getDockerComposeCommand() {
  try {
    await execAsync('docker-compose --version');
    return 'docker-compose';
  } catch (error) {
    return 'docker compose';
  }
}

/**
 * Build Docker images
 */
async function buildImages(rebuild = false) {
  const spinner = ora('Building Docker images').start();

  try {
    const composeCmd = await getDockerComposeCommand();
    const buildCmd = rebuild ? `${composeCmd} build --no-cache` : `${composeCmd} build`;

    const { stdout, stderr } = await execAsync(buildCmd, {
      maxBuffer: 1024 * 1024 * 10 // 10MB buffer for build output
    });

    spinner.succeed('Docker images built successfully');

    if (stderr && !stderr.includes('DEPRECATED')) {
      console.log(chalk.gray(stderr));
    }

    return { success: true };
  } catch (error) {
    spinner.fail('Failed to build Docker images');
    console.error(chalk.red(error.message));
    return { success: false, error };
  }
}

/**
 * Start containers
 */
async function startContainers(detached = true) {
  const spinner = ora('Starting containers').start();

  try {
    const composeCmd = await getDockerComposeCommand();
    const upCmd = detached ? `${composeCmd} up -d` : `${composeCmd} up`;

    await execAsync(upCmd);

    spinner.succeed('Containers started');

    // Wait a moment for containers to fully start
    await new Promise(resolve => setTimeout(resolve, 2000));

    return { success: true };
  } catch (error) {
    spinner.fail('Failed to start containers');
    console.error(chalk.red(error.message));
    return { success: false, error };
  }
}

/**
 * Stop containers
 */
async function stopContainers() {
  const spinner = ora('Stopping containers').start();

  try {
    const composeCmd = await getDockerComposeCommand();
    await execAsync(`${composeCmd} down`);

    spinner.succeed('Containers stopped');
    return { success: true };
  } catch (error) {
    spinner.fail('Failed to stop containers');
    console.error(chalk.red(error.message));
    return { success: false, error };
  }
}

/**
 * Restart containers
 */
async function restartContainers() {
  const spinner = ora('Restarting containers').start();

  try {
    const composeCmd = await getDockerComposeCommand();
    await execAsync(`${composeCmd} restart`);

    spinner.succeed('Containers restarted');
    return { success: true };
  } catch (error) {
    spinner.fail('Failed to restart containers');
    console.error(chalk.red(error.message));
    return { success: false, error };
  }
}

/**
 * Show container logs
 */
async function showLogs(follow = false) {
  console.log(chalk.blue('\n📋 Container Logs:\n'));

  try {
    const composeCmd = await getDockerComposeCommand();
    const logsCmd = follow ? `${composeCmd} logs -f` : `${composeCmd} logs --tail=50`;

    if (follow) {
      // For follow mode, spawn a child process that outputs directly
      const { spawn } = require('child_process');
      const [cmd, ...args] = logsCmd.split(' ');
      const logsProcess = spawn(cmd, args, { stdio: 'inherit' });

      logsProcess.on('exit', (code) => {
        console.log(chalk.gray(`\nLogs exited with code ${code}`));
      });
    } else {
      const { stdout } = await execAsync(logsCmd, {
        maxBuffer: 1024 * 1024 * 5 // 5MB buffer for logs
      });
      console.log(stdout);
    }
  } catch (error) {
    console.error(chalk.red('Failed to retrieve logs:'), error.message);
  }
}

/**
 * Check container status
 */
async function checkStatus() {
  console.log(chalk.blue('\n📊 Container Status:\n'));

  try {
    const composeCmd = await getDockerComposeCommand();
    const { stdout } = await execAsync(`${composeCmd} ps`);
    console.log(stdout);

    return { success: true };
  } catch (error) {
    console.error(chalk.red('Failed to get container status:'), error.message);
    return { success: false, error };
  }
}

/**
 * Run database migrations
 */
async function runMigrations() {
  const spinner = ora('Running database migrations').start();

  try {
    const composeCmd = await getDockerComposeCommand();
    await execAsync(`${composeCmd} exec -T api npm run migrate`);

    spinner.succeed('Database migrations complete');
    return { success: true };
  } catch (error) {
    spinner.fail('Failed to run migrations');
    console.error(chalk.red(error.message));
    return { success: false, error };
  }
}

/**
 * Generate SSL certificates in container
 */
async function generateCertificates() {
  const spinner = ora('Generating SSL certificates').start();

  try {
    const composeCmd = await getDockerComposeCommand();
    await execAsync(`${composeCmd} exec -T api npm run cert:generate`);

    spinner.succeed('SSL certificates generated');
    return { success: true };
  } catch (error) {
    spinner.fail('Failed to generate certificates');
    console.error(chalk.red(error.message));
    return { success: false, error };
  }
}

/**
 * Deploy using Docker
 */
async function deploy(config) {
  console.log(chalk.blue('\n🐳 Deploying with Docker...\n'));

  try {
    // Check Docker
    await checkDocker();
    await checkDockerCompose();

    // Handle different modes
    const mode = config.mode || 'up';

    switch (mode) {
      case 'up':
        if (config.rebuild) {
          await buildImages(true);
        } else {
          await buildImages(false);
        }
        await startContainers(true);

        // Run migrations if requested
        if (config.migrate) {
          await new Promise(resolve => setTimeout(resolve, 5000)); // Wait for DB to be ready
          await runMigrations();
        }

        // Generate certs if requested
        if (config.ssl) {
          await generateCertificates();
        }

        // Show status
        await checkStatus();

        // Show logs if requested
        if (config.logs) {
          await showLogs(true);
        }
        break;

      case 'down':
        await stopContainers();
        break;

      case 'restart':
        await restartContainers();
        break;

      case 'rebuild':
        await stopContainers();
        await buildImages(true);
        await startContainers(true);
        await checkStatus();
        break;

      case 'logs':
        await showLogs(config.follow);
        break;

      case 'status':
        await checkStatus();
        break;

      default:
        throw new Error(`Unknown mode: ${mode}`);
    }

    console.log(chalk.green('\n✓ Docker deployment complete!\n'));

    if (mode === 'up' && !config.logs) {
      console.log(chalk.blue('📝 Next steps:'));
      console.log(chalk.gray('  - View logs: npm run docker:logs'));
      console.log(chalk.gray('  - Check status: exprsn-deploy status'));
      console.log(chalk.gray('  - API available at: http://localhost:3000'));
      console.log(chalk.gray('  - Socket.io available at: http://localhost:3001'));
      console.log(chalk.gray('  - RabbitMQ management: http://localhost:15672\n'));
    }

    return { success: true };
  } catch (error) {
    console.error(chalk.red(`\n✖ Docker deployment failed: ${error.message}\n`));
    return { success: false, error };
  }
}

module.exports = {
  deploy,
  checkDocker,
  checkDockerCompose,
  buildImages,
  startContainers,
  stopContainers,
  restartContainers,
  showLogs,
  checkStatus,
  runMigrations,
  generateCertificates
};
