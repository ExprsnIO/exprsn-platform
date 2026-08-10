/**
 * OpenAPI/Swagger Documentation Generator
 *
 * Generates OpenAPI 3.0 specification from Low-Code API endpoints.
 * Used for API documentation and testing tools.
 */

class OpenAPIGenerator {
  /**
   * Generate OpenAPI specification for an application's APIs
   *
   * @param {Object} application - Application object
   * @param {Array} apis - Array of API endpoint objects
   * @returns {Object} - OpenAPI 3.0 specification
   */
  generateSpec(application, apis) {
    const spec = {
      openapi: '3.0.3',
      info: {
        title: `${application.displayName || application.name} API`,
        description: application.description || 'API endpoints for Low-Code application',
        version: application.version || '1.0.0',
        contact: {
          name: 'Exprsn Low-Code Platform',
          url: 'https://exprsn.io'
        }
      },
      servers: [
        {
          url: `${this.getBaseUrl()}/lowcode/custom`,
          description: 'Custom API Runtime Server'
        }
      ],
      tags: this.generateTags(apis),
      paths: this.generatePaths(apis),
      components: {
        schemas: this.generateSchemas(apis),
        securitySchemes: {
          CAToken: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
            description: 'CA Token authentication. Obtain token from Certificate Authority.'
          },
          ApiKey: {
            type: 'apiKey',
            in: 'header',
            name: 'X-API-Key',
            description: 'API Key authentication'
          }
        }
      },
      security: [
        { CAToken: [] }
      ]
    };

