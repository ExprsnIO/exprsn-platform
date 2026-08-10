/**
 * Services Menu - Interactive service management
 */

const inquirer = require('inquirer');
const chalk = require('chalk');
const { ServiceManager } = require('../modules/service-manager');
const { SERVICES } = require('../utils/service-config');

class ServicesMenu {
  constructor() {
    this.manager = new ServiceManager();
  }

  async show() {
    const choices = [
      { name: 'List all services', value: 'list' },
      { name: 'Start a service', value: 'start' },
      { name: 'Stop a service', value: 'stop' },
      { name: 'Restart a service', value: 'restart' },
      { name: 'View service status', value: 'status' },
      { name: 'View service logs', value: 'logs' },
      { name: 'Start all services', value: 'start-all' },
      { name: 'Stop all services', value: 'stop-all' },
      { name: 'Health check', value: 'health' },
      new inquirer.Separator(),
      { name: chalk.gray('← Back'), value: 'back' }
    ];

    const answer = await inquirer.prompt([{
      type: 'list',
      name: 'action',
      message: 'Service Management',
      choices,
      pageSize: 15
    }]);

    switch (answer.action) {
      case 'list':
        await this.manager.listServices();
        await this.show();
        break;

      case 'start':
        await this.selectService('start');
        await this.show();
        break;

      case 'stop':
        await this.selectService('stop');
        await this.show();
        break;

      case 'restart':
        await this.selectService('restart');
        await this.show();
        break;

      case 'status':
        await this.selectService('status');
        await this.show();
        break;

      case 'logs':
        await this.selectService('logs');
        await this.show();
        break;

      case 'start-all':
        await this.manager.startAll();
        await this.show();
        break;

      case 'stop-all':
        await this.manager.stopAll();
        await this.show();
        break;

      case 'health':
        await this.manager.healthCheck();
        await this.show();
        break;

      case 'back':
        return;
    }
  }

  async selectService(action) {
    const serviceChoices = SERVICES.map(s => ({
      name: `${s.name} (Port ${s.port}) - ${s.description}`,
      value: s.id
    }));

    const answer = await inquirer.prompt([{
      type: 'list',
      name: 'service',
      message: `Select service to ${action}:`,
      choices: serviceChoices,
      pageSize: 15
    }]);

    await this.manager[action](answer.service);
  }
}

module.exports = ServicesMenu;
