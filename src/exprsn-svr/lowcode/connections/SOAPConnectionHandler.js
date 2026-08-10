/**
 * SOAP Connection Handler
 *
 * Handles connections to SOAP web services with WSDL parsing.
 */

const soap = require('soap');
const BaseConnectionHandler = require('./BaseConnectionHandler');

class SOAPConnectionHandler extends BaseConnectionHandler {
  constructor(config) {
    super(config);
    this.validateConfig(['wsdlUrl']);
    this.client = null;
    this.services = {};
  }

  /**
   * Connect to SOAP service
   */
  async connect() {
    try {
      const options = {
        forceSoap12Headers: this.config.forceSoap12 || false,
        ...this.config.soapOptions
      };

      // Add authentication if provided
      if (this.config.auth) {
        if (this.config.auth.type === 'basic') {
          options.wsdl_headers = {
            Authorization: 'Basic ' + Buffer.from(
              `${this.config.auth.username}:${this.config.auth.password}`
            ).toString('base64')
          };
        }
      }

      // Create SOAP client
      this.client = await soap.createClientAsync(this.config.wsdlUrl, options);

      // Add security if configured
      if (this.config.auth) {
        this.addSecurity();
      }

      // Parse available services and methods
      this.parseServices();
    } catch (error) {
      this.handleError(error, { action: 'connect' });
    }
  }

  /**
   * Disconnect from SOAP service
   */
  async disconnect() {
    this.client = null;
    this.services = {};
  }

  /**
   * Test connection
   */
  async testConnection() {
    try {
      if (!this.client) {
        await this.connect();
      }

      // Get service description
      const description = this.client.describe();

      return {
        success: true,
        wsdl: this.config.wsdlUrl,
        services: Object.keys(description),
        methods: this.getAvailableMethods()
      };
    } catch (error) {
      this.handleError(error, { action: 'testConnection' });
    }
  }

  /**
   * Add security to SOAP client
   */
  addSecurity() {
    const auth = this.config.auth;

    switch (auth.type) {
      case 'basic':
        this.client.setSecurity(
          new soap.BasicAuthSecurity(auth.username, auth.password)
        );
        break;

      case 'bearer':
        this.client.setSecurity(
          new soap.BearerSecurity(auth.token)
        );
        break;

      case 'wss':
        this.client.setSecurity(
          new soap.WSSecurity(auth.username, auth.password, auth.wssOptions)
        );
        break;

      case 'clientCert':
        this.client.setSecurity(
          new soap.ClientSSLSecurity(
            auth.keyPath,
            auth.certPath,
            auth.caPath,
            auth.defaults
          )
        );
        break;
    }
  }

  /**
   * Parse available services and methods
   */
  parseServices() {
    const description = this.client.describe();

    for (const serviceName in description) {
      this.services[serviceName] = {};

      for (const portName in description[serviceName]) {
        this.services[serviceName][portName] = Object.keys(
          description[serviceName][portName]
        );
      }
    }
  }

  /**
   * Get available methods
   */
  getAvailableMethods() {
    const methods = [];

    for (const serviceName in this.services) {
      for (const portName in this.services[serviceName]) {
        for (const methodName of this.services[serviceName][portName]) {
          methods.push({
            service: serviceName,
            port: portName,
            method: methodName
          });
        }
      }
    }

    return methods;
  }

  /**
   * Execute query
   */
  async query(queryConfig) {
    const {
      method,
      args = {},
      service = null,
      port = null,
      cacheKey = null
    } = queryConfig;

    // Ensure connected
    if (!this.client) {
      await this.connect();
    }

    // Use cache if key provided
    if (cacheKey) {
      return this.getData(cacheKey, () => this.callMethod(method, args, service, port));
    }

    return this.callMethod(method, args, service, port);
  }

  /**
   * Call SOAP method
   */
  async callMethod(methodName, args, serviceName, portName) {
    try {
      let targetClient = this.client;

      // Navigate to specific service/port if provided
      if (serviceName && portName) {
        targetClient = this.client[serviceName][portName];
      } else if (serviceName) {
        const ports = Object.keys(this.client[serviceName]);
        targetClient = this.client[serviceName][ports[0]];
      }

      // Call the method
      const result = await targetClient[methodName + 'Async'](args);

      return {
        success: true,
        data: result[0], // Result
        raw: result[1], // Raw response
        headers: result[2], // SOAP headers
        xml: result[3] // Raw XML
      };
    } catch (error) {
      this.handleError(error, {
        action: 'callMethod',
        method: methodName,
        service: serviceName,
        port: portName
      });
    }
  }

  /**
   * Get method signature
   */
  getMethodSignature(methodName, serviceName = null, portName = null) {
    try {
      let targetClient = this.client;

      if (serviceName && portName) {
        targetClient = this.client[serviceName][portName];
      } else if (serviceName) {
        const ports = Object.keys(this.client[serviceName]);
        targetClient = this.client[serviceName][ports[0]];
      }

      const description = targetClient.describe();

      // Find the method in the description
      for (const service in description) {
        for (const port in description[service]) {
          if (description[service][port][methodName]) {
            return description[service][port][methodName];
          }
        }
      }

      return null;
    } catch (error) {
      this.handleError(error, { action: 'getMethodSignature', method: methodName });
    }
  }

  /**
   * Get WSDL as XML
   */
  getWSDL() {
    if (!this.client) {
      throw new Error('Not connected. Call connect() first.');
    }

    return this.client.wsdl.toXML();
  }

  /**
   * Add custom SOAP header
   */
  addSoapHeader(header) {
    if (!this.client) {
      throw new Error('Not connected. Call connect() first.');
    }

    this.client.addSoapHeader(header);
  }

  /**
   * Clear SOAP headers
   */
  clearSoapHeaders() {
    if (this.client) {
      this.client.clearSoapHeaders();
    }
  }

  /**
   * Set endpoint URL override
   */
  setEndpoint(url) {
    if (!this.client) {
      throw new Error('Not connected. Call connect() first.');
    }

    this.client.setEndpoint(url);
  }

  /**
   * Get last request XML
   */
  getLastRequest() {
    if (!this.client) {
      return null;
    }

    return this.client.lastRequest;
  }

  /**
   * Get last response XML
   */
  getLastResponse() {
    if (!this.client) {
      return null;
    }

    return this.client.lastResponse;
  }
}

module.exports = SOAPConnectionHandler;
