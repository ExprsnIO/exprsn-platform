const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const { logger, errorHandler } = require('@exprsn/shared');
require('dotenv').config();

const routes = require('./routes');
const sequelize = require('./config/database');

const app = express();
const PORT = process.env.PORT || 3018;

// Security and performance middleware
app.use(helmet());
app.use(cors());
app.use(compression());

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging
app.use((req, res, next) => {
  logger.info('Request received', {
    method: req.method,
    path: req.path,
    ip: req.ip
  });
  next();
});

// API routes
app.use('/api', routes);

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    await sequelize.authenticate();

    res.json({
      status: 'healthy',
      service: 'exprsn-payments',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      database: 'connected',
      providers: {
        stripe: 'available',
        paypal: 'available',
        authorizenet: 'available'
      }
    });
  } catch (error) {
    logger.error('Health check failed:', error);
    res.status(503).json({
      status: 'unhealthy',
      service: 'exprsn-payments',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'NOT_FOUND',
    message: 'The requested resource was not found'
  });
});

// Error handler (must be last)
app.use(errorHandler);

// Start server
const server = app.listen(PORT, () => {
  logger.info(`Exprsn Payments service started on port ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`Database: ${process.env.DB_NAME || 'exprsn_payments'}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  server.close(() => {
    logger.info('Server closed');
    sequelize.close()
      .then(() => {
        logger.info('Database connection closed');
        process.exit(0);
      })
      .catch(err => {
        logger.error('Error closing database connection:', err);
        process.exit(1);
      });
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  server.close(() => {
    logger.info('Server closed');
    sequelize.close()
      .then(() => {
        logger.info('Database connection closed');
        process.exit(0);
      })
      .catch(err => {
        logger.error('Error closing database connection:', err);
        process.exit(1);
      });
  });
});

module.exports = app;
