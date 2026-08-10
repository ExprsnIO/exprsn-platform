/**
 * Service Management Module
 * Start, stop, restart, and check status of Exprsn services
 */

const path = require('path');
const chalk = require('chalk');
const { execSync, spawn } = require('child_process');
const Table = require('cli-table3');
const ora = require('ora');

const EXPRSN_ROOT = path.resolve(__dirname, '../..');

const SERVICES = {
  ca: { name: 'Certificate Authority', port: 3000, path: 'src/exprsn-ca' },
  setup: { name: 'Setup & Management', port: 3015, path: 'src/exprsn-setup' },
  auth: { name: 'Authentication', port: 3001, path: 'src/exprsn-auth' },
  spark: { name: 'Messaging', port: 3002, path: 'src/exprsn-spark' },
  timeline: { name: 'Social Timeline', port: 3004, path: 'src/exprsn-timeline' },
  prefetch: { name: 'Timeline Prefetch', port: 3005, path: 'src/exprsn-prefetch' },
  moderator: { name: 'Content Moderation', port: 3006, path: 'src/exprsn-moderator' },
  filevault: { name: 'File Storage', port: 3007, path: 'src/exprsn-filevault' },
  gallery: { name: 'Media Gallery', port: 3008, path: 'src/exprsn-gallery' },
  live: { name: 'Live Streaming', port: 3009, path: 'src/exprsn-live' },
  bridge: { name: 'API Gateway', port: 3010, path: 'src/exprsn-bridge' },
  nexus: { name: 'Groups & Events', port: 3011, path: 'src/exprsn-nexus' },
  pulse: { name: 'Analytics', port: 3012, path: 'src/exprsn-pulse' },
  vault: { name: 'Secrets Management', port: 3013, path: 'src/exprsn-vault' },
  herald: { name: 'Notifications', port: 3014, path: 'src/exprsn-herald' },
  svr: { name: 'Business Hub', port: 5001, path: 'src/exprsn-svr' },
  workflow: { name: 'Workflow Automation', port: 3017, path: 'src/exprsn-workflow' },
  payments: { name: 'Payments', port: 3018, path: 'src/exprsn-payments' },
  atlas: { name: 'Geospatial', port: 3019, path: 'src/exprsn-atlas' },
  bluesky: { name: 'Bluesky Integration', port: 3020, path: 'src/exprsn-bluesky' }
};

function checkPort(port) {
  try {
    const result = execSync('lsof -i :' + port + ' -t', { encoding: 'utf8', stdio: 'pipe' });
    return result.trim().length > 0;
  } catch {
    return false;
  }
}

async function start(services, options) {
  console.log(chalk.bold.blue('\n🚀 Starting Exprsn Services\n'));
  
  if (options.all || services.length === 0) {
    console.log(chalk.cyan('Starting all services via npm start...'));
    execSync('npm start', { cwd: EXPRSN_ROOT, stdio: 'inherit' });
  } else {
    for (const serviceName of services) {
      if (!SERVICES[serviceName]) {
        console.log(chalk.red('Unknown service: ' + serviceName));
        continue;
      }
      
      const service = SERVICES[serviceName];
      const spinner = ora('Starting ' + service.name).start();
      
      try {
        if (checkPort(service.port)) {
          spinner.warn(service.name + ' already running on port ' + service.port);
        } else {
          execSync('npm start --workspace=@exprsn/' + serviceName, {
            cwd: EXPRSN_ROOT,
            stdio: 'ignore'
          });
          spinner.succeed(service.name + ' started on port ' + service.port);
        }
      } catch (error) {
        spinner.fail('Failed to start ' + service.name);
      }
    }
  }
}

async function stop(services, options) {
  console.log(chalk.bold.blue('\n🛑 Stopping Exprsn Services\n'));
  
  const servicesToStop = options.all || services.length === 0
    ? Object.keys(SERVICES)
    : services;
  
  for (const serviceName of servicesToStop) {
    if (!SERVICES[serviceName]) {
      console.log(chalk.red('Unknown service: ' + serviceName));
      continue;
    }
    
    const service = SERVICES[serviceName];
    const spinner = ora('Stopping ' + service.name).start();
    
    try {
      const pid = execSync('lsof -i :' + service.port + ' -t', { encoding: 'utf8', stdio: 'pipe' }).trim();
      if (pid) {
        execSync('kill ' + pid);
        spinner.succeed(service.name + ' stopped');
      } else {
        spinner.info(service.name + ' not running');
      }
    } catch {
      spinner.info(service.name + ' not running');
    }
  }
}

async function restart(services, options) {
  console.log(chalk.bold.blue('\n🔄 Restarting Exprsn Services\n'));
  await stop(services, options);
  await new Promise(resolve => setTimeout(resolve, 2000));
  await start(services, options);
}

async function status(options) {
  console.log(chalk.bold.blue('\n📊 Exprsn Services Status\n'));
  
  const table = new Table({
    head: ['Service', 'Name', 'Port', 'Status'],
    colWidths: [15, 30, 10, 15]
  });
  
  for (const [key, service] of Object.entries(SERVICES)) {
    const running = checkPort(service.port);
    table.push([
      key,
      service.name,
      service.port,
      running ? chalk.green('Running') : chalk.gray('Stopped')
    ]);
  }
  
  console.log(table.toString());
  console.log();
}

module.exports = {
  start,
  stop,
  restart,
  status
};
