const { DataTypes } = require('sequelize');
const { sequelize } = require('../../../config/database');

const CalendarEvent = sequelize.define('CalendarEvent', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  calendarId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'calendar_id'
  },
  title: {
    type: DataTypes.STRING(500),
    allowNull: false
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  location: {
    type: DataTypes.STRING(500),
    allowNull: true
  },
  eventType: {
    type: DataTypes.ENUM('meeting', 'appointment', 'task', 'reminder', 'out_of_office', 'holiday', 'other'),
    allowNull: false,
    defaultValue: 'meeting',
    field: 'event_type'
  },
  // Timing
  startTime: {
    type: DataTypes.DATE,
    allowNull: false,
    field: 'start_time'
  },
  endTime: {
    type: DataTypes.DATE,
    allowNull: false,
    field: 'end_time'
  },
  allDay: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'all_day'
  },
  timezone: {
    type: DataTypes.STRING(100),
    allowNull: true,
    defaultValue: 'UTC'
  },
  // Recurrence
  isRecurring: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'is_recurring'
  },
  recurrenceRule: {
    type: DataTypes.STRING(500),
    allowNull: true,
    field: 'recurrence_rule',
    comment: 'iCal RRULE format'
  },
  recurrenceExceptions: {
    type: DataTypes.ARRAY(DataTypes.DATE),
    allowNull: true,
    field: 'recurrence_exceptions',
    comment: 'Dates to exclude from recurrence'
  },
  recurringEventId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'recurring_event_id',
    comment: 'ID of parent recurring event'
  },
  // Attendees
  organizerId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'organizer_id'
  },
  attendees: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: [],
    comment: 'Array of { userId, email, status: pending|accepted|declined|tentative, isOptional }'
  },
  // Resources
  resources: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: [],
    comment: 'Array of { resourceId, name, type }'
  },
  // Reminders
  reminders: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: [],
    comment: 'Array of { method: email|popup|sms, minutesBefore }'
  },
  // Status
  status: {
    type: DataTypes.ENUM('tentative', 'confirmed', 'cancelled'),
    allowNull: false,
    defaultValue: 'confirmed'
  },
  visibility: {
    type: DataTypes.ENUM('public', 'private', 'confidential'),
    allowNull: false,
    defaultValue: 'public'
  },
  // Meeting details
  meetingUrl: {
    type: DataTypes.STRING(1000),
    allowNull: true,
    field: 'meeting_url'
  },
  dialInNumber: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'dial_in_number'
  },
  conferenceId: {
    type: DataTypes.STRING(255),
    allowNull: true,
    field: 'conference_id'
  },
  // Workflow integration
  onCreateWorkflowId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'on_create_workflow_id'
  },
  onUpdateWorkflowId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'on_update_workflow_id'
  },
  onCancelWorkflowId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'on_cancel_workflow_id'
  },
  // iCal integration
  icalUid: {
    type: DataTypes.STRING(255),
    allowNull: true,
    field: 'ical_uid',
    comment: 'Unique identifier for iCal format'
  },
  sequence: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    comment: 'iCal sequence number for updates'
  },
  attachments: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: []
  },
  color: {
    type: DataTypes.STRING(7),
    allowNull: true
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
  tableName: 'calendar_events',
  timestamps: true,
  underscored: true,
  indexes: [
    {
      fields: ['calendar_id']
    },
    {
      fields: ['organizer_id']
    },
    {
      fields: ['start_time', 'end_time']
    },
    {
      fields: ['status']
    },
    {
      fields: ['event_type']
    },
    {
      fields: ['recurring_event_id']
    },
    {
      fields: ['ical_uid']
    }
  ]
});

module.exports = CalendarEvent;
