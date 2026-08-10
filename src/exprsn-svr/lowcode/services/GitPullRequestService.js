/**
 * ═══════════════════════════════════════════════════════════
 * Git Pull Request Service
 * PR management with CI/CD and code review integration
 * ═══════════════════════════════════════════════════════════
 */

const { v4: uuidv4 } = require('uuid');
const logger = require('../../utils/logger');
const GitPullRequest = require('../models/GitPullRequest');
const GitRepository = require('../models/GitRepository');
const GitBranch = require('../models/GitBranch');
const GitService = require('./GitService');
const axios = require('axios');
const { Op } = require('sequelize');

class GitPullRequestService {
  /**
   * Create a new pull request
   */
  async createPullRequest(repositoryId, { title, body, sourceBranch, targetBranch, createdBy, reviewers, assignees, labels, isDraft }) {
    try {
      // Validate branches exist
      const [source, target] = await Promise.all([
        GitBranch.findOne({ where: { repositoryId, name: sourceBranch } }),
        GitBranch.findOne({ where: { repositoryId, name: targetBranch } })
      ]);

      if (!source) throw new Error('Source branch not found');
      if (!target) throw new Error('Target branch not found');

      // Get next PR number
      const lastPR = await GitPullRequest.findOne({
        where: { repositoryId },
        order: [['number', 'DESC']],
        attributes: ['number']
      });

      const number = lastPR ? lastPR.number + 1 : 1;

      // Check if PR is mergeable
      const mergeCheck = await this.checkMergeable(repositoryId, sourceBranch, targetBranch);

      // Create pull request
      const pr = await GitPullRequest.create({
        id: uuidv4(),
        repositoryId,
        number,
        title,
        body,
        sourceBranch,
        targetBranch,
        headSha: source.commitSha,
        baseSha: target.commitSha,
        mergeable: mergeCheck.mergeable,
        conflicts: mergeCheck.conflicts || [],
        labels: labels || [],
        assignees: assignees || [],
        reviewers: reviewers || [],
        state: isDraft ? 'draft' : 'open',
        createdBy
      });

      // Update repository PR count
      await GitRepository.increment('openPrsCount', { where: { id: repositoryId } });

      // Trigger CI pipeline
      await this.triggerCIPipeline(pr);

      // Send notifications
      await this.sendPRNotifications(pr, 'created');

      // Notify reviewers
      if (reviewers && reviewers.length > 0) {
        await this.notifyReviewers(pr, reviewers);
      }

      logger.info(`Pull request created: #${number}`, { prId: pr.id, repositoryId });

      return pr;
    } catch (error) {
      logger.error('Failed to create pull request:', error);
      throw error;
    }
  }

  /**
   * Get PR by number
   */
  async getPullRequest(repositoryId, prNumber) {
    return await GitPullRequest.findOne({
      where: { repositoryId, number: prNumber }
    });
  }

  /**
   * List pull requests
   */
  async listPullRequests(repositoryId, { state, createdBy, reviewStatus, ciStatus, limit = 50, offset = 0 }) {
    const where = { repositoryId };

    if (state) where.state = state;
    if (createdBy) where.createdBy = createdBy;
    if (reviewStatus) where.reviewStatus = reviewStatus;
    if (ciStatus) where.ciStatus = ciStatus;

    const { count, rows } = await GitPullRequest.findAndCountAll({
      where,
      limit,
      offset,
      order: [['createdAt', 'DESC']]
    });

    return { total: count, pullRequests: rows, limit, offset };
  }

  /**
   * Update pull request
   */
  async updatePullRequest(repositoryId, prNumber, updates) {
    const pr = await this.getPullRequest(repositoryId, prNumber);
    if (!pr) {
      throw new Error('Pull request not found');
    }

    const oldState = pr.state;

    await pr.update(updates);

    // If state changed, update counts
    if (updates.state && updates.state !== oldState) {
      if (oldState === 'open' && updates.state !== 'open') {
        await GitRepository.decrement('openPrsCount', { where: { id: repositoryId } });
      } else if (oldState !== 'open' && updates.state === 'open') {
        await GitRepository.increment('openPrsCount', { where: { id: repositoryId } });
      }
    }

    // Send notifications
    await this.sendPRNotifications(pr, 'updated', updates);

    logger.info(`Pull request updated: #${prNumber}`, { prId: pr.id, updates });

    return pr;
  }

  /**
   * Check if PR is mergeable
   */
  async checkMergeable(repositoryId, sourceBranch, targetBranch) {
    try {
      const repository = await GitRepository.findByPk(repositoryId);
      const mergeResult = await GitService.mergeBranches(repositoryId, {
        sourceBranch,
        targetBranch,
        message: 'Test merge',
        dryRun: true
      });

      if (mergeResult.conflicts && mergeResult.conflicts.length > 0) {
        return {
          mergeable: false,
          conflicts: mergeResult.conflicts
        };
      }

      return {
        mergeable: true,
        conflicts: []
      };
    } catch (error) {
      logger.error('Failed to check mergeable:', error);
      return {
        mergeable: false,
        conflicts: []
      };
    }
  }

