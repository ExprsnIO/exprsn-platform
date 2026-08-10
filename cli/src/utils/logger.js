/**
 * Logger Utility
 */

const fs = require('fs-extra');
const path = require('path');
const chalk = require('chalk');

class Logger {
  constructor() {
    this.logDir = path.join(global.EXPRSN_ROOT || process.cwd(), 'cli-logs');
    this.logFile = path.join(this.logDir, 'exprsn-cli.log');
    this.init();
  }

  async init() {
    await fs.ensureDir(this.logDir);
  }

  log(level, message, ...args) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;

    // Write to file
    fs.appendFile(this.logFile, logMessage + '\n' + (args.length ? JSON.stringify(args, null, 2) + '\n' : ''))
      .catch(err => console.error('Logger error:', err));

    // Also log to console in debug mode
    if (process.env.DEBUG) {
      console.log(logMessage, ...args);
    }
  }

  info(message, ...args) {
    this.log('info', message, ...args);
  }

  warn(message, ...args) {
    this.log('warn', message, ...args);
  }

  error(message, ...args) {
    this.log('error', message, ...args);
  }

  debug(message, ...args) {
    if (process.env.DEBUG) {
      this.log('debug', message, ...args);
    }
  }
}

const logger = new Logger();

module.exports = { logger, Logger };
