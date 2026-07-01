/** RoomFile — a file shared into a room: either a FileVault reference (kind
 * 'vault', file_id set) or an ephemeral room-scoped upload (kind 'ephemeral',
 * storage_key set). */
const { DataTypes, Model } = require('sequelize');
const { sequelize } = require('../config/database');

class RoomFile extends Model {}
RoomFile.init({
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  room_id: { type: DataTypes.UUID, allowNull: false },
  user_id: { type: DataTypes.UUID, allowNull: false },
  kind: { type: DataTypes.ENUM('vault', 'ephemeral'), allowNull: false },
  file_id: { type: DataTypes.UUID, allowNull: true },
  storage_key: { type: DataTypes.STRING(512), allowNull: true },
  name: { type: DataTypes.STRING(512), allowNull: false },
  mimetype: { type: DataTypes.STRING(128), allowNull: true },
  size: { type: DataTypes.BIGINT, allowNull: true }
}, { sequelize, modelName: 'RoomFile', tableName: 'room_files', timestamps: true, underscored: true });

module.exports = RoomFile;
