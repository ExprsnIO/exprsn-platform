const Proposal = require('../models/Proposal');
const ProposalVote = require('../models/ProposalVote');
const GroupMembership = require('../models/GroupMembership');
const Group = require('../models/Group');
const redis = require('../config/redis');
const crypto = require('crypto');
const { Op } = require('sequelize');

/**
 * ═══════════════════════════════════════════════════════════
 * Governance Service
 * Business logic for group governance, proposals, and voting
 * ═══════════════════════════════════════════════════════════
 */

class GovernanceService {
  /**
   * Create a new proposal
   */
  async createProposal(groupId, proposerId, proposalData) {
    // Validate group exists
    const group = await Group.findByPk(groupId);
    if (!group) {
      throw new Error('GROUP_NOT_FOUND');
    }

    // Verify proposer is a member with proposal creation permission
    const membership = await GroupMembership.findOne({
      where: {
        userId: proposerId,
        groupId,
        status: 'active'
      }
    });

    if (!membership) {
      throw new Error('NOT_GROUP_MEMBER');
    }

    // Check if user can create proposals (based on governance model)
    const canCreateProposal = await this.canCreateProposal(group, membership);
    if (!canCreateProposal) {
      throw new Error('CANNOT_CREATE_PROPOSAL');
    }

    // Validate proposal data
    if (!proposalData.title || proposalData.title.length < 5) {
      throw new Error('INVALID_PROPOSAL_TITLE');
    }

    if (!proposalData.description) {
      throw new Error('PROPOSAL_DESCRIPTION_REQUIRED');
    }

    if (!proposalData.proposalType) {
      throw new Error('PROPOSAL_TYPE_REQUIRED');
    }

    // Set voting period
    const votingStartsAt = proposalData.votingStartsAt || Date.now();
    const votingDuration = proposalData.votingDuration || (7 * 24 * 60 * 60 * 1000); // Default: 7 days
    const votingEndsAt = proposalData.votingEndsAt || (votingStartsAt + votingDuration);

    if (votingEndsAt <= votingStartsAt) {
      throw new Error('INVALID_VOTING_PERIOD');
    }

    // Determine voting method based on governance model
    let votingMethod = proposalData.votingMethod;
    if (!votingMethod) {
      votingMethod = this.getDefaultVotingMethod(group.governanceModel);
    }

    // Create proposal
    const proposal = await Proposal.create({
      groupId,
      proposerId,
      title: proposalData.title,
      description: proposalData.description,
      proposalType: proposalData.proposalType,
      votingMethod,
      quorumRequired: proposalData.quorumRequired || this.getDefaultQuorum(votingMethod),
      status: proposalData.status || 'active',
      actionData: proposalData.actionData || {},
      votingStartsAt,
      votingEndsAt,
      metadata: proposalData.metadata || {},
      createdAt: Date.now()
    });

    // Clear group proposals cache
    await redis.del(`group:${groupId}:proposals`);

    return proposal;
  }

  /**
   * Get proposal by ID
   */
  async getProposal(proposalId) {
    // Try cache first
    const cached = await redis.get(`proposal:${proposalId}`);
    if (cached) {
      return JSON.parse(cached);
    }

    const proposal = await Proposal.findByPk(proposalId);
    if (!proposal) {
      throw new Error('PROPOSAL_NOT_FOUND');
    }

    // Update status if voting period ended
    if (proposal.status === 'active' && Date.now() > proposal.votingEndsAt) {
      await this.closeProposal(proposalId);
      // Refetch after closing
      const updatedProposal = await Proposal.findByPk(proposalId);
      return updatedProposal;
    }

    // Cache for 2 minutes
    await redis.setex(`proposal:${proposalId}`, 120, JSON.stringify(proposal));

    return proposal;
  }

  /**
   * List proposals for a group
   */
  async listProposals(groupId, filters = {}) {
    const where = { groupId };

    // Status filter
    if (filters.status) {
      where.status = filters.status;
    }

    // Proposal type filter
    if (filters.proposalType) {
      where.proposalType = filters.proposalType;
    }

    // Active proposals only
    if (filters.activeOnly) {
      where.status = 'active';
      where.votingEndsAt = { [Op.gt]: Date.now() };
    }

    const limit = Math.min(filters.limit || 50, 100);
    const offset = filters.offset || 0;

    const { count, rows: proposals } = await Proposal.findAndCountAll({
      where,
      limit,
      offset,
      order: [['createdAt', 'DESC']]
    });

    return {
      proposals,
      total: count,
      limit,
      offset
    };
  }

