/**
 * StreamDestination Model
 * Multi-platform streaming destinations (YouTube, Twitch, Facebook, SRS, etc.)
 */

const { DataTypes, Model } = require('sequelize');
const { sequelize } = require('../config/database');

class StreamDestination extends Model {}

StreamDestination.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    stream_id: {
      type: DataTypes.UUID,
      allowNull: false,
      comment: 'Associated stream',
      references: {
        model: 'streams',
        key: 'id'
      },
      onDelete: 'CASCADE'
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      comment: 'User who owns this destination'
    },
    platform: {
      type: DataTypes.ENUM(
        'youtube',
        'twitch',
        'facebook',
        'twitter',
        'linkedin',
        'srs',
        'rtmp_custom',
        'cloudflare'
      ),
      allowNull: false,
      comment: 'Streaming platform'
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
      comment: 'Friendly name for this destination'
    },
    is_enabled: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      comment: 'Whether this destination is active'
    },
    status: {
      type: DataTypes.ENUM('pending', 'connecting', 'live', 'error', 'disconnected'),
      defaultValue: 'pending',
      allowNull: false
    },
    rtmp_url: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'RTMP ingest URL'
    },
    stream_key: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Stream key (encrypted)'
    },
    platform_stream_id: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: 'Platform-specific stream ID (e.g., YouTube broadcast ID)'
    },
    access_token: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'OAuth access token (encrypted)'
    },
    refresh_token: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'OAuth refresh token (encrypted)'
    },
    token_expires_at: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'When the access token expires'
    },
    playback_url: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Public playback URL on the platform'
    },
    viewer_count: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: 'Viewer count on this platform'
    },
    started_at: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'When streaming to this destination started'
    },
    ended_at: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'When streaming to this destination ended'
    },
    error_message: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Last error message'
    },
    retry_count: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: 'Number of connection retry attempts'
    },
    last_retry_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    metadata: {
      type: DataTypes.JSONB,
      defaultValue: {},
      comment: 'Platform-specific metadata'
    },
    settings: {
      type: DataTypes.JSONB,
      defaultValue: {
        bitrate: 4500,
        resolution: '1920x1080',
        framerate: 30,
        auto_start: false,
        auto_reconnect: true,
        max_retries: 3
      },
      comment: 'Streaming settings for this destination'
    }
  },
  {
    sequelize,
    modelName: 'StreamDestination',
    tableName: 'stream_destinations',
    indexes: [
      { fields: ['stream_id'] },
      { fields: ['user_id'] },
      { fields: ['platform'] },
      { fields: ['status'] },
      { fields: ['is_enabled'] },
      { fields: ['created_at'] }
    ]
  }
);

module.exports = StreamDestination;
