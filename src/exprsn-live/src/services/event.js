/**
 * Event Service
 * Business logic for managing live events and pre-recorded webinars
 */

const { Event, Stream, TimelineSegment, ModerationAction } = require('../models');
const logger = require('../utils/logger');
const { Op } = require('sequelize');

class EventService {
  /**
   * Create a new event
   * @param {Object} eventData - Event creation data
   * @param {string} userId - User ID creating the event
   * @returns {Promise<Object>} Created event
   */
  async createEvent(eventData, userId) {
    try {
      const {
        title,
        description,
        eventType = 'live',
        visibility = 'public',
        scheduledStartTime,
        scheduledEndTime = null,
        category = null,
        tags = [],
        language = 'en',
        allowComments = true,
        allowReactions = true,
        maxViewers = null,
        isRecordingEnabled = true,
        moderationSettings = {}
      } = eventData;

      const event = await Event.create({
        user_id: userId,
        title,
        description,
        event_type: eventType,
        visibility,
        scheduled_start_time: scheduledStartTime,
        scheduled_end_time: scheduledEndTime,
        category,
        tags,
        language,
        allow_comments: allowComments,
        allow_reactions: allowReactions,
        max_viewers: maxViewers,
        is_recording_enabled: isRecordingEnabled,
        moderation_settings: {
          auto_moderation: true,
          profanity_filter: true,
          spam_filter: true,
          link_filter: false,
          slow_mode: 0,
          ...moderationSettings
        },
        status: 'scheduled'
      });

      logger.info('Event created', { eventId: event.id, userId, eventType });

      return this.formatEvent(event);
    } catch (error) {
      logger.error('Failed to create event:', error);
      throw error;
    }
  }

  /**
   * Get event by ID
   * @param {string} eventId - Event ID
   * @param {Object} options - Query options
   * @returns {Promise<Object|null>} Event data
   */
  async getEvent(eventId, options = {}) {
    try {
      const includeSegments = options.includeSegments || false;
      const includeModerationActions = options.includeModerationActions || false;

      const include = [];

      if (includeSegments) {
        include.push({
          model: TimelineSegment,
          as: 'segments',
          order: [['order_index', 'ASC']]
        });
      }

      if (includeModerationActions) {
        include.push({
          model: ModerationAction,
          as: 'moderationActions',
          order: [['created_at', 'DESC']],
          limit: 100
        });
      }

      const event = await Event.findByPk(eventId, {
        include: include.length > 0 ? include : undefined
      });

      if (!event) {
        return null;
      }

      return this.formatEvent(event);
    } catch (error) {
      logger.error('Failed to get event:', error);
      throw error;
    }
  }

  /**
   * List events
   * @param {Object} filters - Filter options
   * @returns {Promise<Object>} Paginated events
   */
  async listEvents(filters = {}) {
    try {
      const {
        status = null,
        eventType = null,
        visibility = null,
        userId = null,
        category = null,
        upcoming = false,
        past = false,
        limit = 20,
        offset = 0
      } = filters;

      const where = {};

      if (status) where.status = status;
      if (eventType) where.event_type = eventType;
      if (visibility) where.visibility = visibility;
      if (userId) where.user_id = userId;
      if (category) where.category = category;

      // Filter for upcoming events
      if (upcoming) {
        where.scheduled_start_time = {
          [Op.gte]: new Date()
        };
        where.status = {
          [Op.in]: ['scheduled', 'live']
        };
      }

      // Filter for past events
      if (past) {
        where.status = {
          [Op.in]: ['ended', 'cancelled']
        };
      }

      const { count, rows } = await Event.findAndCountAll({
        where,
        limit: parseInt(limit),
        offset: parseInt(offset),
        order: [['scheduled_start_time', upcoming ? 'ASC' : 'DESC']]
      });

      return {
        events: rows.map(event => this.formatEvent(event)),
        pagination: {
          total: count,
          limit: parseInt(limit),
          offset: parseInt(offset)
        }
      };
    } catch (error) {
      logger.error('Failed to list events:', error);
      throw error;
    }
  }

  /**
   * Update event
   * @param {string} eventId - Event ID
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object>} Updated event
   */
  async updateEvent(eventId, updates) {
    try {
      const event = await Event.findByPk(eventId);
      if (!event) {
        throw new Error('Event not found');
      }

      const allowedUpdates = [
        'title',
        'description',
        'visibility',
        'scheduled_start_time',
        'scheduled_end_time',
        'category',
        'tags',
        'language',
        'allow_comments',
        'allow_reactions',
        'max_viewers',
        'thumbnail_url',
        'preview_video_url',
        'moderation_settings'
      ];

      const updateData = {};
      allowedUpdates.forEach(field => {
        if (updates[field] !== undefined) {
          const dbField = field.replace(/([A-Z])/g, '_$1').toLowerCase();
          updateData[dbField] = updates[field];
        }
      });

      await event.update(updateData);

      logger.info('Event updated', { eventId });

      return this.formatEvent(event);
    } catch (error) {
      logger.error('Failed to update event:', error);
      throw error;
    }
  }

