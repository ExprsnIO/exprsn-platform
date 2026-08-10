const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const BusinessRule = sequelize.define('BusinessRule', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    applicationId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'application_id',
    },
    decisionTableId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'decision_table_id',
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    ruleType: {
      type: DataTypes.ENUM('condition', 'validation', 'transformation', 'calculation'),
      allowNull: false,
      defaultValue: 'condition',
      field: 'rule_type',
    },
    condition: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    action: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    priority: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    enabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
    },
  }, {
    tableName: 'business_rules',
    timestamps: true,
    underscored: true,
    paranoid: true,
  });

  BusinessRule.associate = (models) => {
    BusinessRule.belongsTo(models.Application, {
      foreignKey: 'applicationId',
      as: 'application',
    });

    BusinessRule.belongsTo(models.DecisionTable, {
      foreignKey: 'decisionTableId',
      as: 'decisionTable',
    });
  };

  return BusinessRule;
};
