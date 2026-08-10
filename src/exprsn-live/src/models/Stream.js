/**
 * Stream Model
 * Live streaming sessions
 */

const { DataTypes, Model } = require('sequelize');
const { sequelize } = require('../config/database');

class Stream extends Model {}

Stream.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      comment: 'User who created the stream'
    },
    title: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    stream_key: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
      comment: 'Secret key for RTMP streaming'
    },
    cloudflare_stream_id: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: 'Cloudflare Stream video ID'
    },
    rtmp_url: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'RTMP ingest URL'
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
      type: DataTypes.ENUM('pending', 'live', 'ended', 'error'),
      defaultValue: 'pending',
      allowNull: false
    },
    visibility: {
      type: DataTypes.ENUM('public', 'unlisted', 'private'),
      defaultValue: 'public',
      allowNull: false
    },
    viewer_count: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      allowNull: false
    },
    peak_viewer_count: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      allowNull: false
    },
    duration_seconds: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: 'Total stream duration in seconds'
    },
    started_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    ended_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    is_recording: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    recording_url: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    metadata: {
      type: DataTypes.JSONB,
      defaultValue: {},
      comment: 'Additional stream metadata (tags, category, etc.)'
    }
  },
  {
    sequelize,
    modelName: 'Stream',
    tableName: 'streams',
    indexes: [
      { fields: ['user_id'] },
      { fields: ['stream_key'], unique: true },
      { fields: ['status'] },
      { fields: ['visibility'] },
      { fields: ['started_at'] },
      { fields: ['created_at'] }
    ]
  }
);

module.exports = Stream;
