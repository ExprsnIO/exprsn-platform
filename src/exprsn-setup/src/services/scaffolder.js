/**
 * Service Scaffolding Module
 * Creates new Exprsn services with proper directory structure
 */

const fs = require('fs').promises;
const path = require('path');
const logger = require('../utils/logger');

/**
 * Service templates for different types of services
 */
const SERVICE_TEMPLATES = {
  basic: {
    name: 'Basic Service',
    description: 'Simple REST API service with database',
    features: ['express', 'sequelize', 'health-endpoint']
  },
  realtime: {
    name: 'Real-time Service',
    description: 'Service with Socket.IO support',
    features: ['express', 'sequelize', 'socket.io', 'health-endpoint']
  },
  worker: {
    name: 'Background Worker',
    description: 'Service with Bull queue processing',
    features: ['express', 'sequelize', 'bull', 'redis', 'health-endpoint']
  },
  api: {
    name: 'API-only Service',
    description: 'Lightweight API service without database',
    features: ['express', 'health-endpoint']
  }
};

/**
 * Generate package.json for new service
 * @param {Object} config - Service configuration
 * @returns {Object} Package.json content
 */
function generatePackageJson(config) {
  const dependencies = {
    'express': '^4.18.2',
    'dotenv': '^16.3.1',
    'cors': '^2.8.5',
    'helmet': '^7.1.0',
    'compression': '^1.7.4',
    'morgan': '^1.10.0',
    'winston': '^3.11.0',
    'joi': '^17.11.0'
  };

  const template = SERVICE_TEMPLATES[config.template] || SERVICE_TEMPLATES.basic;

  if (template.features.includes('sequelize')) {
    dependencies['sequelize'] = '^6.35.0';
    dependencies['pg'] = '^8.11.3';
    dependencies['pg-hstore'] = '^2.3.4';
  }

  if (template.features.includes('socket.io')) {
    dependencies['socket.io'] = '^4.6.1';
  }

  if (template.features.includes('bull')) {
    dependencies['bull'] = '^4.12.0';
  }

  if (template.features.includes('redis')) {
    dependencies['ioredis'] = '^5.3.2';
  }

  // Always add shared module for CA tokens
  dependencies['@exprsn/shared'] = 'file:../../shared';
  dependencies['axios'] = '^1.6.0';

  return {
    name: `@exprsn/${config.serviceName}`,
    version: '1.0.0',
    description: config.description || 'Exprsn service',
    main: 'src/index.js',
    scripts: {
      start: 'node src/index.js',
      dev: 'nodemon src/index.js',
      test: 'jest --coverage',
      lint: 'eslint src/',
      format: 'prettier --write \'src/**/*.js\''
    },
    keywords: ['exprsn', config.serviceName],
    author: config.author || 'Rick Holland <engineering@exprsn.com>',
    license: 'MIT',
    dependencies,
    devDependencies: {
      'nodemon': '^3.0.1',
      'jest': '^29.7.0',
      'eslint': '^8.54.0',
      'prettier': '^3.1.0',
      'supertest': '^6.3.3'
    },
    engines: {
      node: '>=18.0.0',
      npm: '>=9.0.0'
    }
  };
}

/**
 * Generate .env.example for new service
 * @param {Object} config - Service configuration
 * @returns {string} Environment file content
 */
