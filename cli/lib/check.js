/**
 * Dependency Check Module
 * Checks system requirements and dependencies
 */

const chalk = require('chalk');
const Table = require('cli-table3');
const { exec } = require('../utils/os-detect');
const semver = require('semver');

async function checkDependencies(options) {
  console.log(chalk.bold.blue('\n🔍 Checking System Dependencies\n'));
  
  const table = new Table({
    head: ['Dependency', 'Required', 'Installed', 'Status'],
    colWidths: [20, 15, 20, 10]
  });
  
  const checks = [
    {
      name: 'Node.js',
      required: '>=18.0.0',
      command: 'node --version',
      parse: (v) => v.replace('v', '')
    },
    {
      name: 'npm',
      required: '>=9.0.0',
      command: 'npm --version',
      parse: (v) => v
    },
    {
      name: 'PostgreSQL',
      required: '>=14.0',
      command: 'psql --version',
      parse: (v) => v.match(/\d+\.\d+/)?.[0]
    },
    {
      name: 'Redis',
      required: '>=7.0',
      command: 'redis-server --version',
      parse: (v) => v.match(/v=(\d+\.\d+)/)?.[1]
    },
    {
      name: 'FFmpeg',
      required: '>=4.0',
      command: 'ffmpeg -version',
      parse: (v) => v.match(/version (\d+\.\d+)/)?.[1],
      optional: true
    },
    {
      name: 'Elasticsearch',
      required: '>=8.0',
      command: 'curl -s localhost:9200',
      parse: (v) => {
        try {
          const json = JSON.parse(v);
          return json.version?.number;
        } catch {
          return null;
        }
      },
      optional: true
    }
  ];
  
  let allPassed = true;
  
  for (const check of checks) {
    const installed = exec(check.command);
    let version = null;
    let status = chalk.red('✗');
    
    if (installed) {
      version = check.parse(installed);
      
      if (version && semver.satisfies(version, check.required)) {
        status = chalk.green('✓');
      } else if (version) {
        status = chalk.yellow('⚠');
        if (!check.optional) allPassed = false;
      } else {
        status = chalk.red('✗');
        if (!check.optional) allPassed = false;
      }
    } else {
      status = check.optional ? chalk.gray('-') : chalk.red('✗');
      if (!check.optional) allPassed = false;
    }
    
    table.push([
      check.name + (check.optional ? chalk.gray(' (optional)') : ''),
      check.required,
      version || chalk.gray('not found'),
      status
    ]);
  }
  
  console.log(table.toString());
  
  // Check services
  console.log(chalk.bold.blue('\n🔧 Checking Services\n'));
  
  const serviceTable = new Table({
    head: ['Service', 'Status'],
    colWidths: [30, 20]
  });
  
  const services = [
    { name: 'PostgreSQL', command: 'pg_isready', successText: 'accepting' },
    { name: 'Redis', command: 'redis-cli ping', successText: 'PONG' }
  ];
  
  for (const service of services) {
    const result = exec(service.command);
    const isRunning = result && result.includes(service.successText);
    serviceTable.push([
      service.name,
      isRunning ? chalk.green('Running') : chalk.red('Stopped')
    ]);
    if (!isRunning) allPassed = false;
  }
  
  console.log(serviceTable.toString());
  
  // Summary
  console.log();
  if (allPassed) {
    console.log(chalk.green('✅ All checks passed!'));
  } else {
    console.log(chalk.red('❌ Some checks failed'));
    console.log(chalk.yellow('\nRun with --fix to attempt automatic fixes'));
    process.exit(1);
  }
}

module.exports = {
  checkDependencies
};
