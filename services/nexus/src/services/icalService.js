/**
 * iCal Export Service
 *
 * Generates iCal (.ics) files from events for calendar integration.
 * Supports:
 * - Single event export
 * - Multiple events export (calendar feed)
 * - Group calendar feed
 * - User calendar feed
 */

const ical = require('ical-generator').default;
const moment = require('moment-timezone');
const { Op } = require('sequelize');
const { Event, EventAttendee, Group } = require('../models');
const logger = require('../utils/logger');

// Event time columns are BIGINT epoch-ms and come back from pg as STRINGS —
// moment('175...') misparses and $-style operators were removed in Sequelize 5+,
// so coerce numbers here and use Op.gte in queries.
const tsMoment = (v) => moment(v == null ? undefined : Number(v));

/**
 * Generate iCal for a single event
 * @param {string} eventId - Event ID
 * @param {string|null} baseUrl - Base URL for event links
 * @returns {Promise<string>} iCal string
 */
async function generateEventICal(eventId, baseUrl = null) {
  try {
    const event = await Event.findByPk(eventId, {
      include: [
        { model: Group, as: 'group', attributes: ['id', 'name', 'slug'] },
        { model: EventAttendee, as: 'attendees', where: { rsvpStatus: 'going' }, required: false }
      ]
    });

    if (!event) {
      throw new Error('EVENT_NOT_FOUND');
    }

    const calendar = ical({ name: event.title });

    const eventUrl = baseUrl ? `${baseUrl}/events/${event.id}` : undefined;

    calendar.createEvent({
      id: event.id,
      start: tsMoment(event.startTime).tz(event.timezone || 'UTC'),
      end: event.endTime ? tsMoment(event.endTime).tz(event.timezone || 'UTC') : tsMoment(event.startTime).add(1, 'hour').tz(event.timezone || 'UTC'),
      summary: event.title,
      description: event.description || '',
      location: event.eventType === 'virtual'
        ? event.virtualUrl
        : event.location || '',
      url: eventUrl,
      organizer: {
        name: event.group.name,
        email: `group-${event.group.slug}@exprsn.io`
      },
      timezone: event.timezone,
      status: event.status === 'cancelled' ? 'CANCELLED' : 'CONFIRMED',
      created: tsMoment(event.createdAt),
      lastModified: tsMoment(event.updatedAt),
      categories: event.tags || []
    });

    return calendar.toString();
  } catch (error) {
    logger.error('Error generating event iCal:', error);
    throw error;
  }
}

/**
 * Generate iCal for all events in a group
 * @param {string} groupId - Group ID
 * @param {object} options - Filter options
 * @returns {Promise<string>} iCal string
 */
async function generateGroupCalendar(groupId, options = {}) {
  try {
    const { upcoming = true, limit = 100 } = options;

    const group = await Group.findByPk(groupId);
    if (!group) {
      throw new Error('GROUP_NOT_FOUND');
    }

    const whereClause = {
      groupId,
      status: ['published', 'cancelled']
    };

    if (upcoming) {
      whereClause.startTime = { [Op.gte]: Date.now() };
    }

    const events = await Event.findAll({
      where: whereClause,
      order: [['startTime', 'ASC']],
      limit,
      include: [
        { model: Group, as: 'group', attributes: ['id', 'name', 'slug'] }
      ]
    });

    const calendar = ical({
      name: `${group.name} Events`,
      description: group.description || `Events from ${group.name}`,
      timezone: 'UTC',
      prodId: {
        company: 'Exprsn',
        product: 'Nexus Groups',
        language: 'EN'
      }
    });

    events.forEach(event => {
      calendar.createEvent({
        id: event.id,
        start: tsMoment(event.startTime).tz(event.timezone || 'UTC'),
        end: event.endTime
          ? tsMoment(event.endTime).tz(event.timezone || 'UTC')
          : tsMoment(event.startTime).add(1, 'hour').tz(event.timezone || 'UTC'),
        summary: event.title,
        description: event.description || '',
        location: event.eventType === 'virtual'
          ? event.virtualUrl
          : event.location || '',
        organizer: {
          name: group.name,
          email: `group-${group.slug}@exprsn.io`
        },
        timezone: event.timezone,
        status: event.status === 'cancelled' ? 'CANCELLED' : 'CONFIRMED',
        created: tsMoment(event.createdAt),
        lastModified: tsMoment(event.updatedAt),
        categories: event.tags || []
      });
    });

    return calendar.toString();
  } catch (error) {
    logger.error('Error generating group calendar:', error);
    throw error;
  }
}

