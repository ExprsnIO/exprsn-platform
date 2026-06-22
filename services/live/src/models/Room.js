/**
 * Room Model
 * Video chat rooms for multi-participant calls
 */

const { DataTypes, Model } = require('sequelize');
const { sequelize } = require('../config/database');

class Room extends Model {}

Room.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    host_id: {
      type: DataTypes.UUID,
      allowNull: false,
      comment: 'User who created the room'
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    room_code: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true,
      comment: 'Short code for joining the room'
    },
    status: {
      type: DataTypes.ENUM('waiting', 'active', 'ended'),
      defaultValue: 'waiting',
      allowNull: false
    },
    is_private: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: 'If true, requires password to join'
    },
    password_hash: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: 'Hashed room password if private'
    },
    max_participants: {
      type: DataTypes.INTEGER,
      defaultValue: 10,
      allowNull: false
    },
    current_participant_count: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      allowNull: false
    },
    peak_participant_count: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      allowNull: false
    },
    duration_seconds: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: 'Total room duration in seconds'
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
    settings: {
      type: DataTypes.JSONB,
      defaultValue: {
        enableChat: true,
        enableScreenShare: true,
        enableRecording: false,
        muteOnJoin: false,
        videoOnJoin: true
      },
      comment: 'Room settings and features'
    },
    metadata: {
      type: DataTypes.JSONB,
      defaultValue: {},
      comment: 'Additional room metadata'
    }
  },
  {
    sequelize,
    modelName: 'Room',
    tableName: 'rooms',
    indexes: [
      { fields: ['host_id'] },
      { fields: ['room_code'], unique: true },
      { fields: ['status'] },
      { fields: ['is_private'] },
      { fields: ['started_at'] },
      { fields: ['created_at'] }
    ]
  }
);

module.exports = Room;
