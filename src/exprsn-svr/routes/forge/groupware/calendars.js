const express = require('express');
const router = express.Router();
const { requirePermission } = require('../../../middleware/auth');
const { validateBody, validateQuery, validateParams, schemas } = require('../../../middleware/validation');
const Joi = require('joi');
const calendarService = require('../../../services/forge/groupware/calendarService');
const logger = require('../../../utils/logger');

// Validation schemas
const calendarCreateSchema = Joi.object({
  name: Joi.string().max(255).required(),
  description: Joi.string().optional(),
  color: Joi.string().pattern(/^#[0-9A-Fa-f]{6}$/).optional(),
  timezone: Joi.string().max(100).optional(),
  isPublic: Joi.boolean().optional(),
  organizationId: Joi.string().uuid().optional(),
  metadata: Joi.object().optional()
});

const calendarUpdateSchema = calendarCreateSchema.fork(
  ['name'],
  (schema) => schema.optional()
);

const eventCreateSchema = Joi.object({
  title: Joi.string().max(500).required(),
  description: Joi.string().optional(),
  location: Joi.string().max(500).optional(),
  startTime: Joi.date().iso().required(),
  endTime: Joi.date().iso().required(),
  isAllDay: Joi.boolean().optional(),
  recurrence: Joi.object({
    frequency: Joi.string().valid('daily', 'weekly', 'monthly', 'yearly').required(),
    interval: Joi.number().integer().min(1).optional(),
    count: Joi.number().integer().min(1).optional(),
    until: Joi.date().iso().optional(),
    byDay: Joi.array().items(Joi.string()).optional()
  }).optional(),
  reminders: Joi.array().items(Joi.object({
    type: Joi.string().valid('email', 'notification', 'popup').required(),
    minutesBefore: Joi.number().integer().min(0).required()
  })).optional(),
  attendees: Joi.array().items(Joi.object({
    email: Joi.string().email().required(),
    name: Joi.string().optional(),
    status: Joi.string().valid('pending', 'accepted', 'declined', 'tentative').optional()
  })).optional(),
  status: Joi.string().valid('confirmed', 'tentative', 'cancelled').optional(),
  metadata: Joi.object().optional()
});

const eventUpdateSchema = eventCreateSchema.fork(
  ['title', 'startTime', 'endTime'],
  (schema) => schema.optional()
);

// List calendars
router.get('/',
  
  requirePermission('read'),
  validateQuery(schemas.pagination.keys({
    isPublic: Joi.boolean().optional()
  })),
  async (req, res) => {
    try {
      const { page, limit, isPublic } = req.query;
      const offset = (page - 1) * limit;

      const result = await calendarService.listCalendars({
        ownerId: req.user.id,
        isPublic,
        limit,
        offset
      });

      res.json({
        success: true,
        calendars: result.calendars,
        pagination: {
          total: result.total,
          page,
          limit,
          pages: Math.ceil(result.total / limit)
        }
      });
    } catch (error) {
      logger.error('Failed to list calendars', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to list calendars'
      });
    }
  }
);

