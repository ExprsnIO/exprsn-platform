const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/database');

class Event extends Model {}

Event.init({
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  groupId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'group_id',
    references: {
      model: 'groups',
      key: 'id'
    },
    onDelete: 'CASCADE'
  },
  creatorId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'creator_id'
  },
  title: {
    type: DataTypes.STRING(255),
    allowNull: false,
    validate: {
      notEmpty: true,
      len: [2, 255]
    }
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  eventType: {
    type: DataTypes.ENUM('in-person', 'virtual', 'hybrid'),
    allowNull: false,
    field: 'event_type'
  },
  location: {
    type: DataTypes.STRING(500),
    allowNull: true
  },
  virtualUrl: {
    type: DataTypes.STRING(500),
    allowNull: true,
    field: 'virtual_url',
    comment: 'URL for virtual events (Zoom, Meet, exprsn-live)'
  },
  startTime: {
    type: DataTypes.BIGINT,
    allowNull: false,
    field: 'start_time'
  },
  endTime: {
    type: DataTypes.BIGINT,
    allowNull: true,
    field: 'end_time'
  },
  timezone: {
    type: DataTypes.STRING(100),
    allowNull: false,
    defaultValue: 'UTC'
  },
  maxAttendees: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'max_attendees'
  },
  attendeeCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'attendee_count'
  },
  rsvpDeadline: {
    type: DataTypes.BIGINT,
    allowNull: true,
    field: 'rsvp_deadline'
  },
  requiresApproval: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'requires_approval'
  },
  visibility: {
    type: DataTypes.ENUM('public', 'members-only', 'invite-only'),
    defaultValue: 'members-only',
    allowNull: false
  },
  coverImageUrl: {
    type: DataTypes.STRING(500),
    allowNull: true,
    field: 'cover_image_url'
  },
  tags: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    defaultValue: []
  },
  metadata: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: 'Additional event metadata'
  },
  status: {
    type: DataTypes.ENUM('draft', 'published', 'cancelled', 'completed'),
    defaultValue: 'published',
    allowNull: false
  },
  cancelledReason: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'cancelled_reason'
  },
  createdAt: {
    type: DataTypes.BIGINT,
    allowNull: false,
    defaultValue: () => Date.now(),
    field: 'created_at'
  },
  updatedAt: {
    type: DataTypes.BIGINT,
    allowNull: false,
    defaultValue: () => Date.now(),
    field: 'updated_at'
  },
  cancelledAt: {
    type: DataTypes.BIGINT,
    allowNull: true,
    field: 'cancelled_at'
  }
}, {
  sequelize,
  modelName: 'Event',
  tableName: 'events',
  timestamps: false,
  indexes: [
    { fields: ['group_id'] },
    { fields: ['creator_id'] },
    { fields: ['start_time'] },
    { fields: ['end_time'] },
    { fields: ['status'] },
    { fields: ['visibility'] },
    { fields: ['tags'], using: 'gin' }
  ]
});

module.exports = Event;
