/**
 * ═══════════════════════════════════════════════════════════════════════
 * Exprsn Timeline - List Member Model
 * ═══════════════════════════════════════════════════════════════════════
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const ListMember = sequelize.define('ListMember', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    listId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'list_id'
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'user_id'
    }
  }, {
    tableName: 'list_members',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['list_id', 'user_id'], unique: true },
      { fields: ['list_id'] },
      { fields: ['user_id'] }
    ]
  });

  return ListMember;
};
