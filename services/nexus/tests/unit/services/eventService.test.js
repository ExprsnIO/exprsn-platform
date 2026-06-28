// Effective manual mocks — keep this suite fully DB-free.
// NOTE: eventService imports each model from its individual file
// (require('../models/Event')), NOT the ../models index — so we must mock the
// individual files. (The old `jest.mock('../../../src/models')` automock targeted
// the index and never took effect, so real queries leaked to Postgres.)
jest.mock('../../../src/models/Event', () => ({
  findByPk: jest.fn(),
  create: jest.fn(),
  findAll: jest.fn(),
  count: jest.fn()
}));
jest.mock('../../../src/models/EventAttendee', () => ({
  findOne: jest.fn(),
  create: jest.fn(),
  count: jest.fn()
}));
jest.mock('../../../src/models/Group', () => ({ findByPk: jest.fn() }));
jest.mock('../../../src/models/GroupMembership', () => ({ findOne: jest.fn() }));

// Mock the notifier/reminder module. eventService only depends on it to fire
// notifications; mocking it keeps this a true unit test (and avoids the Bull
// queue that module builds at require-time).
jest.mock('../../../src/services/eventReminderService', () => ({
  sendEventUpdate: jest.fn().mockResolvedValue(undefined),
  scheduleEventReminders: jest.fn().mockResolvedValue([]),
  cancelEventReminders: jest.fn().mockResolvedValue(undefined)
}));

// Mock Redis
jest.mock('../../../src/config/redis', () => ({
  del: jest.fn().mockResolvedValue(1),
  get: jest.fn().mockResolvedValue(null),
  setex: jest.fn().mockResolvedValue('OK')
}));

const eventService = require('../../../src/services/eventService');
const Event = require('../../../src/models/Event');
const EventAttendee = require('../../../src/models/EventAttendee');
const Group = require('../../../src/models/Group');
const GroupMembership = require('../../../src/models/GroupMembership');
const eventReminderService = require('../../../src/services/eventReminderService');
const redis = require('../../../src/config/redis');

const futureStart = () => Date.now() + 86400000;
const futureEnd = () => Date.now() + 90000000;