/**
 * Generate iCal for a user's events across all groups
 * @param {string} userId - User ID
 * @param {object} options - Filter options
 * @returns {Promise<string>} iCal string
 */
async function generateUserCalendar(userId, options = {}) {
  try {
    const { upcoming = true, limit = 100 } = options;

    // Get all events the user is attending
    const attendees = await EventAttendee.findAll({
      where: {
        userId,
        rsvpStatus: 'going'
      },
      include: [{
        model: Event,
        as: 'event',
        where: {
          status: ['published', 'cancelled'],
          ...(upcoming ? { startTime: { [Op.gte]: Date.now() } } : {})
        },
        include: [{
          model: Group,
          as: 'group',
          attributes: ['id', 'name', 'slug']
        }]
      }],
      order: [['event', 'startTime', 'ASC']],
      limit
    });

    const calendar = ical({
      name: 'My Events',
      description: 'Events I\'m attending',
      timezone: 'UTC',
      prodId: {
        company: 'Exprsn',
        product: 'Nexus Groups',
        language: 'EN'
      }
    });

    attendees.forEach(({ event }) => {
      if (!event) return;

      calendar.createEvent({
        id: event.id,
        start: tsMoment(event.startTime).tz(event.timezone || 'UTC'),
        end: event.endTime
          ? tsMoment(event.endTime).tz(event.timezone || 'UTC')
          : tsMoment(event.startTime).add(1, 'hour').tz(event.timezone || 'UTC'),
        summary: event.title,
        description: event.description || '',
        location: event.eventType === 'virtual'
          ? event.virtualUrl
          : event.location || '',
        organizer: event.group ? {
          name: event.group.name,
          email: `group-${event.group.slug}@exprsn.io`
        } : undefined,
        timezone: event.timezone,
        status: event.status === 'cancelled' ? 'CANCELLED' : 'CONFIRMED',
        created: tsMoment(event.createdAt),
        lastModified: tsMoment(event.updatedAt),
        categories: event.tags || []
      });
    });

    return calendar.toString();
  } catch (error) {
    logger.error('Error generating user calendar:', error);
    throw error;
  }
}

/**
 * Generate iCal for specific events
 * @param {string[]} eventIds - Array of event IDs
 * @param {string} calendarName - Name for the calendar
 * @returns {Promise<string>} iCal string
 */
async function generateMultiEventCalendar(eventIds, calendarName = 'Events') {
  try {
    const events = await Event.findAll({
      where: {
        id: eventIds,
        status: ['published', 'cancelled']
      },
      include: [{
        model: Group,
        as: 'group',
        attributes: ['id', 'name', 'slug']
      }],
      order: [['startTime', 'ASC']]
    });

    const calendar = ical({
      name: calendarName,
      timezone: 'UTC',
      prodId: {
        company: 'Exprsn',
        product: 'Nexus Groups',
        language: 'EN'
      }
    });

    events.forEach(event => {
      calendar.createEvent({
        id: event.id,
        start: tsMoment(event.startTime).tz(event.timezone || 'UTC'),
        end: event.endTime
          ? tsMoment(event.endTime).tz(event.timezone || 'UTC')
          : tsMoment(event.startTime).add(1, 'hour').tz(event.timezone || 'UTC'),
        summary: event.title,
        description: event.description || '',
        location: event.eventType === 'virtual'
          ? event.virtualUrl
          : event.location || '',
        organizer: event.group ? {
          name: event.group.name,
          email: `group-${event.group.slug}@exprsn.io`
        } : undefined,
        timezone: event.timezone,
        status: event.status === 'cancelled' ? 'CANCELLED' : 'CONFIRMED',
        created: tsMoment(event.createdAt),
        lastModified: tsMoment(event.updatedAt),
        categories: event.tags || []
      });
    });

    return calendar.toString();
  } catch (error) {
    logger.error('Error generating multi-event calendar:', error);
    throw error;
  }
}

module.exports = {
  generateEventICal,
  generateGroupCalendar,
  generateUserCalendar,
  generateMultiEventCalendar
};
