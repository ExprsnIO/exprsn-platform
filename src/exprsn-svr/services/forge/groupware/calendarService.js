const { Op } = require('sequelize');
const { Calendar, CalendarEvent } = require('../../../models/forge');
const logger = require('../../../utils/logger');
const moment = require('moment-timezone');

/**
 * Calendar Service
 *
 * Handles calendar and event management
 */

/**
 * Create a calendar
 */
async function createCalendar({
  name,
  description,
  color,
  timezone,
  isPublic,
  ownerId,
  metadata
}) {
  try {
    const calendar = await Calendar.create({
      name,
      description,
      color,
      timezone: timezone || 'UTC',
      isPublic: isPublic || false,
      ownerId,
      metadata: metadata || {}
    });

    logger.info('Calendar created', {
      calendarId: calendar.id,
      name,
      ownerId
    });

    return calendar;
  } catch (error) {
    logger.error('Failed to create calendar', {
      name,
      error: error.message
    });
    throw error;
  }
}

/**
 * Get calendar by ID
 */
async function getCalendarById(id, includeEvents = false) {
  const include = [];

  if (includeEvents) {
    include.push({
      model: CalendarEvent,
      as: 'events',
      limit: 100,
      order: [['startTime', 'ASC']]
    });
  }

  const calendar = await Calendar.findByPk(id, { include });

  if (!calendar) {
    throw new Error(`Calendar not found: ${id}`);
  }

  return calendar;
}

/**
 * List calendars for a user
 */
async function listCalendars({ ownerId, isPublic, limit = 50, offset = 0 }) {
  const where = {};

  if (ownerId) {
    where.ownerId = ownerId;
  }

  if (isPublic !== undefined) {
    where.isPublic = isPublic;
  }

  const { count, rows } = await Calendar.findAndCountAll({
    where,
    limit,
    offset,
    order: [['createdAt', 'DESC']]
  });

  return {
    calendars: rows,
    total: count,
    limit,
    offset
  };
}

/**
 * Update a calendar
 */
async function updateCalendar(id, updates) {
  try {
    const calendar = await getCalendarById(id);

    Object.assign(calendar, updates);
    await calendar.save();

    logger.info('Calendar updated', {
      calendarId: id,
      updates: Object.keys(updates)
    });

    return calendar;
  } catch (error) {
    logger.error('Failed to update calendar', {
      calendarId: id,
      error: error.message
    });
    throw error;
  }
}

/**
 * Delete a calendar
 */
async function deleteCalendar(id) {
  try {
    const calendar = await getCalendarById(id);

    // Delete all events first
    await CalendarEvent.destroy({
      where: { calendarId: id }
    });

    await calendar.destroy();

    logger.info('Calendar deleted', {
      calendarId: id
    });

    return { success: true };
  } catch (error) {
    logger.error('Failed to delete calendar', {
      calendarId: id,
      error: error.message
    });
    throw error;
  }
}

/**
 * Create an event
 */
async function createEvent({
  calendarId,
  title,
  description,
  location,
  startTime,
  endTime,
  isAllDay,
  recurrence,
  reminders,
  attendees,
  status,
  createdBy,
  metadata
}) {
  try {
    // Validate calendar exists
    await getCalendarById(calendarId);

    // Validate times
    const start = moment(startTime);
    const end = moment(endTime);

    if (!start.isValid() || !end.isValid()) {
      throw new Error('Invalid start or end time');
    }

    if (end.isBefore(start)) {
      throw new Error('End time must be after start time');
    }

    const event = await CalendarEvent.create({
      calendarId,
      title,
      description,
      location,
      startTime: start.toDate(),
      endTime: end.toDate(),
      isAllDay: isAllDay || false,
      recurrence: recurrence || null,
      reminders: reminders || [],
      attendees: attendees || [],
      status: status || 'confirmed',
      createdBy,
      metadata: metadata || {}
    });

    logger.info('Calendar event created', {
      eventId: event.id,
      calendarId,
      title,
      createdBy
    });

    return event;
  } catch (error) {
    logger.error('Failed to create event', {
      calendarId,
      title,
      error: error.message
    });
    throw error;
  }
}