describe('EventService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createEvent', () => {
    it('should create event with valid data', async () => {
      Group.findByPk.mockResolvedValue({ id: 'group-1', name: 'Tech Group' });
      GroupMembership.findOne.mockResolvedValue({ role: 'admin', status: 'active' });
      Event.create.mockResolvedValue({ id: 'event-1', title: 'Tech Meetup' });

      const result = await eventService.createEvent('group-1', 'user-1', {
        title: 'Tech Meetup',
        description: 'Monthly meetup',
        eventType: 'in-person',
        startTime: futureStart(),
        endTime: futureEnd(),
        location: '123 Main St',
        maxAttendees: 50
      });

      expect(Event.create).toHaveBeenCalled();
      expect(result.title).toBe('Tech Meetup');
    });

    it('should throw error if user is not group member', async () => {
      Group.findByPk.mockResolvedValue({ id: 'group-1' });
      GroupMembership.findOne.mockResolvedValue(null);

      await expect(
        eventService.createEvent('group-1', 'user-1', {
          title: 'Event',
          eventType: 'in-person',
          startTime: futureStart(),
          endTime: futureEnd()
        })
      ).rejects.toThrow('NOT_GROUP_MEMBER');
    });

    it('should throw error if start time is in the past', async () => {
      Group.findByPk.mockResolvedValue({ id: 'group-1' });
      GroupMembership.findOne.mockResolvedValue({ role: 'admin', status: 'active' });

      await expect(
        eventService.createEvent('group-1', 'user-1', {
          title: 'Event',
          eventType: 'in-person',
          startTime: Date.now() - 86400000, // Yesterday
          endTime: futureEnd()
        })
      ).rejects.toThrow('INVALID_START_TIME');
    });
  });

  describe('cancelEvent', () => {
    it('should cancel event and notify attendees', async () => {
      const mockEvent = {
        id: 'event-1',
        creatorId: 'user-1',
        groupId: 'group-1',
        status: 'published',
        update: jest.fn().mockResolvedValue(true)
      };
      Event.findByPk.mockResolvedValue(mockEvent);
      GroupMembership.findOne.mockResolvedValue({ role: 'admin', status: 'active' });

      await eventService.cancelEvent('event-1', 'user-1', 'Weather concerns');

      expect(mockEvent.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'cancelled',
          cancelledReason: 'Weather concerns'
        })
      );
      // eventService delegates notification to the reminder/notifier module.
      expect(eventReminderService.sendEventUpdate).toHaveBeenCalledWith(
        'event-1',
        'cancelled',
        expect.any(String)
      );
    });

    it('should allow cancellation without reason', async () => {
      const mockEvent = {
        id: 'event-1',
        creatorId: 'user-1',
        groupId: 'group-1',
        status: 'published',
        update: jest.fn().mockResolvedValue(true)
      };
      Event.findByPk.mockResolvedValue(mockEvent);
      GroupMembership.findOne.mockResolvedValue({ role: 'admin', status: 'active' });

      await eventService.cancelEvent('event-1', 'user-1');

      expect(mockEvent.update).toHaveBeenCalled();
      expect(eventReminderService.sendEventUpdate).toHaveBeenCalled();
    });

    it('should throw error if user is not organizer', async () => {
      const mockEvent = {
        id: 'event-1',
        creatorId: 'user-1',
        groupId: 'group-1',
        status: 'published'
      };
      Event.findByPk.mockResolvedValue(mockEvent);
      // A plain member who is neither the creator nor an admin.
      GroupMembership.findOne.mockResolvedValue({ role: 'member', status: 'active' });

      await expect(
        eventService.cancelEvent('event-1', 'user-2')
      ).rejects.toThrow('INSUFFICIENT_PERMISSIONS');
    });

    it('should handle notification failures gracefully', async () => {
      const mockEvent = {
        id: 'event-1',
        creatorId: 'user-1',
        groupId: 'group-1',
        status: 'published',
        update: jest.fn().mockResolvedValue(true)
      };
      Event.findByPk.mockResolvedValue(mockEvent);
      GroupMembership.findOne.mockResolvedValue({ role: 'admin', status: 'active' });
      eventReminderService.sendEventUpdate.mockRejectedValueOnce(
        new Error('Notification service unavailable')
      );

      // Should not throw even if notifications fail.
      await expect(
        eventService.cancelEvent('event-1', 'user-1', 'Test')
      ).resolves.toBeDefined();

      expect(mockEvent.update).toHaveBeenCalled();
    });
  });

  describe('rsvpToEvent', () => {
    const publishedEvent = (overrides = {}) => ({
      id: 'event-1',
      groupId: 'group-1',
      status: 'published',
      visibility: 'public',
      maxAttendees: 50,
      increment: jest.fn().mockResolvedValue(true),
      decrement: jest.fn().mockResolvedValue(true),
      ...overrides
    });

    it('should create attendance record', async () => {
      const mockEvent = publishedEvent();
      Event.findByPk.mockResolvedValue(mockEvent);
      EventAttendee.findOne.mockResolvedValue(null);
      EventAttendee.count.mockResolvedValue(10); // under capacity
      EventAttendee.create.mockResolvedValue({ id: 'attendee-1' });

      await eventService.rsvpToEvent('event-1', 'user-1', { rsvpStatus: 'going' });

      expect(EventAttendee.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          eventId: 'event-1',
          rsvpStatus: 'going'
        })
      );
      expect(mockEvent.increment).toHaveBeenCalledWith('attendeeCount');
    });

    it('should update existing attendance', async () => {
      const mockEvent = publishedEvent();
      const mockAttendee = {
        id: 'attendee-1',
        rsvpStatus: 'maybe',
        update: jest.fn().mockResolvedValue(true)
      };
      Event.findByPk.mockResolvedValue(mockEvent);
      EventAttendee.findOne.mockResolvedValue(mockAttendee);
      EventAttendee.count.mockResolvedValue(10);

      await eventService.rsvpToEvent('event-1', 'user-1', { rsvpStatus: 'going' });

      expect(mockAttendee.update).toHaveBeenCalledWith(
        expect.objectContaining({ rsvpStatus: 'going' })
      );
      // maybe -> going bumps the attendee count.
      expect(mockEvent.increment).toHaveBeenCalledWith('attendeeCount');
    });

    it('should waitlist when the event is full', async () => {
      const mockEvent = publishedEvent({ maxAttendees: 50 });
      Event.findByPk.mockResolvedValue(mockEvent);
      EventAttendee.findOne.mockResolvedValue(null);
      EventAttendee.count.mockResolvedValue(50); // at capacity
      EventAttendee.create.mockResolvedValue({ id: 'attendee-1', rsvpStatus: 'waitlist' });

      const result = await eventService.rsvpToEvent('event-1', 'user-1', { rsvpStatus: 'going' });

      expect(result.waitlisted).toBe(true);
      expect(EventAttendee.create).toHaveBeenCalledWith(
        expect.objectContaining({ rsvpStatus: 'waitlist' })
      );
      // No attendee-count bump for waitlisted RSVPs.
      expect(mockEvent.increment).not.toHaveBeenCalled();
    });

    it('should invalidate cache after RSVP', async () => {
      const mockEvent = publishedEvent();
      Event.findByPk.mockResolvedValue(mockEvent);
      EventAttendee.findOne.mockResolvedValue(null);
      EventAttendee.count.mockResolvedValue(10);
      EventAttendee.create.mockResolvedValue({ id: 'attendee-1' });

      await eventService.rsvpToEvent('event-1', 'user-1', { rsvpStatus: 'going' });

      expect(redis.del).toHaveBeenCalledWith('event:event-1');
      expect(redis.del).toHaveBeenCalledWith('event:event-1:attendees');
    });
  });
});