  /**
   * Cast a vote on a proposal
   */
  async castVote(proposalId, userId, voteData) {
    const proposal = await Proposal.findByPk(proposalId);
    if (!proposal) {
      throw new Error('PROPOSAL_NOT_FOUND');
    }

    // Check if voting is active
    if (proposal.status !== 'active') {
      throw new Error('VOTING_NOT_ACTIVE');
    }

    const now = Date.now();
    if (now < proposal.votingStartsAt) {
      throw new Error('VOTING_NOT_STARTED');
    }

    if (now > proposal.votingEndsAt) {
      throw new Error('VOTING_ENDED');
    }

    // Check voting eligibility
    const eligible = await this.checkVotingEligibility(proposal.groupId, userId, proposal);
    if (!eligible.canVote) {
      throw new Error(eligible.reason || 'NOT_ELIGIBLE_TO_VOTE');
    }

    // Check if already voted
    const existingVote = await ProposalVote.findOne({
      where: { proposalId, userId }
    });

    if (existingVote) {
      throw new Error('ALREADY_VOTED');
    }

    // Validate vote
    const vote = voteData.vote;
    if (!['yes', 'no', 'abstain'].includes(vote)) {
      throw new Error('INVALID_VOTE');
    }

    // Calculate vote weight
    const weight = await this.calculateVoteWeight(proposal, userId, voteData.weight);

    // Generate vote signature for verification
    const signature = this.generateVoteSignature(userId, proposalId, vote);

    // Record vote
    const voteRecord = await ProposalVote.create({
      proposalId,
      userId,
      vote,
      weight,
      signature,
      reason: voteData.reason || null,
      votedAt: Date.now()
    });

    // Update proposal vote counts
    await this.updateVoteCounts(proposal, vote, weight);

    // Clear caches
    await redis.del(`proposal:${proposalId}`);
    await redis.del(`proposal:${proposalId}:votes`);
    await redis.del(`proposal:${proposalId}:results`);

    // Check if proposal can be closed early (e.g., unanimous decision)
    await this.checkEarlyClose(proposal);

    return voteRecord;
  }

  /**
   * Close a proposal (when voting ends)
   */
  async closeProposal(proposalId) {
    const proposal = await Proposal.findByPk(proposalId);
    if (!proposal) {
      throw new Error('PROPOSAL_NOT_FOUND');
    }

    if (proposal.status !== 'active') {
      return proposal; // Already closed
    }

    // Calculate results
    const results = await this.calculateResults(proposal);

    // Update proposal status
    const newStatus = results.passed ? 'passed' : 'rejected';
    await proposal.update({
      status: newStatus,
      closedAt: Date.now()
    });

    // Execute proposal if passed
    if (results.passed) {
      await this.executeProposal(proposal);
    }

    // Clear caches
    await redis.del(`proposal:${proposalId}`);
    await redis.del(`group:${proposal.groupId}:proposals`);

    return proposal;
  }

  /**
   * Get voting results for a proposal
   */
  async getResults(proposalId) {
    // Try cache
    const cached = await redis.get(`proposal:${proposalId}:results`);
    if (cached) {
      return JSON.parse(cached);
    }

    const proposal = await Proposal.findByPk(proposalId);
    if (!proposal) {
      throw new Error('PROPOSAL_NOT_FOUND');
    }

    const results = {
      proposalId: proposal.id,
      status: proposal.status,
      votingMethod: proposal.votingMethod,
      quorumRequired: proposal.quorumRequired,
      votes: {
        yes: proposal.voteCountYes,
        no: proposal.voteCountNo,
        abstain: proposal.voteCountAbstain,
        total: proposal.totalVotes
      },
      passed: null,
      quorumMet: null
    };

    // Calculate if passed (if voting ended)
    if (proposal.status !== 'active' || Date.now() > proposal.votingEndsAt) {
      const calculation = await this.calculateResults(proposal);
      results.passed = calculation.passed;
      results.quorumMet = calculation.quorumMet;
      results.details = calculation.details;
    }

    // Cache results
    const ttl = proposal.status === 'active' ? 60 : 3600; // 1 min active, 1 hour closed
    await redis.setex(`proposal:${proposalId}:results`, ttl, JSON.stringify(results));

    return results;
  }

