/**
 * Process Model
 *
 * Represents a BPM process definition using BPMN 2.0 standard.
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Process = sequelize.define('Process', {
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
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
      validate: {
        notEmpty: true,
        is: /^[a-zA-Z][a-zA-Z0-9_-]*$/,
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
    category: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    bpmnDefinition: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'bpmn_definition',
    },
    definition: {
      type: DataTypes.JSONB,
      allowNull: false,
    },
    inputs: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: [],
    },
    outputs: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: [],
    },
    config: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {
        timeout: 604800000, // 7 days
        retryOnError: true,
        maxRetries: 3,
      },
    },
    triggers: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: [],
    },
    status: {
      type: DataTypes.ENUM('draft', 'active', 'inactive', 'deprecated'),
      allowNull: false,
      defaultValue: 'draft',
    },
    version: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: '1.0.0',
    },
    publishedVersion: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: 'published_version',
    },
    publishedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'published_at',
    },
    instanceCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'instance_count',
    },
    activeInstanceCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'active_instance_count',
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
    },
  }, {
    tableName: 'processes',
    timestamps: true,
    underscored: true,
    paranoid: true,
    indexes: [
      { fields: ['application_id'] },
      { fields: ['status'] },
      { fields: ['category'] },
      { fields: ['name'] },
      {
        unique: true,
        fields: ['application_id', 'name'],
        where: { deleted_at: null },
      },
    ],
  });

  Process.associate = (models) => {
    Process.belongsTo(models.Application, {
      foreignKey: 'applicationId',
      as: 'application',
    });

    Process.hasMany(models.ProcessInstance, {
      foreignKey: 'processId',
      as: 'instances',
      onDelete: 'CASCADE',
    });
  };

  // Instance methods
  Process.prototype.activate = async function() {
    this.status = 'active';
    this.publishedVersion = this.version;
    this.publishedAt = new Date();
    return await this.save();
  };

  Process.prototype.deprecate = async function() {
    this.status = 'deprecated';
    return await this.save();
  };

  Process.prototype.incrementInstanceCount = async function() {
    this.instanceCount += 1;
    this.activeInstanceCount += 1;
    return await this.save();
  };

  Process.prototype.decrementActiveInstanceCount = async function() {
    if (this.activeInstanceCount > 0) {
      this.activeInstanceCount -= 1;
    }
    return await this.save();
  };

  return Process;
};
