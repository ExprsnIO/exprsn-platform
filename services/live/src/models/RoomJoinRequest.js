/** RoomJoinRequest — a user's request to join a request-policy room. */
const { DataTypes, Model } = require('sequelize');
const { sequelize } = require('../config/database');

class RoomJoinRequest extends Model {}
RoomJoinRequest.init({
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  room_id: { type: DataTypes.UUID, allowNull: false },
  user_id: { type: DataTypes.UUID, allowNull: false },
  status: { type: DataTypes.ENUM('pending', 'approved', 'denied'), defaultValue: 'pending' }
}, { sequelize, modelName: 'RoomJoinRequest', tableName: 'room_join_requests', timestamps: true, underscored: true });

module.exports = RoomJoinRequest;
