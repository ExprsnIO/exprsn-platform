const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/database');

class Proposal extends Model {}

Proposal.init({
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  groupId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'group_id',
    references: {
      model: 'groups',
      key: 'id'
    },
    onDelete: 'CASCADE'
  },
  proposerId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'proposer_id'
  },
  title: {
    type: DataTypes.STRING(255),
    allowNull: false,
    validate: {
      notEmpty: true,
      len: [5, 255]
    }
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  proposalType: {
    type: DataTypes.ENUM('rule-change', 'role-change', 'member-action', 'general', 'other'),
    allowNull: false,
    field: 'proposal_type'
  },
  votingMethod: {
    type: DataTypes.ENUM('simple-majority', 'supermajority', 'unanimous', 'weighted'),
    defaultValue: 'simple-majority',
    field: 'voting_method'
  },
  quorumRequired: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'quorum_required',
    comment: 'Minimum number of votes required (percentage or count)'
  },
  status: {
    type: DataTypes.ENUM('draft', 'active', 'passed', 'rejected', 'cancelled', 'expired'),
    defaultValue: 'draft',
    allowNull: false
  },
  voteCountYes: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'vote_count_yes'
  },
  voteCountNo: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'vote_count_no'
  },
  voteCountAbstain: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'vote_count_abstain'
  },
  totalVotes: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'total_votes'
  },
  actionData: {
    type: DataTypes.JSONB,
    defaultValue: {},
    field: 'action_data',
    comment: 'Data for automatic execution if passed'
  },
  executedAt: {
    type: DataTypes.BIGINT,
    allowNull: true,
    field: 'executed_at'
  },
  createdAt: {
    type: DataTypes.BIGINT,
    allowNull: false,
    defaultValue: () => Date.now(),
    field: 'created_at'
  },
  votingStartsAt: {
    type: DataTypes.BIGINT,
    allowNull: false,
    field: 'voting_starts_at'
  },
  votingEndsAt: {
    type: DataTypes.BIGINT,
    allowNull: false,
    field: 'voting_ends_at'
  },
  closedAt: {
    type: DataTypes.BIGINT,
    allowNull: true,
    field: 'closed_at'
  },
  metadata: {
    type: DataTypes.JSONB,
    defaultValue: {}
  }
}, {
  sequelize,
  modelName: 'Proposal',
  tableName: 'proposals',
  timestamps: false,
  indexes: [
    { fields: ['group_id'] },
    { fields: ['proposer_id'] },
    { fields: ['status'] },
    { fields: ['voting_ends_at'] },
    { fields: ['proposal_type'] }
  ]
});

module.exports = Proposal;
