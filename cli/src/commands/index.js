/**
 * Command Setup - Non-interactive CLI commands
 */

const serviceCommands = require('./services');
const caCommands = require('./ca');
const userCommands = require('./users');
const configCommands = require('./config');
const systemCommands = require('./system');
const installCommands = require('./install');

/**
 * Setup all CLI commands
 */
function setupCommands(program) {
  // Service management commands
  serviceCommands(program);

  // CA management commands
  caCommands(program);

  // User management commands
  userCommands(program);

  // Configuration commands
  configCommands(program);

  // System commands
  systemCommands(program);

  // Installation commands
  installCommands(program);
}

module.exports = {
  setupCommands
};