/**
 * Get event by ID
 */
async function getEventById(id) {
  const event = await CalendarEvent.findByPk(id, {
    include: [{ model: Calendar, as: 'calendar' }]
  });

  if (!event) {
    throw new Error(`Event not found: ${id}`);
  }

  return event;
}

/**
 * List events for a calendar
 */
async function listEvents({
  calendarId,
  startDate,
  endDate,
  status,
  limit = 100,
  offset = 0
}) {
  const where = {};

  if (calendarId) {
    where.calendarId = calendarId;
  }

  if (status) {
    where.status = status;
  }

  // Date range filter
  if (startDate || endDate) {
    where.startTime = {};

    if (startDate) {
      where.startTime[Op.gte] = moment(startDate).toDate();
    }

    if (endDate) {
      where.startTime[Op.lte] = moment(endDate).toDate();
    }
  }

  const { count, rows } = await CalendarEvent.findAndCountAll({
    where,
    limit,
    offset,
    order: [['startTime', 'ASC']],
    include: [{ model: Calendar, as: 'calendar' }]
  });

  return {
    events: rows,
    total: count,
    limit,
    offset
  };
}

/**
 * Update an event
 */
async function updateEvent(id, updates) {
  try {
    const event = await getEventById(id);

    // Validate times if being updated
    if (updates.startTime || updates.endTime) {
      const start = moment(updates.startTime || event.startTime);
      const end = moment(updates.endTime || event.endTime);

      if (!start.isValid() || !end.isValid()) {
        throw new Error('Invalid start or end time');
      }

      if (end.isBefore(start)) {
        throw new Error('End time must be after start time');
      }

      if (updates.startTime) updates.startTime = start.toDate();
      if (updates.endTime) updates.endTime = end.toDate();
    }

    Object.assign(event, updates);
    await event.save();

    logger.info('Calendar event updated', {
      eventId: id,
      updates: Object.keys(updates)
    });

    return event;
  } catch (error) {
    logger.error('Failed to update event', {
      eventId: id,
      error: error.message
    });
    throw error;
  }
}

/**
 * Delete an event
 */
async function deleteEvent(id) {
  try {
    const event = await getEventById(id);
    await event.destroy();

    logger.info('Calendar event deleted', {
      eventId: id
    });

    return { success: true };
  } catch (error) {
    logger.error('Failed to delete event', {
      eventId: id,
      error: error.message
    });
    throw error;
  }
}

/**
 * Get events for a date range (for calendar view)
 */
async function getEventsForDateRange(calendarId, startDate, endDate, timezone = 'UTC') {
  try {
    const start = moment.tz(startDate, timezone).startOf('day');
    const end = moment.tz(endDate, timezone).endOf('day');

    if (!start.isValid() || !end.isValid()) {
      throw new Error('Invalid date range');
    }

    const events = await CalendarEvent.findAll({
      where: {
        calendarId,
        [Op.or]: [
          {
            // Events that start in the range
            startTime: {
              [Op.between]: [start.toDate(), end.toDate()]
            }
          },
          {
            // Events that end in the range
            endTime: {
              [Op.between]: [start.toDate(), end.toDate()]
            }
          },
          {
            // Events that span the entire range
            [Op.and]: [
              { startTime: { [Op.lte]: start.toDate() } },
              { endTime: { [Op.gte]: end.toDate() } }
            ]
          }
        ]
      },
      order: [['startTime', 'ASC']]
    });

    // Expand recurring events (simplified - handle RRULE properly in production)
    const expandedEvents = [];
    for (const event of events) {
      if (event.recurrence) {
        // TODO: Expand recurring events based on RRULE
        // For now, just include the master event
        expandedEvents.push(event);
      } else {
        expandedEvents.push(event);
      }
    }

    return expandedEvents;
  } catch (error) {
    logger.error('Failed to get events for date range', {
      calendarId,
      startDate,
      endDate,
      error: error.message
    });
    throw error;
  }
}