function generateEnvExample(config) {
  const template = SERVICE_TEMPLATES[config.template] || SERVICE_TEMPLATES.basic;

  let content = `# ${config.displayName || config.serviceName} Configuration\n`;
  content += `NODE_ENV=development\n`;
  content += `PORT=${config.port}\n`;
  content += `SERVICE_NAME=${config.serviceName}\n\n`;

  if (template.features.includes('sequelize')) {
    const dbName = `exprsn_${config.serviceName.replace('exprsn-', '')}`;
    content += `# Database Configuration\n`;
    content += `DB_HOST=localhost\n`;
    content += `DB_PORT=5432\n`;
    content += `DB_NAME=${dbName}\n`;
    content += `DB_USER=postgres\n`;
    content += `DB_PASSWORD=\n`;
    content += `DB_LOGGING=false\n\n`;
  }

  if (template.features.includes('redis')) {
    content += `# Redis Configuration\n`;
    content += `REDIS_HOST=localhost\n`;
    content += `REDIS_PORT=6379\n`;
    content += `REDIS_PASSWORD=\n`;
    content += `REDIS_ENABLED=true\n\n`;
  }

  content += `# CA Integration\n`;
  content += `CA_URL=http://localhost:3000\n`;
  content += `CA_CERTIFICATE_ID=\n\n`;

  content += `# CORS\n`;
  content += `CORS_ORIGIN=*\n\n`;

  content += `# Logging\n`;
  content += `LOG_LEVEL=info\n`;
  content += `LOG_DIR=./logs\n\n`;

  if (template.features.includes('bull')) {
    content += `# Background Jobs\n`;
    content += `ENABLE_JOBS=true\n`;
    content += `JOB_CONCURRENCY=5\n\n`;
  }

  return content;
}

/**
 * Generate main index.js for new service
 * @param {Object} config - Service configuration
 * @returns {string} Index.js content
 */
