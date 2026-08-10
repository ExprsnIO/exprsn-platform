const Event = require('../models/Event');
const EventAttendee = require('../models/EventAttendee');
const GroupMembership = require('../models/GroupMembership');
const Group = require('../models/Group');
const redis = require('../config/redis');
const crypto = require('crypto');
const { Op } = require('sequelize');
const { sendEventUpdate } = require('./eventReminderService');

/**
 * ═══════════════════════════════════════════════════════════
 * Event Service
 * Business logic for group events and RSVPs
 * ═══════════════════════════════════════════════════════════
 */

class EventService {
  /**
   * Create a new event
   */
  async createEvent(groupId, creatorId, eventData) {
    // Validate group exists
    const group = await Group.findByPk(groupId);
    if (!group) {
      throw new Error('GROUP_NOT_FOUND');
    }

    // Verify creator is a member with event creation permission
    const membership = await GroupMembership.findOne({
      where: {
        userId: creatorId,
        groupId,
        status: 'active'
      }
    });

    if (!membership) {
      throw new Error('NOT_GROUP_MEMBER');
    }

    // Validate event data
    if (!eventData.title || eventData.title.length < 2) {
      throw new Error('INVALID_EVENT_TITLE');
    }

    if (!eventData.eventType || !['in-person', 'virtual', 'hybrid'].includes(eventData.eventType)) {
      throw new Error('INVALID_EVENT_TYPE');
    }

    if (!eventData.startTime || eventData.startTime < Date.now()) {
      throw new Error('INVALID_START_TIME');
    }

    if (eventData.endTime && eventData.endTime <= eventData.startTime) {
      throw new Error('INVALID_END_TIME');
    }

    // Create event
    const event = await Event.create({
      groupId,
      creatorId,
      title: eventData.title,
      description: eventData.description || '',
      eventType: eventData.eventType,
      location: eventData.location || null,
      virtualUrl: eventData.virtualUrl || null,
      startTime: eventData.startTime,
      endTime: eventData.endTime || null,
      timezone: eventData.timezone || 'UTC',
      maxAttendees: eventData.maxAttendees || null,
      rsvpDeadline: eventData.rsvpDeadline || null,
      requiresApproval: eventData.requiresApproval || false,
      visibility: eventData.visibility || 'members-only',
      coverImageUrl: eventData.coverImageUrl || null,
      tags: eventData.tags || [],
      metadata: eventData.metadata || {},
      status: eventData.status || 'published',
      createdAt: Date.now()
    });

    // Clear group events cache
    await redis.del(`group:${groupId}:events`);

    return event;
  }

  /**
   * Get event by ID
   */
  async getEvent(eventId, userId = null) {
    // Try cache first
    const cached = await redis.get(`event:${eventId}`);
    if (cached) {
      return JSON.parse(cached);
    }

    const event = await Event.findByPk(eventId);
    if (!event) {
      throw new Error('EVENT_NOT_FOUND');
    }

    // Check visibility permissions
    if (event.visibility === 'invite-only' && userId) {
      const attendee = await EventAttendee.findOne({
        where: { eventId, userId }
      });
      if (!attendee) {
        throw new Error('EVENT_NOT_ACCESSIBLE');
      }
    } else if (event.visibility === 'members-only' && userId) {
      const membership = await GroupMembership.findOne({
        where: {
          userId,
          groupId: event.groupId,
          status: 'active'
        }
      });
      if (!membership) {
        throw new Error('EVENT_NOT_ACCESSIBLE');
      }
    }

    // Cache for 5 minutes
    await redis.setex(`event:${eventId}`, 300, JSON.stringify(event));

    return event;
  }

