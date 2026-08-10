/**
 * ═══════════════════════════════════════════════════════════
 * Git Issue Service
 * Issue tracking with workflow integration
 * ═══════════════════════════════════════════════════════════
 */

const { v4: uuidv4 } = require('uuid');
const logger = require('../../utils/logger');
const GitIssue = require('../models/GitIssue');
const GitRepository = require('../models/GitRepository');
const { Op } = require('sequelize');
const axios = require('axios');

class GitIssueService {
  /**
   * Create a new issue
   */
  async createIssue(repositoryId, { title, body, priority, issueType, labels, assignees, milestoneId, createdBy, dueDate }) {
    try {
      // Get next issue number
      const lastIssue = await GitIssue.findOne({
        where: { repositoryId },
        order: [['number', 'DESC']],
        attributes: ['number']
      });

      const number = lastIssue ? lastIssue.number + 1 : 1;

      // Create issue
      const issue = await GitIssue.create({
        id: uuidv4(),
        repositoryId,
        number,
        title,
        body,
        priority: priority || 'medium',
        issueType: issueType || 'task',
        labels: labels || [],
        assignees: assignees || [],
        milestoneId,
        createdBy,
        dueDate,
        state: 'open'
      });

      // Update repository issues count
      await GitRepository.increment('openIssuesCount', { where: { id: repositoryId } });

      // Send notifications
      await this.sendIssueNotifications(issue, 'created');

      // Trigger workflow if configured
      await this.triggerWorkflow(issue, 'issue.created');

      logger.info(`Issue created: #${number}`, { issueId: issue.id, repositoryId });

      return issue;
    } catch (error) {
      logger.error('Failed to create issue:', error);
      throw error;
    }
  }

  /**
   * Get issue by number
   */
  async getIssue(repositoryId, issueNumber) {
    return await GitIssue.findOne({
      where: { repositoryId, number: issueNumber }
    });
  }

  /**
   * List issues with filters
   */
  async listIssues(repositoryId, { state, priority, issueType, labels, assignees, createdBy, limit = 50, offset = 0 }) {
    const where = { repositoryId };

    if (state) where.state = state;
    if (priority) where.priority = priority;
    if (issueType) where.issueType = issueType;
    if (createdBy) where.createdBy = createdBy;

    if (labels && labels.length > 0) {
      where.labels = { [Op.overlap]: labels };
    }

    if (assignees && assignees.length > 0) {
      where.assignees = { [Op.overlap]: assignees };
    }

    const { count, rows } = await GitIssue.findAndCountAll({
      where,
      limit,
      offset,
      order: [['createdAt', 'DESC']]
    });

    return { total: count, issues: rows, limit, offset };
  }

  /**
   * Update issue
   */
  async updateIssue(repositoryId, issueNumber, updates) {
    const issue = await this.getIssue(repositoryId, issueNumber);
    if (!issue) {
      throw new Error('Issue not found');
    }

    const oldState = issue.state;

    await issue.update(updates);

    // If state changed, update counts
    if (updates.state && updates.state !== oldState) {
      if (oldState === 'open' && updates.state !== 'open') {
        await GitRepository.decrement('openIssuesCount', { where: { id: repositoryId } });
      } else if (oldState !== 'open' && updates.state === 'open') {
        await GitRepository.increment('openIssuesCount', { where: { id: repositoryId } });
      }
    }

    // Send notifications
    await this.sendIssueNotifications(issue, 'updated', updates);

    // Trigger workflow if state changed
    if (updates.state && updates.state !== oldState) {
      await this.triggerWorkflow(issue, `issue.${updates.state}`);
    }

    logger.info(`Issue updated: #${issueNumber}`, { issueId: issue.id, updates });

    return issue;
  }

  /**
   * Close issue
   */
  async closeIssue(repositoryId, issueNumber, { closedBy, state = 'closed' }) {
    return await this.updateIssue(repositoryId, issueNumber, {
      state,
      closedBy,
      closedAt: new Date()
    });
  }

  /**
   * Reopen issue
   */
  async reopenIssue(repositoryId, issueNumber) {
    return await this.updateIssue(repositoryId, issueNumber, {
      state: 'open',
      closedBy: null,
      closedAt: null
    });
  }

  /**
   * Add label to issue
   */
  async addLabel(repositoryId, issueNumber, label) {
    const issue = await this.getIssue(repositoryId, issueNumber);
    if (!issue) {
      throw new Error('Issue not found');
    }

    if (!issue.labels.includes(label)) {
      const labels = [...issue.labels, label];
      await issue.update({ labels });
    }

    return issue;
  }

  /**
   * Remove label from issue
   */
  async removeLabel(repositoryId, issueNumber, label) {
    const issue = await this.getIssue(repositoryId, issueNumber);
    if (!issue) {
      throw new Error('Issue not found');
    }

    const labels = issue.labels.filter(l => l !== label);
    await issue.update({ labels });

    return issue;
  }

  /**
   * Assign user to issue
   */
  async assignUser(repositoryId, issueNumber, userId) {
    const issue = await this.getIssue(repositoryId, issueNumber);
    if (!issue) {
      throw new Error('Issue not found');
    }

    if (!issue.assignees.includes(userId)) {
      const assignees = [...issue.assignees, userId];
      await issue.update({ assignees });

      // Notify assigned user
      await this.sendAssignmentNotification(issue, userId);
    }

    return issue;
  }

