const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const ProcessInstance = sequelize.define('ProcessInstance', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    processId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'process_id',
    },
    parentInstanceId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'parent_instance_id',
    },
    initiatedBy: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'initiated_by',
    },
    initiatedFrom: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'initiated_from',
    },
    status: {
      type: DataTypes.ENUM('pending', 'running', 'suspended', 'completed', 'failed', 'cancelled'),
      allowNull: false,
      defaultValue: 'pending',
    },
    currentStep: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'current_step',
    },
    inputData: {
      type: DataTypes.JSONB,
      allowNull: true,
      field: 'input_data',
    },
    outputData: {
      type: DataTypes.JSONB,
      allowNull: true,
      field: 'output_data',
    },
    context: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
    },
    error: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    startedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'started_at',
    },
    completedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'completed_at',
    },
    durationMs: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'duration_ms',
    },
    retryCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'retry_count',
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
    },
  }, {
    tableName: 'process_instances',
    timestamps: true,
    underscored: true,
  });

  ProcessInstance.associate = (models) => {
    ProcessInstance.belongsTo(models.Process, {
      foreignKey: 'processId',
      as: 'process',
    });
  };

  return ProcessInstance;
};