/**
 * Search events
 */
async function searchEvents({ query, calendarId, limit = 50 }) {
  const where = {
    [Op.or]: [
      { title: { [Op.iLike]: `%${query}%` } },
      { description: { [Op.iLike]: `%${query}%` } },
      { location: { [Op.iLike]: `%${query}%` } }
    ]
  };

  if (calendarId) {
    where.calendarId = calendarId;
  }

  const events = await CalendarEvent.findAll({
    where,
    limit,
    order: [['startTime', 'ASC']],
    include: [{ model: Calendar, as: 'calendar' }]
  });

  return events;
}

/**
 * Export calendar to iCal format
 */
async function exportToICal(calendarId) {
  try {
    const calendar = await getCalendarById(calendarId, true);

    let ical = 'BEGIN:VCALENDAR\r\n';
    ical += 'VERSION:2.0\r\n';
    ical += 'PRODID:-//Exprsn Forge//Calendar//EN\r\n';
    ical += `X-WR-CALNAME:${calendar.name}\r\n`;
    ical += `X-WR-TIMEZONE:${calendar.timezone}\r\n`;

    if (calendar.events) {
      for (const event of calendar.events) {
        ical += 'BEGIN:VEVENT\r\n';
        ical += `UID:${event.id}@exprsn-forge\r\n`;
        ical += `DTSTART:${formatICalDate(event.startTime)}\r\n`;
        ical += `DTEND:${formatICalDate(event.endTime)}\r\n`;
        ical += `SUMMARY:${escapeICalText(event.title)}\r\n`;

        if (event.description) {
          ical += `DESCRIPTION:${escapeICalText(event.description)}\r\n`;
        }

        if (event.location) {
          ical += `LOCATION:${escapeICalText(event.location)}\r\n`;
        }

        ical += `STATUS:${event.status.toUpperCase()}\r\n`;
        ical += 'END:VEVENT\r\n';
      }
    }

    ical += 'END:VCALENDAR\r\n';

    return ical;
  } catch (error) {
    logger.error('Failed to export calendar to iCal', {
      calendarId,
      error: error.message
    });
    throw error;
  }
}

/**
 * Format date for iCal
 */
function formatICalDate(date) {
  return moment(date).utc().format('YYYYMMDDTHHmmss') + 'Z';
}

/**
 * Escape text for iCal
 */
