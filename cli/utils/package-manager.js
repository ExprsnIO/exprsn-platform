/**
 * Package Manager Abstraction Layer
 * Provides unified interface for different package managers
 */

const { exec } = require('./os-detect');
const { execSync } = require('child_process');
const chalk = require('chalk');
const ora = require('ora');

class PackageManager {
  constructor(type, needsSudo = false) {
    this.type = type;
    this.needsSudo = needsSudo && process.platform !== 'darwin';
    this.sudo = this.needsSudo ? 'sudo ' : '';
  }

  /**
   * Execute package manager command
   */
  async execCommand(command, options = {}) {
    const fullCommand = this.sudo + command;
    const spinner = options.spinner || ora();
    
    try {
      if (options.silent) {
        execSync(fullCommand, { stdio: 'pipe' });
      } else {
        execSync(fullCommand, { stdio: 'inherit' });
      }
      return true;
    } catch (error) {
      if (spinner) spinner.fail();
      throw error;
    }
  }

  /**
   * Update package lists
   */
  async update() {
    const spinner = ora('Updating package lists...').start();
    
    try {
      switch (this.type) {
        case 'brew':
          await this.execCommand('brew update', { spinner });
          break;
        case 'apt':
          await this.execCommand('apt update', { spinner });
          break;
        case 'dnf':
          await this.execCommand('dnf check-update', { spinner, silent: true });
          break;
        case 'yum':
          await this.execCommand('yum check-update', { spinner, silent: true });
          break;
        case 'pacman':
          await this.execCommand('pacman -Sy', { spinner });
          break;
        case 'zypper':
          await this.execCommand('zypper refresh', { spinner });
          break;
        case 'apk':
          await this.execCommand('apk update', { spinner });
          break;
        default:
          spinner.warn('Unknown package manager');
          return false;
      }
      spinner.succeed('Package lists updated');
      return true;
    } catch (error) {
      spinner.fail('Failed to update package lists');
      return false;
    }
  }

  /**
   * Install packages
   */
  async install(packages, options = {}) {
    if (!Array.isArray(packages)) packages = [packages];
    const packageList = packages.join(' ');
    const spinner = ora('Installing packages: ' + chalk.cyan(packageList)).start();
    
    try {
      switch (this.type) {
        case 'brew':
          await this.execCommand('brew install ' + packageList, { spinner });
          break;
        case 'apt':
          await this.execCommand('apt install -y ' + packageList, { spinner });
          break;
        case 'dnf':
          await this.execCommand('dnf install -y ' + packageList, { spinner });
          break;
        case 'yum':
          await this.execCommand('yum install -y ' + packageList, { spinner });
          break;
        case 'pacman':
          await this.execCommand('pacman -S --noconfirm ' + packageList, { spinner });
          break;
        case 'zypper':
          await this.execCommand('zypper install -y ' + packageList, { spinner });
          break;
        case 'apk':
          await this.execCommand('apk add ' + packageList, { spinner });
          break;
        default:
          spinner.fail('Unknown package manager');
          return false;
      }
      spinner.succeed('Packages installed successfully');
      return true;
    } catch (error) {
      spinner.fail('Failed to install packages');
      throw error;
    }
  }

  /**
   * Check if package is installed
   */
  isInstalled(packageName) {
    try {
      switch (this.type) {
        case 'brew':
          return exec('brew list ' + packageName) !== null;
        case 'apt':
          return exec('dpkg -l ' + packageName) !== null;
        case 'dnf':
        case 'yum':
          return exec('rpm -q ' + packageName) !== null;
        case 'pacman':
          return exec('pacman -Q ' + packageName) !== null;
        case 'zypper':
          return exec('rpm -q ' + packageName) !== null;
        case 'apk':
          return exec('apk info ' + packageName) !== null;
        default:
          return false;
      }
    } catch (error) {
      return false;
    }
  }

  /**
   * Add repository
   */
  async addRepository(repo, options = {}) {
    const spinner = ora('Adding repository...').start();
    
    try {
      switch (this.type) {
        case 'brew':
          if (repo.tap) {
            await this.execCommand('brew tap ' + repo.tap, { spinner });
          }
          break;
        case 'apt':
          if (repo.ppa) {
            await this.execCommand('add-apt-repository -y ' + repo.ppa, { spinner });
          } else if (repo.key && repo.source) {
            await this.execCommand('wget -qO- ' + repo.key + ' | apt-key add -', { spinner });
            await this.execCommand('echo "' + repo.source + '" > /etc/apt/sources.list.d/' + repo.name + '.list', { spinner });
          }
          await this.update();
          break;
        case 'dnf':
        case 'yum':
          if (repo.rpm) {
            await this.execCommand('rpm -i ' + repo.rpm, { spinner });
          }
          break;
        case 'pacman':
          spinner.info('Repository configuration not automated for pacman');
          break;
        default:
          spinner.warn('Repository management not supported for this package manager');
          return false;
      }
      spinner.succeed('Repository added');
      return true;
    } catch (error) {
      spinner.fail('Failed to add repository');
      return false;
    }
  }

  /**
   * Start service
   */
  async startService(serviceName) {
    const spinner = ora('Starting service: ' + serviceName).start();
    
    try {
      switch (this.type) {
        case 'brew':
          await this.execCommand('brew services start ' + serviceName, { spinner });
          break;
        case 'apt':
        case 'dnf':
        case 'yum':
        case 'zypper':
          await this.execCommand('systemctl start ' + serviceName, { spinner });
          break;
        case 'pacman':
          await this.execCommand('systemctl start ' + serviceName, { spinner });
          break;
        default:
          spinner.warn('Service management not supported');
          return false;
      }
      spinner.succeed('Service started: ' + serviceName);
      return true;
    } catch (error) {
      spinner.fail('Failed to start service');
      return false;
    }
  }

  /**
   * Enable service on boot
   */
  async enableService(serviceName) {
    const spinner = ora('Enabling service: ' + serviceName).start();
    
    try {
      switch (this.type) {
        case 'brew':
          spinner.info('Service will auto-start (brew services)');
          break;
        case 'apt':
        case 'dnf':
        case 'yum':
        case 'zypper':
        case 'pacman':
          await this.execCommand('systemctl enable ' + serviceName, { spinner });
          break;
        default:
          spinner.warn('Service management not supported');
          return false;
      }
      spinner.succeed('Service enabled: ' + serviceName);
      return true;
    } catch (error) {
      spinner.fail('Failed to enable service');
      return false;
    }
  }
}

module.exports = PackageManager;
