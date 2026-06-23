/**
 * ═══════════════════════════════════════════════════════════
 * atproto module logger
 * Console winston logger (file transport opt-in via LOG_FILE_PATH).
 * ═══════════════════════════════════════════════════════════
 */

const winston = require('winston');

const level = process.env.LOG_LEVEL || 'info';

const transports = [
  new winston.transports.Console({
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.printf(({ timestamp, level: lvl, message, ...meta }) => {
        const rest = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
        return `${timestamp} [atproto] ${lvl}: ${message}${rest}`;
      })
    ),
  }),
];

const logger = winston.createLogger({ level, transports });

module.exports = logger;
