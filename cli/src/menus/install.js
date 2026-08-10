const inquirer = require('inquirer');
const chalk = require('chalk');
const { InstallManager } = require('../modules/install-manager');

class InstallMenu {
  constructor() {
    this.manager = new InstallManager();
  }

  async show() {
    const choices = [
      { name: 'Detect system', value: 'detect' },
      { name: 'Install prerequisites', value: 'prereqs' },
      new inquirer.Separator(),
      { name: 'Install PostgreSQL', value: 'postgres' },
      { name: 'Install Redis', value: 'redis' },
      { name: 'Install Docker', value: 'docker' },
      new inquirer.Separator(),
      { name: 'Setup Docker containers', value: 'docker-setup' },
      { name: 'Install all dependencies', value: 'all' },
      new inquirer.Separator(),
      { name: 'Verify installation', value: 'verify' },
      { name: 'Update Exprsn CLI', value: 'update' },
      new inquirer.Separator(),
      { name: chalk.gray('← Back'), value: 'back' }
    ];

    const answer = await inquirer.prompt([{
      type: 'list',
      name: 'action',
      message: 'Installation & Setup',
      choices
    }]);

    switch (answer.action) {
      case 'detect':
        await this.manager.detectSystem();
        await this.show();
        break;
      case 'prereqs':
        await this.manager.installPrerequisites();
        await this.show();
        break;
      case 'postgres':
        await this.manager.installPostgreSQL();
        await this.show();
        break;
      case 'verify':
        await this.manager.verifyInstallation();
        await this.show();
        break;
      case 'back':
        return;
    }
  }
}

module.exports = InstallMenu;