  /**
   * Merge pull request
   */
  async mergePullRequest(repositoryId, prNumber, { mergedBy, mergeMethod = 'merge' }) {
    const pr = await this.getPullRequest(repositoryId, prNumber);
    if (!pr) {
      throw new Error('Pull request not found');
    }

    if (pr.state !== 'open') {
      throw new Error('Pull request is not open');
    }

    if (!pr.mergeable) {
      throw new Error('Pull request has conflicts and cannot be merged');
    }

    if (pr.reviewStatus === 'changes_requested') {
      throw new Error('Pull request requires changes before merging');
    }

    // Perform the merge
    const mergeResult = await GitService.mergeBranches(repositoryId, {
      sourceBranch: pr.sourceBranch,
      targetBranch: pr.targetBranch,
      message: `Merge pull request #${pr.number}: ${pr.title}`,
      mergedBy
    });

    if (!mergeResult.success) {
      throw new Error('Failed to merge pull request');
    }

    // Update PR
    await pr.update({
      state: 'merged',
      mergedBy,
      mergedAt: new Date(),
      mergeCommitSha: mergeResult.commitSha
    });

    // Update PR count
    await GitRepository.decrement('openPrsCount', { where: { id: repositoryId } });

    // Send notifications
    await this.sendPRNotifications(pr, 'merged');

    logger.info(`Pull request merged: #${prNumber}`, { prId: pr.id });

    return pr;
  }

  /**
   * Close pull request without merging
   */
  async closePullRequest(repositoryId, prNumber, userId) {
    const pr = await this.getPullRequest(repositoryId, prNumber);
    if (!pr) {
      throw new Error('Pull request not found');
    }

    await pr.update({
      state: 'closed',
      closedAt: new Date()
    });

    await GitRepository.decrement('openPrsCount', { where: { id: repositoryId } });

    await this.sendPRNotifications(pr, 'closed');

    logger.info(`Pull request closed: #${prNumber}`, { prId: pr.id });

    return pr;
  }

  /**
   * Convert draft to ready for review
   */
  async markReadyForReview(repositoryId, prNumber) {
    return await this.updatePullRequest(repositoryId, prNumber, {
      state: 'open'
    });
  }

  /**
   * Request review from users
   */
  async requestReview(repositoryId, prNumber, reviewerIds) {
    const pr = await this.getPullRequest(repositoryId, prNumber);
    if (!pr) {
      throw new Error('Pull request not found');
    }

    const reviewers = [...new Set([...pr.reviewers, ...reviewerIds])];
    await pr.update({ reviewers });

    await this.notifyReviewers(pr, reviewerIds);

    return pr;
  }

  /**
   * Trigger CI pipeline for PR
   */
  async triggerCIPipeline(pr) {
    try {
      // Find active pipelines for this repository
      const GitPipeline = require('../models/GitPipeline');
      const pipelines = await GitPipeline.findAll({
        where: {
          repositoryId: pr.repositoryId,
          active: true,
          triggerOn: { [Op.contains]: ['pull_request'] }
        }
      });

      if (pipelines.length === 0) return;

      // Trigger first matching pipeline
      const pipeline = pipelines[0];
      const ciUrl = process.env.CI_SERVICE_URL || 'http://localhost:5001';

      const response = await axios.post(`${ciUrl}/lowcode/api/git/pipelines/${pipeline.id}/trigger`, {
        trigger: 'pull_request',
        branch: pr.sourceBranch,
        commitSha: pr.headSha,
        prId: pr.id,
        prNumber: pr.number
      });

      // Update PR with CI pipeline info
      await pr.update({
        ciPipelineId: pipeline.id,
        ciStatus: 'pending'
      });

      logger.info('CI pipeline triggered for PR', { prId: pr.id, pipelineId: pipeline.id });
    } catch (error) {
      logger.error('Failed to trigger CI pipeline:', error);
      // Don't throw - CI is optional
    }
  }

  /**
   * Update CI status for PR
   */
  async updateCIStatus(prId, { status, pipelineRunId }) {
    const pr = await GitPullRequest.findByPk(prId);
    if (!pr) return;

    await pr.update({ ciStatus: status });

    // Send notification if CI failed
    if (status === 'failure') {
      await this.sendCIFailureNotification(pr, pipelineRunId);
    }

    logger.info('CI status updated for PR', { prId, status });
  }

