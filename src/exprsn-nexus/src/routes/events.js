const express = require('express');
const router = express.Router();
const { requireToken, optionalToken } = require('../middleware/tokenAuth');
const { requireGroupMember, requireGroupRole } = require('../middleware/groupAuth');
const { sanitizeEventData } = require('../utils/sanitization');
const eventService = require('../services/eventService');
const eventReminderService = require('../services/eventReminderService');
const Joi = require('joi');

/**
 * ═══════════════════════════════════════════════════════════
 * Event Routes
 * Group events and RSVPs
 * ═══════════════════════════════════════════════════════════
 */

// Validation schemas
const createEventSchema = Joi.object({
  groupId: Joi.string().uuid().required(),
  title: Joi.string().min(2).max(255).required(),
  description: Joi.string().allow(''),
  eventType: Joi.string().valid('in-person', 'virtual', 'hybrid').required(),
  location: Joi.string().max(500).allow(null),
  virtualUrl: Joi.string().uri().max(500).allow(null),
  startTime: Joi.number().integer().min(Date.now()).required(),
  endTime: Joi.number().integer().min(Joi.ref('startTime')).allow(null),
  timezone: Joi.string().default('UTC'),
  maxAttendees: Joi.number().integer().min(1).allow(null),
  rsvpDeadline: Joi.number().integer().allow(null),
  requiresApproval: Joi.boolean().default(false),
  visibility: Joi.string().valid('public', 'members-only', 'invite-only').default('members-only'),
  coverImageUrl: Joi.string().uri().allow(null),
  tags: Joi.array().items(Joi.string()),
  metadata: Joi.object()
});

const updateEventSchema = Joi.object({
  title: Joi.string().min(2).max(255),
  description: Joi.string().allow(''),
  eventType: Joi.string().valid('in-person', 'virtual', 'hybrid'),
  location: Joi.string().max(500).allow(null),
  virtualUrl: Joi.string().uri().max(500).allow(null),
  startTime: Joi.number().integer(),
  endTime: Joi.number().integer(),
  timezone: Joi.string(),
  maxAttendees: Joi.number().integer().min(1).allow(null),
  rsvpDeadline: Joi.number().integer().allow(null),
  requiresApproval: Joi.boolean(),
  visibility: Joi.string().valid('public', 'members-only', 'invite-only'),
  coverImageUrl: Joi.string().uri().allow(null),
  tags: Joi.array().items(Joi.string()),
  metadata: Joi.object()
}).min(1);

const rsvpSchema = Joi.object({
  rsvpStatus: Joi.string().valid('going', 'maybe', 'not-going').default('going'),
  guestCount: Joi.number().integer().min(0).max(10).default(0),
  notes: Joi.string().max(500).allow(null, '')
});

/**
 * POST /api/events
 * Create a new event
 */
