/**
 * Participant Model
 * Tracks participants in rooms and streams
 */

const { DataTypes, Model } = require('sequelize');
const { sequelize } = require('../config/database');

class Participant extends Model {}

Participant.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false
    },
    room_id: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: 'Room participant is in (if video chat)'
    },
    stream_id: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: 'Stream participant is watching (if live stream)'
    },
    socket_id: {
      type: DataTypes.STRING(255),
      allowNull: false,
      comment: 'Socket.IO connection ID'
    },
    peer_id: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: 'WebRTC peer connection ID'
    },
    display_name: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    status: {
      type: DataTypes.ENUM('connected', 'disconnected', 'reconnecting'),
      defaultValue: 'connected',
      allowNull: false
    },
    role: {
      type: DataTypes.ENUM('host', 'moderator', 'participant', 'viewer'),
      defaultValue: 'participant',
      allowNull: false
    },
    is_audio_enabled: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    is_video_enabled: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    is_screen_sharing: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    joined_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      allowNull: false
    },
    left_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    duration_seconds: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: 'Total participation duration'
    },
    connection_quality: {
      type: DataTypes.JSONB,
      defaultValue: {},
      comment: 'Network stats (latency, bandwidth, packet loss)'
    },
    metadata: {
      type: DataTypes.JSONB,
      defaultValue: {},
      comment: 'Additional participant data'
    }
  },
  {
    sequelize,
    modelName: 'Participant',
    tableName: 'participants',
    indexes: [
      { fields: ['user_id'] },
      { fields: ['room_id'] },
      { fields: ['stream_id'] },
      { fields: ['socket_id'] },
      { fields: ['status'] },
      { fields: ['joined_at'] }
    ]
  }
);

module.exports = Participant;
