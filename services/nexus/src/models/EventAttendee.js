const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/database');

class EventAttendee extends Model {}

EventAttendee.init({
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  eventId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'event_id',
    references: {
      model: 'events',
      key: 'id'
    },
    onDelete: 'CASCADE'
  },
  userId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'user_id'
  },
  rsvpStatus: {
    type: DataTypes.ENUM('going', 'maybe', 'not-going', 'waitlist'),
    allowNull: false,
    field: 'rsvp_status'
  },
  checkInStatus: {
    type: DataTypes.ENUM('pending', 'checked-in', 'no-show'),
    defaultValue: 'pending',
    field: 'check_in_status'
  },
  guestCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'guest_count',
    comment: 'Number of additional guests'
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Attendee notes or dietary restrictions'
  },
  rsvpedAt: {
    type: DataTypes.BIGINT,
    allowNull: false,
    defaultValue: () => Date.now(),
    field: 'rsvped_at'
  },
  checkedInAt: {
    type: DataTypes.BIGINT,
    allowNull: true,
    field: 'checked_in_at'
  },
  checkedInBy: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'checked_in_by',
    comment: 'Admin who checked in the attendee'
  }
}, {
  sequelize,
  modelName: 'EventAttendee',
  tableName: 'event_attendees',
  timestamps: false,
  indexes: [
    { fields: ['event_id'] },
    { fields: ['user_id'] },
    { fields: ['event_id', 'user_id'], unique: true },
    { fields: ['rsvp_status'] },
    { fields: ['check_in_status'] }
  ]
});

module.exports = EventAttendee;
