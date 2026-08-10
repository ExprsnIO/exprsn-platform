const inquirer = require('inquirer');
const chalk = require('chalk');
const { ServiceManager } = require('../modules/service-manager');
const { SystemManager } = require('../modules/system-manager');

class MonitorMenu {
  constructor() {
    this.serviceManager = new ServiceManager();
    this.systemManager = new SystemManager();
  }

  async show() {
    const choices = [
      { name: 'Service health check', value: 'health' },
      { name: 'Continuous monitoring', value: 'watch' },
      { name: 'View system logs', value: 'logs' },
      { name: 'Redis cache statistics', value: 'cache-stats' },
      new inquirer.Separator(),
      { name: chalk.gray('← Back'), value: 'back' }
    ];

    const answer = await inquirer.prompt([{
      type: 'list',
      name: 'action',
      message: 'System Monitoring',
      choices
    }]);

    switch (answer.action) {
      case 'health':
        await this.serviceManager.healthCheck();
        await this.show();
        break;
      case 'watch':
        await this.serviceManager.healthCheck({ watch: true });
        await this.show();
        break;
      case 'cache-stats':
        await this.systemManager.manageCache({ stats: true });
        await this.show();
        break;
      case 'back':
        return;
    }
  }
}

module.exports = MonitorMenu;
