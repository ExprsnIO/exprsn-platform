/**
 * Models Index
 * Exports all models and sets up associations
 */

const Stream = require('./Stream');
const Room = require('./Room');
const Participant = require('./Participant');
const Recording = require('./Recording');
const Event = require('./Event');
const StreamDestination = require('./StreamDestination');
const TimelineSegment = require('./TimelineSegment');
const ModerationAction = require('./ModerationAction');

/**
 * Set up model associations
 */

// Stream associations
Stream.hasMany(Participant, {
  foreignKey: 'stream_id',
  as: 'viewers',
  onDelete: 'CASCADE'
});

Stream.hasMany(Recording, {
  foreignKey: 'stream_id',
  as: 'recordings',
  onDelete: 'CASCADE'
});

Stream.hasMany(StreamDestination, {
  foreignKey: 'stream_id',
  as: 'destinations',
  onDelete: 'CASCADE'
});

Stream.hasMany(ModerationAction, {
  foreignKey: 'stream_id',
  as: 'moderationActions',
  onDelete: 'CASCADE'
});

Stream.hasOne(Event, {
  foreignKey: 'stream_id',
  as: 'event',
  onDelete: 'CASCADE'
});

// Event associations
Event.belongsTo(Stream, {
  foreignKey: 'stream_id',
  as: 'stream'
});

Event.hasMany(TimelineSegment, {
  foreignKey: 'event_id',
  as: 'segments',
  onDelete: 'CASCADE'
});

Event.hasMany(ModerationAction, {
  foreignKey: 'event_id',
  as: 'moderationActions',
  onDelete: 'CASCADE'
});

// StreamDestination associations
StreamDestination.belongsTo(Stream, {
  foreignKey: 'stream_id',
  as: 'stream'
});

// TimelineSegment associations
TimelineSegment.belongsTo(Event, {
  foreignKey: 'event_id',
  as: 'event'
});

// ModerationAction associations
ModerationAction.belongsTo(Stream, {
  foreignKey: 'stream_id',
  as: 'stream'
});

ModerationAction.belongsTo(Event, {
  foreignKey: 'event_id',
  as: 'event'
});

// Room associations
Room.hasMany(Participant, {
  foreignKey: 'room_id',
  as: 'participants',
  onDelete: 'CASCADE'
});

Room.hasMany(Recording, {
  foreignKey: 'room_id',
  as: 'recordings',
  onDelete: 'CASCADE'
});

// Participant associations
Participant.belongsTo(Stream, {
  foreignKey: 'stream_id',
  as: 'stream'
});

Participant.belongsTo(Room, {
  foreignKey: 'room_id',
  as: 'room'
});

// Recording associations
Recording.belongsTo(Stream, {
  foreignKey: 'stream_id',
  as: 'stream'
});

Recording.belongsTo(Room, {
  foreignKey: 'room_id',
  as: 'room'
});

module.exports = {
  Stream,
  Room,
  Participant,
  Recording,
  Event,
  StreamDestination,
  TimelineSegment,
  ModerationAction
};
