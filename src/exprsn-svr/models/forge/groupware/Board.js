const { DataTypes } = require('sequelize');
const { sequelize } = require('../../../config/database');

const Board = sequelize.define('Board', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  name: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  // Board type and configuration
  boardType: {
    type: DataTypes.ENUM('kanban', 'scrum', 'support', 'custom'),
    allowNull: false,
    defaultValue: 'kanban',
    field: 'board_type'
  },
  visibility: {
    type: DataTypes.ENUM('private', 'team', 'organization', 'public'),
    allowNull: false,
    defaultValue: 'team'
  },
  // Ownership and project linking
  ownerId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'owner_id'
  },
  projectId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'project_id',
    comment: 'Link to ERP project if applicable'
  },
  teamId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'team_id',
    comment: 'Team that owns this board'
  },
  // Board settings
  settings: {
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: {
      allowSubtasks: true,
      autoArchiveCompleted: false,
      autoArchiveDays: 30,
      cardCoverEnabled: true,
      dueDateReminders: true,
      swimlaneBy: null, // 'assignee', 'priority', 'tag', null
      cardLimit: null, // WIP limit per column
      votingEnabled: false,
      timeTrackingEnabled: true
    }
  },
  // Status and archiving
  status: {
    type: DataTypes.ENUM('active', 'archived', 'template'),
    allowNull: false,
    defaultValue: 'active'
  },
  archivedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'archived_at'
  },
  archivedById: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'archived_by_id'
  },
  // Template information
  isTemplate: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'is_template'
  },
  templateName: {
    type: DataTypes.STRING(255),
    allowNull: true,
    field: 'template_name'
  },
  sourceTemplateId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'source_template_id',
    comment: 'ID of template this board was created from'
  },
  // Background and theming
  backgroundColor: {
    type: DataTypes.STRING(7),
    allowNull: true,
    field: 'background_color',
    defaultValue: '#ffffff'
  },
  backgroundImage: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'background_image'
  },
  // Statistics
  cardCount: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    field: 'card_count'
  },
  memberCount: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    field: 'member_count'
  },
  // Metadata
  tags: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    allowNull: true,
    defaultValue: []
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
  tableName: 'boards',
  timestamps: true,
  underscored: true,
  indexes: [
    {
      fields: ['owner_id']
    },
    {
      fields: ['project_id']
    },
    {
      fields: ['team_id']
    },
    {
      fields: ['status']
    },
    {
      fields: ['board_type']
    },
    {
      fields: ['is_template']
    },
    {
      fields: ['visibility']
    }
  ]
});

module.exports = Board;