    return spec;
  }

  /**
   * Generate tags from API categories
   */
  generateTags(apis) {
    const tags = new Set();

    apis.forEach(api => {
      if (api.category) {
        tags.add(api.category);
      }

      if (api.tags && Array.isArray(api.tags)) {
        api.tags.forEach(tag => tags.add(tag));
      }
    });

    return Array.from(tags).map(tag => ({
      name: tag,
      description: this.getTagDescription(tag)
    }));
  }

  /**
   * Get tag description
   */
  getTagDescription(tag) {
    const descriptions = {
      custom: 'Custom API endpoints',
      integration: 'Integration endpoints with external services',
      webhook: 'Webhook receivers',
      utility: 'Utility endpoints'
    };

    return descriptions[tag] || `${tag} endpoints`;
  }

  /**
   * Generate paths from APIs
   */
  generatePaths(apis) {
    const paths = {};

    apis.forEach(api => {
      if (!api.enabled) {
        return; // Skip disabled APIs
      }

      const path = api.path;
      const method = api.method.toLowerCase();

      if (!paths[path]) {
        paths[path] = {};
      }

      paths[path][method] = this.generateOperation(api);
    });

    return paths;
  }

  /**
   * Generate operation object for an API endpoint
   */
  generateOperation(api) {
    const operation = {
      summary: api.displayName,
      description: api.description || `${api.method} ${api.path}`,
      operationId: this.generateOperationId(api),
      tags: api.tags && api.tags.length > 0 ? api.tags : [api.category],
      parameters: this.generateParameters(api),
      responses: this.generateResponses(api)
    };

    // Add request body for POST, PUT, PATCH
    if (['post', 'put', 'patch'].includes(api.method.toLowerCase())) {
      operation.requestBody = this.generateRequestBody(api);
    }

    // Add security requirements
    if (api.authentication && api.authentication.required) {
      operation.security = [{ CAToken: api.authentication.permissions || [] }];
    } else {
      operation.security = [];
    }

    // Add rate limiting extension
    if (api.rateLimit && api.rateLimit.enabled) {
      operation['x-ratelimit'] = {
        maxRequests: api.rateLimit.maxRequests,
        windowMs: api.rateLimit.windowMs
      };
    }

    // Add caching extension
    if (api.cache && api.cache.enabled) {
      operation['x-cache'] = {
        enabled: true,
        ttl: api.cache.ttl
      };
    }

    // Add handler type extension
    operation['x-handler-type'] = api.handlerType;

    return operation;
  }

  /**
   * Generate operation ID
   */
  generateOperationId(api) {
    // Convert path to camelCase operation ID
    // e.g., /api/users/:id -> getUsersById
    const pathParts = api.path
      .split('/')
      .filter(part => part && part !== 'api')
      .map(part => part.startsWith(':') ? 'By' + this.capitalize(part.substring(1)) : this.capitalize(part));

    return api.method.toLowerCase() + pathParts.join('');
  }

  /**
   * Generate parameters (query, path, header)
   */
  generateParameters(api) {
    const parameters = [];

    // Extract path parameters
    const pathParams = (api.path.match(/:(\w+)/g) || []).map(param => param.substring(1));

    pathParams.forEach(param => {
      parameters.push({
        name: param,
        in: 'path',
        required: true,
        schema: {
          type: 'string'
        },
        description: `${this.capitalize(param)} identifier`
      });
    });

    // Add query parameters from request schema
    if (api.requestSchema && api.requestSchema.properties) {
      Object.entries(api.requestSchema.properties).forEach(([name, schema]) => {
        if (name !== 'body') { // body is handled separately
          parameters.push({
            name,
            in: 'query',
            required: api.requestSchema.required?.includes(name) || false,
            schema: this.convertJSONSchemaType(schema),
            description: schema.description || `${name} parameter`
          });
        }
      });
    }

    // Add common pagination parameters for GET endpoints
    if (api.method === 'GET' && api.handlerType === 'entity_query') {
      parameters.push({
        name: 'limit',
        in: 'query',
        schema: { type: 'integer', default: 25, minimum: 1, maximum: 100 },
        description: 'Maximum number of records to return'
      });

      parameters.push({
        name: 'offset',
        in: 'query',
        schema: { type: 'integer', default: 0, minimum: 0 },
        description: 'Number of records to skip'
      });

      parameters.push({
        name: 'sortBy',
        in: 'query',
        schema: { type: 'string' },
        description: 'Field to sort by'
      });

      parameters.push({
        name: 'sortOrder',
        in: 'query',
        schema: { type: 'string', enum: ['ASC', 'DESC'], default: 'DESC' },
        description: 'Sort order'
      });
    }

    return parameters;
  }

  /**
   * Generate request body
   */
  generateRequestBody(api) {
    let content = {
      'application/json': {
        schema: {}
      }
    };

    if (api.requestSchema && Object.keys(api.requestSchema).length > 0) {
      content['application/json'].schema = api.requestSchema;
    } else {
      content['application/json'].schema = {
        type: 'object',
        properties: {
          data: {
            type: 'object',
            description: 'Request data'
          }
        }
      };
    }

    return {
      description: 'Request payload',
      required: true,
      content
    };
  }

  /**
   * Generate responses
   */
  generateResponses(api) {
    const responses = {
      '200': {
        description: 'Successful response',
        content: {
          'application/json': {
            schema: api.responseSchema && Object.keys(api.responseSchema).length > 0
              ? api.responseSchema
              : {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: { type: 'object' },
                    executionId: { type: 'string' },
                    responseTime: { type: 'number' },
                    timestamp: { type: 'string', format: 'date-time' }
                  }
                }
          }
        }
      },
      '400': {
        description: 'Bad Request - Invalid input',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                success: { type: 'boolean', example: false },
                error: {
                  type: 'object',
                  properties: {
                    message: { type: 'string' },
                    code: { type: 'string' },
                    type: { type: 'string' }
                  }
                },
                timestamp: { type: 'string', format: 'date-time' }
              }
            }
          }
        }
      },
      '401': {
        description: 'Unauthorized - Authentication required',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/Error' }
          }
        }
      },
      '403': {
        description: 'Forbidden - Insufficient permissions',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/Error' }
          }
        }
      },
      '404': {
        description: 'Not Found - Endpoint or resource not found',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/Error' }
          }
        }
      },
      '429': {
        description: 'Too Many Requests - Rate limit exceeded',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/Error' }
          }
        }
      },
      '500': {
        description: 'Internal Server Error',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/Error' }
          }
        }
      }
    };

    // Add 201 Created for POST endpoints
    if (api.method === 'POST') {
      responses['201'] = {
        description: 'Resource created successfully',
        content: responses['200'].content
      };
    }

    // Add 204 No Content for DELETE endpoints
    if (api.method === 'DELETE') {
      responses['204'] = {
        description: 'Resource deleted successfully'
      };
    }

    return responses;
  }

  /**
   * Generate component schemas
   */
  generateSchemas(apis) {
    const schemas = {
      Error: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          error: {
            type: 'object',
            properties: {
              message: { type: 'string' },
              code: { type: 'string' },
              type: { type: 'string' }
            }
          },
          executionId: { type: 'string' },
          responseTime: { type: 'number' },
          timestamp: { type: 'string', format: 'date-time' }
        }
      }
    };

    // Extract schemas from request/response schemas
    apis.forEach(api => {
      if (api.requestSchema && api.requestSchema.$ref) {
        // TODO: Extract referenced schemas
      }

      if (api.responseSchema && api.responseSchema.$ref) {
        // TODO: Extract referenced schemas
      }
    });

    return schemas;
  }

  /**
   * Convert JSON Schema type to OpenAPI type
   */
  convertJSONSchemaType(schema) {
    // JSON Schema and OpenAPI 3.0 are mostly compatible
    // Just need to handle a few edge cases
    return schema;
  }

  /**
   * Get base URL
   */
  getBaseUrl() {
    // In production, this should be configurable
    if (typeof window !== 'undefined') {
      return window.location.origin;
    }
    return process.env.API_BASE_URL || 'http://localhost:5000';
  }

  /**
   * Capitalize first letter
   */
  capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  /**
   * Generate Swagger UI HTML
   */
  generateSwaggerUI(spec) {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${spec.info.title} - API Documentation</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css">
  <style>
    body { margin: 0; padding: 0; }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-standalone-preset.js"></script>
  <script>
    window.onload = function() {
      SwaggerUIBundle({
        spec: ${JSON.stringify(spec, null, 2)},
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIStandalonePreset
        ],
        plugins: [
          SwaggerUIBundle.plugins.DownloadUrl
        ],
        layout: "StandaloneLayout"
      });
    };
  </script>
</body>
</html>
    `;
  }
}

module.exports = new OpenAPIGenerator();