  /**
   * Get votes for a proposal
   */
  async getVotes(proposalId, filters = {}) {
    const where = { proposalId };

    if (filters.vote) {
      where.vote = filters.vote;
    }

    const limit = Math.min(filters.limit || 100, 500);
    const offset = filters.offset || 0;

    const { count, rows: votes } = await ProposalVote.findAndCountAll({
      where,
      limit,
      offset,
      order: [['votedAt', 'DESC']]
    });

    return {
      votes,
      total: count,
      limit,
      offset
    };
  }

  // ═══════════════════════════════════════════════════════════
  // Helper Methods
  // ═══════════════════════════════════════════════════════════

  /**
   * Check if user can create proposals
   */
  async canCreateProposal(group, membership) {
    switch (group.governanceModel) {
      case 'centralized':
        // Only admins can create proposals
        return ['owner', 'admin'].includes(membership.role);

      case 'decentralized':
      case 'dao':
      case 'consensus':
        // All members can create proposals
        return true;

      default:
        return false;
    }
  }

  /**
   * Get default voting method based on governance model
   */
  getDefaultVotingMethod(governanceModel) {
    switch (governanceModel) {
      case 'centralized':
        return 'simple-majority';
      case 'decentralized':
        return 'simple-majority';
      case 'dao':
        return 'weighted';
      case 'consensus':
        return 'unanimous';
      default:
        return 'simple-majority';
    }
  }

  /**
   * Get default quorum requirement
   */
  getDefaultQuorum(votingMethod) {
    switch (votingMethod) {
      case 'simple-majority':
        return 50; // 50% participation
      case 'supermajority':
        return 66; // 66% participation
      case 'unanimous':
        return 100; // 100% participation
      case 'weighted':
        return 50;
      default:
        return 50;
    }
  }

  /**
   * Check if user is eligible to vote
   */
  async checkVotingEligibility(groupId, userId, proposal) {
    // Check membership
    const membership = await GroupMembership.findOne({
      where: {
        userId,
        groupId,
        status: 'active'
      }
    });

    if (!membership) {
      return { canVote: false, reason: 'NOT_GROUP_MEMBER' };
    }

    // Check if member joined before proposal was created
    if (membership.joinedAt > proposal.createdAt) {
      return { canVote: false, reason: 'JOINED_AFTER_PROPOSAL' };
    }

    // Additional eligibility checks can be added here
    // (e.g., minimum tenure, activity requirements, etc.)

    return { canVote: true };
  }

  /**
   * Calculate vote weight
   */
  async calculateVoteWeight(proposal, userId, providedWeight = null) {
    if (proposal.votingMethod !== 'weighted') {
      return 1.0; // Equal weight for non-weighted voting
    }

    if (providedWeight) {
      return providedWeight;
    }

    // Calculate weight based on tenure or activity
    const membership = await GroupMembership.findOne({
      where: {
        userId,
        groupId: proposal.groupId,
        status: 'active'
      }
    });

    if (!membership) {
      return 1.0;
    }

    // Simple weight calculation: days since joining / 30
    const daysSinceJoining = (Date.now() - membership.joinedAt) / (1000 * 60 * 60 * 24);
    const weight = Math.min(daysSinceJoining / 30, 10.0); // Max 10x weight

    return Math.max(weight, 1.0); // Minimum 1x weight
  }

  /**
   * Generate cryptographic vote signature
   */
  generateVoteSignature(userId, proposalId, vote) {
    const data = `${userId}:${proposalId}:${vote}:${Date.now()}`;
    const signature = crypto
      .createHash('sha256')
      .update(data)
      .digest('hex');

    return signature;
  }

  /**
   * Update vote counts in proposal
   */
  async updateVoteCounts(proposal, vote, weight = 1.0) {
    const updates = {
      totalVotes: proposal.totalVotes + weight
    };

    switch (vote) {
      case 'yes':
        updates.voteCountYes = proposal.voteCountYes + weight;
        break;
      case 'no':
        updates.voteCountNo = proposal.voteCountNo + weight;
        break;
      case 'abstain':
        updates.voteCountAbstain = proposal.voteCountAbstain + weight;
        break;
    }

    await proposal.update(updates);

    // Update cached counts in Redis
    await redis.hmset(`proposal:${proposal.id}:votes`, {
      yes: updates.voteCountYes || proposal.voteCountYes,
      no: updates.voteCountNo || proposal.voteCountNo,
      abstain: updates.voteCountAbstain || proposal.voteCountAbstain,
      total: updates.totalVotes
    });
  }

