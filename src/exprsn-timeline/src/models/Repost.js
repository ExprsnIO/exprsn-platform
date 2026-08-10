/**
 * ═══════════════════════════════════════════════════════════════════════
 * Exprsn Timeline - Repost Model
 * ═══════════════════════════════════════════════════════════════════════
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Repost = sequelize.define('Repost', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'user_id'
    },
    postId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'post_id'
    }
  }, {
    tableName: 'reposts',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['user_id', 'post_id'], unique: true },
      { fields: ['post_id'] },
      { fields: ['created_at'] }
    ]
  });

  return Repost;
};
