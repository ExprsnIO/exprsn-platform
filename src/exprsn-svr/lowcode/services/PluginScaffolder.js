/**
 * ═══════════════════════════════════════════════════════════
 * Plugin Scaffolder Service
 * Generates plugin boilerplate code based on configuration
 * ═══════════════════════════════════════════════════════════
 */

const fs = require('fs').promises;
const path = require('path');
const logger = require('../../utils/logger');

class PluginScaffolder {
  constructor() {
    this.pluginsDir = path.join(__dirname, '../../plugins');
  }

  /**
   * Generate a complete plugin based on configuration
   */
  async generatePlugin(config) {
    try {
      const {
        basic,
        features,
        routes,
        middleware,
        socketEvents,
        database,
        views,
        settings
      } = config;

      // Create plugin directory
      const pluginDir = path.join(this.pluginsDir, basic.name);
      await fs.mkdir(pluginDir, { recursive: true });

      logger.info('Generating plugin', { name: basic.name, dir: pluginDir });

      // Generate package.json
      await this.generatePackageJson(pluginDir, basic);

      // Generate main index.js
      await this.generateIndexFile(pluginDir, basic, features);

      // Generate routes if enabled
      if (features.routes && routes && routes.length > 0) {
        await this.generateRoutesFile(pluginDir, routes);
      }

      // Generate middleware if enabled
      if (features.middleware && middleware && middleware.length > 0) {
        await this.generateMiddlewareFile(pluginDir, middleware);
      }

      // Generate Socket.IO handlers if enabled
      if (features.socketio && socketEvents && socketEvents.length > 0) {
        await this.generateSocketHandlers(pluginDir, socketEvents);
      }

      // Generate database models if enabled
      if (features.database && database) {
        await this.generateDatabaseModels(pluginDir, database);
      }

      // Generate views if enabled
      if (features.views && views && views.length > 0) {
        await this.generateViews(pluginDir, views);
      }

      // Generate public assets directory if enabled
      if (features.assets) {
        await this.generateAssetsStructure(pluginDir);
      }

      // Generate settings management if enabled
      if (features.settings && settings) {
        await this.generateSettingsFile(pluginDir, settings);
      }

      // Generate README.md
      await this.generateReadme(pluginDir, basic, features);

      logger.info('Plugin generated successfully', { name: basic.name });

      return {
        success: true,
        path: pluginDir,
        name: basic.name
      };
    } catch (error) {
      logger.error('Plugin generation failed', { error: error.message, stack: error.stack });
      throw error;
    }
  }

  /**
   * Generate package.json
   */
  async generatePackageJson(pluginDir, basic) {
    const packageJson = {
      name: basic.name,
      version: basic.version || '1.0.0',
      description: basic.description,
      main: 'index.js',
      author: basic.author,
      license: basic.license || 'MIT',
      keywords: basic.tags ? basic.tags.split(',').map(t => t.trim()) : [],
      dependencies: {},
      exprsn: {
        plugin: true,
        version: basic.version || '1.0.0',
        compatibility: basic.compatibility || '^1.0.0'
      }
    };

    await fs.writeFile(
      path.join(pluginDir, 'package.json'),
      JSON.stringify(packageJson, null, 2),
      'utf8'
    );

    logger.info('Generated package.json', { plugin: basic.name });
  }