  /**
   * Calculate proposal results
   */
  async calculateResults(proposal) {
    const totalMembers = await GroupMembership.count({
      where: {
        groupId: proposal.groupId,
        status: 'active',
        joinedAt: { [Op.lte]: proposal.createdAt }
      }
    });

    const participationRate = (proposal.totalVotes / totalMembers) * 100;
    const quorumMet = participationRate >= proposal.quorumRequired;

    let passed = false;
    const details = {
      totalMembers,
      participationRate: participationRate.toFixed(2),
      quorumRequired: proposal.quorumRequired,
      quorumMet
    };

    if (!quorumMet) {
      return { passed: false, quorumMet: false, details };
    }

    // Calculate based on voting method
    switch (proposal.votingMethod) {
      case 'simple-majority':
        passed = proposal.voteCountYes > proposal.voteCountNo;
        details.yesPercentage = ((proposal.voteCountYes / proposal.totalVotes) * 100).toFixed(2);
        break;

      case 'supermajority':
        const yesPercentage = (proposal.voteCountYes / proposal.totalVotes) * 100;
        passed = yesPercentage >= 66.67;
        details.yesPercentage = yesPercentage.toFixed(2);
        details.requiredPercentage = '66.67';
        break;

      case 'unanimous':
        passed = proposal.voteCountNo === 0 && proposal.voteCountYes > 0;
        details.unanimous = passed;
        break;

      case 'weighted':
        passed = proposal.voteCountYes > proposal.voteCountNo;
        details.weightedYes = proposal.voteCountYes;
        details.weightedNo = proposal.voteCountNo;
        break;

      default:
        passed = proposal.voteCountYes > proposal.voteCountNo;
    }

    return { passed, quorumMet, details };
  }

  /**
   * Check if proposal can be closed early
   */
  async checkEarlyClose(proposal) {
    if (proposal.votingMethod === 'unanimous') {
      // Close if anyone votes no
      if (proposal.voteCountNo > 0) {
        await this.closeProposal(proposal.id);
      }
    }

    // Can add more early close conditions here
  }

  /**
   * Execute a passed proposal
   */
  async executeProposal(proposal) {
    if (!proposal.actionData || Object.keys(proposal.actionData).length === 0) {
      // No automatic action to execute
      return;
    }

    try {
      switch (proposal.proposalType) {
        case 'role-change':
          await this.executeRoleChange(proposal);
          break;

        case 'member-action':
          await this.executeMemberAction(proposal);
          break;

        case 'rule-change':
          await this.executeRuleChange(proposal);
          break;

        default:
          // No automatic execution for this type
          break;
      }

      await proposal.update({
        executedAt: Date.now()
      });
    } catch (error) {
      console.error('Error executing proposal:', error);
      // Log error but don't fail the proposal
    }
  }

  /**
   * Execute role change action
   */
  async executeRoleChange(proposal) {
    const { userId, newRole } = proposal.actionData;

    if (!userId || !newRole) {
      return;
    }

    const membership = await GroupMembership.findOne({
      where: {
        userId,
        groupId: proposal.groupId,
        status: 'active'
      }
    });

    if (membership) {
      await membership.update({ role: newRole });
    }
  }

  /**
   * Execute member action (remove, ban, etc.)
   */
  async executeMemberAction(proposal) {
    const { userId, action } = proposal.actionData;

    if (!userId || !action) {
      return;
    }

    const membership = await GroupMembership.findOne({
      where: {
        userId,
        groupId: proposal.groupId
      }
    });

    if (!membership) {
      return;
    }

    switch (action) {
      case 'remove':
        await membership.update({ status: 'removed' });
        break;

      case 'ban':
        await membership.update({ status: 'banned' });
        break;

      default:
        break;
    }
  }

  /**
   * Execute rule change
   */
  async executeRuleChange(proposal) {
    const { setting, value } = proposal.actionData;

    if (!setting) {
      return;
    }

    const group = await Group.findByPk(proposal.groupId);
    if (group) {
      // Update group settings based on the rule change
      const updates = {};
      updates[setting] = value;
      await group.update(updates);
    }
  }
}

module.exports = new GovernanceService();
