const eventService = require('../../../src/services/eventService');
const { Event, EventAttendee, Group, GroupMembership } = require('../../../src/models');

// Mock models
jest.mock('../../../src/models');

// Mock axios for notification service calls
jest.mock('axios', () => ({
  post: jest.fn().mockResolvedValue({ data: { success: true } }),
  get: jest.fn().mockResolvedValue({ data: {} })
}));

// Mock Redis
jest.mock('../../../src/config/redis', () => ({
  del: jest.fn().mockResolvedValue(1),
  get: jest.fn().mockResolvedValue(null),
  setex: jest.fn().mockResolvedValue('OK')
}));

describe('EventService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createEvent', () => {
    it('should create event with valid data', async () => {
      const mockGroup = {
        id: 'group-1',
        name: 'Tech Group'
      };

      const mockEvent = {
        id: 'event-1',
        title: 'Tech Meetup',
        description: 'Monthly meetup',
        groupId: 'group-1',
        organizerId: 'user-1',
        startTime: Date.now() + 86400000,
        endTime: Date.now() + 90000000,
        location: '123 Main St',
        maxAttendees: 50
      };

      Group.findByPk = jest.fn().mockResolvedValue(mockGroup);
      Event.create = jest.fn().mockResolvedValue(mockEvent);
      GroupMembership.findOne = jest.fn().mockResolvedValue({
        role: 'admin',
        status: 'active'
      });

      const result = await eventService.createEvent('user-1', {
        title: 'Tech Meetup',
        description: 'Monthly meetup',
        groupId: 'group-1',
        startTime: Date.now() + 86400000,
        endTime: Date.now() + 90000000,
        location: '123 Main St',
        maxAttendees: 50
      });

      expect(Event.create).toHaveBeenCalled();
      expect(result.title).toBe('Tech Meetup');
    });

    it('should throw error if user is not group member', async () => {
      Group.findByPk = jest.fn().mockResolvedValue({ id: 'group-1' });
      GroupMembership.findOne = jest.fn().mockResolvedValue(null);

      await expect(
        eventService.createEvent('user-1', {
          title: 'Event',
          groupId: 'group-1',
          startTime: Date.now() + 86400000,
          endTime: Date.now() + 90000000
        })
      ).rejects.toThrow();
    });

    it('should throw error if start time is in the past', async () => {
      Group.findByPk = jest.fn().mockResolvedValue({ id: 'group-1' });
      GroupMembership.findOne = jest.fn().mockResolvedValue({ role: 'admin' });

      await expect(
        eventService.createEvent('user-1', {
          title: 'Event',
          groupId: 'group-1',
          startTime: Date.now() - 86400000, // Yesterday
          endTime: Date.now() + 86400000
        })
      ).rejects.toThrow();
    });
  });

  describe('cancelEvent', () => {
    it('should cancel event and notify attendees', async () => {
      const mockEvent = {
        id: 'event-1',
        organizerId: 'user-1',
        status: 'scheduled',
        update: jest.fn().mockResolvedValue(true)
      };

      Event.findByPk = jest.fn().mockResolvedValue(mockEvent);
      const axios = require('axios');

      await eventService.cancelEvent('event-1', 'user-1', 'Weather concerns');

      expect(mockEvent.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'cancelled',
          cancellationReason: 'Weather concerns'
        })
      );
      // Verify notification was sent via axios (Herald service)
      expect(axios.post).toHaveBeenCalled();
    });

    it('should allow cancellation without reason', async () => {
      const mockEvent = {
        id: 'event-1',
        organizerId: 'user-1',
        status: 'scheduled',
        update: jest.fn().mockResolvedValue(true)
      };

      Event.findByPk = jest.fn().mockResolvedValue(mockEvent);
      const axios = require('axios');

      await eventService.cancelEvent('event-1', 'user-1');

      expect(mockEvent.update).toHaveBeenCalled();
      expect(axios.post).toHaveBeenCalled();
    });

    it('should throw error if user is not organizer', async () => {
      const mockEvent = {
        id: 'event-1',
        organizerId: 'user-1',
        status: 'scheduled'
      };

      Event.findByPk = jest.fn().mockResolvedValue(mockEvent);

      await expect(
        eventService.cancelEvent('event-1', 'user-2')
      ).rejects.toThrow();
    });

    it('should handle notification failures gracefully', async () => {
      const mockEvent = {
        id: 'event-1',
        organizerId: 'user-1',
        status: 'scheduled',
        update: jest.fn().mockResolvedValue(true)
      };

      Event.findByPk = jest.fn().mockResolvedValue(mockEvent);
      const axios = require('axios');
      axios.post.mockRejectedValueOnce(new Error('Notification service unavailable'));

      // Should not throw error even if notifications fail
      await eventService.cancelEvent('event-1', 'user-1', 'Test');

      expect(mockEvent.update).toHaveBeenCalled();
    });
  });

  describe('rsvpToEvent', () => {
    it('should create attendance record', async () => {
      const mockEvent = {
        id: 'event-1',
        maxAttendees: 50,
        attendeeCount: 10
      };

      const mockAttendee = {
        id: 'attendee-1',
        userId: 'user-1',
        eventId: 'event-1',
        status: 'going'
      };

      Event.findByPk = jest.fn().mockResolvedValue(mockEvent);
      EventAttendee.findOne = jest.fn().mockResolvedValue(null);
      EventAttendee.create = jest.fn().mockResolvedValue(mockAttendee);
      Event.increment = jest.fn().mockResolvedValue(true);

      const result = await eventService.rsvpToEvent('event-1', 'user-1', 'going');

      expect(EventAttendee.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          eventId: 'event-1',
          status: 'going'
        })
      );
      expect(Event.increment).toHaveBeenCalledWith('attendeeCount', {
        where: { id: 'event-1' }
      });
    });

    it('should update existing attendance', async () => {
      const mockEvent = {
        id: 'event-1',
        maxAttendees: 50,
        attendeeCount: 10
      };

      const mockAttendee = {
        id: 'attendee-1',
        userId: 'user-1',
        eventId: 'event-1',
        status: 'maybe',
        update: jest.fn().mockResolvedValue(true)
      };

      Event.findByPk = jest.fn().mockResolvedValue(mockEvent);
      EventAttendee.findOne = jest.fn().mockResolvedValue(mockAttendee);

      await eventService.rsvpToEvent('event-1', 'user-1', 'going');

      expect(mockAttendee.update).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'going' })
      );
    });

    it('should throw error if event is full', async () => {
      const mockEvent = {
        id: 'event-1',
        maxAttendees: 50,
        attendeeCount: 50
      };

      Event.findByPk = jest.fn().mockResolvedValue(mockEvent);
      EventAttendee.findOne = jest.fn().mockResolvedValue(null);

      await expect(
        eventService.rsvpToEvent('event-1', 'user-1', 'going')
      ).rejects.toThrow();
    });

    it('should invalidate cache after RSVP', async () => {
      const mockEvent = {
        id: 'event-1',
        maxAttendees: 50,
        attendeeCount: 10
      };

      Event.findByPk = jest.fn().mockResolvedValue(mockEvent);
      EventAttendee.findOne = jest.fn().mockResolvedValue(null);
      EventAttendee.create = jest.fn().mockResolvedValue({ id: 'attendee-1' });
      Event.increment = jest.fn().mockResolvedValue(true);

      const redis = require('../../../src/config/redis');

      await eventService.rsvpToEvent('event-1', 'user-1', 'going');

      expect(redis.del).toHaveBeenCalledWith('event:event-1');
      expect(redis.del).toHaveBeenCalledWith('event:event-1:attendees');
    });
  });
});
