const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Comment = sequelize.define('Comment', {
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
    },
    // Self-referential parent for threaded/nested comments. NULL = top-level.
    // Columns are camelCase by default here (no global `underscored`), so map
    // this new column explicitly to snake_case (matches Post.groupId → group_id).
    parentId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'parent_id',
      references: { model: 'comments', key: 'id' }
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    deleted: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    }
  }, {
    tableName: 'comments',
    timestamps: true,
    indexes: [
      { fields: ['postId'] },
      { fields: ['userId'] },
      { name: 'comments_parent_id', fields: ['parent_id'] }
    ]
  });

  return Comment;
};
