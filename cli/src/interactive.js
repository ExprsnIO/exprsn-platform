/**
 * Interactive Mode - Main Menu System
 */

const inquirer = require('inquirer');
const chalk = require('chalk');
const boxen = require('boxen');
const { logger } = require('./utils/logger');

// Import menu modules
const ServicesMenu = require('./menus/services');
const CAMenu = require('./menus/ca');
const UsersMenu = require('./menus/users');
const ConfigMenu = require('./menus/config');
const SystemMenu = require('./menus/system');
const InstallMenu = require('./menus/install');
const MonitorMenu = require('./menus/monitor');

class InteractiveMode {
  constructor() {
    this.menus = {
      services: new ServicesMenu(),
      ca: new CAMenu(),
      users: new UsersMenu(),
      config: new ConfigMenu(),
      system: new SystemMenu(),
      install: new InstallMenu(),
      monitor: new MonitorMenu()
    };
  }

  /**
   * Display welcome message
   */
  showWelcome() {
    const welcome = boxen(
      chalk.white.bold('Welcome to Exprsn CLI\n\n') +
      chalk.gray('Manage your Certificate Authority ecosystem with ease.\n') +
      chalk.gray('Use arrow keys to navigate, Enter to select, Ctrl+C to exit.'),
      {
        padding: 1,
        margin: 1,
        borderStyle: 'round',
        borderColor: 'cyan'
      }
    );
    console.log(welcome);
  }

  /**
   * Main menu
   */
  async showMainMenu() {
    const choices = [
      { name: chalk.cyan('🚀 Service Management'), value: 'services', description: 'Start, stop, and configure services' },
      { name: chalk.green('🔐 Certificate Authority'), value: 'ca', description: 'Manage certificates, tokens, and OCSP' },
      { name: chalk.blue('👥 Users & Access'), value: 'users', description: 'Manage users, groups, and roles' },
      { name: chalk.yellow('⚙️  Configuration'), value: 'config', description: 'Edit .env files and service configs' },
      { name: chalk.magenta('📊 System Monitor'), value: 'monitor', description: 'View system health and metrics' },
      { name: chalk.white('💾 Installation & Setup'), value: 'install', description: 'Install dependencies and configure system' },
      { name: chalk.red('🔧 System Operations'), value: 'system', description: 'Database, migrations, and maintenance' },
      new inquirer.Separator(),
      { name: chalk.gray('Exit'), value: 'exit' }
    ];

    const answer = await inquirer.prompt([
      {
        type: 'list',
        name: 'menu',
        message: 'What would you like to do?',
        choices,
        pageSize: 15,
        loop: false
      }
    ]);

    return answer.menu;
  }

  /**
   * Start interactive mode
   */
  async start() {
    this.showWelcome();

    let running = true;

    while (running) {
      try {
        const selection = await this.showMainMenu();

        if (selection === 'exit') {
          console.log(chalk.cyan('\n👋 Thank you for using Exprsn CLI!\n'));
          running = false;
          break;
        }

        // Execute selected menu
        if (this.menus[selection]) {
          await this.menus[selection].show();
        }

        // Add spacing between menu navigations
        console.log('');
      } catch (error) {
        if (error.isTtyError) {
          console.error(chalk.red('Prompt could not be rendered in this environment'));
          running = false;
        } else if (error.message === 'User force closed the prompt') {
          console.log(chalk.yellow('\n\nExiting...'));
          running = false;
        } else {
          logger.error('Interactive mode error:', error);
          console.error(chalk.red('Error:'), error.message);

          const retry = await inquirer.prompt([
            {
              type: 'confirm',
              name: 'continue',
              message: 'Continue using Exprsn CLI?',
              default: true
            }
          ]);

          if (!retry.continue) {
            running = false;
          }
        }
      }
    }
  }
}

module.exports = InteractiveMode;
