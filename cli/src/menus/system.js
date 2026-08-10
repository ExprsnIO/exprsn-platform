const inquirer = require('inquirer');
const chalk = require('chalk');
const { SystemManager } = require('../modules/system-manager');

class SystemMenu {
  constructor() {
    this.manager = new SystemManager();
  }

  async show() {
    const choices = [
      { name: 'Initialize system', value: 'init' },
      { name: 'System health check', value: 'health' },
      { name: 'Prerequisites check', value: 'preflight' },
      new inquirer.Separator(),
      { name: 'Create databases', value: 'db-create' },
      { name: 'Run migrations', value: 'migrate' },
      { name: 'Seed databases', value: 'seed' },
      { name: 'Backup databases', value: 'backup' },
      new inquirer.Separator(),
      { name: 'Reset system', value: 'reset' },
      { name: 'Clear cache', value: 'cache' },
      { name: 'View logs', value: 'logs' },
      new inquirer.Separator(),
      { name: chalk.gray('← Back'), value: 'back' }
    ];

    const answer = await inquirer.prompt([{
      type: 'list',
      name: 'action',
      message: 'System Operations',
      choices
    }]);

    switch (answer.action) {
      case 'init':
        await this.manager.initialize();
        await this.show();
        break;
      case 'health':
        await this.manager.healthCheck();
        await this.show();
        break;
      case 'preflight':
        await this.manager.preflight();
        await this.show();
        break;
      case 'reset':
        await this.manager.reset();
        await this.show();
        break;
      case 'cache':
        await this.manager.manageCache({ clear: true });
        await this.show();
        break;
      case 'back':
        return;
    }
  }
}

module.exports = SystemMenu;
