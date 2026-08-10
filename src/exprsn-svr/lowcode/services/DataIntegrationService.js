/**
 * ═══════════════════════════════════════════════════════════
 * Data Integration Service
 * Handles integration with multiple data sources:
 * - PostgreSQL databases
 * - Forge CRM (via API)
 * - XML/JSON/BSON files and APIs
 * - REST/SOAP web services
 * ═══════════════════════════════════════════════════════════
 */

const { Sequelize } = require('sequelize');
const axios = require('axios');
const xml2js = require('xml2js');
const BSON = require('bson');

class DataIntegrationService {
  constructor() {
    this.connections = new Map();
    this.parsers = {
      json: new JSONParser(),
      xml: new XMLParser(),
      bson: new BSONParser()
    };
  }

  /**
   * Fetch data from a data source
   */
  async fetchData(dataSourceConfig, filters = {}) {
    const { sourceType } = dataSourceConfig;

    switch (sourceType) {
      case 'postgresql':
        return await this.fetchPostgreSQL(dataSourceConfig, filters);

      case 'forge':
        return await this.fetchForge(dataSourceConfig, filters);

      case 'rest':
        return await this.fetchREST(dataSourceConfig, filters);

      case 'soap':
        return await this.fetchSOAP(dataSourceConfig, filters);

      case 'json':
        return await this.fetchJSON(dataSourceConfig, filters);

      case 'xml':
        return await this.fetchXML(dataSourceConfig, filters);

      case 'csv':
      case 'tsv':
        return await this.fetchDelimited(dataSourceConfig, filters, sourceType);

      default:
        throw new Error(`Unsupported data source type: ${sourceType}`);
    }
  }

  /**
   * Save data to a data source
   */
  async saveData(dataSourceConfig, data, options = {}) {
    const { sourceType } = dataSourceConfig;

    switch (sourceType) {
      case 'postgresql':
        return await this.savePostgreSQL(dataSourceConfig, data, options);

      case 'forge':
        return await this.saveForge(dataSourceConfig, data, options);

      case 'rest':
        return await this.saveREST(dataSourceConfig, data, options);

      default:
        throw new Error(`Save operation not supported for ${sourceType}`);
    }
  }

  /**
   * Fetch from PostgreSQL database
   */
  async fetchPostgreSQL(config, filters) {
    try {
      const connection = await this.getPostgreSQLConnection(config);

      // Build query
      const { query, table, where, orderBy, limit, offset } = this.buildSQLQuery(config, filters);

      let result;
      if (query) {
        // Execute raw query
        [result] = await connection.query(query, {
          replacements: filters,
          type: Sequelize.QueryTypes.SELECT
        });
      } else {
        // Build query from params
        const whereClause = this.buildWhereClause(where);
        const queryStr = `
          SELECT * FROM ${table}
          ${whereClause ? `WHERE ${whereClause}` : ''}
          ${orderBy ? `ORDER BY ${orderBy}` : ''}
          ${limit ? `LIMIT ${limit}` : ''}
          ${offset ? `OFFSET ${offset}` : ''}
        `;

        [result] = await connection.query(queryStr, {
          type: Sequelize.QueryTypes.SELECT
        });
      }

      return result;
    } catch (error) {
      console.error('[DataIntegration] PostgreSQL fetch error:', error);
      throw error;
    }
  }

  /**
   * Save to PostgreSQL database
   */
  async savePostgreSQL(config, data, options) {
    try {
      const connection = await this.getPostgreSQLConnection(config);
      const table = config.connectionConfig.table;

      if (options.operation === 'update' && data.id) {
        // Update existing record
        const fields = Object.keys(data).filter(k => k !== 'id');
        const setClause = fields.map(f => `${f} = :${f}`).join(', ');

        await connection.query(
          `UPDATE ${table} SET ${setClause} WHERE id = :id`,
          { replacements: data }
        );

        return { success: true, operation: 'update', id: data.id };
      } else {
        // Insert new record
        const fields = Object.keys(data);
        const values = fields.map(f => `:${f}`).join(', ');

        const [result] = await connection.query(
          `INSERT INTO ${table} (${fields.join(', ')}) VALUES (${values}) RETURNING id`,
          { replacements: data }
        );

        return { success: true, operation: 'insert', id: result[0].id };
      }
    } catch (error) {
      console.error('[DataIntegration] PostgreSQL save error:', error);
      throw error;
    }
  }