  /**
   * Generate main index.js file
   */
  async generateIndexFile(pluginDir, basic, features) {
    const hasRoutes = features.routes;
    const hasMiddleware = features.middleware;
    const hasSocketIO = features.socketio;
    const hasDatabase = features.database;
    const hasSettings = features.settings;

    let code = `/**
 * ${basic.name}
 * ${basic.description}
 *
 * @author ${basic.author}
 * @version ${basic.version || '1.0.0'}
 */

`;

    // Add imports
    if (hasRoutes) {
      code += `const routes = require('./routes');\n`;
    }
    if (hasMiddleware) {
      code += `const middleware = require('./middleware');\n`;
    }
    if (hasSocketIO) {
      code += `const socketHandlers = require('./socketHandlers');\n`;
    }
    if (hasDatabase) {
      code += `const models = require('./models');\n`;
    }
    if (hasSettings) {
      code += `const settings = require('./settings');\n`;
    }

    code += `\nclass ${this.toPascalCase(basic.name)}Plugin {\n`;
    code += `  constructor() {\n`;
    code += `    this.name = '${basic.name}';\n`;
    code += `    this.version = '${basic.version || '1.0.0'}';\n`;
    code += `    this.description = '${basic.description}';\n`;
    if (hasSettings) {
      code += `    this.settings = settings;\n`;
    }
    code += `  }\n\n`;

    // Initialize method
    code += `  /**\n`;
    code += `   * Initialize plugin\n`;
    code += `   * Called when plugin is loaded\n`;
    code += `   */\n`;
    code += `  async initialize(app, io) {\n`;
    code += `    console.log('[${basic.name}] Initializing plugin...');\n\n`;

    if (hasDatabase) {
      code += `    // Initialize database models\n`;
      code += `    await models.sync();\n`;
      code += `    console.log('[${basic.name}] Database models synchronized');\n\n`;
    }

    if (hasMiddleware) {
      code += `    // Register middleware\n`;
      code += `    middleware.register(app);\n`;
      code += `    console.log('[${basic.name}] Middleware registered');\n\n`;
    }

    if (hasRoutes) {
      code += `    // Register routes\n`;
      code += `    app.use('/${basic.name}', routes);\n`;
      code += `    console.log('[${basic.name}] Routes registered at /${basic.name}');\n\n`;
    }

    if (hasSocketIO) {
      code += `    // Register Socket.IO handlers\n`;
      code += `    socketHandlers.register(io);\n`;
      code += `    console.log('[${basic.name}] Socket.IO handlers registered');\n\n`;
    }

    code += `    console.log('[${basic.name}] Plugin initialized successfully');\n`;
    code += `  }\n\n`;

    // Shutdown method
    code += `  /**\n`;
    code += `   * Shutdown plugin\n`;
    code += `   * Called when plugin is unloaded\n`;
    code += `   */\n`;
    code += `  async shutdown() {\n`;
    code += `    console.log('[${basic.name}] Shutting down plugin...');\n`;
    code += `    // Cleanup resources here\n`;
    code += `  }\n`;

    code += `}\n\n`;
    code += `module.exports = ${this.toPascalCase(basic.name)}Plugin;\n`;

    await fs.writeFile(path.join(pluginDir, 'index.js'), code, 'utf8');
    logger.info('Generated index.js', { plugin: basic.name });
  }

  /**
   * Generate routes file
   */
  async generateRoutesFile(pluginDir, routes) {
    let code = `/**
 * Plugin Routes
 * HTTP route handlers for the plugin
 */

const express = require('express');
const router = express.Router();

`;

    for (const route of routes) {
      const method = route.method.toLowerCase();
      const handlerName = this.toHandlerName(route.path, method);

      code += `/**\n`;
      code += ` * ${route.description || route.method + ' ' + route.path}\n`;
      code += ` */\n`;
      code += `router.${method}('${route.path}', async (req, res) => {\n`;
      code += `  try {\n`;
      code += `    // TODO: Implement handler logic\n`;
      code += `    res.json({\n`;
      code += `      success: true,\n`;
      code += `      message: '${route.method} ${route.path} endpoint'\n`;
      code += `    });\n`;
      code += `  } catch (error) {\n`;
      code += `    console.error('Route error:', error);\n`;
      code += `    res.status(500).json({\n`;
      code += `      success: false,\n`;
      code += `      error: error.message\n`;
      code += `    });\n`;
      code += `  }\n`;
      code += `});\n\n`;
    }

    code += `module.exports = router;\n`;

    await fs.writeFile(path.join(pluginDir, 'routes.js'), code, 'utf8');
    logger.info('Generated routes.js');
  }

