/**
 * ═══════════════════════════════════════════════════════════
 * WYSIWYG Data Binding Module
 * Handles JSON, XML, Database, and Redis data sources
 * ═══════════════════════════════════════════════════════════
 */

const WYSIWYGDataBinding = {
  /**
   * Active data sources
   */
  dataSources: [],

  /**
   * Cache for loaded data
   */
  dataCache: {},

  /**
   * Add a new data source
   */
  addDataSource(config) {
    const source = {
      id: `source-${Date.now()}`,
      name: config.name ||`Source ${this.dataSources.length + 1}`,
      type: config.type, // 'json', 'xml', 'database', 'redis', 'api'
      config: config,
      data: null,
      lastUpdated: null
    };

    this.dataSources.push(source);
    return source.id;
  },

  /**
   * Load data from JSON source
   */
  async loadJSON(config) {
    try {
      let data;

      if (config.url) {
        // Load from URL
        const response = await fetch(config.url);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        data = await response.json();
      } else if (config.data) {
        // Direct JSON data
        data = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
      } else if (config.file) {
        // Load from file upload
        data = await this.readFileAsJSON(config.file);
      }

      return {
        success: true,
        data: data,
        format: 'json'
      };
    } catch (error) {
      console.error('JSON load error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  },

  /**
   * Load data from XML source
   */
  async loadXML(config) {
    try {
      let xmlText;

      if (config.url) {
        const response = await fetch(config.url);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        xmlText = await response.text();
      } else if (config.data) {
        xmlText = config.data;
      } else if (config.file) {
        xmlText = await this.readFileAsText(config.file);
      }

      // Parse XML to JSON
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
      const jsonData = this.xmlToJson(xmlDoc);

      return {
        success: true,
        data: jsonData,
        format: 'xml',
        raw: xmlText
      };
    } catch (error) {
      console.error('XML load error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  },

  /**
   * Load data from database
   */
  async loadDatabase(config) {
    try {
      const response = await fetch('/lowcode/api/data/query', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          connection: config.connection, // postgres, mysql, mongodb
          database: config.database,
          query: config.query,
          params: config.params || []
        })
      });

      if (!response.ok) throw new Error(`Database query failed: ${response.status}`);

      const result = await response.json();

      return {
        success: true,
        data: result.data,
        format: 'database',
        rowCount: result.rowCount
      };
    } catch (error) {
      console.error('Database load error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  },

  /**
   * Load data from Redis
   */
  async loadRedis(config) {
    try {
      const response = await fetch('/lowcode/api/data/redis', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          operation: config.operation || 'get',
          key: config.key,
          value: config.value,
          ttl: config.ttl
        })
      });

      if (!response.ok) throw new Error(`Redis operation failed: ${response.status}`);

      const result = await response.json();

      return {
        success: true,
        data: result.data,
        format: 'redis'
      };
    } catch (error) {
      console.error('Redis load error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  },

  /**
   * Load data from API endpoint
   */
  async loadAPI(config) {
    try {
      const options = {
        method: config.method || 'GET',
        headers: config.headers || {
          'Content-Type': 'application/json'
        }
      };

      if (config.body && (config.method === 'POST' || config.method === 'PUT')) {
        options.body = JSON.stringify(config.body);
      }

      const response = await fetch(config.url, options);

      if (!response.ok) throw new Error(`API call failed: ${response.status}`);

      const data = await response.json();

      return {
        success: true,
        data: data,
        format: 'api'
      };
    } catch (error) {
      console.error('API load error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  },

  /**
   * Load data based on source type
   */
  async loadData(sourceId) {
    const source = this.dataSources.find(s => s.id === sourceId);
    if (!source) {
      return { success: false, error: 'Source not found' };
    }

    let result;

    switch (source.type) {
      case 'json':
        result = await this.loadJSON(source.config);
        break;
      case 'xml':
        result = await this.loadXML(source.config);
        break;
      case 'database':
        result = await this.loadDatabase(source.config);
        break;
      case 'redis':
        result = await this.loadRedis(source.config);
        break;
      case 'api':
        result = await this.loadAPI(source.config);
        break;
      default:
        return { success: false, error: 'Unknown source type' };
    }

    if (result.success) {
      source.data = result.data;
      source.lastUpdated = new Date();
      this.dataCache[sourceId] = result.data;
    }

    return result;
  },

  /**
   * Bind data to element
   */
  bindDataToElement(elementId, sourceId, binding) {
    const element = document.getElementById(elementId);
    if (!element) {
      console.error('Element not found:', elementId);
      return false;
    }

    const data = this.dataCache[sourceId];
    if (!data) {
      console.error('No data in cache for source:', sourceId);
      return false;
    }

    try {
      switch (binding.type) {
        case 'text':
          element.textContent = this.getDataValue(data, binding.path);
          break;

        case 'html':
          element.innerHTML = this.getDataValue(data, binding.path);
          break;

        case 'attribute':
          element.setAttribute(binding.attribute, this.getDataValue(data, binding.path));
          break;

        case 'list':
          this.bindList(element, data, binding);
          break;

        case 'table':
          this.bindTable(element, data, binding);
          break;

        case 'form':
          this.bindForm(element, data, binding);
          break;
      }

      return true;
    } catch (error) {
      console.error('Data binding error:', error);
      return false;
    }
  },

  /**
   * Get value from data using path (e.g., "user.name", "items[0].title")
   */
  getDataValue(data, path) {
    if (!path) return data;

    const parts = path.split('.');
    let value = data;

    for (const part of parts) {
      if (value === null || value === undefined) break;

      // Handle array notation: items[0]
      const arrayMatch = part.match(/(.+)\[(\d+)\]/);
      if (arrayMatch) {
        value = value[arrayMatch[1]][parseInt(arrayMatch[2])];
      } else {
        value = value[part];
      }
    }

    return value;
  },

  /**
   * Bind array data to list
   */
  bindList(element, data, binding) {
    const items = Array.isArray(data) ? data : this.getDataValue(data, binding.arrayPath);

    if (!Array.isArray(items)) {
      console.error('Data is not an array');
      return;
    }

    element.innerHTML = items.map((item, index) => {
      let template = binding.template || '<li>{{value}}</li>';

      // Replace placeholders
      template = template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
        return item[key] !== undefined ? item[key] : item;
      });

      template = template.replace(/\{\{index\}\}/g, index);
      template = template.replace(/\{\{value\}\}/g, item);

      return template;
    }).join('');
  },

  /**
   * Bind data to table
   */
  bindTable(element, data, binding) {
    const rows = Array.isArray(data) ? data : this.getDataValue(data, binding.arrayPath);

    if (!Array.isArray(rows) || rows.length === 0) {
      element.innerHTML = '<tr><td colspan="100%">No data available</td></tr>';
      return;
    }

    // Generate table header
    const columns = binding.columns || Object.keys(rows[0]);
    const thead = element.querySelector('thead') || element.insertBefore(document.createElement('thead'), element.firstChild);
    thead.innerHTML = `<tr>${columns.map(col => `<th>${col}</th>`).join('')}</tr>`;

    // Generate table body
    const tbody = element.querySelector('tbody') || element.appendChild(document.createElement('tbody'));
    tbody.innerHTML = rows.map(row => {
      return `<tr>${columns.map(col => `<td>${row[col] !== undefined ? row[col] : ''}</td>`).join('')}</tr>`;
    }).join('');
  },

  /**
   * Bind data to form
   */
  bindForm(element, data, binding) {
    const formData = binding.path ? this.getDataValue(data, binding.path) : data;

    if (typeof formData !== 'object') return;

    // Populate form fields
    for (const [key, value] of Object.entries(formData)) {
      const input = element.querySelector(`[name="${key}"]`);
      if (input) {
        if (input.type === 'checkbox') {
          input.checked = Boolean(value);
        } else if (input.type === 'radio') {
          const radio = element.querySelector(`[name="${key}"][value="${value}"]`);
          if (radio) radio.checked = true;
        } else {
          input.value = value;
        }
      }
    }
  },

  /**
   * Convert XML to JSON
   */
  xmlToJson(xml) {
    const obj = {};

    if (xml.nodeType === 1) {
      // Element node
      if (xml.attributes.length > 0) {
        obj['@attributes'] = {};
        for (let j = 0; j < xml.attributes.length; j++) {
          const attribute = xml.attributes.item(j);
          obj['@attributes'][attribute.nodeName] = attribute.nodeValue;
        }
      }
    } else if (xml.nodeType === 3) {
      // Text node
      obj = xml.nodeValue;
    }

    if (xml.hasChildNodes()) {
      for (let i = 0; i < xml.childNodes.length; i++) {
        const item = xml.childNodes.item(i);
        const nodeName = item.nodeName;

        if (typeof obj[nodeName] === 'undefined') {
          obj[nodeName] = this.xmlToJson(item);
        } else {
          if (typeof obj[nodeName].push === 'undefined') {
            const old = obj[nodeName];
            obj[nodeName] = [];
            obj[nodeName].push(old);
          }
          obj[nodeName].push(this.xmlToJson(item));
        }
      }
    }

    return obj;
  },

  /**
   * Read file as JSON
   */
  readFileAsJSON(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = JSON.parse(e.target.result);
          resolve(data);
        } catch (error) {
          reject(error);
        }
      };
      reader.onerror = reject;
      reader.readAsText(file);
    });
  },

  /**
   * Read file as text
   */
  readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = reject;
      reader.readAsText(file);
    });
  },

  /**
   * Refresh data from source
   */
  async refreshData(sourceId) {
    return await this.loadData(sourceId);
  },

  /**
   * Clear cache
   */
  clearCache(sourceId) {
    if (sourceId) {
      delete this.dataCache[sourceId];
    } else {
      this.dataCache = {};
    }
  },

  /**
   * Get all data sources
   */
  getAllSources() {
    return this.dataSources;
  },

  /**
   * Remove data source
   */
  removeSource(sourceId) {
    const index = this.dataSources.findIndex(s => s.id === sourceId);
    if (index > -1) {
      this.dataSources.splice(index, 1);
      delete this.dataCache[sourceId];
      return true;
    }
    return false;
  },

  /**
   * Save data to Redis cache
   */
  async saveToRedis(key, data, ttl = 3600) {
    return await this.loadRedis({
      operation: 'set',
      key: key,
      value: JSON.stringify(data),
      ttl: ttl
    });
  },

  /**
   * Execute database query
   */
  async executeQuery(connection, database, query, params = []) {
    return await this.loadDatabase({
      connection,
      database,
      query,
      params
    });
  }
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = WYSIWYGDataBinding;
}
