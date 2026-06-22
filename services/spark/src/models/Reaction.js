/**
 * ═══════════════════════════════════════════════════════════
 * Reaction Model
 * Message reactions (emoji, etc.)
 * ═══════════════════════════════════════════════════════════
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Reaction = sequelize.define('Reaction', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },

    messageId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'messages',
        key: 'id'
      }
    },

    userId: {
      type: DataTypes.UUID,
      allowNull: false
    },

    emoji: {
      type: DataTypes.STRING,
      allowNull: false
    }
  }, {
    tableName: 'reactions',
    timestamps: true,
    indexes: [
      { fields: ['messageId'] },
      { fields: ['userId'] },
      { unique: true, fields: ['messageId', 'userId', 'emoji'] }
    ]
  });

  return Reaction;
};
