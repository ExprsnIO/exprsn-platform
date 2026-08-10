const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/database');

/**
 * MemberRole Model
 *
 * Junction table for many-to-many relationship between GroupMembership and GroupRole.
 * Allows group members to have multiple roles simultaneously.
 *
 * Example: A member can be both a 'moderator' and 'event-organizer' in the same group.
 */
class MemberRole extends Model {}

MemberRole.init({
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  membershipId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'membership_id',
    references: {
      model: 'group_memberships',
      key: 'id'
    },
    onDelete: 'CASCADE',
    comment: 'Reference to group membership'
  },
  roleId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'role_id',
    references: {
      model: 'group_roles',
      key: 'id'
    },
    onDelete: 'CASCADE',
    comment: 'Reference to group role'
  },
  grantedBy: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'granted_by',
    comment: 'User ID who granted this role'
  },
  grantedAt: {
    type: DataTypes.BIGINT,
    allowNull: false,
    defaultValue: () => Date.now(),
    field: 'granted_at'
  },
  expiresAt: {
    type: DataTypes.BIGINT,
    allowNull: true,
    field: 'expires_at',
    comment: 'Optional expiration timestamp for temporary roles'
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    allowNull: false,
    field: 'is_active',
    comment: 'Whether this role assignment is currently active'
  },
  metadata: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: 'Additional role assignment metadata'
  }
}, {
  sequelize,
  modelName: 'MemberRole',
  tableName: 'member_roles',
  timestamps: false,
  indexes: [
    { fields: ['membership_id'] },
    { fields: ['role_id'] },
    { fields: ['membership_id', 'role_id'], unique: true },
    { fields: ['granted_by'] },
    { fields: ['is_active'] },
    { fields: ['expires_at'] }
  ]
});

module.exports = MemberRole;
