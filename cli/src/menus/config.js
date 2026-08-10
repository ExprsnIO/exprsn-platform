const inquirer = require('inquirer');
const chalk = require('chalk');
const { ConfigManager } = require('../modules/config-manager');

class ConfigMenu {
  constructor() {
    this.manager = new ConfigManager();
  }

  async show() {
    const choices = [
      { name: 'List configurations', value: 'list' },
      { name: 'Show service config', value: 'show' },
      { name: 'Edit service config', value: 'edit' },
      { name: 'Set config value', value: 'set' },
      { name: 'Delete config value', value: 'delete' },
      new inquirer.Separator(),
      { name: 'Initialize from template', value: 'init' },
      { name: 'Validate configuration', value: 'validate' },
      new inquirer.Separator(),
      { name: 'Backup configurations', value: 'backup' },
      { name: 'Restore from backup', value: 'restore' },
      new inquirer.Separator(),
      { name: chalk.gray('← Back'), value: 'back' }
    ];

    const answer = await inquirer.prompt([{
      type: 'list',
      name: 'action',
      message: 'Configuration Management',
      choices
    }]);

    switch (answer.action) {
      case 'list':
        await this.manager.listConfigs();
        await this.show();
        break;
      case 'edit':
        const service = await this.selectService();
        if (service) await this.manager.editConfig(service);
        await this.show();
        break;
      case 'backup':
        await this.manager.backupConfigs();
        await this.show();
        break;
      case 'back':
        return;
    }
  }

  async selectService() {
    const { SERVICES } = require('../utils/service-config');
    const answer = await inquirer.prompt([{
      type: 'list',
      name: 'service',
      message: 'Select service:',
      choices: ['root', ...SERVICES.map(s => s.id)]
    }]);
    return answer.service;
  }
}

module.exports = ConfigMenu;
