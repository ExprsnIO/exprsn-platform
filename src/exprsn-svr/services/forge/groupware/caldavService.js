const moment = require('moment');
const { Calendar, CalendarEvent } = require('../../../models/forge');
const calendarService = require('./calendarService');
const logger = require('../../../utils/logger');

/**
 * CalDAV Service
 *
 * Implements CalDAV protocol for external calendar client synchronization
 * Compatible with Apple Calendar, Google Calendar, Thunderbird, etc.
 */

/**
 * Generate CalDAV XML response for PROPFIND
 */
function generatePropfindResponse(calendars, baseUrl, depth = '1') {
  const responses = [];

  if (depth === '0') {
    // Return only the collection itself
    responses.push(generateCalendarCollectionResponse(baseUrl));
  } else {
    // Return collection + calendars
    responses.push(generateCalendarCollectionResponse(baseUrl));

    calendars.forEach(calendar => {
      responses.push(generateCalendarResponse(calendar, baseUrl));
    });
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:cs="http://calendarserver.org/ns/">
  ${responses.join('\n')}
</d:multistatus>`;
}

/**
 * Generate calendar collection response
 */
function generateCalendarCollectionResponse(baseUrl) {
  return `<d:response>
    <d:href>${baseUrl}/</d:href>
    <d:propstat>
      <d:prop>
        <d:resourcetype>
          <d:collection/>
          <c:calendar/>
        </d:resourcetype>
        <d:displayname>Exprsn Calendars</d:displayname>
        <c:supported-calendar-component-set>
          <c:comp name="VEVENT"/>
          <c:comp name="VTODO"/>
        </c:supported-calendar-component-set>
        <d:current-user-privilege-set>
          <d:privilege><d:read/></d:privilege>
          <d:privilege><d:write/></d:privilege>
        </d:current-user-privilege-set>
      </d:prop>
      <d:status>HTTP/1.1 200 OK</d:status>
    </d:propstat>
  </d:response>`;
}

/**
 * Generate individual calendar response
 */
function generateCalendarResponse(calendar, baseUrl) {
  const href = `${baseUrl}/${calendar.id}/`;
  const ctag = generateCTag(calendar);

  return `<d:response>
    <d:href>${href}</d:href>
    <d:propstat>
      <d:prop>
        <d:resourcetype>
          <d:collection/>
          <c:calendar/>
        </d:resourcetype>
        <d:displayname>${escapeXml(calendar.name)}</d:displayname>
        <c:calendar-description>${escapeXml(calendar.description || '')}</c:calendar-description>
        <c:calendar-timezone>${escapeXml(calendar.timezone || 'UTC')}</c:calendar-timezone>
        <c:supported-calendar-component-set>
          <c:comp name="VEVENT"/>
        </c:supported-calendar-component-set>
        <d:current-user-privilege-set>
          <d:privilege><d:read/></d:privilege>
          <d:privilege><d:write/></d:privilege>
        </d:current-user-privilege-set>
        <cs:getctag>${ctag}</cs:getctag>
        <d:getetag>"${generateETag(calendar)}"</d:getetag>
      </d:prop>
      <d:status>HTTP/1.1 200 OK</d:status>
    </d:propstat>
  </d:response>`;
}

/**
 * Generate event response for REPORT
 */
function generateEventResponse(event, calendar, baseUrl) {
  const href = `${baseUrl}/${calendar.id}/${event.id}.ics`;
  const etag = generateEventETag(event);

  return `<d:response>
    <d:href>${href}</d:href>
    <d:propstat>
      <d:prop>
        <d:getetag>"${etag}"</d:getetag>
        <c:calendar-data>${escapeXml(eventToICal(event))}</c:calendar-data>
      </d:prop>
      <d:status>HTTP/1.1 200 OK</d:status>
    </d:propstat>
  </d:response>`;
}

/**
 * Generate calendar-query REPORT response
 */
function generateCalendarQueryResponse(events, calendar, baseUrl) {
  const responses = events.map(event =>
    generateEventResponse(event, calendar, baseUrl)
  );

  return `<?xml version="1.0" encoding="UTF-8"?>
<d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  ${responses.join('\n')}
</d:multistatus>`;
}

/**
 * Convert event to iCalendar format
 */
function eventToICal(event) {
  let ical = 'BEGIN:VCALENDAR\r\n';
  ical += 'VERSION:2.0\r\n';
  ical += 'PRODID:-//Exprsn Forge//CalDAV//EN\r\n';
  ical += 'CALSCALE:GREGORIAN\r\n';
  ical += 'BEGIN:VEVENT\r\n';
  ical += `UID:${event.id}@exprsn-forge\r\n`;
  ical += `DTSTAMP:${formatICalDateTime(new Date())}\r\n`;
  ical += `DTSTART:${formatICalDateTime(event.startTime, event.isAllDay)}\r\n`;
  ical += `DTEND:${formatICalDateTime(event.endTime, event.isAllDay)}\r\n`;
  ical += `SUMMARY:${escapeICalText(event.title)}\r\n`;

  if (event.description) {
    ical += `DESCRIPTION:${escapeICalText(event.description)}\r\n`;
  }

  if (event.location) {
    ical += `LOCATION:${escapeICalText(event.location)}\r\n`;
  }

  ical += `STATUS:${event.status.toUpperCase()}\r\n`;

  // Add recurrence rule if present
  if (event.recurrence && event.recurrence.frequency) {
    ical += `RRULE:FREQ=${event.recurrence.frequency.toUpperCase()}`;
    if (event.recurrence.interval) {
      ical += `;INTERVAL=${event.recurrence.interval}`;
    }
    if (event.recurrence.count) {
      ical += `;COUNT=${event.recurrence.count}`;
    }
    if (event.recurrence.until) {
      ical += `;UNTIL=${formatICalDateTime(new Date(event.recurrence.until))}`;
    }
    ical += '\r\n';
  }

  // Add attendees
  if (event.attendees && event.attendees.length > 0) {
    event.attendees.forEach(attendee => {
      ical += `ATTENDEE;CN="${escapeICalText(attendee.name || attendee.email)}";PARTSTAT=${attendee.status || 'NEEDS-ACTION'}:mailto:${attendee.email}\r\n`;
    });
  }

  // Add reminders (alarms)
  if (event.reminders && event.reminders.length > 0) {
    event.reminders.forEach(reminder => {
      ical += 'BEGIN:VALARM\r\n';
      ical += `ACTION:${reminder.type === 'email' ? 'EMAIL' : 'DISPLAY'}\r\n`;
      ical += `TRIGGER:-PT${reminder.minutesBefore}M\r\n`;
      if (reminder.type === 'popup') {
        ical += `DESCRIPTION:${escapeICalText(event.title)}\r\n`;
      }
      ical += 'END:VALARM\r\n';
    });
  }

  ical += 'END:VEVENT\r\n';
  ical += 'END:VCALENDAR\r\n';

  return ical;
}

/**
 * Parse iCalendar data to event object
 */
function parseICal(icalData) {
  const lines = icalData.split(/\r?\n/).filter(line => line.trim());
  const event = {
    attendees: [],
    reminders: []
  };

  let inVEvent = false;
  let inVAlarm = false;
  let currentAlarm = null;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed === 'BEGIN:VEVENT') {
      inVEvent = true;
      continue;
    }

    if (trimmed === 'END:VEVENT') {
      inVEvent = false;
      continue;
    }

    if (trimmed === 'BEGIN:VALARM') {
      inVAlarm = true;
      currentAlarm = {};
      continue;
    }

    if (trimmed === 'END:VALARM') {
      inVAlarm = false;
      if (currentAlarm) {
        event.reminders.push(currentAlarm);
        currentAlarm = null;
      }
      continue;
    }

    if (!inVEvent && !inVAlarm) continue;

    const [key, ...valueParts] = trimmed.split(':');
    const value = valueParts.join(':');
    const [prop, ...params] = key.split(';');

    if (inVAlarm) {
      // Parse alarm properties
      if (prop === 'ACTION') {
        currentAlarm.type = value === 'EMAIL' ? 'email' : 'popup';
      } else if (prop === 'TRIGGER') {
        // Parse trigger like "-PT15M"
        const match = value.match(/-?PT(\d+)M/);
        if (match) {
          currentAlarm.minutesBefore = parseInt(match[1]);
        }
      }
    } else {
      // Parse event properties
      switch (prop) {
        case 'UID':
          event.uid = value;
          break;
        case 'SUMMARY':
          event.title = unescapeICalText(value);
          break;
        case 'DESCRIPTION':
          event.description = unescapeICalText(value);
          break;
        case 'LOCATION':
          event.location = unescapeICalText(value);
          break;
        case 'DTSTART':
          event.startTime = parseICalDateTime(value, params);
          event.isAllDay = params.some(p => p.includes('VALUE=DATE'));
          break;
        case 'DTEND':
          event.endTime = parseICalDateTime(value, params);
          break;
        case 'STATUS':
          event.status = value.toLowerCase();
          break;
        case 'RRULE':
          event.recurrence = parseRRule(value);
          break;
        case 'ATTENDEE':
          const attendee = parseAttendee(value, params);
          if (attendee) {
            event.attendees.push(attendee);
          }
          break;
      }
    }
  }

  return event;
}

/**
 * Parse iCalendar date-time
 */
function parseICalDateTime(value, params = []) {
  // Remove timezone identifier if present
  const dateStr = value.replace(/Z$/, '');

  // Check if it's a date-only value
  if (dateStr.length === 8) {
    // YYYYMMDD format
    return moment(dateStr, 'YYYYMMDD').toDate();
  } else {
    // YYYYMMDDTHHmmss format
    return moment(dateStr, 'YYYYMMDDTHHmmss').toDate();
  }
}

/**
 * Format date-time for iCalendar
 */
function formatICalDateTime(date, isAllDay = false) {
  const m = moment(date).utc();

  if (isAllDay) {
    return m.format('YYYYMMDD');
  } else {
    return m.format('YYYYMMDDTHHmmss') + 'Z';
  }
}

/**
 * Parse RRULE string
 */
function parseRRule(rrule) {
  const parts = rrule.split(';');
  const recurrence = {};

  parts.forEach(part => {
    const [key, value] = part.split('=');
    switch (key) {
      case 'FREQ':
        recurrence.frequency = value.toLowerCase();
        break;
      case 'INTERVAL':
        recurrence.interval = parseInt(value);
        break;
      case 'COUNT':
        recurrence.count = parseInt(value);
        break;
      case 'UNTIL':
        recurrence.until = parseICalDateTime(value);
        break;
      case 'BYDAY':
        recurrence.byDay = value.split(',');
        break;
    }
  });

  return recurrence;
}

/**
 * Parse attendee information
 */
function parseAttendee(value, params) {
  const email = value.replace('mailto:', '');
  const attendee = { email };

  params.forEach(param => {
    if (param.startsWith('CN=')) {
      attendee.name = param.substring(3).replace(/"/g, '');
    } else if (param.startsWith('PARTSTAT=')) {
      attendee.status = param.substring(9).toLowerCase();
    }
  });

  return attendee;
}

/**
 * Generate CTag for calendar (collection tag)
 */
function generateCTag(calendar) {
  return `ctag-${calendar.id}-${calendar.updatedAt.getTime()}`;
}

/**
 * Generate ETag for calendar
 */
function generateETag(calendar) {
  return `etag-${calendar.id}-${calendar.updatedAt.getTime()}`;
}

/**
 * Generate ETag for event
 */
function generateEventETag(event) {
  return `etag-${event.id}-${event.updatedAt.getTime()}`;
}

/**
 * Escape XML special characters
 */
function escapeXml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Escape iCalendar text
 */
function escapeICalText(text) {
  if (!text) return '';
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

/**
 * Unescape iCalendar text
 */
function unescapeICalText(text) {
  if (!text) return '';
  return text
    .replace(/\\n/g, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
}

/**
 * Parse calendar-query filter from REPORT request
 */
function parseCalendarQuery(xmlBody) {
  // Simple parser for time-range filter
  const filter = {
    start: null,
    end: null
  };

  // Extract time-range if present
  const timeRangeMatch = xmlBody.match(/time-range.*start="([^"]+)".*end="([^"]+)"/);
  if (timeRangeMatch) {
    filter.start = parseICalDateTime(timeRangeMatch[1]);
    filter.end = parseICalDateTime(timeRangeMatch[2]);
  }

  return filter;
}

/**
 * Get calendar by URL path
 */
async function getCalendarByPath(userId, calendarId) {
  const calendar = await Calendar.findOne({
    where: {
      id: calendarId,
      ownerId: userId
    }
  });

  if (!calendar) {
    throw new Error('Calendar not found');
  }

  return calendar;
}

/**
 * Get event by URL path
 */
async function getEventByPath(calendarId, eventId) {
  // Remove .ics extension if present
  const cleanEventId = eventId.replace(/\.ics$/, '');

  const event = await CalendarEvent.findOne({
    where: {
      id: cleanEventId,
      calendarId
    }
  });

  if (!event) {
    throw new Error('Event not found');
  }

  return event;
}

/**
 * Create or update event from iCalendar data
 */
async function createOrUpdateEvent(calendarId, eventData, existingEventId = null) {
  const eventInfo = {
    ...eventData,
    calendarId
  };

  if (existingEventId) {
    // Update existing event
    const event = await CalendarEvent.findByPk(existingEventId);
    if (!event) {
      throw new Error('Event not found');
    }

    await event.update(eventInfo);
    logger.info('Event updated via CalDAV', { eventId: event.id, calendarId });
    return event;
  } else {
    // Create new event
    const event = await CalendarEvent.create(eventInfo);
    logger.info('Event created via CalDAV', { eventId: event.id, calendarId });
    return event;
  }
}

/**
 * Delete event
 */
async function deleteEvent(eventId) {
  const event = await CalendarEvent.findByPk(eventId);
  if (!event) {
    throw new Error('Event not found');
  }

  await event.destroy();
  logger.info('Event deleted via CalDAV', { eventId });
  return { success: true };
}

module.exports = {
  generatePropfindResponse,
  generateCalendarQueryResponse,
  eventToICal,
  parseICal,
  parseCalendarQuery,
  getCalendarByPath,
  getEventByPath,
  createOrUpdateEvent,
  deleteEvent,
  generateCTag,
  generateETag,
  generateEventETag
};
