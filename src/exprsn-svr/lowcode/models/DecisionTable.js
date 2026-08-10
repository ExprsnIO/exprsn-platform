/**
 * DecisionTable Model
 *
 * Represents a decision table for business rules (DMN-style).
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const DecisionTable = sequelize.define('DecisionTable', {
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
        is: /^[a-zA-Z][a-zA-Z0-9_]*$/,
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
    inputs: {
      type: DataTypes.JSONB,
      allowNull: false,
      validate: {
        hasInputs(value) {
          if (!Array.isArray(value) || value.length === 0) {
            throw new Error('Decision table must have at least one input');
          }
        },
      },
    },
    outputs: {
      type: DataTypes.JSONB,
      allowNull: false,
      validate: {
        hasOutputs(value) {
          if (!Array.isArray(value) || value.length === 0) {
            throw new Error('Decision table must have at least one output');
          }
        },
      },
    },
    rules: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
    },
    hitPolicy: {
      type: DataTypes.ENUM('first', 'unique', 'priority', 'any', 'collect'),
      allowNull: false,
      defaultValue: 'first',
      field: 'hit_policy',
    },
    defaultOutput: {
      type: DataTypes.JSONB,
      allowNull: true,
      field: 'default_output',
    },
    status: {
      type: DataTypes.ENUM('draft', 'active', 'inactive'),
      allowNull: false,
      defaultValue: 'draft',
    },
    version: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: '1.0.0',
    },
    executionCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'execution_count',
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
    },
  }, {
    tableName: 'decision_tables',
    timestamps: true,
    underscored: true,
    paranoid: true,
    indexes: [
      { fields: ['application_id'] },
      { fields: ['status'] },
      { fields: ['name'] },
      {
        unique: true,
        fields: ['application_id', 'name'],
        where: { deleted_at: null },
      },
    ],
  });

  DecisionTable.associate = (models) => {
    DecisionTable.belongsTo(models.Application, {
      foreignKey: 'applicationId',
      as: 'application',
    });

    DecisionTable.hasMany(models.BusinessRule, {
      foreignKey: 'decisionTableId',
      as: 'businessRules',
      onDelete: 'CASCADE',
    });
  };

  // Instance methods
  DecisionTable.prototype.addRule = function(rule) {
    if (!this.rules) {
      this.rules = [];
    }

    // Validate rule structure
    if (!rule.id || !rule.conditions || !rule.outputs) {
      throw new Error('Rule must have id, conditions, and outputs');
    }

    this.rules.push(rule);
    this.changed('rules', true);
    return this;
  };

  DecisionTable.prototype.removeRule = function(ruleId) {
    if (!this.rules) return this;

    this.rules = this.rules.filter(r => r.id !== ruleId);
    this.changed('rules', true);
    return this;
  };

  DecisionTable.prototype.evaluate = function(inputData) {
    // This would be implemented in the RuleEngine service
    // Placeholder implementation
    if (!this.rules || this.rules.length === 0) {
      return this.defaultOutput || null;
    }

    // Simple "first" hit policy implementation
    for (const rule of this.rules) {
      // In a real implementation, this would evaluate conditions
      // For now, just return the first rule's output
      return rule.outputs;
    }

    return this.defaultOutput || null;
  };

  DecisionTable.prototype.activate = async function() {
    this.status = 'active';
    return await this.save();
  };

  DecisionTable.prototype.incrementExecutionCount = async function() {
    this.executionCount += 1;
    return await this.save();
  };

  return DecisionTable;
};
