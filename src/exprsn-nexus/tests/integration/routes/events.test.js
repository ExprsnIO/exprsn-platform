const request = require('supertest');
const express = require('express');
const eventsRouter = require('../../../src/routes/events');

// Mock middleware
jest.mock('../../../src/middleware/tokenAuth', () => ({
  requireToken: () => (req, res, next) => {
    req.user = { id: 'test-user-123' };
    req.token = { data: { userId: 'test-user-123' } };
    next();
  }
}));

jest.mock('../../../src/middleware/groupAuth', () => ({
  validateGroup: (req, res, next) => next(),
  requireGroupMember: (req, res, next) => next()
}));

// Mock services
jest.mock('../../../src/services/eventService');

const eventService = require('../../../src/services/eventService');

describe('Events Routes', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api/events', eventsRouter);

    // Error handler
    app.use((err, req, res, next) => {
      res.status(err.status || 500).json({
        success: false,
        error: err.message
      });
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/events', () => {
    it('should create event with valid input', async () => {
      const mockEvent = {
        id: 'event-123',
        title: 'Tech Meetup',
        description: 'Monthly tech meetup',
        groupId: 'group-123',
        startTime: Date.now() + 86400000,
        endTime: Date.now() + 90000000,
        location: '123 Main St'
      };

      eventService.createEvent = jest.fn().mockResolvedValue(mockEvent);

      const response = await request(app)
        .post('/api/events')
        .send({
          title: 'Tech Meetup',
          description: 'Monthly tech meetup',
          groupId: 'group-123',
          startTime: Date.now() + 86400000,
          endTime: Date.now() + 90000000,
          location: '123 Main St',
          maxAttendees: 50
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.event.title).toBe('Tech Meetup');
      expect(eventService.createEvent).toHaveBeenCalled();
    });

    it('should sanitize HTML in event description', async () => {
      const mockEvent = {
        id: 'event-123',
        title: 'Test Event',
        description: 'Safe content'
      };

      eventService.createEvent = jest.fn().mockResolvedValue(mockEvent);

      await request(app)
        .post('/api/events')
        .send({
          title: 'Test Event',
          description: '<script>alert("xss")</script>Safe content',
          groupId: 'group-123',
          startTime: Date.now() + 86400000,
          endTime: Date.now() + 90000000
        })
        .expect(201);

      const sanitizedData = eventService.createEvent.mock.calls[0][1];
      expect(sanitizedData.description).not.toContain('script');
      expect(sanitizedData.description).not.toContain('alert');
    });

    it('should reject event with invalid dates', async () => {
      const response = await request(app)
        .post('/api/events')
        .send({
          title: 'Test Event',
          groupId: 'group-123',
          startTime: Date.now() + 90000000,
          endTime: Date.now() + 86400000 // End before start
        })
        .expect(400);

      expect(response.body.error).toBe('VALIDATION_ERROR');
    });

    it('should reject missing required fields', async () => {
      const response = await request(app)
        .post('/api/events')
        .send({
          description: 'Missing title and dates'
        })
        .expect(400);

      expect(response.body.error).toBe('VALIDATION_ERROR');
    });
  });

  describe('PUT /api/events/:id', () => {
    it('should update event with valid input', async () => {
      const mockEvent = {
        id: 'event-123',
        title: 'Updated Event',
        description: 'Updated description'
      };

      eventService.updateEvent = jest.fn().mockResolvedValue(mockEvent);

      const response = await request(app)
        .put('/api/events/event-123')
        .send({
          description: 'Updated description',
          location: 'New Location'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.event.description).toBe('Updated description');
    });

    it('should sanitize HTML in updated description', async () => {
      const mockEvent = {
        id: 'event-123',
        description: 'Safe content'
      };

      eventService.updateEvent = jest.fn().mockResolvedValue(mockEvent);

      await request(app)
        .put('/api/events/event-123')
        .send({
          description: '<b>Bold text</b><script>alert("xss")</script>'
        })
        .expect(200);

      const sanitizedData = eventService.updateEvent.mock.calls[0][2];
      expect(sanitizedData.description).toContain('<b>Bold text</b>');
      expect(sanitizedData.description).not.toContain('script');
    });
  });

  describe('POST /api/events/:id/cancel', () => {
    it('should cancel event', async () => {
      eventService.cancelEvent = jest.fn().mockResolvedValue(true);

      const response = await request(app)
        .post('/api/events/event-123/cancel')
        .send({
          reason: 'Weather concerns'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(eventService.cancelEvent).toHaveBeenCalledWith(
        'event-123',
        'test-user-123',
        'Weather concerns'
      );
    });

    it('should allow cancellation without reason', async () => {
      eventService.cancelEvent = jest.fn().mockResolvedValue(true);

      await request(app)
        .post('/api/events/event-123/cancel')
        .send({})
        .expect(200);

      expect(eventService.cancelEvent).toHaveBeenCalledWith(
        'event-123',
        'test-user-123',
        undefined
      );
    });

    it('should sanitize cancellation reason', async () => {
      eventService.cancelEvent = jest.fn().mockResolvedValue(true);

      await request(app)
        .post('/api/events/event-123/cancel')
        .send({
          reason: '<script>alert("xss")</script>Bad weather'
        })
        .expect(200);

      const reason = eventService.cancelEvent.mock.calls[0][2];
      expect(reason).not.toContain('script');
      expect(reason).toContain('Bad weather');
    });
  });

  describe('POST /api/events/:id/rsvp', () => {
    it('should create RSVP with valid status', async () => {
      const mockAttendee = {
        id: 'attendee-123',
        userId: 'test-user-123',
        eventId: 'event-123',
        status: 'going'
      };

      eventService.rsvpToEvent = jest.fn().mockResolvedValue(mockAttendee);

      const response = await request(app)
        .post('/api/events/event-123/rsvp')
        .send({
          status: 'going'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.attendee.status).toBe('going');
    });

    it('should reject invalid RSVP status', async () => {
      const response = await request(app)
        .post('/api/events/event-123/rsvp')
        .send({
          status: 'invalid-status'
        })
        .expect(400);

      expect(response.body.error).toBe('VALIDATION_ERROR');
    });
  });

  describe('DELETE /api/events/:id', () => {
    it('should delete event', async () => {
      eventService.deleteEvent = jest.fn().mockResolvedValue(true);

      const response = await request(app)
        .delete('/api/events/event-123')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(eventService.deleteEvent).toHaveBeenCalledWith('event-123', 'test-user-123');
    });
  });

  describe('Input Sanitization', () => {
    it('should remove XSS attempts from event title', async () => {
      const mockEvent = {
        id: 'event-123',
        title: 'Test Event'
      };

      eventService.createEvent = jest.fn().mockResolvedValue(mockEvent);

      await request(app)
        .post('/api/events')
        .send({
          title: '<img src=x onerror="alert(1)">Test Event',
          groupId: 'group-123',
          startTime: Date.now() + 86400000,
          endTime: Date.now() + 90000000
        })
        .expect(201);

      const sanitizedData = eventService.createEvent.mock.calls[0][1];
      expect(sanitizedData.title).not.toContain('onerror');
      expect(sanitizedData.title).not.toContain('<img');
    });

    it('should allow safe HTML in event descriptions', async () => {
      const mockEvent = {
        id: 'event-123',
        description: '<b>Bold</b> text'
      };

      eventService.createEvent = jest.fn().mockResolvedValue(mockEvent);

      await request(app)
        .post('/api/events')
        .send({
          title: 'Test Event',
          description: '<b>Bold</b> text with <i>italic</i>',
          groupId: 'group-123',
          startTime: Date.now() + 86400000,
          endTime: Date.now() + 90000000
        })
        .expect(201);

      const sanitizedData = eventService.createEvent.mock.calls[0][1];
      expect(sanitizedData.description).toContain('<b>Bold</b>');
      expect(sanitizedData.description).toContain('<i>italic</i>');
    });
  });
});
