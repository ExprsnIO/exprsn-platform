const { DataTypes } = require('sequelize');
const { sequelize } = require('../../../config/database');

const BoardColumn = sequelize.define('BoardColumn', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  boardId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'board_id'
  },
  name: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  // Column positioning and display
  position: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    comment: 'Display order of column'
  },
  color: {
    type: DataTypes.STRING(7),
    allowNull: true,
    comment: 'Column header color'
  },
  // Task status mapping
  taskStatus: {
    type: DataTypes.ENUM('pending', 'in_progress', 'completed', 'cancelled'),
    allowNull: true,
    field: 'task_status',
    comment: 'Map column to task status'
  },
  // Column configuration
  wipLimit: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'wip_limit',
    comment: 'Work-in-progress limit for this column'
  },
  isCompleteColumn: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'is_complete_column',
    comment: 'Moving card here marks task as complete'
  },
  isDefaultColumn: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'is_default_column',
    comment: 'New cards are added to this column'
  },
  // Automation rules
  autoAssignTo: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'auto_assign_to',
    comment: 'Auto-assign tasks to this user when moved to column'
  },
  onEnterWorkflowId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'on_enter_workflow_id',
    comment: 'Trigger workflow when card enters this column'
  },
  onExitWorkflowId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'on_exit_workflow_id',
    comment: 'Trigger workflow when card exits this column'
  },
  // Statistics
  cardCount: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    field: 'card_count'
  },
  // Status
  isArchived: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'is_archived'
  },
  // Metadata
  settings: {
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: {
      collapsed: false,
      cardLimit: null,
      showCardCount: true,
      highlightOverLimit: true
    }
  },
  metadata: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: {}
  },
  createdAt: {
    type: DataTypes.DATE,
    allowNull: false,
    field: 'created_at'
  },
  updatedAt: {
    type: DataTypes.DATE,
    allowNull: false,
    field: 'updated_at'
  }
}, {
  tableName: 'board_columns',
  timestamps: true,
  underscored: true,
  indexes: [
    {
      fields: ['board_id']
    },
    {
      fields: ['board_id', 'position'],
      unique: true
    },
    {
      fields: ['task_status']
    },
    {
      fields: ['is_archived']
    }
  ]
});

module.exports = BoardColumn;
