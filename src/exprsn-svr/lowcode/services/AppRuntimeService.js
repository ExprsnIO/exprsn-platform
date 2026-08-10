/**
 * ═══════════════════════════════════════════════════════════
 * Application Runtime Service
 * Loads and prepares applications for execution
 * ═══════════════════════════════════════════════════════════
 */

const {
  Application,
  Entity,
  AppForm,
  Grid,
  Card,
  DataSource,
  FormConnection,
  AppSetting
} = require('../models');

// Import SettingsService for loading settings
const SettingsService = require('./SettingsService');

class AppRuntimeService {
  constructor() {
    // Initialize SettingsService
    this.settingsService = new SettingsService({ AppSetting, Application });
  }

  /**
   * Load application settings as variables
   * @param {string} appId - Application ID
   * @param {string} environment - Environment (development, staging, production, all)
   * @returns {Object} Settings as key-value object
   */
  async loadSettings(appId, environment = 'all') {
    try {
      // Detect environment from NODE_ENV if not specified
      if (environment === 'all') {
        environment = process.env.NODE_ENV || 'development';
      }

      const settings = await this.settingsService.getSettingsAsObject(appId, environment);
      return settings;
    } catch (error) {
      console.error('Failed to load settings:', error);
      return {}; // Return empty object if settings fail to load
    }
  }

  /**
   * Load complete application with all components
   * @param {string} appId - Application ID
   * @param {string} userId - User ID (for permissions)
   * @returns {Object} Complete application data
   */
  async loadApplication(appId, userId = null) {
    const application = await Application.findByPk(appId, {
      include: [
        {
          model: Entity,
          as: 'entities',
          attributes: ['id', 'name', 'displayName', 'schema', 'status']
        },
        {
          model: AppForm,
          as: 'forms',
          attributes: ['id', 'name', 'displayName', 'schema', 'isStartForm', 'status'],
          include: [
            {
              model: FormConnection,
              as: 'connections',
              attributes: ['id', 'sourceType', 'sourceId', 'targetType', 'targetId', 'mappings']
            }
          ]
        },
        {
          model: Grid,
          as: 'grids',
          attributes: ['id', 'name', 'displayName', 'columns', 'dataSource', 'filters', 'sorting', 'status']
        },
        {
          model: Card,
          as: 'cards',
          attributes: ['id', 'name', 'displayName', 'schema', 'category', 'status']
        },
        {
          model: DataSource,
          as: 'dataSources',
          attributes: ['id', 'name', 'displayName', 'type', 'config', 'status']
        }
      ]
    });

    if (!application) {
      throw new Error('Application not found');
    }

    // Check if user has permission to access this app
    if (application.status === 'draft' && userId !== application.ownerId) {
      throw new Error('Application not published');
    }

    // Find start form
    const startForm = application.forms.find(f => f.isStartForm) || application.forms[0];

    // Load application settings
    const settings = await this.loadSettings(appId);

    return {
      id: application.id,
      name: application.name,
      displayName: application.displayName,
      description: application.description,
      version: application.version,
      status: application.status,
      theme: application.theme || 'default',
      startFormId: startForm?.id || null,
      entities: application.entities,
      forms: application.forms,
      grids: application.grids,
      cards: application.cards,
      dataSources: application.dataSources,
      settings, // Include settings as variables
      metadata: {
        createdAt: application.createdAt,
        updatedAt: application.updatedAt,
        owner: application.ownerId
      }
    };
  }

  /**
   * Load specific form for runtime
   * @param {string} appId - Application ID
   * @param {string} formId - Form ID
   * @returns {Object} Form data with all dependencies
   */
  async loadForm(appId, formId) {
    const application = await Application.findByPk(appId);
    if (!application) {
      throw new Error('Application not found');
    }

    const form = await AppForm.findOne({
      where: { id: formId, applicationId: appId },
      include: [
        {
          model: FormConnection,
          as: 'connections',
          include: [
            {
              model: Entity,
              as: 'entity',
              attributes: ['id', 'name', 'displayName', 'schema']
            },
            {
              model: DataSource,
              as: 'dataSource',
              attributes: ['id', 'name', 'type', 'config']
            }
          ]
        }
      ]
    });

    if (!form) {
      throw new Error('Form not found');
    }

    // Load application settings
    const settings = await this.loadSettings(appId);

    return {
      id: form.id,
      name: form.name,
      displayName: form.displayName,
      schema: form.schema,
      connections: form.connections,
      variables: form.variables || {},
      settings, // Include settings as variables
      rules: form.rules || [],
      metadata: {
        applicationId: appId,
        applicationName: application.name,
        isStartForm: form.isStartForm
      }
    };
  }

