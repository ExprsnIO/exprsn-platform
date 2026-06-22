const axios = require('axios');
const Queue = require('bull');
const { Event, EventAttendee, Group } = require('../models');
const logger = require('../utils/logger');
const config = require('../config');
const { Op } = require('sequelize');

/**
 * ═══════════════════════════════════════════════════════════
 * Event Reminder Service
 * Manages scheduled reminders for events via Herald service
 * ═══════════════════════════════════════════════════════════
 */

// Herald service URL
const HERALD_URL = process.env.HERALD_URL || 'http://localhost:3014';

// Reminder timing presets (in milliseconds)
const REMINDER_PRESETS = {
  ONE_WEEK: 7 * 24 * 60 * 60 * 1000,
  THREE_DAYS: 3 * 24 * 60 * 60 * 1000,
  ONE_DAY: 24 * 60 * 60 * 1000,
  SIX_HOURS: 6 * 60 * 60 * 1000,
  ONE_HOUR: 60 * 60 * 1000,
  THIRTY_MINUTES: 30 * 60 * 1000
};

// Default reminder schedule
const DEFAULT_REMINDER_SCHEDULE = [
  REMINDER_PRESETS.ONE_DAY,
  REMINDER_PRESETS.ONE_HOUR
];

// Create Bull queue for reminder processing
const reminderQueue = new Queue('event-reminders', {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379
  }
});

/**
 * Schedule reminders for an event
 * @param {string} eventId - Event ID
 * @param {Array} reminderTimes - Array of reminder times (ms before event)
 * @returns {Promise<Array>} Scheduled reminder jobs
 */
async function scheduleEventReminders(eventId, reminderTimes = DEFAULT_REMINDER_SCHEDULE) {
  try {
    const event = await Event.findByPk(eventId, {
      include: [{
        model: Group,
        as: 'group',
        attributes: ['id', 'name']
      }]
    });

    if (!event) {
      throw new Error('EVENT_NOT_FOUND');
    }

    if (event.status === 'cancelled' || event.status === 'draft') {
      logger.info(`Skipping reminders for ${event.status} event ${eventId}`);
      return [];
    }

    const eventStartTime = event.startTime;
    const now = Date.now();
    const scheduledJobs = [];

    // Schedule each reminder
    for (const reminderTime of reminderTimes) {
      const reminderAt = eventStartTime - reminderTime;

      // Only schedule if reminder time is in the future
      if (reminderAt > now) {
        const delay = reminderAt - now;

        const job = await reminderQueue.add(
          {
            eventId,
            eventTitle: event.title,
            eventStartTime: event.startTime,
            groupId: event.groupId,
            groupName: event.group?.name,
            reminderType: getReminderTypeLabel(reminderTime),
            location: event.location,
            virtualUrl: event.virtualUrl
          },
          {
            delay,
            attempts: 3,
            backoff: {
              type: 'exponential',
              delay: 2000
            },
            removeOnComplete: true,
            removeOnFail: false
          }
        );

        scheduledJobs.push({
          jobId: job.id,
          eventId,
          reminderAt,
          reminderType: getReminderTypeLabel(reminderTime),
          status: 'scheduled'
        });

        logger.info(`Scheduled ${getReminderTypeLabel(reminderTime)} reminder for event ${eventId} at ${new Date(reminderAt).toISOString()}`);
      } else {
        logger.debug(`Skipping past reminder time ${getReminderTypeLabel(reminderTime)} for event ${eventId}`);
      }
    }

    return scheduledJobs;
  } catch (error) {
    logger.error('Error scheduling event reminders:', error);
    throw error;
  }
}

/**
 * Cancel all reminders for an event
 * @param {string} eventId - Event ID
 * @returns {Promise<number>} Number of cancelled jobs
 */
async function cancelEventReminders(eventId) {
  try {
    // Get all jobs for this event
    const jobs = await reminderQueue.getJobs(['waiting', 'delayed']);
    const eventJobs = jobs.filter(job => job.data.eventId === eventId);

    let cancelledCount = 0;
    for (const job of eventJobs) {
      await job.remove();
      cancelledCount++;
    }

    logger.info(`Cancelled ${cancelledCount} reminders for event ${eventId}`);
    return cancelledCount;
  } catch (error) {
    logger.error('Error cancelling event reminders:', error);
    throw error;
  }
}

/**
 * Update event reminders (cancel and reschedule)
 * @param {string} eventId - Event ID
 * @param {Array} reminderTimes - New reminder times
 * @returns {Promise<Array>} New scheduled jobs
 */
async function updateEventReminders(eventId, reminderTimes = DEFAULT_REMINDER_SCHEDULE) {
  try {
    // Cancel existing reminders
    await cancelEventReminders(eventId);

    // Schedule new reminders
    const jobs = await scheduleEventReminders(eventId, reminderTimes);

    logger.info(`Updated reminders for event ${eventId}`);
    return jobs;
  } catch (error) {
    logger.error('Error updating event reminders:', error);
    throw error;
  }
}

/**
 * Send event reminder notification via Herald
 * @param {object} reminderData - Reminder data from queue
 * @returns {Promise<object>} Herald response
 */
