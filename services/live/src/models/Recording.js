/**
 * Recording Model
 * Stores metadata for stream and room recordings
 */

const { DataTypes, Model } = require('sequelize');
const { sequelize } = require('../config/database');

class Recording extends Model {}

Recording.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    stream_id: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: 'Stream that was recorded'
    },
    room_id: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: 'Room that was recorded'
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      comment: 'User who initiated recording'
    },
    title: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    cloudflare_video_id: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: 'Cloudflare Stream video ID for playback'
    },
    storage_url: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Storage URL (S3, FileVault, etc.)'
    },
    hls_url: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'HLS playback URL'
    },
    dash_url: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'DASH playback URL'
    },
    thumbnail_url: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    status: {
      type: DataTypes.ENUM('processing', 'ready', 'failed', 'deleted'),
      defaultValue: 'processing',
      allowNull: false
    },
    format: {
      type: DataTypes.STRING(50),
      defaultValue: 'mp4',
      comment: 'Video format (mp4, webm, etc.)'
    },
    duration_seconds: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    file_size_bytes: {
      type: DataTypes.BIGINT,
      defaultValue: 0
    },
    resolution: {
      type: DataTypes.STRING(50),
      allowNull: true,
      comment: 'Video resolution (1080p, 720p, etc.)'
    },
    bitrate: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Video bitrate in kbps'
    },
    codec: {
      type: DataTypes.STRING(50),
      allowNull: true,
      comment: 'Video codec (h264, vp9, etc.)'
    },
    started_at: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'When recording started'
    },
    completed_at: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'When recording completed'
    },
    view_count: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    download_count: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    is_public: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    visibility: {
      type: DataTypes.ENUM('public', 'unlisted', 'private'),
      defaultValue: 'private',
      allowNull: false
    },
    metadata: {
      type: DataTypes.JSONB,
      defaultValue: {},
      comment: 'Additional recording metadata (chapters, transcription, etc.)'
    }
  },
  {
    sequelize,
    modelName: 'Recording',
    tableName: 'recordings',
    indexes: [
      { fields: ['stream_id'] },
      { fields: ['room_id'] },
      { fields: ['user_id'] },
      { fields: ['status'] },
      { fields: ['visibility'] },
      { fields: ['created_at'] },
      { fields: ['completed_at'] }
    ]
  }
);

module.exports = Recording;
