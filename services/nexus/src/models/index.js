const sequelize = require('../config/database');

// Import all models
const Group = require('./Group');
const GroupMembership = require('./GroupMembership');
const GroupRole = require('./GroupRole');
const MemberRole = require('./MemberRole');
const JoinRequest = require('./JoinRequest');
const GroupInvite = require('./GroupInvite');
const Event = require('./Event');
const EventAttendee = require('./EventAttendee');
const Proposal = require('./Proposal');
const ProposalVote = require('./ProposalVote');
const GroupCategory = require('./GroupCategory');
const GroupTrendingStats = require('./GroupTrendingStats');
const GroupRecommendation = require('./GroupRecommendation');
const GroupContentFlag = require('./GroupContentFlag');
const GroupModerationCase = require('./GroupModerationCase');
const SubGroup = require('./SubGroup');
const SubGroupMembership = require('./SubGroupMembership');

/**
 * ═══════════════════════════════════════════════════════════
 * Model Associations
 * ═══════════════════════════════════════════════════════════
 */

// Group associations
Group.hasMany(GroupMembership, { foreignKey: 'groupId', as: 'memberships' });
Group.hasMany(GroupRole, { foreignKey: 'groupId', as: 'roles' });
Group.hasMany(JoinRequest, { foreignKey: 'groupId', as: 'joinRequests' });
Group.hasMany(GroupInvite, { foreignKey: 'groupId', as: 'invites' });
Group.hasMany(Event, { foreignKey: 'groupId', as: 'events' });
Group.hasMany(Proposal, { foreignKey: 'groupId', as: 'proposals' });
Group.hasOne(GroupTrendingStats, { foreignKey: 'groupId', as: 'trendingStats' });
Group.hasMany(GroupRecommendation, { foreignKey: 'groupId', as: 'recommendations' });
Group.hasMany(GroupContentFlag, { foreignKey: 'groupId', as: 'contentFlags' });
Group.hasMany(GroupModerationCase, { foreignKey: 'groupId', as: 'moderationCases' });
Group.belongsTo(GroupCategory, { foreignKey: 'category', targetKey: 'slug', as: 'categoryDetails' });

// GroupMembership associations
GroupMembership.belongsTo(Group, { foreignKey: 'groupId', as: 'group' });
GroupMembership.belongsTo(GroupRole, { foreignKey: 'customRoleId', as: 'customRole' });
GroupMembership.hasMany(MemberRole, { foreignKey: 'membershipId', as: 'memberRoles' });

// GroupRole associations
GroupRole.belongsTo(Group, { foreignKey: 'groupId', as: 'group' });
GroupRole.hasMany(GroupMembership, { foreignKey: 'customRoleId', as: 'memberships' });
GroupRole.hasMany(MemberRole, { foreignKey: 'roleId', as: 'memberRoles' });

// MemberRole associations (many-to-many between GroupMembership and GroupRole)
MemberRole.belongsTo(GroupMembership, { foreignKey: 'membershipId', as: 'membership' });
MemberRole.belongsTo(GroupRole, { foreignKey: 'roleId', as: 'role' });

// JoinRequest associations
JoinRequest.belongsTo(Group, { foreignKey: 'groupId', as: 'group' });

// GroupInvite associations
GroupInvite.belongsTo(Group, { foreignKey: 'groupId', as: 'group' });

// Event associations
Event.belongsTo(Group, { foreignKey: 'groupId', as: 'group' });
Event.hasMany(EventAttendee, { foreignKey: 'eventId', as: 'attendees' });

// EventAttendee associations
EventAttendee.belongsTo(Event, { foreignKey: 'eventId', as: 'event' });

// Proposal associations
Proposal.belongsTo(Group, { foreignKey: 'groupId', as: 'group' });
Proposal.hasMany(ProposalVote, { foreignKey: 'proposalId', as: 'votes' });

// ProposalVote associations
ProposalVote.belongsTo(Proposal, { foreignKey: 'proposalId', as: 'proposal' });

// GroupCategory associations
GroupCategory.hasMany(Group, { foreignKey: 'category', sourceKey: 'slug', as: 'groups' });
GroupCategory.belongsTo(GroupCategory, { foreignKey: 'parentId', as: 'parent' });
GroupCategory.hasMany(GroupCategory, { foreignKey: 'parentId', as: 'children' });

// GroupTrendingStats associations
GroupTrendingStats.belongsTo(Group, { foreignKey: 'groupId', as: 'group' });

// GroupRecommendation associations
GroupRecommendation.belongsTo(Group, { foreignKey: 'groupId', as: 'group' });

// GroupContentFlag associations
GroupContentFlag.belongsTo(Group, { foreignKey: 'groupId', as: 'group' });

// GroupModerationCase associations
GroupModerationCase.belongsTo(Group, { foreignKey: 'groupId', as: 'group' });

// SubGroup associations
SubGroup.belongsTo(Group, { foreignKey: 'parentGroupId', as: 'parentGroup' });
SubGroup.hasMany(SubGroupMembership, { foreignKey: 'subGroupId', as: 'memberships' });
Group.hasMany(SubGroup, { foreignKey: 'parentGroupId', as: 'subGroups' });

// SubGroupMembership associations
SubGroupMembership.belongsTo(SubGroup, { foreignKey: 'subGroupId', as: 'subGroup' });

/**
 * ═══════════════════════════════════════════════════════════
 * Export Models
 * ═══════════════════════════════════════════════════════════
 */

module.exports = {
  sequelize,
  Group,
  GroupMembership,
  GroupRole,
  MemberRole,
  JoinRequest,
  GroupInvite,
  Event,
  EventAttendee,
  Proposal,
  ProposalVote,
  GroupCategory,
  GroupTrendingStats,
  GroupRecommendation,
  GroupContentFlag,
  GroupModerationCase,
  SubGroup,
  SubGroupMembership
};