  /**
   * Generate middleware file
   */
  async generateMiddlewareFile(pluginDir, middleware) {
    let code = `/**
 * Plugin Middleware
 * Custom middleware functions
 */

`;

    for (const mw of middleware) {
      code += `/**\n`;
      code += ` * ${mw.description || mw.name}\n`;
      code += ` */\n`;
      code += `function ${mw.name}(req, res, next) {\n`;
      code += `  // TODO: Implement middleware logic\n`;
      code += `  console.log('[${mw.name}] Processing request:', req.path);\n`;
      code += `  next();\n`;
      code += `}\n\n`;
    }

    code += `/**\n`;
    code += ` * Register all middleware\n`;
    code += ` */\n`;
    code += `function register(app) {\n`;
    for (const mw of middleware) {
      if (mw.global) {
        code += `  app.use(${mw.name});\n`;
      }
    }
    code += `}\n\n`;

    code += `module.exports = {\n`;
    for (let i = 0; i < middleware.length; i++) {
      code += `  ${middleware[i].name}`;
      if (i < middleware.length - 1) code += ',';
      code += `\n`;
    }
    code += `  register\n`;
    code += `};\n`;

    await fs.writeFile(path.join(pluginDir, 'middleware.js'), code, 'utf8');
    logger.info('Generated middleware.js');
  }

  /**
   * Generate Socket.IO handlers
   */
  async generateSocketHandlers(pluginDir, socketEvents) {
    let code = `/**
 * Socket.IO Event Handlers
 * Real-time WebSocket event handlers
 */

`;

    for (const event of socketEvents) {
      code += `/**\n`;
      code += ` * ${event.description || 'Handle ' + event.name}\n`;
      code += ` */\n`;
      code += `function handle${this.toPascalCase(event.name)}(socket, data) {\n`;
      code += `  console.log('[Socket.IO] ${event.name}:', data);\n`;
      code += `  // TODO: Implement event handler logic\n`;
      code += `  socket.emit('${event.name}:response', {\n`;
      code += `    success: true,\n`;
      code += `    message: 'Event processed'\n`;
      code += `  });\n`;
      code += `}\n\n`;
    }

    code += `/**\n`;
    code += ` * Register all Socket.IO handlers\n`;
    code += ` */\n`;
    code += `function register(io) {\n`;
    code += `  io.on('connection', (socket) => {\n`;
    code += `    console.log('[Socket.IO] Client connected:', socket.id);\n\n`;

    for (const event of socketEvents) {
      code += `    socket.on('${event.name}', (data) => {\n`;
      code += `      handle${this.toPascalCase(event.name)}(socket, data);\n`;
      code += `    });\n\n`;
    }

    code += `    socket.on('disconnect', () => {\n`;
    code += `      console.log('[Socket.IO] Client disconnected:', socket.id);\n`;
    code += `    });\n`;
    code += `  });\n`;
    code += `}\n\n`;

    code += `module.exports = { register };\n`;

    await fs.writeFile(path.join(pluginDir, 'socketHandlers.js'), code, 'utf8');
    logger.info('Generated socketHandlers.js');
  }

  /**
   * Generate database models
   */
  async generateDatabaseModels(pluginDir, database) {
    const modelsDir = path.join(pluginDir, 'models');
    await fs.mkdir(modelsDir, { recursive: true });

    // Generate index file
    let indexCode = `/**
 * Database Models
 */

const { Sequelize } = require('sequelize');

// TODO: Configure database connection
const sequelize = new Sequelize({
  dialect: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'exprsn',
  username: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  logging: false
});

// Import models here
// const SampleModel = require('./SampleModel');

const models = {
  sequelize,
  Sequelize,
  // Add models here
};

// Initialize associations
Object.keys(models).forEach(modelName => {
  if (models[modelName].associate) {
    models[modelName].associate(models);
  }
});

/**
 * Sync all models
 */
async function sync() {
  await sequelize.sync({ alter: false });
  console.log('Models synchronized');
}

module.exports = { ...models, sync };
`;

    await fs.writeFile(path.join(modelsDir, 'index.js'), indexCode, 'utf8');
    logger.info('Generated models/index.js');
  }