  /**
   * Get or create PostgreSQL connection
   */
  async getPostgreSQLConnection(config) {
    const connectionKey = `pg_${config.id}`;

    if (!this.connections.has(connectionKey)) {
      const sequelize = new Sequelize({
        database: config.connectionConfig.database,
        username: config.connectionConfig.username,
        password: config.connectionConfig.password,
        host: config.connectionConfig.host,
        port: config.connectionConfig.port || 5432,
        dialect: 'postgres',
        logging: false,
        pool: {
          max: 5,
          min: 0,
          acquire: 30000,
          idle: 10000
        }
      });

      // Test connection
      await sequelize.authenticate();
      this.connections.set(connectionKey, sequelize);
    }

    return this.connections.get(connectionKey);
  }

  /**
   * Fetch from Forge CRM
   */
  async fetchForge(config, filters) {
    try {
      const forgeUrl = process.env.FORGE_URL || 'https://localhost:3016';
      const endpoint = config.connectionConfig.endpoint;

      // Build query params
      const params = {
        ...filters,
        limit: filters.limit || 50,
        offset: filters.offset || 0
      };

      const response = await axios.get(`${forgeUrl}/api${endpoint}`, {
        params,
        headers: {
          'Content-Type': 'application/json',
          ...config.headers
        },
        httpsAgent: new (require('https').Agent)({
          rejectUnauthorized: false
        })
      });

      // Handle pagination metadata
      return {
        data: response.data.data || response.data,
        pagination: response.data.pagination,
        total: response.data.total
      };
    } catch (error) {
      console.error('[DataIntegration] Forge fetch error:', error);
      throw error;
    }
  }

  /**
   * Save to Forge CRM
   */
  async saveForge(config, data, options) {
    try {
      const forgeUrl = process.env.FORGE_URL || 'https://localhost:3016';
      const endpoint = config.connectionConfig.endpoint;

      let response;
      if (data.id) {
        // Update
        response = await axios.put(`${forgeUrl}/api${endpoint}/${data.id}`, data, {
          headers: {
            'Content-Type': 'application/json',
            ...config.headers
          },
          httpsAgent: new (require('https').Agent)({
            rejectUnauthorized: false
          })
        });
      } else {
        // Create
        response = await axios.post(`${forgeUrl}/api${endpoint}`, data, {
          headers: {
            'Content-Type': 'application/json',
            ...config.headers
          },
          httpsAgent: new (require('https').Agent)({
            rejectUnauthorized: false
          })
        });
      }

      return response.data;
    } catch (error) {
      console.error('[DataIntegration] Forge save error:', error);
      throw error;
    }
  }

  /**
   * Fetch from REST API
   */
  async fetchREST(config, filters) {
    try {
      const url = this.buildURL(config.connectionConfig.baseUrl, filters);

      const response = await axios({
        method: config.connectionConfig.method || 'GET',
        url,
        params: config.connectionConfig.method === 'GET' ? filters : undefined,
        data: config.connectionConfig.method !== 'GET' ? filters : undefined,
        headers: {
          'Content-Type': 'application/json',
          ...config.headers
        },
        timeout: config.timeout || 30000
      });

      // Apply response transformation if configured
      if (config.connectionConfig.transformResponse) {
        return this.transformResponse(response.data, config.connectionConfig.transformResponse);
      }

      return response.data;
    } catch (error) {
      console.error('[DataIntegration] REST fetch error:', error);
      throw error;
    }
  }

  /**
   * Save via REST API
   */
  async saveREST(config, data, options) {
    try {
      const url = config.connectionConfig.baseUrl;
      const method = options.method || config.connectionConfig.saveMethod || 'POST';

      // Apply request transformation if configured
      let payload = data;
      if (config.connectionConfig.transformRequest) {
        payload = this.transformRequest(data, config.connectionConfig.transformRequest);
      }

      const response = await axios({
        method,
        url: data.id ? `${url}/${data.id}` : url,
        data: payload,
        headers: {
          'Content-Type': 'application/json',
          ...config.headers
        },
        timeout: config.timeout || 30000
      });

      return response.data;
    } catch (error) {
      console.error('[DataIntegration] REST save error:', error);
      throw error;
    }
  }