router.post('/',
  requireToken,
  async (req, res, next) => {
    try {
      const { error, value } = createEventSchema.validate(req.body);
      if (error) {
        return res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: error.details[0].message
        });
      }

      // Sanitize user input to prevent XSS
      const sanitizedData = sanitizeEventData(value);

      const userId = req.token.data.userId;
      const event = await eventService.createEvent(sanitizedData.groupId, userId, sanitizedData);

      res.status(201).json({
        success: true,
        event
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/events
 * List upcoming events (optionally filtered)
 */
router.get('/',
  optionalToken,
  async (req, res, next) => {
    try {
      const filters = {
        upcoming: req.query.upcoming === 'true',
        past: req.query.past === 'true',
        status: req.query.status,
        eventType: req.query.eventType,
        limit: parseInt(req.query.limit) || 50,
        offset: parseInt(req.query.offset) || 0
      };

      const userId = req.token?.data?.userId || null;

      // If groupId provided, list events for that group
      if (req.query.groupId) {
        const result = await eventService.listEvents(req.query.groupId, filters, userId);
        return res.json({
          success: true,
          ...result
        });
      }

      // Otherwise, list user's upcoming events
      if (userId) {
        const events = await eventService.getUserUpcomingEvents(userId, filters.limit);
        return res.json({
          success: true,
          events
        });
      }

      res.status(400).json({
        error: 'MISSING_PARAMETER',
        message: 'groupId required when not authenticated'
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/events/:id
 * Get event details
 */
router.get('/:id',
  optionalToken,
  async (req, res, next) => {
    try {
      const userId = req.token?.data?.userId || null;
      const event = await eventService.getEvent(req.params.id, userId);

      res.json({
        success: true,
        event
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * PUT /api/events/:id
 * Update event details
 */
router.put('/:id',
  requireToken,
  async (req, res, next) => {
    try {
      const { error, value } = updateEventSchema.validate(req.body);
      if (error) {
        return res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: error.details[0].message
        });
      }

      // Sanitize user input to prevent XSS
      const sanitizedData = sanitizeEventData(value);

      const userId = req.token.data.userId;
      const event = await eventService.updateEvent(req.params.id, userId, sanitizedData);

      res.json({
        success: true,
        event
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/events/:id/cancel
 * Cancel an event
 */
router.post('/:id/cancel',
  requireToken,
  async (req, res, next) => {
    try {
      const userId = req.token.data.userId;
      const { reason } = req.body;

      const event = await eventService.cancelEvent(req.params.id, userId, reason);

      res.json({
        success: true,
        event,
        message: 'Event cancelled successfully'
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * DELETE /api/events/:id
 * Delete an event
 */
router.delete('/:id',
  requireToken,
  async (req, res, next) => {
    try {
      const userId = req.token.data.userId;
      await eventService.deleteEvent(req.params.id, userId);

      res.json({
        success: true,
        message: 'Event deleted successfully'
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/events/:id/rsvp
 * RSVP to an event
 */
router.post('/:id/rsvp',
  requireToken,
  async (req, res, next) => {
    try {
      const { error, value } = rsvpSchema.validate(req.body);
      if (error) {
        return res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: error.details[0].message
        });
      }

      const userId = req.token.data.userId;
      const result = await eventService.rsvpToEvent(req.params.id, userId, value);

      res.json({
        success: true,
        ...result
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * DELETE /api/events/:id/rsvp
 * Cancel RSVP
 */
router.delete('/:id/rsvp',
  requireToken,
  async (req, res, next) => {
    try {
      const userId = req.token.data.userId;
      await eventService.cancelRsvp(req.params.id, userId);

      res.json({
        success: true,
        message: 'RSVP cancelled successfully'
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/events/:id/rsvp
 * Get user's RSVP status
 */
router.get('/:id/rsvp',
  requireToken,
  async (req, res, next) => {
    try {
      const userId = req.token.data.userId;
      const rsvp = await eventService.getUserRsvp(req.params.id, userId);

      res.json({
        success: true,
        rsvp
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/events/:id/attendees
 * List event attendees
 */
router.get('/:id/attendees',
  optionalToken,
  async (req, res, next) => {
    try {
      const filters = {
        rsvpStatus: req.query.rsvpStatus,
        checkInStatus: req.query.checkInStatus,
        limit: parseInt(req.query.limit) || 100,
        offset: parseInt(req.query.offset) || 0
      };

      const result = await eventService.listAttendees(req.params.id, filters);

      res.json({
        success: true,
        ...result
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/events/:id/check-in/:userId
 * Check in an attendee (admin only)
 */
router.post('/:id/check-in/:userId',
  requireToken,
  async (req, res, next) => {
    try {
      const adminId = req.token.data.userId;
      const attendee = await eventService.checkInAttendee(
        req.params.id,
        req.params.userId,
        adminId
      );

      res.json({
        success: true,
        attendee,
        message: 'Attendee checked in successfully'
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * ═══════════════════════════════════════════════════════════
 * Event Reminder Routes
 * ═══════════════════════════════════════════════════════════
 */

// Validation schema for reminders
const reminderSchema = Joi.object({
  reminderTimes: Joi.array().items(
    Joi.number().integer().valid(
      ...Object.values(eventReminderService.REMINDER_PRESETS)
    )
  ).min(1).max(6)
});

/**
 * POST /api/events/:id/reminders
 * Schedule reminders for an event
 */
router.post('/:id/reminders',
  requireToken,
  async (req, res, next) => {
    try {
      const { error, value } = reminderSchema.validate(req.body);
      if (error) {
        return res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: error.details[0].message
        });
      }

      const jobs = await eventReminderService.scheduleEventReminders(
        req.params.id,
        value.reminderTimes || eventReminderService.DEFAULT_REMINDER_SCHEDULE
      );

      res.status(201).json({
        success: true,
        scheduled: jobs.length,
        jobs,
        message: `Scheduled ${jobs.length} reminder(s)`
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * DELETE /api/events/:id/reminders
 * Cancel all reminders for an event
 */
router.delete('/:id/reminders',
  requireToken,
  async (req, res, next) => {
    try {
      const cancelled = await eventReminderService.cancelEventReminders(req.params.id);

      res.json({
        success: true,
        cancelled,
        message: `Cancelled ${cancelled} reminder(s)`
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * PUT /api/events/:id/reminders
 * Update event reminders
 */
router.put('/:id/reminders',
  requireToken,
  async (req, res, next) => {
    try {
      const { error, value } = reminderSchema.validate(req.body);
      if (error) {
        return res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: error.details[0].message
        });
      }

      const jobs = await eventReminderService.updateEventReminders(
        req.params.id,
        value.reminderTimes || eventReminderService.DEFAULT_REMINDER_SCHEDULE
      );

      res.json({
        success: true,
        scheduled: jobs.length,
        jobs,
        message: `Updated reminders, scheduled ${jobs.length} reminder(s)`
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/events/:id/notify
 * Send immediate notification to attendees (admin only)
 */
router.post('/:id/notify',
  requireToken,
  async (req, res, next) => {
    try {
      const { updateType, message } = req.body;

      if (!updateType || !message) {
        return res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: 'updateType and message required'
        });
      }

      const result = await eventReminderService.sendEventUpdate(
        req.params.id,
        updateType,
        message
      );

      res.json({
        success: true,
        sent: result.sent,
        message: `Notification sent to ${result.sent} attendee(s)`
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/events/reminders/presets
 * Get available reminder time presets
 */
router.get('/reminders/presets', (req, res) => {
  res.json({
    success: true,
    presets: eventReminderService.REMINDER_PRESETS,
    default: eventReminderService.DEFAULT_REMINDER_SCHEDULE
  });
});

module.exports = router;
