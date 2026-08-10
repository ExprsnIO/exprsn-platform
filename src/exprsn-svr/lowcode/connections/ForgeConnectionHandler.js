/**
 * Forge Connection Handler
 *
 * Handles connections to Exprsn Forge (CRM/ERP/Groupware) APIs.
 * Provides access to Forge entities like Contacts, Companies, Deals, etc.
 */

const axios = require('axios');
const BaseConnectionHandler = require('./BaseConnectionHandler');

class ForgeConnectionHandler extends BaseConnectionHandler {
  constructor(config) {
    super(config);
    this.validateConfig(['forgeUrl']);
    this.apiClient = null;
    this.serviceToken = null;
    this.tokenExpiry = null;
  }

  /**
   * Connect to Forge
   */
  async connect() {
    try {
      // Generate service token for authentication
      await this.refreshServiceToken();

      // Create axios instance with base configuration
      this.apiClient = axios.create({
        baseURL: this.config.forgeUrl,
        timeout: this.config.timeout || 30000,
        headers: {
          'Content-Type': 'application/json'
        }
      });

      // Add request interceptor for authentication
      this.apiClient.interceptors.request.use(async (config) => {
        // Check if token needs refresh
        if (!this.serviceToken || Date.now() >= this.tokenExpiry) {
          await this.refreshServiceToken();
        }

        config.headers.Authorization = `Bearer ${this.serviceToken}`;
        return config;
      });

      // Add response interceptor for error handling
      this.apiClient.interceptors.response.use(
        response => response,
        error => {
          this.handleError(error, {
            action: 'apiRequest',
            url: error.config?.url
          });
        }
      );
    } catch (error) {
      this.handleError(error, { action: 'connect' });
    }
  }

  /**
   * Disconnect from Forge
   */
  async disconnect() {
    this.apiClient = null;
    this.serviceToken = null;
    this.tokenExpiry = null;
  }

  /**
   * Test connection
   */
  async testConnection() {
    try {
      if (!this.apiClient) {
        await this.connect();
      }

      const response = await this.apiClient.get('/health');

      return {
        success: true,
        status: response.data.status,
        version: response.data.version
      };
    } catch (error) {
      this.handleError(error, { action: 'testConnection' });
    }
  }

  /**
   * Refresh service token
   */
  async refreshServiceToken() {
    try {
      // Call CA to generate service token
      // This would use the @exprsn/shared utility in production
      const response = await axios.post(
        `${this.config.caUrl || 'http://localhost:3000'}/api/tokens/service`,
        {
          serviceName: 'exprsn-svr-lowcode',
          resource: `${this.config.forgeUrl}/api/*`,
          permissions: {
            read: true,
            write: this.config.allowWrite !== false,
            update: this.config.allowWrite !== false,
            delete: this.config.allowDelete === true
          },
          ttl: 3600 // 1 hour
        }
      );

      this.serviceToken = response.data.token;
      this.tokenExpiry = Date.now() + (3600 * 1000); // 1 hour from now
    } catch (error) {
      console.error('Failed to refresh service token:', error.message);
      throw new Error('Unable to authenticate with Forge service');
    }
  }

  /**
   * Execute query
   */
  async query(queryConfig) {
    const { entity, operation, params = {}, cacheKey = null } = queryConfig;

    // Ensure connected
    if (!this.apiClient) {
      await this.connect();
    }

    // Use cache if key provided
    if (cacheKey) {
      return this.getData(cacheKey, () => this.executeOperation(entity, operation, params));
    }

    return this.executeOperation(entity, operation, params);
  }

  /**
   * Execute operation
   */
  async executeOperation(entity, operation, params) {
    try {
      let response;

      switch (operation) {
        case 'list':
          response = await this.list(entity, params);
          break;

        case 'get':
          response = await this.get(entity, params.id);
          break;

        case 'create':
          response = await this.create(entity, params.data);
          break;

        case 'update':
          response = await this.update(entity, params.id, params.data);
          break;

        case 'delete':
          response = await this.delete(entity, params.id);
          break;

        case 'search':
          response = await this.search(entity, params);
          break;

        default:
          throw new Error(`Unknown operation: ${operation}`);
      }

      return response;
    } catch (error) {
      this.handleError(error, { action: 'executeOperation', entity, operation });
    }
  }

  /**
   * List entities
   */
  async list(entity, options = {}) {
    const {
      limit = 25,
      offset = 0,
      sortBy = 'created_at',
      sortOrder = 'DESC',
      filters = {}
    } = options;

    const response = await this.apiClient.get(`/api/${entity}`, {
      params: {
        limit,
        offset,
        sortBy,
        sortOrder,
        ...filters
      }
    });

    return {
      data: response.data.data,
      total: response.data.total,
      hasMore: response.data.hasMore
    };
  }

  /**
   * Get single entity
   */
  async get(entity, id) {
    const response = await this.apiClient.get(`/api/${entity}/${id}`);
    return response.data.data;
  }

  /**
   * Create entity
   */
  async create(entity, data) {
    const response = await this.apiClient.post(`/api/${entity}`, data);
    return response.data.data;
  }

  /**
   * Update entity
   */
  async update(entity, id, data) {
    const response = await this.apiClient.put(`/api/${entity}/${id}`, data);
    return response.data.data;
  }

  /**
   * Delete entity
   */
  async delete(entity, id) {
    const response = await this.apiClient.delete(`/api/${entity}/${id}`);
    return response.data;
  }

  /**
   * Search entities
   */
  async search(entity, options = {}) {
    const {
      query = '',
      filters = {},
      limit = 25,
      offset = 0
    } = options;

    const response = await this.apiClient.post(`/api/${entity}/search`, {
      query,
      filters,
      limit,
      offset
    });

    return {
      data: response.data.data,
      total: response.data.total,
      hasMore: response.data.hasMore
    };
  }

  /**
   * Get entity schema
   */
  async getSchema(entity) {
    const cacheKey = `schema:${entity}`;

    return this.getData(cacheKey, async () => {
      const response = await this.apiClient.get(`/api/metadata/${entity}/schema`);
      return response.data.data;
    });
  }

  /**
   * List available entities
   */
  async listEntities() {
    const cacheKey = 'entities:list';

    return this.getData(cacheKey, async () => {
      const response = await this.apiClient.get('/api/metadata/entities');
      return response.data.data;
    });
  }

  /**
   * Execute custom Forge API call
   */
  async customRequest(method, endpoint, data = null, params = null) {
    const config = {
      method: method.toLowerCase(),
      url: endpoint,
      data,
      params
    };

    const response = await this.apiClient.request(config);
    return response.data;
  }

  /**
   * Get CRM contacts
   */
  async getContacts(options = {}) {
    return this.list('contacts', options);
  }

  /**
   * Get CRM companies
   */
  async getCompanies(options = {}) {
    return this.list('companies', options);
  }

  /**
   * Get CRM deals
   */
  async getDeals(options = {}) {
    return this.list('deals', options);
  }

  /**
   * Get CRM activities
   */
  async getActivities(options = {}) {
    return this.list('activities', options);
  }

  /**
   * Get CRM pipelines
   */
  async getPipelines(options = {}) {
    return this.list('pipelines', options);
  }
}

module.exports = ForgeConnectionHandler;
