/**
 * REST Connection Handler
 *
 * Handles connections to external REST APIs with support for
 * authentication, custom headers, and response transformation.
 */

const axios = require('axios');
const BaseConnectionHandler = require('./BaseConnectionHandler');

class RESTConnectionHandler extends BaseConnectionHandler {
  constructor(config) {
    super(config);
    this.validateConfig(['baseUrl']);
    this.apiClient = null;
  }

  /**
   * Connect to REST API
   */
  async connect() {
    try {
      // Create axios instance with base configuration
      this.apiClient = axios.create({
        baseURL: this.config.baseUrl,
        timeout: this.config.timeout || 30000,
        headers: this.buildHeaders()
      });

      // Add request interceptor for authentication
      this.apiClient.interceptors.request.use(async (config) => {
        // Dynamic authentication header injection
        if (this.config.auth) {
          config.headers = await this.addAuthHeaders(config.headers);
        }

        return config;
      });

      // Add response interceptor
      this.apiClient.interceptors.response.use(
        response => this.transformResponse(response),
        error => this.handleError(error, {
          action: 'apiRequest',
          url: error.config?.url,
          method: error.config?.method
        })
      );

      // Test the connection if enabled
      if (this.config.testOnConnect !== false) {
        await this.testConnection();
      }
    } catch (error) {
      this.handleError(error, { action: 'connect' });
    }
  }

  /**
   * Disconnect from REST API
   */
  async disconnect() {
    this.apiClient = null;
  }

  /**
   * Test connection
   */
  async testConnection() {
    try {
      if (!this.apiClient) {
        await this.connect();
      }

      const healthEndpoint = this.config.healthEndpoint || '/health';

      const response = await this.apiClient.get(healthEndpoint);

      return {
        success: true,
        status: response.status,
        data: response.data
      };
    } catch (error) {
      // If health endpoint doesn't exist, just test base URL
      try {
        const response = await this.apiClient.get('/');
        return {
          success: true,
          status: response.status,
          message: 'Base URL accessible'
        };
      } catch (err) {
        this.handleError(error, { action: 'testConnection' });
      }
    }
  }

  /**
   * Build headers
   */
  buildHeaders() {
    const headers = {
      'Content-Type': this.config.contentType || 'application/json',
      'Accept': this.config.accept || 'application/json'
    };

    // Add custom headers
    if (this.config.headers) {
      Object.assign(headers, this.config.headers);
    }

    return headers;
  }

  /**
   * Add authentication headers
   */
  async addAuthHeaders(headers) {
    const auth = this.config.auth;

    switch (auth.type) {
      case 'basic':
        const basicAuth = Buffer.from(`${auth.username}:${auth.password}`).toString('base64');
        headers.Authorization = `Basic ${basicAuth}`;
        break;

      case 'bearer':
        headers.Authorization = `Bearer ${auth.token}`;
        break;

      case 'apiKey':
        headers[auth.headerName || 'X-API-Key'] = auth.apiKey;
        break;

      case 'oauth2':
        // OAuth2 token refresh logic would go here
        headers.Authorization = `Bearer ${auth.accessToken}`;
        break;

      case 'custom':
        if (auth.customHeaders) {
          Object.assign(headers, auth.customHeaders);
        }
        break;
    }

    return headers;
  }

  /**
   * Transform response
   */
  transformResponse(response) {
    if (this.config.responseTransform) {
      // Custom transformation function
      return this.config.responseTransform(response);
    }

    // Default transformation
    return {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
      data: response.data
    };
  }

  /**
   * Execute query
   */
  async query(queryConfig) {
    const {
      method = 'GET',
      endpoint,
      data = null,
      params = null,
      headers = null,
      cacheKey = null
    } = queryConfig;

    // Ensure connected
    if (!this.apiClient) {
      await this.connect();
    }

    // Use cache if key provided
    if (cacheKey && method.toUpperCase() === 'GET') {
      return this.getData(cacheKey, () => this.executeRequest(method, endpoint, data, params, headers));
    }

    return this.executeRequest(method, endpoint, data, params, headers);
  }

  /**
   * Execute HTTP request
   */
  async executeRequest(method, endpoint, data, params, headers) {
    try {
      const config = {
        method: method.toUpperCase(),
        url: endpoint,
        data,
        params,
        headers
      };

      const response = await this.apiClient.request(config);
      return response.data;
    } catch (error) {
      this.handleError(error, {
        action: 'executeRequest',
        method,
        endpoint
      });
    }
  }

  /**
   * GET request
   */
  async get(endpoint, params = null, options = {}) {
    return this.query({
      method: 'GET',
      endpoint,
      params,
      ...options
    });
  }

  /**
   * POST request
   */
  async post(endpoint, data, options = {}) {
    return this.query({
      method: 'POST',
      endpoint,
      data,
      ...options
    });
  }

  /**
   * PUT request
   */
  async put(endpoint, data, options = {}) {
    return this.query({
      method: 'PUT',
      endpoint,
      data,
      ...options
    });
  }

  /**
   * PATCH request
   */
  async patch(endpoint, data, options = {}) {
    return this.query({
      method: 'PATCH',
      endpoint,
      data,
      ...options
    });
  }

  /**
   * DELETE request
   */
  async delete(endpoint, options = {}) {
    return this.query({
      method: 'DELETE',
      endpoint,
      ...options
    });
  }

  /**
   * Execute batch requests
   */
  async batch(requests) {
    try {
      const promises = requests.map(req =>
        this.query(req).catch(error => ({ error: error.message }))
      );

      const results = await Promise.all(promises);

      return {
        results,
        successCount: results.filter(r => !r.error).length,
        errorCount: results.filter(r => r.error).length
      };
    } catch (error) {
      this.handleError(error, { action: 'batch' });
    }
  }

  /**
   * Paginated request helper
   */
  async *paginate(endpoint, options = {}) {
    const {
      pageSize = 25,
      pageParam = 'page',
      limitParam = 'limit',
      startPage = 1,
      maxPages = null
    } = options;

    let currentPage = startPage;
    let hasMore = true;
    let pagesRetrieved = 0;

    while (hasMore) {
      const response = await this.get(endpoint, {
        [pageParam]: currentPage,
        [limitParam]: pageSize,
        ...options.params
      });

      yield response;

      // Determine if there are more pages
      // This logic varies by API, so make it configurable
      if (options.hasMoreCheck) {
        hasMore = options.hasMoreCheck(response);
      } else {
        // Default: assume no more if less than page size
        hasMore = Array.isArray(response.data)
          ? response.data.length === pageSize
          : response.data?.length === pageSize;
      }

      pagesRetrieved++;
      if (maxPages && pagesRetrieved >= maxPages) {
        hasMore = false;
      }

      currentPage++;
    }
  }

  /**
   * Get all paginated results
   */
  async getAllPages(endpoint, options = {}) {
    const allResults = [];

    for await (const page of this.paginate(endpoint, options)) {
      const data = Array.isArray(page.data) ? page.data : page;
      allResults.push(...data);
    }

    return allResults;
  }
}

module.exports = RESTConnectionHandler;