function generateIndexJs(config) {
  const template = SERVICE_TEMPLATES[config.template] || SERVICE_TEMPLATES.basic;

  let content = `/**\n`;
  content += ` * ${config.displayName || config.serviceName}\n`;
  content += ` * ${config.description || 'Exprsn service'}\n`;
  content += ` */\n\n`;

  content += `require('dotenv').config();\n`;
  content += `const express = require('express');\n`;

  if (template.features.includes('socket.io')) {
    content += `const http = require('http');\n`;
    content += `const { Server } = require('socket.io');\n`;
  }

  content += `const cors = require('cors');\n`;
  content += `const helmet = require('helmet');\n`;
  content += `const compression = require('compression');\n`;
  content += `const morgan = require('morgan');\n`;
  content += `const logger = require('./utils/logger');\n\n`;

  if (template.features.includes('sequelize')) {
    content += `// Database connection\n`;
    content += `const { sequelize } = require('./models');\n\n`;
  }

  content += `// Configuration\n`;
  content += `const PORT = process.env.PORT || ${config.port};\n`;
  content += `const NODE_ENV = process.env.NODE_ENV || 'development';\n\n`;

  content += `// Create Express app\n`;
  content += `const app = express();\n`;

  if (template.features.includes('socket.io')) {
    content += `const server = http.createServer(app);\n`;
    content += `const io = new Server(server, {\n`;
    content += `  cors: { origin: '*', methods: ['GET', 'POST'] }\n`;
    content += `});\n\n`;
  }

  content += `\n// Middleware\n`;
  content += `app.use(helmet());\n`;
  content += `app.use(cors());\n`;
  content += `app.use(compression());\n`;
  content += `app.use(morgan('combined', {\n`;
  content += `  stream: { write: (message) => logger.info(message.trim()) }\n`;
  content += `}));\n`;
  content += `app.use(express.json());\n`;
  content += `app.use(express.urlencoded({ extended: true }));\n\n`;

  content += `// Health endpoint\n`;
  content += `app.get('/health', async (req, res) => {\n`;
  content += `  const health = {\n`;
  content += `    success: true,\n`;
  content += `    service: '${config.serviceName}',\n`;
  content += `    status: 'healthy',\n`;
  content += `    timestamp: new Date().toISOString(),\n`;
  content += `    uptime: process.uptime(),\n`;
  content += `    environment: NODE_ENV\n`;
  content += `  };\n\n`;

  if (template.features.includes('sequelize')) {
    content += `  // Check database\n`;
    content += `  try {\n`;
    content += `    await sequelize.authenticate();\n`;
    content += `    health.database = 'connected';\n`;
    content += `  } catch (error) {\n`;
    content += `    health.database = 'disconnected';\n`;
    content += `    health.status = 'degraded';\n`;
    content += `  }\n\n`;
  }

  content += `  res.json(health);\n`;
  content += `});\n\n`;

  content += `// Root endpoint\n`;
  content += `app.get('/', (req, res) => {\n`;
  content += `  res.json({\n`;
  content += `    success: true,\n`;
  content += `    service: '${config.serviceName}',\n`;
  content += `    version: '1.0.0',\n`;
  content += `    message: 'Service is running'\n`;
  content += `  });\n`;
  content += `});\n\n`;

  content += `// Error handler\n`;
  content += `app.use((err, req, res, next) => {\n`;
  content += `  logger.error('Express error:', err);\n`;
  content += `  res.status(err.status || 500).json({\n`;
  content += `    success: false,\n`;
  content += `    error: err.message || 'Internal server error'\n`;
  content += `  });\n`;
  content += `});\n\n`;

  if (template.features.includes('socket.io')) {
    content += `// Socket.IO connection handling\n`;
    content += `io.on('connection', (socket) => {\n`;
    content += `  logger.info(\`Client connected: \${socket.id}\`);\n\n`;
    content += `  socket.on('disconnect', () => {\n`;
    content += `    logger.info(\`Client disconnected: \${socket.id}\`);\n`;
    content += `  });\n`;
    content += `});\n\n`;
  }

  content += `// Start server\n`;
  const serverVar = template.features.includes('socket.io') ? 'server' : 'app';
  content += `${serverVar}.listen(PORT, async () => {\n`;
  content += `  logger.info(\`${config.displayName || config.serviceName} listening on port \${PORT}\`);\n`;
  content += `  logger.info(\`Environment: \${NODE_ENV}\`);\n\n`;

  if (template.features.includes('sequelize')) {
    content += `  // Sync database\n`;
    content += `  try {\n`;
    content += `    await sequelize.authenticate();\n`;
    content += `    logger.info('Database connected successfully');\n`;
    content += `    \n`;
    content += `    if (NODE_ENV === 'development') {\n`;
    content += `      await sequelize.sync({ alter: false });\n`;
    content += `      logger.info('Database models synchronized');\n`;
    content += `    }\n`;
    content += `  } catch (error) {\n`;
    content += `    logger.error('Database connection failed:', error);\n`;
    content += `  }\n`;
  }

  content += `});\n\n`;

  content += `// Graceful shutdown\n`;
  content += `process.on('SIGTERM', () => {\n`;
  content += `  logger.info('SIGTERM received, shutting down gracefully...');\n`;

  if (template.features.includes('sequelize')) {
    content += `  sequelize.close();\n`;
  }

  content += `  ${serverVar}.close(() => {\n`;
  content += `    logger.info('Server closed');\n`;
  content += `    process.exit(0);\n`;
  content += `  });\n`;
  content += `});\n\n`;

  if (template.features.includes('socket.io')) {
    content += `module.exports = { app, server, io };\n`;
  } else {
    content += `module.exports = { app };\n`;
  }

  return content;
}

/**
 * Generate logger utility
 * @param {Object} config - Service configuration
 * @returns {string} Logger utility content
 */
function generateLogger(config) {
  return `/**
 * Logger Utility
 * Winston logger configuration
 */

const winston = require('winston');
const path = require('path');

const logDir = process.env.LOG_DIR || './logs';
const logLevel = process.env.LOG_LEVEL || 'info';

const logger = winston.createLogger({
  level: logLevel,
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
  ),
  defaultMeta: { service: '${config.serviceName}' },
  transports: [
    new winston.transports.File({
      filename: path.join(logDir, 'error.log'),
      level: 'error'
    }),
    new winston.transports.File({
      filename: path.join(logDir, '${config.serviceName}.log')
    })
  ]
});

// Console logging in development
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    )
  }));
}

module.exports = logger;
`;
}

/**
 * Generate README.md for new service
 * @param {Object} config - Service configuration
 * @returns {string} README content
 */
