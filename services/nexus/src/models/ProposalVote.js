const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/database');

class ProposalVote extends Model {}

ProposalVote.init({
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  proposalId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'proposal_id',
    references: {
      model: 'proposals',
      key: 'id'
    },
    onDelete: 'CASCADE'
  },
  userId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'user_id'
  },
  vote: {
    type: DataTypes.ENUM('yes', 'no', 'abstain'),
    allowNull: false
  },
  weight: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 1.0,
    allowNull: false,
    comment: 'Vote weight for weighted voting systems'
  },
  signature: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Cryptographic signature for vote verification'
  },
  votedAt: {
    type: DataTypes.BIGINT,
    allowNull: false,
    defaultValue: () => Date.now(),
    field: 'voted_at'
  },
  reason: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Optional explanation for the vote'
  }
}, {
  sequelize,
  modelName: 'ProposalVote',
  tableName: 'proposal_votes',
  timestamps: false,
  indexes: [
    { fields: ['proposal_id'] },
    { fields: ['user_id'] },
    { fields: ['proposal_id', 'user_id'], unique: true },
    { fields: ['vote'] },
    { fields: ['voted_at'] }
  ]
});

module.exports = ProposalVote;
