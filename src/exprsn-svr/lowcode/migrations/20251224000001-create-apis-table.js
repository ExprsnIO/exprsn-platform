/**
 * Migration: Create apis table
 * Stores custom API endpoints created in the Low-Code Platform
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('apis', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
        allowNull: false
      },
      application_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'applications',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
        comment: 'Application this API belongs to'
      },
      path: {
        type: Sequelize.STRING(255),
        allowNull: false,
        comment: 'API endpoint path (e.g., /api/users)'
      },
      display_name: {
        type: Sequelize.STRING(255),
        allowNull: false,
        comment: 'User-friendly name for the API'
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Description of what this API does'
      },
      method: {
        type: Sequelize.ENUM('GET', 'POST', 'PUT', 'PATCH', 'DELETE'),
        allowNull: false,
        defaultValue: 'GET',
        comment: 'HTTP method'
      },
      category: {
        type: Sequelize.STRING(100),
        allowNull: false,
        defaultValue: 'custom',
        comment: 'API category for organization'
      },
      handler_type: {
        type: Sequelize.ENUM('jsonlex', 'external_api', 'workflow', 'custom_code', 'entity_query'),
        allowNull: false,
        defaultValue: 'jsonlex',
        comment: 'Type of handler that executes this API'
      },
      handler_config: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {},
        comment: 'Configuration for the handler (expression, url, code, etc.)'
      },
      request_schema: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {},
        comment: 'JSON Schema for request validation'
      },
      response_schema: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {},
        comment: 'JSON Schema for response structure'
      },
      authentication: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {
          required: true,
          permissions: []
        },
        comment: 'Authentication requirements (CA tokens, permissions)'
      },
      rate_limit: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {
          enabled: true,
          maxRequests: 100,
          windowMs: 60000
        },
        comment: 'Rate limiting configuration'
      },
      cors: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {
          enabled: true,
          allowedOrigins: ['*'],
          allowedMethods: ['GET', 'POST']
        },
        comment: 'CORS configuration'
      },
      cache: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {
          enabled: false,
          ttl: 300
        },
        comment: 'Caching configuration'
      },
      enabled: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment: 'Is this API endpoint active?'
      },
      version: {
        type: Sequelize.STRING(50),
        allowNull: false,
        defaultValue: '1.0.0',
        comment: 'API version (semver format)'
      },
      tags: {
        type: Sequelize.ARRAY(Sequelize.STRING),
        allowNull: false,
        defaultValue: [],
        comment: 'Tags for categorization and search'
      },
      call_count: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'Total number of API calls'
      },
      error_count: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'Total number of errors'
      },
      avg_response_time: {
        type: Sequelize.FLOAT,
        allowNull: false,
        defaultValue: 0,
        comment: 'Average response time in milliseconds'
      },
      last_called_at: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'Last time this API was called'
      },
      created_by: {
        type: Sequelize.UUID,
        allowNull: false,
        comment: 'User who created this API'
      },
      updated_by: {
        type: Sequelize.UUID,
        allowNull: true,
        comment: 'User who last updated this API'
      },
      metadata: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {},
        comment: 'Additional metadata'
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      deleted_at: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'Soft delete timestamp'
      }
    });

    // Create indexes for performance
    await queryInterface.addIndex('apis', ['application_id'], {
      name: 'apis_application_id_idx'
    });

    await queryInterface.addIndex('apis', ['method'], {
      name: 'apis_method_idx'
    });

    await queryInterface.addIndex('apis', ['category'], {
      name: 'apis_category_idx'
    });

    await queryInterface.addIndex('apis', ['handler_type'], {
      name: 'apis_handler_type_idx'
    });

    await queryInterface.addIndex('apis', ['enabled'], {
      name: 'apis_enabled_idx'
    });

    await queryInterface.addIndex('apis', ['created_by'], {
      name: 'apis_created_by_idx'
    });

    // Unique constraint on path + method + application (excluding soft-deleted)
    await queryInterface.addIndex('apis', ['application_id', 'path', 'method'], {
      unique: true,
      name: 'apis_unique_endpoint',
      where: { deleted_at: null }
    });

    // Performance index for queries
    await queryInterface.addIndex('apis', ['application_id', 'enabled', 'method'], {
      name: 'apis_app_enabled_method_idx'
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('apis');
  }
};
