/**
 * Poll Service
 *
 * Business logic for poll/survey management in the low-code platform.
 * Manages polls, responses, and result aggregation.
 */

const { Op } = require('sequelize');
const { Poll, PollResponse, Application, AppForm } = require('../models');

class PollService {
  /**
   * List polls with pagination and filtering
   */
  async listPolls(options = {}) {
    const {
      applicationId,
      formId,
      creatorId,
      pollType,
      status,
      limit = 25,
      offset = 0,
      sortBy = 'created_at',
      sortOrder = 'DESC',
      search
    } = options;

    const where = {};

    if (applicationId) {
      where.applicationId = applicationId;
    }

    if (formId) {
      where.formId = formId;
    }

    if (creatorId) {
      where.creatorId = creatorId;
    }

    if (pollType) {
      where.pollType = pollType;
    }

    if (status) {
      where.status = status;
    }

    if (search) {
      where[Op.or] = [
        { question: { [Op.iLike]: `%${search}%` } },
        { description: { [Op.iLike]: `%${search}%` } }
      ];
    }

    const { count, rows } = await Poll.findAndCountAll({
      where,
      limit,
      offset,
      order: [[sortBy, sortOrder]],
      include: [
        {
          model: Application,
          as: 'application',
          attributes: ['id', 'name', 'displayName']
        },
        {
          model: AppForm,
          as: 'form',
          attributes: ['id', 'name', 'displayName'],
          required: false
        }
      ]
    });

    return {
      total: count,
      polls: rows,
      limit,
      offset,
      hasMore: offset + limit < count
    };
  }

  /**
   * Get poll by ID
   */
  async getPollById(pollId, options = {}) {
    const { includeResponses = false, userId = null } = options;

    const include = [
      {
        model: Application,
        as: 'application',
        attributes: ['id', 'name', 'displayName']
      },
      {
        model: AppForm,
        as: 'form',
        attributes: ['id', 'name', 'displayName'],
        required: false
      }
    ];

    if (includeResponses) {
      include.push({
        model: PollResponse,
        as: 'responses',
        attributes: ['id', 'selectedOptions', 'comment', 'createdAt', 'userId']
      });
    }

    const poll = await Poll.findByPk(pollId, { include });

    if (!poll) {
      throw new Error('Poll not found');
    }

    // Check if user can see results
    const canSeeResults = this.canUserSeeResults(poll, userId);

    if (!canSeeResults && poll.results) {
      // Hide results if not allowed
      poll.results = null;
    }

    return poll;
  }

  /**
   * Create new poll
   */
  async createPoll(data, userId) {
    const { applicationId, formId, question, pollType, options } = data;

    // Verify application exists and user has access
    const application = await Application.findByPk(applicationId);
    if (!application) {
      throw new Error('Application not found');
    }

    if (application.ownerId !== userId) {
      throw new Error('Unauthorized: You do not own this application');
    }

    // Verify form if specified
    if (formId) {
      const form = await AppForm.findByPk(formId);
      if (!form) {
        throw new Error('Form not found');
      }
      if (form.applicationId !== applicationId) {
        throw new Error('Form does not belong to this application');
      }
    }

    // Validate options
    if (!Array.isArray(options) || options.length < 2) {
      throw new Error('Poll must have at least 2 options');
    }

    // Create poll
    const poll = await Poll.create({
      applicationId,
      formId: formId || null,
      creatorId: userId,
      question,
      description: data.description || '',
      pollType: pollType || 'single-choice',
      options,
      settings: data.settings || {
        allowAnonymous: true,
        allowMultipleResponses: false,
        showResults: 'after-vote',
        requireComment: false
      },
      startDate: data.startDate || null,
      endDate: data.endDate || null,
      status: 'draft'
    });

    return poll;
  }

  /**
   * Update poll
   */
  async updatePoll(pollId, data, userId) {
    const poll = await Poll.findByPk(pollId, {
      include: [{ model: Application, as: 'application' }]
    });

    if (!poll) {
      throw new Error('Poll not found');
    }

    if (poll.application.ownerId !== userId && poll.creatorId !== userId) {
      throw new Error('Unauthorized');
    }

    // Can't modify closed or archived polls
    if (poll.status === 'closed' || poll.status === 'archived') {
      throw new Error('Cannot modify closed or archived polls');
    }

    // Can't modify options if poll is active and has responses
    if (poll.status === 'active' && poll.responseCount > 0 && data.options) {
      throw new Error('Cannot modify options on active poll with existing responses');
    }

    // Update allowed fields
    const allowedFields = [
      'question',
      'description',
      'pollType',
      'options',
      'settings',
      'startDate',
      'endDate'
    ];

    allowedFields.forEach(field => {
      if (data[field] !== undefined) {
        poll[field] = data[field];
      }
    });

    await poll.save();
    return poll;
  }