  /**
   * Fetch from SOAP service
   */
  async fetchSOAP(config, filters) {
    try {
      const soapEnvelope = this.buildSOAPEnvelope(
        config.connectionConfig.operation,
        filters
      );

      const response = await axios.post(
        config.connectionConfig.wsdlUrl,
        soapEnvelope,
        {
          headers: {
            'Content-Type': 'text/xml; charset=utf-8',
            'SOAPAction': config.connectionConfig.soapAction,
            ...config.headers
          },
          timeout: config.timeout || 30000
        }
      );

      // Parse SOAP response
      return await this.parseSOAPResponse(response.data);
    } catch (error) {
      console.error('[DataIntegration] SOAP fetch error:', error);
      throw error;
    }
  }

  /**
   * Fetch JSON file or API
   */
  async fetchJSON(config, filters) {
    try {
      let jsonData;

      if (config.connectionConfig.url) {
        // Fetch from URL
        const response = await axios.get(config.connectionConfig.url);
        jsonData = response.data;
      } else if (config.connectionConfig.file) {
        // Read from file
        const fs = require('fs').promises;
        const content = await fs.readFile(config.connectionConfig.file, 'utf8');
        jsonData = JSON.parse(content);
      } else {
        throw new Error('No JSON source specified');
      }

      // Apply JSONPath filter if configured
      if (config.connectionConfig.jsonPath) {
        const JSONPath = require('jsonpath');
        jsonData = JSONPath.query(jsonData, config.connectionConfig.jsonPath);
      }

      return jsonData;
    } catch (error) {
      console.error('[DataIntegration] JSON fetch error:', error);
      throw error;
    }
  }

  /**
   * Fetch XML file or API
   */
  async fetchXML(config, filters) {
    try {
      let xmlData;

      if (config.connectionConfig.url) {
        // Fetch from URL
        const response = await axios.get(config.connectionConfig.url);
        xmlData = response.data;
      } else if (config.connectionConfig.file) {
        // Read from file
        const fs = require('fs').promises;
        xmlData = await fs.readFile(config.connectionConfig.file, 'utf8');
      } else {
        throw new Error('No XML source specified');
      }

      // Parse XML to JSON
      const parser = new xml2js.Parser({
        explicitArray: false,
        mergeAttrs: true
      });

      const result = await parser.parseStringPromise(xmlData);

      // Apply XPath if configured
      if (config.connectionConfig.xpath) {
        const xpath = require('xpath');
        const dom = require('xmldom').DOMParser;
        const doc = new dom().parseFromString(xmlData);
        const nodes = xpath.select(config.connectionConfig.xpath, doc);
        return nodes;
      }

      return result;
    } catch (error) {
      console.error('[DataIntegration] XML fetch error:', error);
      throw error;
    }
  }

  /**
   * Fetch delimited file (CSV/TSV)
   */
  async fetchDelimited(config, filters, type) {
    try {
      const fs = require('fs').promises;
      const Papa = require('papaparse');

      let content;
      if (config.connectionConfig.url) {
        const response = await axios.get(config.connectionConfig.url);
        content = response.data;
      } else if (config.connectionConfig.file) {
        content = await fs.readFile(config.connectionConfig.file, 'utf8');
      } else {
        throw new Error('No delimited file source specified');
      }

      const delimiter = type === 'tsv' ? '\t' : ',';
      const result = Papa.parse(content, {
        delimiter,
        header: true,
        skipEmptyLines: true,
        dynamicTyping: true
      });

      return result.data;
    } catch (error) {
      console.error('[DataIntegration] Delimited file fetch error:', error);
      throw error;
    }
  }

