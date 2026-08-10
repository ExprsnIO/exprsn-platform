/**
 * Exprsn Installation CLI - Module Exports
 * Allows programmatic usage of installer functions
 */

module.exports = {
  detectOS: require('./utils/os-detect').detectOS,
  PackageManager: require('./utils/package-manager'),
  install: require('./lib/install').install,
  configure: require('./lib/configure').configure,
  checkDependencies: require('./lib/check').checkDependencies,
  services: require('./lib/services'),
  uninstall: require('./lib/uninstall').uninstall
};
