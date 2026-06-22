/**
 * Exprsn Live - Logger
 */

const winston = require('winston');
const path = require('path');
const config = require('../config');

const logger = winston.createLogger({
  level: config.logging.level,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'exprsn-live' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

// Add file transport in production
if (config.service.env === 'production') {
  logger.add(new winston.transports.File({
    filename: path.join(config.logging.dir, 'error.log'),
    level: 'error'
  }));
  logger.add(new winston.transports.File({
    filename: path.join(config.logging.dir, 'combined.log')
  }));
}

module.exports = logger;