function generateReadme(config) {
  const template = SERVICE_TEMPLATES[config.template] || SERVICE_TEMPLATES.basic;

  let content = `# ${config.displayName || config.serviceName}\n\n`;
  content += `${config.description || 'Exprsn service'}\n\n`;

  content += `## Features\n\n`;
  template.features.forEach(feature => {
    content += `- ${feature}\n`;
  });
  content += `\n`;

  content += `## Installation\n\n`;
  content += `\`\`\`bash\n`;
  content += `# Install dependencies\n`;
  content += `npm install\n\n`;
  content += `# Copy environment variables\n`;
  content += `cp .env.example .env\n\n`;
  content += `# Edit .env with your settings\n`;
  content += `nano .env\n`;
  content += `\`\`\`\n\n`;

  content += `## Usage\n\n`;
  content += `\`\`\`bash\n`;
  content += `# Production mode\n`;
  content += `npm start\n\n`;
  content += `# Development mode (with auto-reload)\n`;
  content += `npm run dev\n`;
  content += `\`\`\`\n\n`;

  content += `The service will be available at \`http://localhost:${config.port}\`\n\n`;

  if (template.features.includes('sequelize')) {
    content += `## Database Setup\n\n`;
    content += `\`\`\`bash\n`;
    content += `# Create database\n`;
    content += `createdb exprsn_${config.serviceName.replace('exprsn-', '')}\n\n`;
    content += `# Apply schema\n`;
    content += `psql -d exprsn_${config.serviceName.replace('exprsn-', '')} -f database/schema.sql\n`;
    content += `\`\`\`\n\n`;
  }

  content += `## API Endpoints\n\n`;
  content += `### Health Check\n`;
  content += `\`\`\`bash\n`;
  content += `GET /health\n`;
  content += `\`\`\`\n\n`;

  content += `## Environment Variables\n\n`;
  content += `See \`.env.example\` for all available configuration options.\n\n`;

  content += `## Development\n\n`;
  content += `\`\`\`bash\n`;
  content += `# Run tests\n`;
  content += `npm test\n\n`;
  content += `# Lint code\n`;
  content += `npm run lint\n\n`;
  content += `# Format code\n`;
  content += `npm run format\n`;
  content += `\`\`\`\n\n`;

  content += `## License\n\n`;
  content += `MIT License (2025)\n\n`;

  content += `## Author\n\n`;
  content += `${config.author || 'Rick Holland <engineering@exprsn.com>'}\n`;

  return content;
}

/**
 * Generate Sequelize models index if using database
 * @param {Object} config - Service configuration
 * @returns {string} Models index content
 */
function generateModelsIndex(config) {
  return `/**
 * Sequelize Models
 * Database models for ${config.serviceName}
 */

const { Sequelize } = require('sequelize');
const logger = require('../utils/logger');

// Initialize Sequelize
const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    dialect: 'postgres',
    logging: process.env.DB_LOGGING === 'true' ? (msg) => logger.debug(msg) : false,
    pool: {
      max: 10,
      min: 0,
      acquire: 30000,
      idle: 10000
    }
  }
);

// Import models here
// const ExampleModel = require('./ExampleModel')(sequelize);

const db = {
  sequelize,
  Sequelize,
  // Add models here
  // ExampleModel
};

module.exports = db;
`;
}

/**
 * Create directory structure for new service
 * @param {string} servicePath - Path to service directory
 * @param {Object} config - Service configuration
 * @returns {Promise<void>}
 */
async function createServiceStructure(servicePath, config) {
  const template = SERVICE_TEMPLATES[config.template] || SERVICE_TEMPLATES.basic;

  // Create main directories
  await fs.mkdir(path.join(servicePath, 'src'), { recursive: true });
  await fs.mkdir(path.join(servicePath, 'src/utils'), { recursive: true });
  await fs.mkdir(path.join(servicePath, 'src/routes'), { recursive: true });
  await fs.mkdir(path.join(servicePath, 'src/middleware'), { recursive: true });
  await fs.mkdir(path.join(servicePath, 'logs'), { recursive: true });
  await fs.mkdir(path.join(servicePath, 'tests'), { recursive: true });

  if (template.features.includes('sequelize')) {
    await fs.mkdir(path.join(servicePath, 'src/models'), { recursive: true });
    await fs.mkdir(path.join(servicePath, 'src/services'), { recursive: true });
  }

  logger.info(`Created directory structure for ${config.serviceName}`);
}

