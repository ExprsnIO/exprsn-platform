/**
 * Service Management Commands
 */

const chalk = require('chalk');
const { ServiceManager } = require('../modules/service-manager');
const { logger } = require('../utils/logger');

module.exports = function(program) {
  const services = program.command('services').description('Manage Exprsn services');

  // List services
  services
    .command('list')
    .alias('ls')
    .description('List all services and their status')
    .option('-r, --running', 'Show only running services')
    .option('-s, --stopped', 'Show only stopped services')
    .action(async (options) => {
      const manager = new ServiceManager();
      await manager.listServices(options);
    });

  // Start service
  services
    .command('start <service>')
    .description('Start a service')
    .option('-a, --all', 'Start all services')
    .option('-w, --watch', 'Watch service logs after starting')
    .action(async (service, options) => {
      const manager = new ServiceManager();
      if (options.all) {
        await manager.startAll();
      } else {
        await manager.start(service, options);
      }
    });

  // Stop service
  services
    .command('stop <service>')
    .description('Stop a service')
    .option('-a, --all', 'Stop all services')
    .action(async (service, options) => {
      const manager = new ServiceManager();
      if (options.all) {
        await manager.stopAll();
      } else {
        await manager.stop(service);
      }
    });

  // Restart service
  services
    .command('restart <service>')
    .description('Restart a service')
    .option('-a, --all', 'Restart all services')
    .action(async (service, options) => {
      const manager = new ServiceManager();
      if (options.all) {
        await manager.restartAll();
      } else {
        await manager.restart(service);
      }
    });

  // Service status
  services
    .command('status <service>')
    .description('Get detailed service status')
    .action(async (service) => {
      const manager = new ServiceManager();
      await manager.status(service);
    });

  // Service logs
  services
    .command('logs <service>')
    .description('View service logs')
    .option('-f, --follow', 'Follow log output')
    .option('-n, --lines <number>', 'Number of lines to show', '50')
    .action(async (service, options) => {
      const manager = new ServiceManager();
      await manager.logs(service, options);
    });

  // Enable/disable service
  services
    .command('enable <service>')
    .description('Enable service to auto-start')
    .action(async (service) => {
      const manager = new ServiceManager();
      await manager.enable(service);
    });

  services
    .command('disable <service>')
    .description('Disable service auto-start')
    .action(async (service) => {
      const manager = new ServiceManager();
      await manager.disable(service);
    });

  // Health check
  services
    .command('health')
    .description('Check health of all services')
    .option('-w, --watch', 'Continuous monitoring')
    .action(async (options) => {
      const manager = new ServiceManager();
      await manager.healthCheck(options);
    });
};
