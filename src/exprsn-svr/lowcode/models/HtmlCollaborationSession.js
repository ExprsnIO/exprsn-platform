/**
 * ═══════════════════════════════════════════════════════════
 * HTML Collaboration Session Model
 * Real-time editing sessions for collaborative development
 * ═══════════════════════════════════════════════════════════
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const HtmlCollaborationSession = sequelize.define('HtmlCollaborationSession', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  projectId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'project_id'
  },
  fileId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'file_id'
  },
  userId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'user_id'
  },
  socketId: {
    type: DataTypes.STRING(100),
    allowNull: false,
    field: 'socket_id',
    comment: 'Socket.IO session ID'
  },
  cursorPosition: {
    type: DataTypes.JSONB,
    allowNull: true,
    field: 'cursor_position',
    comment: 'Current cursor position in file',
    get() {
      const value = this.getDataValue('cursorPosition');
      return value || null;
    }
  },
  selection: {
    type: DataTypes.JSONB,
    allowNull: true,
    comment: 'Current text selection',
    get() {
      const value = this.getDataValue('selection');
      return value || null;
    }
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    field: 'is_active'
  }
}, {
  tableName: 'html_collaboration_sessions',
  underscored: true,
  timestamps: true,
  indexes: [
    { fields: ['project_id'] },
    { fields: ['file_id'] },
    { fields: ['user_id'] },
    { fields: ['socket_id'] },
    { fields: ['is_active'] }
  ]
});

  HtmlCollaborationSession.associate = (models) => {
    HtmlCollaborationSession.belongsTo(models.HtmlProject, {
      foreignKey: 'projectId',
      as: 'project'
    });

    HtmlCollaborationSession.belongsTo(models.HtmlFile, {
      foreignKey: 'fileId',
      as: 'file'
    });
  };

  return HtmlCollaborationSession;
};