async function sendEventReminder(reminderData) {
  try {
    const { eventId, eventTitle, eventStartTime, groupId, groupName, reminderType, location, virtualUrl } = reminderData;

    // Get all attendees who RSVP'd yes
    const attendees = await EventAttendee.findAll({
      where: {
        eventId,
        status: 'yes'
      },
      attributes: ['userId']
    });

    if (attendees.length === 0) {
      logger.info(`No attendees to remind for event ${eventId}`);
      return { sent: 0 };
    }

    const userIds = attendees.map(a => a.userId);

    // Format event details
    const eventDate = new Date(eventStartTime);
    const formattedDate = eventDate.toLocaleString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short'
    });

    // Prepare notification payload
    const notificationPayload = {
      type: 'event-reminder',
      recipients: userIds,
      title: `${reminderType} Reminder: ${eventTitle}`,
      message: `Don't forget! ${eventTitle} starts ${reminderType.toLowerCase()}.`,
      data: {
        eventId,
        eventTitle,
        eventStartTime,
        formattedDate,
        groupId,
        groupName,
        location,
        virtualUrl,
        reminderType
      },
      channels: ['push', 'email'], // Send via push and email
      priority: 'high',
      metadata: {
        source: 'exprsn-nexus',
        category: 'event-reminder'
      }
    };

    // Send to Herald service
    const response = await axios.post(
      `${HERALD_URL}/api/notifications/bulk`,
      notificationPayload,
      {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 10000
      }
    );

    logger.info(`Sent ${reminderType} reminder for event ${eventId} to ${userIds.length} attendees`);

    return {
      sent: userIds.length,
      heraldResponse: response.data
    };
  } catch (error) {
    logger.error('Error sending event reminder:', error);
    throw error;
  }
}

/**
 * Send event update notification
 * @param {string} eventId - Event ID
 * @param {string} updateType - Type of update (changed, cancelled, rescheduled)
 * @param {string} message - Update message
 * @returns {Promise<object>} Herald response
 */
async function sendEventUpdate(eventId, updateType, message) {
  try {
    const event = await Event.findByPk(eventId, {
      include: [{
        model: Group,
        as: 'group',
        attributes: ['name']
      }]
    });

    if (!event) {
      throw new Error('EVENT_NOT_FOUND');
    }

    // Get all attendees (any RSVP status)
    const attendees = await EventAttendee.findAll({
      where: {
        eventId,
        status: { [Op.in]: ['yes', 'maybe'] }
      },
      attributes: ['userId']
    });

    if (attendees.length === 0) {
      logger.info(`No attendees to notify for event update ${eventId}`);
      return { sent: 0 };
    }

    const userIds = attendees.map(a => a.userId);

    // Prepare notification
    const notificationPayload = {
      type: `event-${updateType}`,
      recipients: userIds,
      title: `Event ${updateType}: ${event.title}`,
      message,
      data: {
        eventId,
        eventTitle: event.title,
        groupId: event.groupId,
        groupName: event.group?.name,
        updateType
      },
      channels: ['push', 'email'],
      priority: updateType === 'cancelled' ? 'high' : 'normal',
      metadata: {
        source: 'exprsn-nexus',
        category: 'event-update'
      }
    };

    // Send to Herald
    const response = await axios.post(
      `${HERALD_URL}/api/notifications/bulk`,
      notificationPayload,
      {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 10000
      }
    );

    logger.info(`Sent ${updateType} notification for event ${eventId} to ${userIds.length} attendees`);

    return {
      sent: userIds.length,
      heraldResponse: response.data
    };
  } catch (error) {
    logger.error('Error sending event update:', error);
    throw error;
  }
}

/**
 * Get reminder type label from time value
 * @param {number} reminderTime - Reminder time in ms
 * @returns {string} Label
 */
function getReminderTypeLabel(reminderTime) {
  switch (reminderTime) {
    case REMINDER_PRESETS.ONE_WEEK:
      return 'One Week';
    case REMINDER_PRESETS.THREE_DAYS:
      return 'Three Days';
    case REMINDER_PRESETS.ONE_DAY:
      return 'One Day';
    case REMINDER_PRESETS.SIX_HOURS:
      return 'Six Hours';
    case REMINDER_PRESETS.ONE_HOUR:
      return 'One Hour';
    case REMINDER_PRESETS.THIRTY_MINUTES:
      return '30 Minutes';
    default:
      return 'Custom';
  }
}

/**
 * Process reminder queue jobs
 */
reminderQueue.process(async (job) => {
  try {
    await sendEventReminder(job.data);
  } catch (error) {
    logger.error('Error processing reminder job:', error);
    throw error;
  }
});

// Queue event handlers
reminderQueue.on('completed', (job) => {
  logger.debug(`Reminder job ${job.id} completed`);
});

reminderQueue.on('failed', (job, err) => {
  logger.error(`Reminder job ${job.id} failed:`, err.message);
});

module.exports = {
  scheduleEventReminders,
  cancelEventReminders,
  updateEventReminders,
  sendEventReminder,
  sendEventUpdate,
  REMINDER_PRESETS,
  DEFAULT_REMINDER_SCHEDULE,
  reminderQueue
};
