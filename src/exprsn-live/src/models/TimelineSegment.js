/**
 * TimelineSegment Model
 * Timeline editing segments for pre-recorded webinars and videos
 */

const { DataTypes, Model } = require('sequelize');
const { sequelize } = require('../config/database');

class TimelineSegment extends Model {}

TimelineSegment.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    event_id: {
      type: DataTypes.UUID,
      allowNull: false,
      comment: 'Associated event',
      references: {
        model: 'events',
        key: 'id'
      },
      onDelete: 'CASCADE'
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      comment: 'User who created this segment'
    },
    segment_type: {
      type: DataTypes.ENUM(
        'intro',
        'main_content',
        'break',
        'qa_session',
        'outro',
        'chapter',
        'advertisement',
        'custom'
      ),
      defaultValue: 'main_content',
      allowNull: false
    },
    title: {
      type: DataTypes.STRING(255),
      allowNull: false,
      comment: 'Segment title/label'
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    order_index: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      comment: 'Order in the timeline (0-based)'
    },
    start_time_ms: {
      type: DataTypes.BIGINT,
      allowNull: false,
      comment: 'Start time in milliseconds from video start'
    },
    end_time_ms: {
      type: DataTypes.BIGINT,
      allowNull: false,
      comment: 'End time in milliseconds from video start'
    },
    duration_ms: {
      type: DataTypes.BIGINT,
      allowNull: false,
      comment: 'Segment duration in milliseconds'
    },
    source_video_url: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Source video file URL (if different from main event)'
    },
    source_start_ms: {
      type: DataTypes.BIGINT,
      defaultValue: 0,
      comment: 'Start offset in source video (for trimming)'
    },
    source_end_ms: {
      type: DataTypes.BIGINT,
      allowNull: true,
      comment: 'End offset in source video (for trimming)'
    },
    is_skippable: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      comment: 'Whether viewers can skip this segment'
    },
    thumbnail_url: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Segment thumbnail'
    },
    transitions: {
      type: DataTypes.JSONB,
      defaultValue: {
        in: { type: 'none', duration_ms: 0 },
        out: { type: 'none', duration_ms: 0 }
      },
      comment: 'Transition effects (fade, dissolve, etc.)'
    },
    audio_settings: {
      type: DataTypes.JSONB,
      defaultValue: {
        volume: 1.0,
        fade_in_ms: 0,
        fade_out_ms: 0,
        muted: false
      },
      comment: 'Audio-specific settings'
    },
    overlays: {
      type: DataTypes.JSONB,
      defaultValue: [],
      comment: 'Text overlays, images, etc. [{type, content, position, start_ms, end_ms}]'
    },
    markers: {
      type: DataTypes.JSONB,
      defaultValue: [],
      comment: 'Important moments within segment [{time_ms, label, type}]'
    },
    metadata: {
      type: DataTypes.JSONB,
      defaultValue: {},
      comment: 'Additional segment metadata'
    }
  },
  {
    sequelize,
    modelName: 'TimelineSegment',
    tableName: 'timeline_segments',
    indexes: [
      { fields: ['event_id'] },
      { fields: ['user_id'] },
      { fields: ['segment_type'] },
      { fields: ['order_index'] },
      { fields: ['event_id', 'order_index'] },
      { fields: ['created_at'] }
    ]
  }
);

module.exports = TimelineSegment;
