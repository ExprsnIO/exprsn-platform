/**
 * ═══════════════════════════════════════════════════════════════════════
 * UserGroup Model - User↔Group membership with a per-membership role
 * ═══════════════════════════════════════════════════════════════════════
 * Through table for the User<->Group many-to-many. The `role` column is what
 * makes a member an admin/owner of a group (or of an organization — a group
 * of type organizational_unit/department), which in turn authorizes them to
 * invalidate tokens scoped to that group/org (Token spec v1.1).
 *
 * Table name stays "UserGroups" to match the table Sequelize's string-through
 * association already created in the live ca schema.
 */

module.exports = (sequelize, DataTypes) => {
  const UserGroup = sequelize.define('UserGroup', {
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
      field: 'user_id'
    },
    groupId: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
      field: 'group_id',
      references: {
        model: 'groups',
        key: 'id'
      }
    },
    role: {
      type: DataTypes.ENUM('member', 'admin', 'owner'),
      allowNull: false,
      defaultValue: 'member'
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'created_at'
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'updated_at'
    }
  }, {
    tableName: 'UserGroups',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['group_id'] },
      { fields: ['role'] }
    ]
  });

  return UserGroup;
};
