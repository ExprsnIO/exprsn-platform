/**
 * API Model
 *
 * Represents a custom API endpoint in the Low-Code Platform.
 * Allows users to create RESTful API endpoints with various handler types.
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Api = sequelize.define('Api', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false,
    },
    applicationId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'application_id',
      references: {
        model: 'applications',
        key: 'id',
      },
    },
    path: {
      type: DataTypes.STRING(255),
      allowNull: false,
      validate: {
        notEmpty: true,
        is: /^\/[a-zA-Z0-9\/_-]*$/,
      },
    },
    displayName: {
      type: DataTypes.STRING(255),
      allowNull: false,
      field: 'display_name',
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    method: {
      type: DataTypes.ENUM('GET', 'POST', 'PUT', 'PATCH', 'DELETE'),
      allowNull: false,
      defaultValue: 'GET',
    },
    category: {
      type: DataTypes.STRING(100),
      allowNull: false,
      defaultValue: 'custom',
    },
    handlerType: {
      type: DataTypes.ENUM('jsonlex', 'external_api', 'workflow', 'custom_code', 'entity_query'),
      allowNull: false,
      defaultValue: 'jsonlex',
      field: 'handler_type',
    },
    handlerConfig: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
      field: 'handler_config',
      validate: {
        validateHandler(value) {
          if (this.handlerType === 'jsonlex' && !value.expression) {
            throw new Error('JSONLex handler requires expression in config');
          }
          if (this.handlerType === 'external_api' && !value.url) {
            throw new Error('External API handler requires url in config');
          }
          if (this.handlerType === 'workflow' && !value.workflowId) {
            throw new Error('Workflow handler requires workflowId in config');
          }
          if (this.handlerType === 'custom_code' && !value.code) {
            throw new Error('Custom code handler requires code in config');
          }
          if (this.handlerType === 'entity_query' && !value.entityId) {
            throw new Error('Entity query handler requires entityId in config');
          }
        },
      },
    },
    requestSchema: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
      field: 'request_schema',
    },
    responseSchema: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
      field: 'response_schema',
    },
    authentication: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {
        required: true,
        permissions: [],
      },
    },
    rateLimit: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {
        enabled: true,
        maxRequests: 100,
        windowMs: 60000,
      },
      field: 'rate_limit',
    },
    cors: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {
        enabled: true,
        allowedOrigins: ['*'],
        allowedMethods: ['GET', 'POST'],
      },
    },
    cache: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {
        enabled: false,
        ttl: 300,
      },
    },
    enabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    version: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: '1.0.0',
      validate: {
        is: /^\d+\.\d+\.\d+$/,
      },
    },
    tags: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      allowNull: false,
      defaultValue: [],
    },
    callCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'call_count',
    },
    errorCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'error_count',
    },
    avgResponseTime: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 0,
      field: 'avg_response_time',
    },
    lastCalledAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'last_called_at',
    },
    createdBy: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'created_by',
    },
    updatedBy: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'updated_by',
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
    },
  }, {
    tableName: 'apis',
    timestamps: true,
    underscored: true,
    paranoid: true,
    indexes: [
      { fields: ['application_id'] },
      { fields: ['method'] },
      { fields: ['category'] },
      { fields: ['handler_type'] },
      { fields: ['enabled'] },
      { fields: ['created_by'] },
      {
        unique: true,
        fields: ['application_id', 'path', 'method'],
        where: { deleted_at: null },
      },
    ],
  });

  Api.associate = (models) => {
    Api.belongsTo(models.Application, {
      foreignKey: 'applicationId',
      as: 'application',
    });
  };

  // Instance methods
  Api.prototype.incrementCallCount = async function(responseTime) {
    this.callCount += 1;
    this.lastCalledAt = new Date();

    // Calculate rolling average response time
    if (this.avgResponseTime === 0) {
      this.avgResponseTime = responseTime;
    } else {
      this.avgResponseTime = (this.avgResponseTime * 0.9) + (responseTime * 0.1);
    }

    return await this.save();
  };

  Api.prototype.incrementErrorCount = async function() {
    this.errorCount += 1;
    return await this.save();
  };

  Api.prototype.enable = async function() {
    this.enabled = true;
    return await this.save();
  };

  Api.prototype.disable = async function() {
    this.enabled = false;
    return await this.save();
  };

  Api.prototype.toSafeJSON = function() {
    const values = this.get({ plain: true });
    // Don't expose sensitive handler config details in list views
    return {
      ...values,
      handlerConfig: {
        type: this.handlerType,
        // Only include safe metadata, not actual code or credentials
      },
    };
  };

  return Api;
};