  /**
   * Delete poll (soft delete)
   */
  async deletePoll(pollId, userId) {
    const poll = await Poll.findByPk(pollId, {
      include: [{ model: Application, as: 'application' }]
    });

    if (!poll) {
      throw new Error('Poll not found');
    }

    if (poll.application.ownerId !== userId && poll.creatorId !== userId) {
      throw new Error('Unauthorized');
    }

    // Can't delete active polls
    if (poll.status === 'active') {
      throw new Error('Cannot delete active poll. Close it first.');
    }

    // Soft delete
    await poll.destroy();

    return { success: true, message: 'Poll deleted successfully' };
  }

  /**
   * Activate poll
   */
  async activatePoll(pollId, userId) {
    const poll = await Poll.findByPk(pollId, {
      include: [{ model: Application, as: 'application' }]
    });

    if (!poll) {
      throw new Error('Poll not found');
    }

    if (poll.application.ownerId !== userId && poll.creatorId !== userId) {
      throw new Error('Unauthorized');
    }

    if (poll.status !== 'draft') {
      throw new Error('Only draft polls can be activated');
    }

    // Validate poll is ready
    if (!poll.options || poll.options.length < 2) {
      throw new Error('Poll must have at least 2 options');
    }

    await poll.activate();

    return poll;
  }

  /**
   * Close poll
   */
  async closePoll(pollId, userId) {
    const poll = await Poll.findByPk(pollId, {
      include: [{ model: Application, as: 'application' }]
    });

    if (!poll) {
      throw new Error('Poll not found');
    }

    if (poll.application.ownerId !== userId && poll.creatorId !== userId) {
      throw new Error('Unauthorized');
    }

    if (poll.status !== 'active') {
      throw new Error('Only active polls can be closed');
    }

    await poll.close();

    // Calculate final results
    await this.calculateResults(pollId);

    return poll;
  }

  /**
   * Archive poll
   */
  async archivePoll(pollId, userId) {
    const poll = await Poll.findByPk(pollId, {
      include: [{ model: Application, as: 'application' }]
    });

    if (!poll) {
      throw new Error('Poll not found');
    }

    if (poll.application.ownerId !== userId && poll.creatorId !== userId) {
      throw new Error('Unauthorized');
    }

    if (poll.status !== 'closed') {
      throw new Error('Only closed polls can be archived');
    }

    poll.status = 'archived';
    await poll.save();

    return poll;
  }

  /**
   * Add option to poll
   */
  async addOption(pollId, optionData, userId) {
    const poll = await Poll.findByPk(pollId, {
      include: [{ model: Application, as: 'application' }]
    });

    if (!poll) {
      throw new Error('Poll not found');
    }

    if (poll.application.ownerId !== userId && poll.creatorId !== userId) {
      throw new Error('Unauthorized');
    }

    // Can't add options to active polls with responses
    if (poll.status === 'active' && poll.responseCount > 0) {
      throw new Error('Cannot add options to active poll with existing responses');
    }

    poll.addOption(optionData);
    await poll.save();

    return poll;
  }

  /**
   * Submit poll response
   */
  async submitResponse(pollId, responseData, userId = null) {
    const poll = await Poll.findByPk(pollId);

    if (!poll) {
      throw new Error('Poll not found');
    }

    // Check if poll is active
    if (poll.status !== 'active') {
      throw new Error('Poll is not active');
    }

    // Check dates
    const now = new Date();
    if (poll.startDate && now < poll.startDate) {
      throw new Error('Poll has not started yet');
    }
    if (poll.endDate && now > poll.endDate) {
      throw new Error('Poll has ended');
    }

    // Check if user can respond
    if (!poll.settings.allowAnonymous && !userId) {
      throw new Error('Anonymous responses are not allowed');
    }

    // Check for duplicate responses
    if (!poll.settings.allowMultipleResponses && userId) {
      const existing = await PollResponse.findOne({
        where: {
          pollId,
          userId
        }
      });

      if (existing) {
        throw new Error('You have already responded to this poll');
      }
    }

    // Validate selected options
    const { selectedOptions, comment } = responseData;

    if (!selectedOptions || (Array.isArray(selectedOptions) && selectedOptions.length === 0)) {
      throw new Error('Selected options are required');
    }

    // Validate options exist in poll
    const optionIds = poll.options.map(opt => opt.id);
    const selectedIds = Array.isArray(selectedOptions) ? selectedOptions : [selectedOptions];

    for (const selectedId of selectedIds) {
      if (!optionIds.includes(String(selectedId))) {
        throw new Error(`Invalid option: ${selectedId}`);
      }
    }

    // Validate response type
    if (poll.pollType === 'single-choice' && selectedIds.length > 1) {
      throw new Error('Only one option can be selected for single-choice polls');
    }

    // Check if comment is required
    if (poll.settings.requireComment && !comment) {
      throw new Error('Comment is required');
    }

    // Create response
    const response = await PollResponse.create({
      pollId,
      userId: userId || null,
      selectedOptions: selectedIds,
      comment: comment || null,
      metadata: {
        ipAddress: responseData.ipAddress || null,
        userAgent: responseData.userAgent || null,
        timestamp: now
      }
    });

    // Update response count
    poll.responseCount += 1;
    await poll.save();

    // Recalculate results
    await this.calculateResults(pollId);

    return response;
  }