  /**
   * Update event
   */
  async updateEvent(eventId, userId, updates) {
    const event = await Event.findByPk(eventId);
    if (!event) {
      throw new Error('EVENT_NOT_FOUND');
    }

    // Verify user is creator or group admin
    const membership = await GroupMembership.findOne({
      where: {
        userId,
        groupId: event.groupId,
        status: 'active'
      }
    });

    if (!membership) {
      throw new Error('NOT_GROUP_MEMBER');
    }

    const isCreator = event.creatorId === userId;
    const isAdmin = ['owner', 'admin'].includes(membership.role);

    if (!isCreator && !isAdmin) {
      throw new Error('INSUFFICIENT_PERMISSIONS');
    }

    // Update allowed fields
    const allowedFields = [
      'title', 'description', 'eventType', 'location', 'virtualUrl',
      'startTime', 'endTime', 'timezone', 'maxAttendees', 'rsvpDeadline',
      'requiresApproval', 'visibility', 'coverImageUrl', 'tags', 'metadata'
    ];

    const updateData = {};
    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        updateData[field] = updates[field];
      }
    }

    updateData.updatedAt = Date.now();

    await event.update(updateData);

    // Clear caches
    await redis.del(`event:${eventId}`);
    await redis.del(`group:${event.groupId}:events`);

    return event;
  }

  /**
   * Cancel event
   */
  async cancelEvent(eventId, userId, reason = null) {
    const event = await Event.findByPk(eventId);
    if (!event) {
      throw new Error('EVENT_NOT_FOUND');
    }

    // Verify permissions
    const membership = await GroupMembership.findOne({
      where: {
        userId,
        groupId: event.groupId,
        status: 'active'
      }
    });

    if (!membership) {
      throw new Error('NOT_GROUP_MEMBER');
    }

    const isCreator = event.creatorId === userId;
    const isAdmin = ['owner', 'admin'].includes(membership.role);

    if (!isCreator && !isAdmin) {
      throw new Error('INSUFFICIENT_PERMISSIONS');
    }

    await event.update({
      status: 'cancelled',
      cancelledReason: reason,
      cancelledAt: Date.now(),
      updatedAt: Date.now()
    });

    // Clear caches
    await redis.del(`event:${eventId}`);
    await redis.del(`group:${event.groupId}:events`);

    // Notify all attendees of cancellation (via exprsn-herald)
    try {
      const cancelMessage = reason
        ? `This event has been cancelled. Reason: ${reason}`
        : 'This event has been cancelled.';

      await sendEventUpdate(eventId, 'cancelled', cancelMessage);
    } catch (notificationError) {
      // Log error but don't fail the cancellation
      console.error('Failed to send cancellation notifications:', notificationError);
    }

    return event;
  }

  /**
   * Delete event (hard delete)
   */
  async deleteEvent(eventId, userId) {
    const event = await Event.findByPk(eventId);
    if (!event) {
      throw new Error('EVENT_NOT_FOUND');
    }

    // Only group admins or event creator can delete
    const membership = await GroupMembership.findOne({
      where: {
        userId,
        groupId: event.groupId,
        status: 'active'
      }
    });

    if (!membership) {
      throw new Error('NOT_GROUP_MEMBER');
    }

    const isCreator = event.creatorId === userId;
    const isAdmin = ['owner', 'admin'].includes(membership.role);

    if (!isCreator && !isAdmin) {
      throw new Error('INSUFFICIENT_PERMISSIONS');
    }

    const groupId = event.groupId;

    // Delete event (cascade will delete attendees)
    await event.destroy();

    // Clear caches
    await redis.del(`event:${eventId}`);
    await redis.del(`group:${groupId}:events`);

    return { success: true };
  }

  /**
   * List events for a group
   */
  async listEvents(groupId, filters = {}, userId = null) {
    const where = { groupId };

    // Status filter
    if (filters.status) {
      where.status = filters.status;
    } else {
      // Default: only show published and upcoming events
      where.status = 'published';
    }

    // Time filters
    if (filters.upcoming) {
      where.startTime = { [Op.gte]: Date.now() };
    }

    if (filters.past) {
      where.startTime = { [Op.lt]: Date.now() };
    }

    // Event type filter
    if (filters.eventType) {
      where.eventType = filters.eventType;
    }

    // Visibility filter based on user permissions
    if (!userId) {
      where.visibility = 'public';
    } else {
      // Check if user is a member
      const membership = await GroupMembership.findOne({
        where: { userId, groupId, status: 'active' }
      });

      if (!membership) {
        where.visibility = 'public';
      }
      // Members can see all events
    }

    const limit = Math.min(filters.limit || 50, 100);
    const offset = filters.offset || 0;

    const { count, rows: events } = await Event.findAndCountAll({
      where,
      limit,
      offset,
      order: [['startTime', 'ASC']]
    });

    return {
      events,
      total: count,
      limit,
      offset
    };
  }

  /**
   * RSVP to an event
   */
  async rsvpToEvent(eventId, userId, rsvpData) {
    const event = await Event.findByPk(eventId);
    if (!event) {
      throw new Error('EVENT_NOT_FOUND');
    }

    if (event.status !== 'published') {
      throw new Error('EVENT_NOT_AVAILABLE');
    }

    // Check RSVP deadline
    if (event.rsvpDeadline && Date.now() > event.rsvpDeadline) {
      throw new Error('RSVP_DEADLINE_PASSED');
    }

    // Check if user is allowed to RSVP
    if (event.visibility === 'members-only') {
      const membership = await GroupMembership.findOne({
        where: { userId, groupId: event.groupId, status: 'active' }
      });
      if (!membership) {
        throw new Error('NOT_GROUP_MEMBER');
      }
    }

    // Check if already RSVP'd
    let attendee = await EventAttendee.findOne({
      where: { eventId, userId }
    });

    const rsvpStatus = rsvpData.rsvpStatus || 'going';
    if (!['going', 'maybe', 'not-going'].includes(rsvpStatus)) {
      throw new Error('INVALID_RSVP_STATUS');
    }

    // Check capacity
    if (rsvpStatus === 'going' && event.maxAttendees) {
      const goingCount = await EventAttendee.count({
        where: {
          eventId,
          rsvpStatus: 'going'
        }
      });

      if (goingCount >= event.maxAttendees) {
        // Add to waitlist
        if (attendee) {
          await attendee.update({
            rsvpStatus: 'waitlist',
            guestCount: rsvpData.guestCount || 0,
            notes: rsvpData.notes || null,
            rsvpedAt: Date.now()
          });
        } else {
          attendee = await EventAttendee.create({
            eventId,
            userId,
            rsvpStatus: 'waitlist',
            guestCount: rsvpData.guestCount || 0,
            notes: rsvpData.notes || null,
            rsvpedAt: Date.now()
          });
        }

        return { attendee, waitlisted: true };
      }
    }

    // Create or update RSVP
    if (attendee) {
      // Update existing RSVP
      const oldStatus = attendee.rsvpStatus;

      await attendee.update({
        rsvpStatus,
        guestCount: rsvpData.guestCount || 0,
        notes: rsvpData.notes || null,
        rsvpedAt: Date.now()
      });

      // Update attendee count
      if (oldStatus === 'going' && rsvpStatus !== 'going') {
        await event.decrement('attendeeCount');
      } else if (oldStatus !== 'going' && rsvpStatus === 'going') {
        await event.increment('attendeeCount');
      }
    } else {
      // Create new RSVP
      attendee = await EventAttendee.create({
        eventId,
        userId,
        rsvpStatus,
        guestCount: rsvpData.guestCount || 0,
        notes: rsvpData.notes || null,
        rsvpedAt: Date.now()
      });

      // Update attendee count
      if (rsvpStatus === 'going') {
        await event.increment('attendeeCount');
      }
    }

    // Clear event cache
    await redis.del(`event:${eventId}`);
    await redis.del(`event:${eventId}:attendees`);

    return { attendee, waitlisted: false };
  }

  /**
   * Cancel RSVP
   */
  async cancelRsvp(eventId, userId) {
    const attendee = await EventAttendee.findOne({
      where: { eventId, userId }
    });

    if (!attendee) {
      throw new Error('NO_RSVP_FOUND');
    }

    const wasGoing = attendee.rsvpStatus === 'going';

    await attendee.destroy();

    // Update attendee count
    if (wasGoing) {
      const event = await Event.findByPk(eventId);
      if (event) {
        await event.decrement('attendeeCount');
      }
    }

    // Clear caches
    await redis.del(`event:${eventId}`);
    await redis.del(`event:${eventId}:attendees`);

    return { success: true };
  }

  /**
   * Check in attendee
   */
  async checkInAttendee(eventId, userId, adminId) {
    const event = await Event.findByPk(eventId);
    if (!event) {
      throw new Error('EVENT_NOT_FOUND');
    }

    // Verify admin permissions
    const adminMembership = await GroupMembership.findOne({
      where: {
        userId: adminId,
        groupId: event.groupId,
        status: 'active'
      }
    });

    if (!adminMembership || !['owner', 'admin', 'moderator'].includes(adminMembership.role)) {
      throw new Error('INSUFFICIENT_PERMISSIONS');
    }

    // Find attendee
    const attendee = await EventAttendee.findOne({
      where: { eventId, userId }
    });

    if (!attendee) {
      throw new Error('ATTENDEE_NOT_FOUND');
    }

    if (attendee.rsvpStatus !== 'going') {
      throw new Error('ATTENDEE_NOT_CONFIRMED');
    }

    // Check in
    await attendee.update({
      checkInStatus: 'checked-in',
      checkedInAt: Date.now(),
      checkedInBy: adminId
    });

    return attendee;
  }

  /**
   * List event attendees
   */
  async listAttendees(eventId, filters = {}) {
    const event = await Event.findByPk(eventId);
    if (!event) {
      throw new Error('EVENT_NOT_FOUND');
    }

    // Try cache
    const cacheKey = `event:${eventId}:attendees:${JSON.stringify(filters)}`;
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    const where = { eventId };

    if (filters.rsvpStatus) {
      where.rsvpStatus = filters.rsvpStatus;
    }

    if (filters.checkInStatus) {
      where.checkInStatus = filters.checkInStatus;
    }

    const limit = Math.min(filters.limit || 100, 500);
    const offset = filters.offset || 0;

    const { count, rows: attendees } = await EventAttendee.findAndCountAll({
      where,
      limit,
      offset,
      order: [['rsvpedAt', 'DESC']]
    });

    const result = {
      attendees,
      total: count,
      limit,
      offset,
      summary: {
        going: await EventAttendee.count({ where: { eventId, rsvpStatus: 'going' } }),
        maybe: await EventAttendee.count({ where: { eventId, rsvpStatus: 'maybe' } }),
        notGoing: await EventAttendee.count({ where: { eventId, rsvpStatus: 'not-going' } }),
        waitlist: await EventAttendee.count({ where: { eventId, rsvpStatus: 'waitlist' } }),
        checkedIn: await EventAttendee.count({ where: { eventId, checkInStatus: 'checked-in' } })
      }
    };

    // Cache for 2 minutes
    await redis.setex(cacheKey, 120, JSON.stringify(result));

    return result;
  }

  /**
   * Get user's RSVP for an event
   */
  async getUserRsvp(eventId, userId) {
    const attendee = await EventAttendee.findOne({
      where: { eventId, userId }
    });

    return attendee;
  }

  /**
   * Get upcoming events for a user (across all groups)
   */
  async getUserUpcomingEvents(userId, limit = 20) {
    // Get user's group memberships
    const memberships = await GroupMembership.findAll({
      where: { userId, status: 'active' },
      attributes: ['groupId']
    });

    const groupIds = memberships.map(m => m.groupId);

    if (groupIds.length === 0) {
      return [];
    }

    const events = await Event.findAll({
      where: {
        groupId: { [Op.in]: groupIds },
        status: 'published',
        startTime: { [Op.gte]: Date.now() }
      },
      limit,
      order: [['startTime', 'ASC']]
    });

    return events;
  }
}

module.exports = new EventService();