// Get calendar by ID
router.get('/:id',
  
  requirePermission('read'),
  validateParams(schemas.id),
  validateQuery(Joi.object({
    includeEvents: Joi.boolean().optional()
  })),
  async (req, res) => {
    try {
      const calendar = await calendarService.getCalendarById(
        req.params.id,
        req.query.includeEvents === 'true'
      );

      // Check ownership or public access
      if (calendar.ownerId !== req.user.id && !calendar.isPublic) {
        return res.status(403).json({
          success: false,
          error: 'Access denied'
        });
      }

      res.json({
        success: true,
        calendar
      });
    } catch (error) {
      logger.error('Failed to get calendar', { error: error.message, calendarId: req.params.id });
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

// Get calendar events for a date range
router.get('/:id/events',
  
  requirePermission('read'),
  validateParams(schemas.id),
  validateQuery(Joi.object({
    startDate: Joi.date().iso().optional(),
    endDate: Joi.date().iso().optional(),
    status: Joi.string().valid('confirmed', 'tentative', 'cancelled').optional(),
    limit: Joi.number().integer().min(1).max(1000).optional().default(100),
    offset: Joi.number().integer().min(0).optional().default(0)
  })),
  async (req, res) => {
    try {
      const { startDate, endDate, status, limit, offset } = req.query;

      const result = await calendarService.listEvents({
        calendarId: req.params.id,
        startDate,
        endDate,
        status,
        limit,
        offset
      });

      res.json({
        success: true,
        events: result.events,
        pagination: {
          total: result.total,
          limit: result.limit,
          offset: result.offset,
          pages: Math.ceil(result.total / result.limit)
        }
      });
    } catch (error) {
      logger.error('Failed to get calendar events', { error: error.message, calendarId: req.params.id });
      res.status(500).json({
        success: false,
        error: 'Failed to get calendar events'
      });
    }
  }
);

// Export calendar to iCal
router.get('/:id/export',
  
  requirePermission('read'),
  validateParams(schemas.id),
  async (req, res) => {
    try {
      const calendar = await calendarService.getCalendarById(req.params.id);

      // Check ownership or public access
      if (calendar.ownerId !== req.user.id && !calendar.isPublic) {
        return res.status(403).json({
          success: false,
          error: 'Access denied'
        });
      }

      const ical = await calendarService.exportToICal(req.params.id);

      res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${calendar.name}.ics"`);
      res.send(ical);
    } catch (error) {
      logger.error('Failed to export calendar', { error: error.message, calendarId: req.params.id });
      res.status(500).json({
        success: false,
        error: 'Failed to export calendar'
      });
    }
  }
);

// Search events
router.get('/:id/search',
  
  requirePermission('read'),
  validateParams(schemas.id),
  validateQuery(Joi.object({
    query: Joi.string().min(2).required(),
    limit: Joi.number().integer().min(1).max(100).optional().default(50)
  })),
  async (req, res) => {
    try {
      const events = await calendarService.searchEvents({
        query: req.query.query,
        calendarId: req.params.id,
        limit: req.query.limit
      });

      res.json({
        success: true,
        events
      });
    } catch (error) {
      logger.error('Failed to search events', { error: error.message, calendarId: req.params.id });
      res.status(500).json({
        success: false,
        error: 'Failed to search events'
      });
    }
  }
);

// Create calendar
router.post('/',
  
  requirePermission('write'),
  validateBody(calendarCreateSchema),
  async (req, res) => {
    try {
      const calendar = await calendarService.createCalendar({
        ...req.body,
        ownerId: req.user.id
      });

      // Emit Socket.IO event
      const io = req.app.get('io');
      io.to(`user:${req.user.id}`).emit('calendar:created', { calendar });

      logger.info('Calendar created', {
        calendarId: calendar.id,
        userId: req.user.id
      });

      res.status(201).json({
        success: true,
        calendar
      });
    } catch (error) {
      logger.error('Failed to create calendar', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to create calendar'
      });
    }
  }
);

// Create event
router.post('/:id/events',
  
  requirePermission('write'),
  validateParams(schemas.id),
  validateBody(eventCreateSchema),
  async (req, res) => {
    try {
      // Verify calendar ownership
      const calendar = await calendarService.getCalendarById(req.params.id);
      if (calendar.ownerId !== req.user.id) {
        return res.status(403).json({
          success: false,
          error: 'Access denied'
        });
      }

      const event = await calendarService.createEvent({
        ...req.body,
        calendarId: req.params.id,
        createdBy: req.user.id
      });

      // Emit Socket.IO event
      const io = req.app.get('io');
      io.to(`user:${req.user.id}`).emit('event:created', { event, calendarId: req.params.id });

      logger.info('Calendar event created', {
        eventId: event.id,
        calendarId: req.params.id,
        userId: req.user.id
      });

      res.status(201).json({
        success: true,
        event
      });
    } catch (error) {
      logger.error('Failed to create event', { error: error.message });
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

// Update calendar
router.put('/:id',
  
  requirePermission('update'),
  validateParams(schemas.id),
  validateBody(calendarUpdateSchema),
  async (req, res) => {
    try {
      // Verify calendar ownership
      const calendar = await calendarService.getCalendarById(req.params.id);
      if (calendar.ownerId !== req.user.id) {
        return res.status(403).json({
          success: false,
          error: 'Access denied'
        });
      }

      const updatedCalendar = await calendarService.updateCalendar(req.params.id, req.body);

      // Emit Socket.IO event
      const io = req.app.get('io');
      io.to(`user:${req.user.id}`).emit('calendar:updated', { calendar: updatedCalendar });

      logger.info('Calendar updated', {
        calendarId: req.params.id,
        userId: req.user.id
      });

      res.json({
        success: true,
        calendar: updatedCalendar
      });
    } catch (error) {
      logger.error('Failed to update calendar', { error: error.message, calendarId: req.params.id });
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

// Update event
router.put('/:calendarId/events/:eventId',
  
  requirePermission('update'),
  validateParams(Joi.object({
    calendarId: Joi.string().uuid().required(),
    eventId: Joi.string().uuid().required()
  })),
  validateBody(eventUpdateSchema),
  async (req, res) => {
    try {
      // Verify calendar ownership
      const calendar = await calendarService.getCalendarById(req.params.calendarId);
      if (calendar.ownerId !== req.user.id) {
        return res.status(403).json({
          success: false,
          error: 'Access denied'
        });
      }

      const event = await calendarService.updateEvent(req.params.eventId, req.body);

      // Emit Socket.IO event
      const io = req.app.get('io');
      io.to(`user:${req.user.id}`).emit('event:updated', { event, calendarId: req.params.calendarId });

      logger.info('Calendar event updated', {
        eventId: req.params.eventId,
        calendarId: req.params.calendarId,
        userId: req.user.id
      });

      res.json({
        success: true,
        event
      });
    } catch (error) {
      logger.error('Failed to update event', { error: error.message, eventId: req.params.eventId });
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

// Delete calendar
router.delete('/:id',
  
  requirePermission('delete'),
  validateParams(schemas.id),
  async (req, res) => {
    try {
      // Verify calendar ownership
      const calendar = await calendarService.getCalendarById(req.params.id);
      if (calendar.ownerId !== req.user.id) {
        return res.status(403).json({
          success: false,
          error: 'Access denied'
        });
      }

      await calendarService.deleteCalendar(req.params.id);

      // Emit Socket.IO event
      const io = req.app.get('io');
      io.to(`user:${req.user.id}`).emit('calendar:deleted', { calendarId: req.params.id });

      logger.info('Calendar deleted', {
        calendarId: req.params.id,
        userId: req.user.id
      });

      res.json({
        success: true,
        message: 'Calendar deleted successfully'
      });
    } catch (error) {
      logger.error('Failed to delete calendar', { error: error.message, calendarId: req.params.id });
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

// Delete event
router.delete('/:calendarId/events/:eventId',
  
  requirePermission('delete'),
  validateParams(Joi.object({
    calendarId: Joi.string().uuid().required(),
    eventId: Joi.string().uuid().required()
  })),
  async (req, res) => {
    try {
      // Verify calendar ownership
      const calendar = await calendarService.getCalendarById(req.params.calendarId);
      if (calendar.ownerId !== req.user.id) {
        return res.status(403).json({
          success: false,
          error: 'Access denied'
        });
      }

      await calendarService.deleteEvent(req.params.eventId);

      // Emit Socket.IO event
      const io = req.app.get('io');
      io.to(`user:${req.user.id}`).emit('event:deleted', {
        eventId: req.params.eventId,
        calendarId: req.params.calendarId
      });

      logger.info('Calendar event deleted', {
        eventId: req.params.eventId,
        calendarId: req.params.calendarId,
        userId: req.user.id
      });

      res.json({
        success: true,
        message: 'Event deleted successfully'
      });
    } catch (error) {
      logger.error('Failed to delete event', { error: error.message, eventId: req.params.eventId });
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

module.exports = router;
