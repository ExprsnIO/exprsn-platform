/**
 * ═══════════════════════════════════════════════════════════════════════
 * User Model (Stub)
 * This is a stub model for associations only
 * Actual user data is managed by exprsn-auth service
 * ═══════════════════════════════════════════════════════════════════════
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const User = sequelize.define('User', {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      comment: 'User ID from exprsn-auth service - NOT stored in this database'
    },
    // No other fields - this is just for association purposes
  }, {
    tableName: 'users_stub',
    timestamps: false,
    // This table won't actually be created - it's just for associations
    sync: { force: false, alter: false },
    comment: 'Stub model for associations - actual user data in exprsn-auth'
  });

  User.associate = (models) => {
    // Many-to-many with groups through GroupMembers
    User.belongsToMany(models.Group, {
      through: models.GroupMember,
      foreignKey: 'userId',
      otherKey: 'groupId',
      as: 'groups'
    });
  };

  return User;
};
