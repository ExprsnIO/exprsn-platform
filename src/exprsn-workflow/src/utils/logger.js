const winston = require('winston');
const path = require('path');

const logLevel = process.env.LOG_LEVEL || 'info';
const logFile = process.env.LOG_FILE || 'logs/exprsn-workflow.log';

const logger = winston.createLogger({
  level: logLevel,
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
  ),
  defaultMeta: { service: 'exprsn-workflow' },
  transports: [
    new winston.transports.File({
      filename: path.join(process.cwd(), logFile),
      maxsize: parseInt(process.env.LOG_MAX_SIZE, 10) || 10485760, // 10MB
      maxFiles: parseInt(process.env.LOG_MAX_FILES, 10) || 7
    }),
    new winston.transports.File({
      filename: path.join(process.cwd(), 'logs/error.log'),
      level: 'error',
      maxsize: parseInt(process.env.LOG_MAX_SIZE, 10) || 10485760,
      maxFiles: parseInt(process.env.LOG_MAX_FILES, 10) || 7
    })
  ]
});

// Add console transport in development
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    )
  }));
}

module.exports = logger;