  /**
   * Build SQL query from config and filters
   */
  buildSQLQuery(config, filters) {
    const { query, table, columns, where, orderBy, limit, offset } = config.connectionConfig;

    return {
      query: query || null,
      table: table || null,
      columns: columns || '*',
      where: { ...where, ...filters },
      orderBy: orderBy || null,
      limit: filters.limit || limit || null,
      offset: filters.offset || offset || null
    };
  }

  /**
   * Build SQL WHERE clause
   */
  buildWhereClause(conditions) {
    if (!conditions || Object.keys(conditions).length === 0) return '';

    const clauses = Object.entries(conditions).map(([key, value]) => {
      if (value === null) return `${key} IS NULL`;
      if (Array.isArray(value)) return `${key} IN (${value.map(v => `'${v}'`).join(', ')})`;
      if (typeof value === 'object' && value.operator) {
        return `${key} ${value.operator} '${value.value}'`;
      }
      return `${key} = '${value}'`;
    });

    return clauses.join(' AND ');
  }

  /**
   * Build URL with query parameters
   */
  buildURL(baseUrl, params) {
    if (!params || Object.keys(params).length === 0) return baseUrl;

    const url = new URL(baseUrl);
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.append(key, value);
    });

    return url.toString();
  }

  /**
   * Build SOAP envelope
   */
  buildSOAPEnvelope(operation, params) {
    const paramsXML = Object.entries(params)
      .map(([key, value]) => `<${key}>${value}</${key}>`)
      .join('');

    return `<?xml version="1.0" encoding="utf-8"?>
      <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
        <soap:Body>
          <${operation}>
            ${paramsXML}
          </${operation}>
        </soap:Body>
      </soap:Envelope>`;
  }

  /**
   * Parse SOAP response
   */
  async parseSOAPResponse(xmlData) {
    const parser = new xml2js.Parser({ explicitArray: false });
    const result = await parser.parseStringPromise(xmlData);

    // Extract from SOAP envelope
    const body = result['soap:Envelope']['soap:Body'];
    return body;
  }

  /**
   * Transform response data
   */
  transformResponse(data, transform) {
    // Apply JSONata transformation or custom function
    if (typeof transform === 'function') {
      return transform(data);
    }

    // Simple path-based extraction
    if (typeof transform === 'string') {
      return this.getNestedProperty(data, transform);
    }

    return data;
  }

  /**
   * Transform request data
   */
  transformRequest(data, transform) {
    if (typeof transform === 'function') {
      return transform(data);
    }

    // Apply mapping rules
    if (typeof transform === 'object') {
      const transformed = {};
      Object.entries(transform).forEach(([targetKey, sourceKey]) => {
        transformed[targetKey] = this.getNestedProperty(data, sourceKey);
      });
      return transformed;
    }

    return data;
  }

  /**
   * Get nested property by path
   */
  getNestedProperty(obj, path) {
    return path.split('.').reduce((current, prop) => current?.[prop], obj);
  }

  /**
   * Execute API call (for events)
   */
  async executeApiCall(eventConfig) {
    try {
      const response = await axios({
        method: eventConfig.method || 'GET',
        url: eventConfig.url,
        data: eventConfig.data,
        headers: eventConfig.headers,
        timeout: eventConfig.timeout || 30000
      });

      return response.data;
    } catch (error) {
      console.error('[DataIntegration] API call error:', error);
      throw error;
    }
  }

  /**
   * Close all connections
   */
  async closeConnections() {
    for (const [key, connection] of this.connections.entries()) {
      if (connection.close) {
        await connection.close();
      }
    }
    this.connections.clear();
  }
}

/**
 * Parser classes
 */
class JSONParser {
  parse(data) {
    return typeof data === 'string' ? JSON.parse(data) : data;
  }

  stringify(data) {
    return JSON.stringify(data, null, 2);
  }
}

class XMLParser {
  async parse(data) {
    const parser = new xml2js.Parser({ explicitArray: false });
    return await parser.parseStringPromise(data);
  }

  stringify(data) {
    const builder = new xml2js.Builder();
    return builder.buildObject(data);
  }
}

class BSONParser {
  parse(buffer) {
    return BSON.deserialize(buffer);
  }

  stringify(data) {
    return BSON.serialize(data);
  }
}

module.exports = DataIntegrationService;