function escapeICalText(text) {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

/**
 * Share calendar with users
 */
async function shareCalendar(calendarId, userIds, permission = 'read') {
  try {
    const calendar = await getCalendarById(calendarId);

    // Get current shares
    const shares = calendar.metadata?.shares || {};

    // Add new shares
    userIds.forEach(userId => {
      shares[userId] = {
        permission, // 'read', 'write', or 'admin'
        sharedAt: new Date().toISOString()
      };
    });

    // Update calendar metadata
    calendar.metadata = {
      ...calendar.metadata,
      shares
    };

    await calendar.save();

    logger.info('Calendar shared', {
      calendarId,
      sharedWith: userIds,
      permission
    });

    return {
      calendarId,
      shares: userIds.map(userId => ({
        userId,
        permission,
        sharedAt: shares[userId].sharedAt
      }))
    };
  } catch (error) {
    logger.error('Failed to share calendar', {
      calendarId,
      error: error.message
    });
    throw error;
  }
}

/**
 * Unshare calendar with users
 */
async function unshareCalendar(calendarId, userIds) {
  try {
    const calendar = await getCalendarById(calendarId);

    // Get current shares
    const shares = calendar.metadata?.shares || {};

    // Remove shares
    userIds.forEach(userId => {
      delete shares[userId];
    });

    // Update calendar metadata
    calendar.metadata = {
      ...calendar.metadata,
      shares
    };

    await calendar.save();

    logger.info('Calendar unshared', {
      calendarId,
      unsharedWith: userIds
    });

    return { success: true };
  } catch (error) {
    logger.error('Failed to unshare calendar', {
      calendarId,
      error: error.message
    });
    throw error;
  }
}

/**
 * Get calendar shares
 */
async function getCalendarShares(calendarId) {
  try {
    const calendar = await getCalendarById(calendarId);
    const shares = calendar.metadata?.shares || {};

    return Object.entries(shares).map(([userId, data]) => ({
      userId,
      permission: data.permission,
      sharedAt: data.sharedAt
    }));
  } catch (error) {
    logger.error('Failed to get calendar shares', {
      calendarId,
      error: error.message
    });
    throw error;
  }
}

/**
 * Update share permission
 */
async function updateSharePermission(calendarId, userId, permission) {
  try {
    const calendar = await getCalendarById(calendarId);

    // Get current shares
    const shares = calendar.metadata?.shares || {};

    if (!shares[userId]) {
      throw new Error('User does not have access to this calendar');
    }

    // Update permission
    shares[userId].permission = permission;
    shares[userId].updatedAt = new Date().toISOString();

    // Update calendar metadata
    calendar.metadata = {
      ...calendar.metadata,
      shares
    };

    await calendar.save();

    logger.info('Calendar share permission updated', {
      calendarId,
      userId,
      permission
    });

    return {
      userId,
      permission,
      updatedAt: shares[userId].updatedAt
    };
  } catch (error) {
    logger.error('Failed to update share permission', {
      calendarId,
      userId,
      error: error.message
    });
    throw error;
  }
}

/**
 * Check if user has access to calendar
 */
async function checkCalendarAccess(calendarId, userId, requiredPermission = 'read') {
  try {
    const calendar = await Calendar.findByPk(calendarId);

    if (!calendar) {
      return false;
    }

    // Owner has full access
    if (calendar.ownerId === userId) {
      return true;
    }

    // Check if calendar is public (read-only access)
    if (calendar.isPublic && requiredPermission === 'read') {
      return true;
    }

    // Check shares
    const shares = calendar.metadata?.shares || {};
    const userShare = shares[userId];

    if (!userShare) {
      return false;
    }

    // Check permission level
    const permissionLevels = {
      'read': 1,
      'write': 2,
      'admin': 3
    };

    const userLevel = permissionLevels[userShare.permission] || 0;
    const requiredLevel = permissionLevels[requiredPermission] || 0;

    return userLevel >= requiredLevel;
  } catch (error) {
    logger.error('Failed to check calendar access', {
      calendarId,
      userId,
      error: error.message
    });
    return false;
  }
}

/**
 * Get shared calendars for a user
 */
async function getSharedCalendars(userId, limit = 50) {
  try {
    // Find all calendars where user is in shares
    const calendars = await Calendar.findAll({
      where: {
        metadata: {
          shares: {
            [userId]: {
              [Op.ne]: null
            }
          }
        }
      },
      limit,
      order: [['updatedAt', 'DESC']]
    });

    return calendars.map(calendar => ({
      ...calendar.toJSON(),
      permission: calendar.metadata?.shares?.[userId]?.permission || 'read'
    }));
  } catch (error) {
    logger.error('Failed to get shared calendars', {
      userId,
      error: error.message
    });
    throw error;
  }
}

/**
 * Check for scheduling conflicts
 */
async function checkConflicts({
  startTime,
  endTime,
  attendees = [],
  resources = [],
  excludeEventId = null
}) {
  try {
    const conflicts = {
      attendeeConflicts: [],
      resourceConflicts: [],
      hasConflicts: false
    };

    // Check attendee conflicts
    if (attendees.length > 0) {
      const attendeeIds = attendees.filter(a => a.userId).map(a => a.userId);

      for (const userId of attendeeIds) {
        const userEvents = await CalendarEvent.findAll({
          where: {
            [Op.and]: [
              excludeEventId ? { id: { [Op.ne]: excludeEventId } } : {},
              {
                [Op.or]: [
                  {
                    startTime: {
                      [Op.between]: [startTime, endTime]
                    }
                  },
                  {
                    endTime: {
                      [Op.between]: [startTime, endTime]
                    }
                  },
                  {
                    [Op.and]: [
                      { startTime: { [Op.lte]: startTime } },
                      { endTime: { [Op.gte]: endTime } }
                    ]
                  }
                ]
              },
              literal(`attendees::jsonb @> '[{"userId": "${userId}"}]'`)
            ]
          }
        });

        if (userEvents.length > 0) {
          conflicts.attendeeConflicts.push({
            userId,
            events: userEvents.map(e => ({
              id: e.id,
              title: e.title,
              startTime: e.startTime,
              endTime: e.endTime
            }))
          });
        }
      }
    }

    // Check resource conflicts (meeting rooms, equipment, etc.)
    if (resources.length > 0) {
      const resourceIds = resources.map(r => r.resourceId);

      for (const resourceId of resourceIds) {
        const resourceEvents = await CalendarEvent.findAll({
          where: {
            [Op.and]: [
              excludeEventId ? { id: { [Op.ne]: excludeEventId } } : {},
              {
                [Op.or]: [
                  {
                    startTime: {
                      [Op.between]: [startTime, endTime]
                    }
                  },
                  {
                    endTime: {
                      [Op.between]: [startTime, endTime]
                    }
                  },
                  {
                    [Op.and]: [
                      { startTime: { [Op.lte]: startTime } },
                      { endTime: { [Op.gte]: endTime } }
                    ]
                  }
                ]
              },
              literal(`resources::jsonb @> '[{"resourceId": "${resourceId}"}]'`)
            ]
          }
        });

        if (resourceEvents.length > 0) {
          conflicts.resourceConflicts.push({
            resourceId,
            resourceName: resources.find(r => r.resourceId === resourceId)?.name,
            events: resourceEvents.map(e => ({
              id: e.id,
              title: e.title,
              startTime: e.startTime,
              endTime: e.endTime
            }))
          });
        }
      }
    }

    conflicts.hasConflicts = conflicts.attendeeConflicts.length > 0 || conflicts.resourceConflicts.length > 0;

    logger.info('Conflict check completed', {
      hasConflicts: conflicts.hasConflicts,
      attendeeConflicts: conflicts.attendeeConflicts.length,
      resourceConflicts: conflicts.resourceConflicts.length
    });

    return conflicts;
  } catch (error) {
    logger.error('Failed to check conflicts', {
      error: error.message
    });
    throw error;
  }
}

/**
 * Find available time slots
 */
async function findAvailableSlots({
  attendees = [],
  resources = [],
  startDate,
  endDate,
  duration, // in minutes
  workingHours = { start: 9, end: 17 }, // 9 AM to 5 PM
  workingDays = [1, 2, 3, 4, 5] // Monday to Friday
}) {
  try {
    const availableSlots = [];
    const slotDuration = duration * 60 * 1000; // Convert to milliseconds

    let currentDate = moment(startDate);
    const finalDate = moment(endDate);

    while (currentDate.isBefore(finalDate)) {
      const dayOfWeek = currentDate.day();

      // Skip non-working days
      if (!workingDays.includes(dayOfWeek)) {
        currentDate.add(1, 'day').startOf('day');
        continue;
      }

      // Check each hour within working hours
      for (let hour = workingHours.start; hour < workingHours.end; hour++) {
        const slotStart = currentDate.clone().hour(hour).minute(0).second(0).toDate();
        const slotEnd = new Date(slotStart.getTime() + slotDuration);

        // Check if slot is within working hours
        if (moment(slotEnd).hour() > workingHours.end) {
          continue;
        }

        // Check for conflicts
        const conflicts = await checkConflicts({
          startTime: slotStart,
          endTime: slotEnd,
          attendees,
          resources
        });

        if (!conflicts.hasConflicts) {
          availableSlots.push({
            startTime: slotStart,
            endTime: slotEnd,
            duration
          });
        }
      }

      currentDate.add(1, 'day').startOf('day');
    }

    logger.info('Available slots found', {
      count: availableSlots.length,
      duration
    });

    return availableSlots;
  } catch (error) {
    logger.error('Failed to find available slots', {
      error: error.message
    });
    throw error;
  }
}

/**
 * Get calendar overlay (merge multiple calendars)
 */
async function getCalendarOverlay({
  calendarIds,
  userId,
  startDate,
  endDate
}) {
  try {
    const allEvents = [];

    for (const calendarId of calendarIds) {
      // Check access
      const hasAccess = await checkCalendarAccess(calendarId, userId, 'read');
      if (!hasAccess) {
        logger.warn('User does not have access to calendar', {
          calendarId,
          userId
        });
        continue;
      }

      const events = await getEventsForDateRange(calendarId, startDate, endDate);
      allEvents.push(...events.map(e => ({
        ...e.toJSON(),
        calendarId
      })));
    }

    // Sort by start time
    allEvents.sort((a, b) => new Date(a.startTime) - new Date(b.startTime));

    logger.info('Calendar overlay generated', {
      calendarsCount: calendarIds.length,
      eventsCount: allEvents.length,
      userId
    });

    return allEvents;
  } catch (error) {
    logger.error('Failed to get calendar overlay', {
      error: error.message
    });
    throw error;
  }
}

/**
 * Update recurring event instance
 */
async function updateRecurringInstance(recurringEventId, instanceDate, updates) {
  try {
    const recurringEvent = await CalendarEvent.findByPk(recurringEventId);
    if (!recurringEvent || !recurringEvent.isRecurring) {
      throw new Error('Event is not a recurring event');
    }

    // Add exception to recurrence
    const exceptions = recurringEvent.recurrenceExceptions || [];
    if (!exceptions.some(d => moment(d).isSame(instanceDate, 'day'))) {
      exceptions.push(instanceDate);
    }

    await recurringEvent.update({
      recurrenceExceptions: exceptions
    });

    // Create a new event for the modified instance
    const instance = await CalendarEvent.create({
      ...recurringEvent.toJSON(),
      id: undefined,
      recurringEventId,
      isRecurring: false,
      recurrenceRule: null,
      recurrenceExceptions: null,
      startTime: instanceDate,
      endTime: new Date(instanceDate.getTime() + (recurringEvent.endTime - recurringEvent.startTime)),
      ...updates
    });

    logger.info('Recurring event instance updated', {
      recurringEventId,
      instanceDate,
      instanceId: instance.id
    });

    return instance;
  } catch (error) {
    logger.error('Failed to update recurring instance', {
      recurringEventId,
      instanceDate,
      error: error.message
    });
    throw error;
  }
}

module.exports = {
  createCalendar,
  getCalendarById,
  listCalendars,
  updateCalendar,
  deleteCalendar,
  createEvent,
  getEventById,
  listEvents,
  updateEvent,
  deleteEvent,
  getEventsForDateRange,
  searchEvents,
  exportToICal,
  // Calendar sharing
  shareCalendar,
  unshareCalendar,
  getCalendarShares,
  updateSharePermission,
  checkCalendarAccess,
  getSharedCalendars,
  // Advanced features
  checkConflicts,
  findAvailableSlots,
  getCalendarOverlay,
  updateRecurringInstance
};
