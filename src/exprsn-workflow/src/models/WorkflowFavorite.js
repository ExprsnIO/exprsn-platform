const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const WorkflowFavorite = sequelize.define('WorkflowFavorite', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  workflow_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'workflows',
      key: 'id'
    },
    onDelete: 'CASCADE'
  },
  user_id: {
    type: DataTypes.UUID,
    allowNull: false,
    comment: 'User ID who favorited the workflow'
  }
}, {
  tableName: 'workflow_favorites',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false, // No updated_at for favorites
  underscored: true,
  indexes: [
    {
      fields: ['workflow_id']
    },
    {
      fields: ['user_id']
    },
    {
      fields: ['workflow_id', 'user_id'],
      unique: true,
      name: 'workflow_favorites_unique'
    },
    {
      fields: ['created_at']
    }
  ]
});

module.exports = WorkflowFavorite;