  /**
   * Calculate poll results
   */
  async calculateResults(pollId) {
    const poll = await Poll.findByPk(pollId, {
      include: [
        {
          model: PollResponse,
          as: 'responses',
          attributes: ['selectedOptions']
        }
      ]
    });

    if (!poll) {
      throw new Error('Poll not found');
    }

    const results = {
      totalResponses: poll.responseCount,
      calculatedAt: new Date(),
      optionResults: {}
    };

    // Initialize option counts
    poll.options.forEach(option => {
      results.optionResults[option.id] = {
        label: option.label,
        count: 0,
        percentage: 0
      };
    });

    // Count responses
    poll.responses.forEach(response => {
      response.selectedOptions.forEach(optionId => {
        if (results.optionResults[optionId]) {
          results.optionResults[optionId].count += 1;
        }
      });
    });

    // Calculate percentages
    if (poll.responseCount > 0) {
      Object.keys(results.optionResults).forEach(optionId => {
        const count = results.optionResults[optionId].count;
        results.optionResults[optionId].percentage = Math.round((count / poll.responseCount) * 100);
      });
    }

    poll.results = results;
    poll.changed('results', true);
    await poll.save();

    return results;
  }

  /**
   * Get poll results
   */
  async getResults(pollId, userId = null) {
    const poll = await Poll.findByPk(pollId, {
      include: [{ model: Application, as: 'application' }]
    });

    if (!poll) {
      throw new Error('Poll not found');
    }

    // Check if user can see results
    const canSeeResults = this.canUserSeeResults(poll, userId);

    if (!canSeeResults) {
      throw new Error('Results are not available yet');
    }

    // Recalculate if needed
    if (!poll.results || poll.results.totalResponses !== poll.responseCount) {
      await this.calculateResults(pollId);
      await poll.reload();
    }

    return poll.results;
  }

  /**
   * Get poll responses
   */
  async getResponses(pollId, userId, options = {}) {
    const { limit = 50, offset = 0, includeAnonymous = false } = options;

    const poll = await Poll.findByPk(pollId, {
      include: [{ model: Application, as: 'application' }]
    });

    if (!poll) {
      throw new Error('Poll not found');
    }

    // Only creator or app owner can see responses
    if (poll.application.ownerId !== userId && poll.creatorId !== userId) {
      throw new Error('Unauthorized');
    }

    const where = { pollId };

    if (!includeAnonymous) {
      where.userId = { [Op.ne]: null };
    }

    const { count, rows } = await PollResponse.findAndCountAll({
      where,
      limit,
      offset,
      order: [['createdAt', 'DESC']]
    });

    return {
      total: count,
      responses: rows,
      limit,
      offset,
      hasMore: offset + limit < count
    };
  }

  /**
   * Get poll statistics
   */
  async getPollStats(pollId, userId) {
    const poll = await Poll.findByPk(pollId, {
      include: [{ model: Application, as: 'application' }]
    });

    if (!poll) {
      throw new Error('Poll not found');
    }

    if (poll.application.ownerId !== userId && poll.creatorId !== userId) {
      throw new Error('Unauthorized');
    }

    const stats = {
      id: poll.id,
      question: poll.question,
      pollType: poll.pollType,
      status: poll.status,
      responseCount: poll.responseCount,
      optionCount: poll.options.length,
      startDate: poll.startDate,
      endDate: poll.endDate,
      createdAt: poll.createdAt,
      updatedAt: poll.updatedAt,
      isActive: poll.status === 'active',
      hasResponses: poll.responseCount > 0
    };

    // Calculate response rate if dates are set
    if (poll.startDate && poll.endDate) {
      const duration = poll.endDate - poll.startDate;
      const durationDays = Math.ceil(duration / (1000 * 60 * 60 * 24));
      stats.durationDays = durationDays;
      stats.responsesPerDay = poll.responseCount / Math.max(1, durationDays);
    }

    return stats;
  }

  /**
   * Check if user can see results
   */
  canUserSeeResults(poll, userId = null) {
    const showResults = poll.settings.showResults || 'after-vote';

    switch (showResults) {
      case 'always':
        return true;

      case 'after-vote':
        // Check if user has voted
        if (!userId) return false;
        // Would need to query PollResponse here
        // For now, return true if poll is closed
        return poll.status === 'closed' || poll.status === 'archived';

      case 'after-close':
        return poll.status === 'closed' || poll.status === 'archived';

      case 'never':
        // Only creator and app owner can see
        return poll.creatorId === userId || poll.application?.ownerId === userId;

      default:
        return false;
    }
  }
}

module.exports = new PollService();