  /**
   * Send PR notifications via Herald
   */
  async sendPRNotifications(pr, action, updates = {}) {
    try {
      const repository = await GitRepository.findByPk(pr.repositoryId);
      if (!repository) return;

      const heraldUrl = process.env.HERALD_URL || 'http://localhost:3014';

      const notification = {
        type: `git.pr.${action}`,
        title: `PR #${pr.number}: ${pr.title}`,
        message: this.formatPRNotification(pr, action, updates),
        data: {
          repositoryId: pr.repositoryId,
          repositorySlug: repository.slug,
          prNumber: pr.number,
          prId: pr.id,
          action,
          updates
        },
        recipients: this.getPRRecipients(pr),
        channels: ['in_app', 'push'],
        priority: 'normal'
      };

      await axios.post(`${heraldUrl}/api/notifications`, notification);

      logger.debug('PR notification sent', { prId: pr.id, action });
    } catch (error) {
      logger.error('Failed to send PR notification:', error);
    }
  }

  /**
   * Format PR notification message
   */
  formatPRNotification(pr, action, updates) {
    switch (action) {
      case 'created':
        return `New pull request from ${pr.sourceBranch} to ${pr.targetBranch}`;
      case 'merged':
        return 'Pull request merged';
      case 'closed':
        return 'Pull request closed';
      case 'updated':
        return Object.keys(updates).map(key => `${key} updated`).join(', ');
      default:
        return `Pull request ${action}`;
    }
  }

  /**
   * Get notification recipients for PR
   */
  getPRRecipients(pr) {
    const recipients = new Set();

    if (pr.createdBy) recipients.add(pr.createdBy);
    pr.reviewers.forEach(id => recipients.add(id));
    pr.assignees.forEach(id => recipients.add(id));
    if (pr.mergedBy) recipients.add(pr.mergedBy);

    return Array.from(recipients);
  }

  /**
   * Notify reviewers via Herald and Spark
   */
  async notifyReviewers(pr, reviewerIds) {
    try {
      const repository = await GitRepository.findByPk(pr.repositoryId);
      const heraldUrl = process.env.HERALD_URL || 'http://localhost:3014';

      for (const reviewerId of reviewerIds) {
        await axios.post(`${heraldUrl}/api/notifications`, {
          type: 'git.pr.review_requested',
          title: `Review requested for PR #${pr.number}`,
          message: pr.title,
          data: {
            repositoryId: pr.repositoryId,
            repositorySlug: repository.slug,
            prNumber: pr.number,
            prId: pr.id
          },
          recipients: [reviewerId],
          channels: ['in_app', 'push', 'email'],
          priority: 'normal'
        });
      }

      // Send Spark message if configured
      await this.sendSparkMessage(pr, reviewerIds);

      logger.debug('Reviewers notified', { prId: pr.id, reviewers: reviewerIds });
    } catch (error) {
      logger.error('Failed to notify reviewers:', error);
    }
  }

  /**
   * Send Spark real-time message
   */
  async sendSparkMessage(pr, userIds) {
    try {
      const sparkUrl = process.env.SPARK_URL || 'http://localhost:3002';

      await axios.post(`${sparkUrl}/api/messages/send`, {
        type: 'git_pr_notification',
        content: {
          prId: pr.id,
          prNumber: pr.number,
          title: pr.title,
          repositoryId: pr.repositoryId
        },
        recipients: userIds,
        priority: 'normal'
      });

      logger.debug('Spark message sent for PR', { prId: pr.id });
    } catch (error) {
      logger.error('Failed to send Spark message:', error);
    }
  }

  /**
   * Send CI failure notification
   */
  async sendCIFailureNotification(pr, pipelineRunId) {
    try {
      const heraldUrl = process.env.HERALD_URL || 'http://localhost:3014';

      await axios.post(`${heraldUrl}/api/notifications`, {
        type: 'git.pr.ci_failed',
        title: `CI failed for PR #${pr.number}`,
        message: 'The continuous integration pipeline has failed',
        data: {
          prId: pr.id,
          prNumber: pr.number,
          pipelineRunId
        },
        recipients: [pr.createdBy],
        channels: ['in_app', 'push', 'email'],
        priority: 'high'
      });
    } catch (error) {
      logger.error('Failed to send CI failure notification:', error);
    }
  }

  /**
   * Get PR statistics
   */
  async getPRStats(repositoryId) {
    const [total, open, merged, closed, draft] = await Promise.all([
      GitPullRequest.count({ where: { repositoryId } }),
      GitPullRequest.count({ where: { repositoryId, state: 'open' } }),
      GitPullRequest.count({ where: { repositoryId, state: 'merged' } }),
      GitPullRequest.count({ where: { repositoryId, state: 'closed' } }),
      GitPullRequest.count({ where: { repositoryId, state: 'draft' } })
    ]);

    const ciStats = await GitPullRequest.findAll({
      where: { repositoryId },
      attributes: [
        'ciStatus',
        [GitPullRequest.sequelize.fn('COUNT', GitPullRequest.sequelize.col('id')), 'count']
      ],
      group: ['ciStatus']
    });

    return {
      total,
      open,
      merged,
      closed,
      draft,
      ciStatus: ciStats.reduce((acc, item) => {
        acc[item.ciStatus] = parseInt(item.getDataValue('count'));
        return acc;
      }, {})
    };
  }
}

module.exports = new GitPullRequestService();