  /**
   * Start an event
   * @param {string} eventId - Event ID
   * @returns {Promise<Object>} Updated event
   */
  async startEvent(eventId) {
    try {
      const event = await Event.findByPk(eventId);
      if (!event) {
        throw new Error('Event not found');
      }

      if (event.status !== 'scheduled') {
        throw new Error(`Cannot start event with status: ${event.status}`);
      }

      await event.update({
        status: 'live',
        actual_start_time: new Date()
      });

      logger.info('Event started', { eventId });

      return this.formatEvent(event);
    } catch (error) {
      logger.error('Failed to start event:', error);
      throw error;
    }
  }

  /**
   * End an event
   * @param {string} eventId - Event ID
   * @returns {Promise<Object>} Updated event
   */
  async endEvent(eventId) {
    try {
      const event = await Event.findByPk(eventId);
      if (!event) {
        throw new Error('Event not found');
      }

      if (event.status !== 'live') {
        throw new Error(`Cannot end event with status: ${event.status}`);
      }

      const endTime = new Date();
      const duration = event.actual_start_time
        ? Math.floor((endTime - event.actual_start_time) / 1000)
        : 0;

      await event.update({
        status: 'ended',
        actual_end_time: endTime,
        duration_seconds: duration
      });

      logger.info('Event ended', { eventId, duration });

      return this.formatEvent(event);
    } catch (error) {
      logger.error('Failed to end event:', error);
      throw error;
    }
  }

  /**
   * Cancel an event
   * @param {string} eventId - Event ID
   * @returns {Promise<Object>} Updated event
   */
  async cancelEvent(eventId) {
    try {
      const event = await Event.findByPk(eventId);
      if (!event) {
        throw new Error('Event not found');
      }

      await event.update({
        status: 'cancelled'
      });

      logger.info('Event cancelled', { eventId });

      return this.formatEvent(event);
    } catch (error) {
      logger.error('Failed to cancel event:', error);
      throw error;
    }
  }

  /**
   * Delete an event
   * @param {string} eventId - Event ID
   * @returns {Promise<boolean>} Success status
   */
  async deleteEvent(eventId) {
    try {
      const event = await Event.findByPk(eventId);
      if (!event) {
        throw new Error('Event not found');
      }

      await event.destroy();

      logger.info('Event deleted', { eventId });

      return true;
    } catch (error) {
      logger.error('Failed to delete event:', error);
      throw error;
    }
  }

  /**
   * Update viewer count
   * @param {string} eventId - Event ID
   * @param {number} count - Current viewer count
   * @returns {Promise<void>}
   */
  async updateViewerCount(eventId, count) {
    try {
      const event = await Event.findByPk(eventId);
      if (!event) {
        return;
      }

      const updateData = {
        current_viewer_count: count
      };

      // Update peak if current is higher
      if (count > event.peak_viewer_count) {
        updateData.peak_viewer_count = count;
      }

      await event.update(updateData);
    } catch (error) {
      logger.error('Failed to update viewer count:', error);
    }
  }

  /**
   * Increment total views
   * @param {string} eventId - Event ID
   * @returns {Promise<void>}
   */
  async incrementViews(eventId) {
    try {
      const event = await Event.findByPk(eventId);
      if (!event) {
        return;
      }

      await event.update({
        total_views: event.total_views + 1
      });
    } catch (error) {
      logger.error('Failed to increment views:', error);
    }
  }

  /**
   * Search events
   * @param {string} query - Search query
   * @param {Object} filters - Additional filters
   * @returns {Promise<Array>} Matching events
   */
  async searchEvents(query, filters = {}) {
    try {
      const where = {
        [Op.or]: [
          { title: { [Op.iLike]: `%${query}%` } },
          { description: { [Op.iLike]: `%${query}%` } },
          { tags: { [Op.contains]: [query] } }
        ]
      };

      if (filters.category) {
        where.category = filters.category;
      }

      if (filters.eventType) {
        where.event_type = filters.eventType;
      }

      if (filters.status) {
        where.status = filters.status;
      }

      const events = await Event.findAll({
        where,
        limit: filters.limit || 50,
        order: [['scheduled_start_time', 'DESC']]
      });

      return events.map(event => this.formatEvent(event));
    } catch (error) {
      logger.error('Failed to search events:', error);
      throw error;
    }
  }

  /**
   * Get upcoming events
   * @param {number} limit - Maximum number of events
   * @returns {Promise<Array>} Upcoming events
   */
  async getUpcomingEvents(limit = 10) {
    try {
      const events = await Event.findAll({
        where: {
          scheduled_start_time: {
            [Op.gte]: new Date()
          },
          status: 'scheduled'
        },
        order: [['scheduled_start_time', 'ASC']],
        limit
      });

      return events.map(event => this.formatEvent(event));
    } catch (error) {
      logger.error('Failed to get upcoming events:', error);
      throw error;
    }
  }

  /**
   * Format event for API response
   * @param {Object} event - Event model instance
   * @returns {Object} Formatted event
   */
  formatEvent(event) {
    const data = event.toJSON();

    // Add computed fields
    data.isLive = data.status === 'live';
    data.isUpcoming = data.status === 'scheduled' && new Date(data.scheduled_start_time) > new Date();
    data.hasEnded = data.status === 'ended';

    // Calculate time until start for upcoming events
    if (data.isUpcoming) {
      data.startsIn = Math.floor((new Date(data.scheduled_start_time) - new Date()) / 1000);
    }

    return data;
  }
}

module.exports = new EventService();
