/**
 * ═══════════════════════════════════════════════════════════
 * Decision Table Model
 * Business rules engine using DMN-style decision tables
 * ═══════════════════════════════════════════════════════════
 */

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const DecisionTable = sequelize.define('DecisionTable', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  applicationId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'application_id'
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  displayName: {
    type: DataTypes.STRING,
    allowNull: false,
    field: 'display_name'
  },
  description: {
    type: DataTypes.TEXT
  },
  inputs: {
    type: DataTypes.JSONB,
    allowNull: false,
    comment: 'Input columns definition'
  },
  outputs: {
    type: DataTypes.JSONB,
    allowNull: false,
    comment: 'Output columns definition'
  },
  rules: {
    type: DataTypes.JSONB,
    defaultValue: [],
    comment: 'Decision rules'
  },
  hitPolicy: {
    type: DataTypes.ENUM('first', 'unique', 'priority', 'any', 'collect'),
    defaultValue: 'first',
    field: 'hit_policy',
    comment: 'Rule matching strategy'
  },
  defaultOutput: {
    type: DataTypes.JSONB,
    field: 'default_output',
    comment: 'Default output if no rules match'
  },
  status: {
    type: DataTypes.ENUM('draft', 'active', 'inactive'),
    defaultValue: 'draft'
  },
  version: {
    type: DataTypes.STRING,
    defaultValue: '1.0.0'
  },
  executionCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'execution_count'
  },
  metadata: {
    type: DataTypes.JSONB,
    defaultValue: {}
  }
}, {
  tableName: 'decision_tables',
  timestamps: true,
  paranoid: true,
  underscored: true,
  indexes: [
    { fields: ['application_id'] },
    { fields: ['status'] },
    { fields: ['name'] }
  ]
});

/**
 * Instance methods
 */
DecisionTable.prototype.activate = async function() {
  this.status = 'active';
  await this.save();
};

DecisionTable.prototype.deactivate = async function() {
  this.status = 'inactive';
  await this.save();
};

DecisionTable.prototype.incrementExecutionCount = async function() {
  this.executionCount += 1;
  await this.save();
};

module.exports = DecisionTable;