  /**
   * Load grid for runtime
   * @param {string} appId - Application ID
   * @param {string} gridId - Grid ID
   * @returns {Object} Grid configuration
   */
  async loadGrid(appId, gridId) {
    const grid = await Grid.findOne({
      where: { id: gridId, applicationId: appId },
      include: [
        {
          model: DataSource,
          as: 'dataSource',
          attributes: ['id', 'name', 'type', 'config', 'status']
        }
      ]
    });

    if (!grid) {
      throw new Error('Grid not found');
    }

    // Load application settings
    const settings = await this.loadSettings(appId);

    return {
      id: grid.id,
      name: grid.name,
      displayName: grid.displayName,
      columns: grid.columns,
      dataSource: grid.dataSource,
      filters: grid.filters || [],
      sorting: grid.sorting || [],
      pagination: grid.pagination || { enabled: true, pageSize: 25 },
      actions: grid.actions || [],
      styling: grid.styling || {},
      settings // Include settings for dynamic configuration
    };
  }

  /**
   * Execute data source query
   * @param {string} dataSourceId - Data source ID
   * @param {Object} query - Query parameters
   * @returns {Object} Query results
   */
  async executeDataSourceQuery(dataSourceId, query = {}) {
    const dataSource = await DataSource.findByPk(dataSourceId);

    if (!dataSource) {
      throw new Error('Data source not found');
    }

    if (dataSource.status !== 'active') {
      throw new Error('Data source is not active');
    }

    // Import ConnectionManager
    const { ConnectionManager } = require('../connections');

    try {
      // Get or create connection
      const connectionId = `runtime_${dataSourceId}`;

      // Check if connection exists
      if (!ConnectionManager.hasConnection(connectionId)) {
        await ConnectionManager.createConnection(
          connectionId,
          dataSource.type,
          dataSource.config
        );
      }

      // Execute query based on type
      let result;
      const recordId = query.id || query.recordId; // Support both 'id' and 'recordId'

      switch (query.operation || 'query') {
        case 'query':
          result = await ConnectionManager.query(connectionId, query.sql || query.query);
          break;

        case 'get':
          result = await ConnectionManager.get(connectionId, recordId);
          break;

        case 'list':
          result = await ConnectionManager.list(connectionId, query.filters, query.options);
          break;

        case 'create':
          result = await ConnectionManager.create(connectionId, query.data);
          break;

        case 'update':
          result = await ConnectionManager.update(connectionId, recordId, query.data);
          break;

        case 'delete':
          result = await ConnectionManager.delete(connectionId, recordId);
          break;

        default:
          throw new Error(`Unsupported operation: ${query.operation}`);
      }

      return {
        success: true,
        data: result,
        metadata: {
          dataSourceId,
          dataSourceName: dataSource.name,
          operation: query.operation || 'query',
          timestamp: new Date()
        }
      };

    } catch (error) {
      return {
        success: false,
        error: error.message,
        metadata: {
          dataSourceId,
          dataSourceName: dataSource.name,
          operation: query.operation || 'query',
          timestamp: new Date()
        }
      };
    }
  }

  /**
   * Get application navigation structure
   * @param {string} appId - Application ID
   * @returns {Array} Navigation items
   */
  async getNavigation(appId) {
    const application = await Application.findByPk(appId, {
      include: [
        {
          model: AppForm,
          as: 'forms',
          attributes: ['id', 'name', 'displayName', 'isStartForm', 'icon'],
          where: { status: 'published' },
          required: false
        }
      ]
    });

    if (!application) {
      throw new Error('Application not found');
    }

    // Build navigation from forms
    const navigation = application.forms.map(form => ({
      id: form.id,
      label: form.displayName,
      icon: form.icon || 'fa-file',
      route: `/apps/${appId}/forms/${form.id}`,
      isStart: form.isStartForm
    }));

    // Sort: start form first, then alphabetically
    navigation.sort((a, b) => {
      if (a.isStart && !b.isStart) return -1;
      if (!a.isStart && b.isStart) return 1;
      return a.label.localeCompare(b.label);
    });

    return navigation;
  }

  /**
   * Record application usage analytics
   * @param {string} appId - Application ID
   * @param {string} userId - User ID
   * @param {Object} event - Event data
   */
  async recordAnalytics(appId, userId, event) {
    // This would integrate with Pulse analytics service
    // For now, just log
    console.log('Analytics Event:', {
      appId,
      userId,
      event,
      timestamp: new Date()
    });

    // TODO: Send to Pulse service via HTTP
    // await fetch('http://localhost:3012/api/events', {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify({ appId, userId, event })
    // });
  }
}

module.exports = new AppRuntimeService();
