/**
 * Event Model
 * Scheduled live events and pre-recorded webinars
 */

const { DataTypes, Model } = require('sequelize');
const { sequelize } = require('../config/database');

class Event extends Model {}

Event.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      comment: 'User who created the event'
    },
    stream_id: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: 'Associated live stream (null for pre-recorded)',
      references: {
        model: 'streams',
        key: 'id'
      },
      onDelete: 'CASCADE'
    },
    title: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    event_type: {
      type: DataTypes.ENUM('live', 'pre_recorded', 'webinar', 'premiere'),
      defaultValue: 'live',
      allowNull: false
    },
    status: {
      type: DataTypes.ENUM('scheduled', 'live', 'ended', 'cancelled'),
      defaultValue: 'scheduled',
      allowNull: false
    },
    visibility: {
      type: DataTypes.ENUM('public', 'unlisted', 'private'),
      defaultValue: 'public',
      allowNull: false
    },
    scheduled_start_time: {
      type: DataTypes.DATE,
      allowNull: false,
      comment: 'When the event should start'
    },
    scheduled_end_time: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'When the event should end (optional)'
    },
    actual_start_time: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'When the event actually started'
    },
    actual_end_time: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'When the event actually ended'
    },
    duration_seconds: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: 'Actual event duration'
    },
    thumbnail_url: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    preview_video_url: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Preview/trailer video URL'
    },
    recording_url: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Final recording URL (for pre-recorded or post-event)'
    },
    is_recording_enabled: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    allow_comments: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    allow_reactions: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    max_viewers: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Maximum concurrent viewers (null = unlimited)'
    },
    current_viewer_count: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    peak_viewer_count: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    total_views: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: 'Total views including replays'
    },
    category: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: 'Event category (Gaming, Education, Music, etc.)'
    },
    tags: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      defaultValue: [],
      comment: 'Searchable tags'
    },
    language: {
      type: DataTypes.STRING(10),
      defaultValue: 'en',
      comment: 'Primary language (ISO 639-1 code)'
    },
    metadata: {
      type: DataTypes.JSONB,
      defaultValue: {},
      comment: 'Additional event metadata'
    },
    moderation_settings: {
      type: DataTypes.JSONB,
      defaultValue: {
        auto_moderation: true,
        profanity_filter: true,
        spam_filter: true,
        link_filter: false,
        slow_mode: 0
      },
      comment: 'Moderation configuration'
    }
  },
  {
    sequelize,
    modelName: 'Event',
    tableName: 'events',
    indexes: [
      { fields: ['user_id'] },
      { fields: ['stream_id'] },
      { fields: ['event_type'] },
      { fields: ['status'] },
      { fields: ['visibility'] },
      { fields: ['scheduled_start_time'] },
      { fields: ['category'] },
      { fields: ['created_at'] }
    ]
  }
);

module.exports = Event;
