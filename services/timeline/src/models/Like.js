const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Like = sequelize.define('Like', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    postId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'posts', key: 'id' }
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false
    }
  }, {
    tableName: 'likes',
    timestamps: true,
    indexes: [
      { fields: ['postId'] },
      { fields: ['userId'] },
      { unique: true, fields: ['postId', 'userId'] }
    ]
  });

  return Like;
};