  /**
   * Unassign user from issue
   */
  async unassignUser(repositoryId, issueNumber, userId) {
    const issue = await this.getIssue(repositoryId, issueNumber);
    if (!issue) {
      throw new Error('Issue not found');
    }

    const assignees = issue.assignees.filter(id => id !== userId);
    await issue.update({ assignees });

    return issue;
  }

  /**
   * Send issue notifications via Herald
   */
  async sendIssueNotifications(issue, action, updates = {}) {
    try {
      const repository = await GitRepository.findByPk(issue.repositoryId);
      if (!repository) return;

      // Get Herald service URL from environment
      const heraldUrl = process.env.HERALD_URL || 'http://localhost:3014';

      const notification = {
        type: `git.issue.${action}`,
        title: `Issue #${issue.number}: ${issue.title}`,
        message: this.formatIssueNotification(issue, action, updates),
        data: {
          repositoryId: issue.repositoryId,
          repositorySlug: repository.slug,
          issueNumber: issue.number,
          issueId: issue.id,
          action,
          updates
        },
        recipients: this.getIssueRecipients(issue),
        channels: ['in_app', 'push'],
        priority: issue.priority === 'critical' ? 'high' : 'normal'
      };

      await axios.post(`${heraldUrl}/api/notifications`, notification, {
        headers: {
          'Content-Type': 'application/json'
        }
      });

      logger.debug('Issue notification sent', { issueId: issue.id, action });
    } catch (error) {
      logger.error('Failed to send issue notification:', error);
      // Don't throw - notifications are non-critical
    }
  }

  /**
   * Format issue notification message
   */
  formatIssueNotification(issue, action, updates) {
    switch (action) {
      case 'created':
        return `New ${issue.issueType} issue created`;
      case 'updated':
        return Object.keys(updates).map(key => `${key} updated`).join(', ');
      case 'closed':
        return 'Issue closed';
      case 'reopened':
        return 'Issue reopened';
      default:
        return `Issue ${action}`;
    }
  }

  /**
   * Get notification recipients for an issue
   */
  getIssueRecipients(issue) {
    const recipients = new Set();

    // Creator
    if (issue.createdBy) recipients.add(issue.createdBy);

    // Assignees
    issue.assignees.forEach(id => recipients.add(id));

    // Closer
    if (issue.closedBy) recipients.add(issue.closedBy);

    return Array.from(recipients);
  }

  /**
   * Send assignment notification
   */
  async sendAssignmentNotification(issue, userId) {
    try {
      const repository = await GitRepository.findByPk(issue.repositoryId);
      const heraldUrl = process.env.HERALD_URL || 'http://localhost:3014';

      await axios.post(`${heraldUrl}/api/notifications`, {
        type: 'git.issue.assigned',
        title: `You were assigned to issue #${issue.number}`,
        message: issue.title,
        data: {
          repositoryId: issue.repositoryId,
          repositorySlug: repository.slug,
          issueNumber: issue.number,
          issueId: issue.id
        },
        recipients: [userId],
        channels: ['in_app', 'push', 'email'],
        priority: issue.priority === 'critical' ? 'high' : 'normal'
      });
    } catch (error) {
      logger.error('Failed to send assignment notification:', error);
    }
  }

  /**
   * Trigger workflow for issue events
   */
  async triggerWorkflow(issue, eventType) {
    try {
      // Check if workflow is configured
      if (!issue.workflowId) return;

      const workflowUrl = process.env.WORKFLOW_URL || 'http://localhost:3017';

      await axios.post(`${workflowUrl}/api/workflows/${issue.workflowId}/trigger`, {
        eventType,
        data: {
          issueId: issue.id,
          repositoryId: issue.repositoryId,
          issueNumber: issue.number,
          title: issue.title,
          state: issue.state,
          priority: issue.priority,
          issueType: issue.issueType,
          assignees: issue.assignees,
          createdBy: issue.createdBy
        }
      });

      logger.debug('Workflow triggered for issue', { issueId: issue.id, eventType });
    } catch (error) {
      logger.error('Failed to trigger workflow:', error);
    }
  }

  /**
   * Get issue statistics
   */
  async getIssueStats(repositoryId) {
    const [total, open, closed, inProgress] = await Promise.all([
      GitIssue.count({ where: { repositoryId } }),
      GitIssue.count({ where: { repositoryId, state: 'open' } }),
      GitIssue.count({ where: { repositoryId, state: 'closed' } }),
      GitIssue.count({ where: { repositoryId, state: 'in_progress' } })
    ]);

    const byType = await GitIssue.findAll({
      where: { repositoryId },
      attributes: [
        'issueType',
        [GitIssue.sequelize.fn('COUNT', GitIssue.sequelize.col('id')), 'count']
      ],
      group: ['issueType']
    });

    const byPriority = await GitIssue.findAll({
      where: { repositoryId },
      attributes: [
        'priority',
        [GitIssue.sequelize.fn('COUNT', GitIssue.sequelize.col('id')), 'count']
      ],
      group: ['priority']
    });

    return {
      total,
      open,
      closed,
      inProgress,
      byType: byType.reduce((acc, item) => {
        acc[item.issueType] = parseInt(item.getDataValue('count'));
        return acc;
      }, {}),
      byPriority: byPriority.reduce((acc, item) => {
        acc[item.priority] = parseInt(item.getDataValue('count'));
        return acc;
      }, {})
    };
  }
}

module.exports = new GitIssueService();