  /**
   * Generate views
   */
  async generateViews(pluginDir, views) {
    const viewsDir = path.join(pluginDir, 'views');
    await fs.mkdir(viewsDir, { recursive: true });

    for (const view of views) {
      const viewCode = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${view.title || view.name}</title>
  <link rel="stylesheet" href="/css/exprsn-theme.css">
</head>
<body>
  <div class="container">
    <h1>${view.title || view.name}</h1>
    <p>TODO: Implement view content</p>
  </div>
</body>
</html>
`;

      await fs.writeFile(path.join(viewsDir, `${view.name}.ejs`), viewCode, 'utf8');
    }

    logger.info('Generated views', { count: views.length });
  }

  /**
   * Generate assets structure
   */
  async generateAssetsStructure(pluginDir) {
    const publicDir = path.join(pluginDir, 'public');
    await fs.mkdir(path.join(publicDir, 'css'), { recursive: true });
    await fs.mkdir(path.join(publicDir, 'js'), { recursive: true });
    await fs.mkdir(path.join(publicDir, 'images'), { recursive: true });

    // Generate sample CSS
    const cssCode = `/**
 * Plugin Styles
 */

.plugin-container {
  padding: 20px;
}
`;
    await fs.writeFile(path.join(publicDir, 'css', 'plugin.css'), cssCode, 'utf8');

    // Generate sample JS
    const jsCode = `/**
 * Plugin Client-Side JavaScript
 */

(function() {
  console.log('Plugin loaded');
})();
`;
    await fs.writeFile(path.join(publicDir, 'js', 'plugin.js'), jsCode, 'utf8');

    logger.info('Generated assets structure');
  }

  /**
   * Generate settings file
   */
  async generateSettingsFile(pluginDir, settings) {
    const code = `/**
 * Plugin Settings
 */

const defaultSettings = ${JSON.stringify(settings, null, 2)};

module.exports = defaultSettings;
`;

    await fs.writeFile(path.join(pluginDir, 'settings.js'), code, 'utf8');
    logger.info('Generated settings.js');
  }

  /**
   * Generate README.md
   */
  async generateReadme(pluginDir, basic, features) {
    let readme = `# ${basic.name}

${basic.description}

## Version

${basic.version || '1.0.0'}

## Author

${basic.author}

## License

${basic.license || 'MIT'}

## Features

`;

    if (features.routes) readme += `- HTTP Routes\n`;
    if (features.middleware) readme += `- Custom Middleware\n`;
    if (features.socketio) readme += `- Socket.IO Event Handlers\n`;
    if (features.database) readme += `- Database Models\n`;
    if (features.views) readme += `- EJS Views\n`;
    if (features.assets) readme += `- Static Assets\n`;
    if (features.settings) readme += `- Configuration Settings\n`;
    if (features.dashboard) readme += `- Dashboard Widgets\n`;
    if (features.hooks) readme += `- Lifecycle Hooks\n`;
    if (features.api) readme += `- API Endpoints\n`;

    readme += `\n## Installation

\`\`\`bash
npm install
\`\`\`

## Usage

This plugin integrates with the Exprsn Low-Code Platform automatically.

## Development

TODO: Add development instructions

## Contributing

TODO: Add contributing guidelines

## Support

TODO: Add support information
`;

    await fs.writeFile(path.join(pluginDir, 'README.md'), readme, 'utf8');
    logger.info('Generated README.md');
  }

  /**
   * Helper: Convert string to PascalCase
   */
  toPascalCase(str) {
    return str
      .replace(/[-_\s]+(.)?/g, (_, char) => char ? char.toUpperCase() : '')
      .replace(/^(.)/, (_, char) => char.toUpperCase());
  }

  /**
   * Helper: Convert route path to handler name
   */
  toHandlerName(path, method) {
    const cleanPath = path.replace(/^\//, '').replace(/\//g, '_').replace(/[:-]/g, '_');
    return `${method}_${cleanPath || 'root'}`;
  }
}

module.exports = new PluginScaffolder();
