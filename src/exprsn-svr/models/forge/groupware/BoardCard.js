const { DataTypes } = require('sequelize');
const { sequelize } = require('../../../config/database');

const BoardCard = sequelize.define('BoardCard', {
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
  columnId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'column_id'
  },
  taskId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'task_id',
    comment: 'Link to the actual task'
  },
  // Card positioning
  position: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    comment: 'Position within column'
  },
  swimlaneId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'swimlane_id',
    comment: 'Optional swimlane grouping'
  },
  // Card display
  coverImage: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'cover_image'
  },
  coverColor: {
    type: DataTypes.STRING(7),
    allowNull: true,
    field: 'cover_color'
  },
  labels: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    allowNull: true,
    defaultValue: []
  },
  // Card metadata
  addedById: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'added_by_id',
    comment: 'User who added card to board'
  },
  addedAt: {
    type: DataTypes.DATE,
    allowNull: false,
    field: 'added_at',
    defaultValue: DataTypes.NOW
  },
  // Movement tracking
  movedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'moved_at',
    comment: 'Last time card was moved'
  },
  previousColumnId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'previous_column_id'
  },
  timeInColumn: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    field: 'time_in_column',
    comment: 'Seconds spent in current column'
  },
  totalMoves: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    field: 'total_moves',
    comment: 'Number of times card was moved'
  },
  // Card state
  isBlocked: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'is_blocked'
  },
  blockReason: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'block_reason'
  },
  isArchived: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'is_archived'
  },
  archivedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'archived_at'
  },
  // Voting and engagement
  votes: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  watcherCount: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    field: 'watcher_count'
  },
  // Metadata
  customFields: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: {},
    field: 'custom_fields'
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
  tableName: 'board_cards',
  timestamps: true,
  underscored: true,
  indexes: [
    {
      fields: ['board_id']
    },
    {
      fields: ['column_id']
    },
    {
      fields: ['task_id']
    },
    {
      fields: ['board_id', 'task_id'],
      unique: true,
      comment: 'A task can only appear once per board'
    },
    {
      fields: ['column_id', 'position']
    },
    {
      fields: ['swimlane_id']
    },
    {
      fields: ['is_archived']
    },
    {
      fields: ['added_by_id']
    }
  ]
});

module.exports = BoardCard;
