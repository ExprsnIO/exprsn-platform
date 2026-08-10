/**
 * ═══════════════════════════════════════════════════════════════════════
 * Exprsn Timeline - Logger
 * ═══════════════════════════════════════════════════════════════════════
 */

const winston = require('winston');
const path = require('path');

// Define log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

// Console format for development
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let msg = `${timestamp} [${level}]: ${message}`;
    if (Object.keys(meta).length > 0) {
      msg += ` ${JSON.stringify(meta)}`;
    }
    return msg;
  })
);

// Create logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  defaultMeta: { service: 'exprsn-timeline' },
  transports: [
    // Write all logs to console
    new winston.transports.Console({
      format: consoleFormat
    })
  ]
});

// Add file transports in production
if (process.env.NODE_ENV === 'production') {
  const logDir = process.env.LOG_DIR || path.join(__dirname, '../../logs');

  logger.add(new winston.transports.File({
    filename: path.join(logDir, 'timeline-error.log'),
    level: 'error',
    maxsize: 10485760, // 10MB
    maxFiles: 5
  }));

  logger.add(new winston.transports.File({
    filename: path.join(logDir, 'timeline.log'),
    maxsize: 10485760, // 10MB
    maxFiles: 5
  }));
}

module.exports = logger;
