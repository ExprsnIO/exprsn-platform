/**
 * ═══════════════════════════════════════════════════════════════════════
 * Exprsn Timeline - Bookmark Model
 * ═══════════════════════════════════════════════════════════════════════
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Bookmark = sequelize.define('Bookmark', {
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
    tableName: 'bookmarks',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['user_id', 'post_id'], unique: true },
      { fields: ['user_id'] },
      { fields: ['created_at'] }
    ]
  });

  return Bookmark;
};