/**
 * Scaffold a new Exprsn service
 * @param {Object} config - Service configuration
 * @param {string} config.serviceName - Service name (e.g., 'exprsn-myservice')
 * @param {string} config.displayName - Display name
 * @param {string} config.description - Service description
 * @param {number} config.port - Service port
 * @param {string} config.template - Template type (basic, realtime, worker, api)
 * @param {string} config.author - Author name
 * @returns {Promise<Object>} Scaffolding result
 */
async function scaffoldService(config) {
  logger.info(`Scaffolding new service: ${config.serviceName}`);

  // Validate service name
  if (!config.serviceName || !config.serviceName.startsWith('exprsn-')) {
    throw new Error('Service name must start with "exprsn-"');
  }

  // Validate port
  if (!config.port || config.port < 1024 || config.port > 65535) {
    throw new Error('Port must be between 1024 and 65535');
  }

  // Determine service path
  const projectRoot = path.resolve(__dirname, '../../../..');
  const servicePath = path.join(projectRoot, 'src', config.serviceName);

  // Check if service already exists
  try {
    await fs.access(servicePath);
    throw new Error(`Service directory already exists: ${servicePath}`);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }

  const template = SERVICE_TEMPLATES[config.template] || SERVICE_TEMPLATES.basic;

  try {
    // Create directory structure
    await createServiceStructure(servicePath, config);

    // Generate and write files
    const files = {
      'package.json': JSON.stringify(generatePackageJson(config), null, 2),
      '.env.example': generateEnvExample(config),
      'src/index.js': generateIndexJs(config),
      'src/utils/logger.js': generateLogger(config),
      'README.md': generateReadme(config)
    };

    if (template.features.includes('sequelize')) {
      files['src/models/index.js'] = generateModelsIndex(config);
    }

    // Write .gitignore
    files['.gitignore'] = `node_modules/
logs/
.env
coverage/
.DS_Store
`;

    for (const [fileName, content] of Object.entries(files)) {
      await fs.writeFile(path.join(servicePath, fileName), content, 'utf8');
      logger.info(`Created ${fileName}`);
    }

    logger.info(`Service ${config.serviceName} scaffolded successfully at ${servicePath}`);

    return {
      success: true,
      serviceName: config.serviceName,
      path: servicePath,
      template: config.template,
      port: config.port,
      files: Object.keys(files),
      message: 'Service scaffolded successfully'
    };
  } catch (error) {
    logger.error(`Error scaffolding service ${config.serviceName}:`, error);
    // Cleanup on error
    try {
      await fs.rm(servicePath, { recursive: true, force: true });
    } catch (cleanupError) {
      logger.error('Error during cleanup:', cleanupError);
    }
    throw error;
  }
}

/**
 * Get available service templates
 * @returns {Object} Service templates
 */
function getServiceTemplates() {
  return SERVICE_TEMPLATES;
}

/**
 * Delete a service directory
 * @param {string} serviceName - Service name
 * @returns {Promise<Object>} Deletion result
 */
async function deleteService(serviceName) {
  logger.warn(`Deleting service: ${serviceName}`);

  const projectRoot = path.resolve(__dirname, '../../../..');
  const servicePath = path.join(projectRoot, 'src', serviceName);

  try {
    await fs.access(servicePath);
  } catch (error) {
    throw new Error(`Service directory not found: ${servicePath}`);
  }

  await fs.rm(servicePath, { recursive: true, force: true });

  logger.info(`Service ${serviceName} deleted successfully`);

  return {
    success: true,
    serviceName,
    message: 'Service deleted successfully'
  };
}

module.exports = {
  scaffoldService,
  getServiceTemplates,
  deleteService,
  SERVICE_TEMPLATES
};
