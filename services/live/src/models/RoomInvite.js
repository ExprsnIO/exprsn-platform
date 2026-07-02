/** RoomInvite — a host invitation for a user to join a room. */
const { DataTypes, Model } = require('sequelize');
const { sequelize } = require('../config/database');

class RoomInvite extends Model {}
RoomInvite.init({
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  room_id: { type: DataTypes.UUID, allowNull: false },
  inviter_id: { type: DataTypes.UUID, allowNull: false },
  invitee_id: { type: DataTypes.UUID, allowNull: false },
  status: { type: DataTypes.ENUM('pending', 'accepted', 'revoked'), defaultValue: 'pending' }
}, { sequelize, modelName: 'RoomInvite', tableName: 'room_invites', timestamps: true, underscored: true });

module.exports = RoomInvite;
