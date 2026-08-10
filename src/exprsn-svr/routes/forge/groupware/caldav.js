const express = require('express');
const router = express.Router();
const { validateToken } = require('../../../middleware/auth');
const caldavService = require('../../../services/forge/groupware/caldavService');
const calendarService = require('../../../services/forge/groupware/calendarService');
const logger = require('../../../utils/logger');

/**
 * CalDAV Routes
 *
 * Implements CalDAV protocol for calendar synchronization
 * Compatible with Apple Calendar, Thunderbird, Google Calendar, etc.
 *
 * CalDAV URL structure:
 * - Collection: /caldav/
 * - Calendar: /caldav/{calendarId}/
 * - Event: /caldav/{calendarId}/{eventId}.ics
 */

/**
 * Middleware to parse raw body for CalDAV requests
 */
function rawBodyParser(req, res, next) {
  if (req.method === 'PROPFIND' || req.method === 'REPORT') {
    let data = '';
    req.setEncoding('utf8');
    req.on('data', chunk => {
      data += chunk;
    });
    req.on('end', () => {
      req.rawBody = data;
      next();
    });
  } else {
    next();
  }
}

router.use(rawBodyParser);

/**
 * OPTIONS - Return allowed methods and DAV capabilities
 */
router.options('*', (req, res) => {
  res.set({
    'DAV': '1, 2, calendar-access',
    'Allow': 'OPTIONS, GET, HEAD, POST, PUT, DELETE, PROPFIND, REPORT',
    'MS-Author-Via': 'DAV'
  });
  res.status(200).end();
});

/**
 * PROPFIND - Discover calendars and their properties
 *
 * Used by clients to:
 * - Discover available calendars
 * - Get calendar properties (name, description, ctag)
 * - Get event lists
 */
router.propfind('/',  async (req, res) => {
  try {
    const depth = req.headers.depth || '1';
    const baseUrl = `${req.protocol}://${req.get('host')}/api/groupware/caldav`;

    // Get user's calendars
    const result = await calendarService.listCalendars({
      ownerId: req.user.id,
      limit: 100,
      offset: 0
    });

    const xmlResponse = caldavService.generatePropfindResponse(
      result.calendars,
      baseUrl,
      depth
    );

    res.set({
      'Content-Type': 'application/xml; charset=utf-8',
      'DAV': '1, 2, calendar-access'
    });
    res.status(207).send(xmlResponse); // 207 Multi-Status

    logger.info('CalDAV PROPFIND on collection', {
      userId: req.user.id,
      depth,
      calendarCount: result.calendars.length
    });
  } catch (error) {
    logger.error('CalDAV PROPFIND failed', {
      error: error.message,
      userId: req.user.id
    });
    res.status(500).send('Internal Server Error');
  }
});

/**
 * PROPFIND - Get specific calendar properties
 */
router.propfind('/:calendarId/',  async (req, res) => {
  try {
    const depth = req.headers.depth || '1';
    const baseUrl = `${req.protocol}://${req.get('host')}/api/groupware/caldav`;

    // Get calendar
    const calendar = await caldavService.getCalendarByPath(
      req.user.id,
      req.params.calendarId
    );

    if (depth === '0') {
      // Just the calendar itself
      const xmlResponse = caldavService.generatePropfindResponse(
        [calendar],
        baseUrl,
        '1' // Return calendar properties
      );

      res.set({
        'Content-Type': 'application/xml; charset=utf-8',
        'DAV': '1, 2, calendar-access',
        'ETag': `"${caldavService.generateETag(calendar)}"`
      });
      res.status(207).send(xmlResponse);
    } else {
      // Calendar + events
      const events = await calendarService.listEvents({
        calendarId: req.params.calendarId,
        limit: 1000,
        offset: 0
      });

      // Generate response with events
      const responses = [];
      events.events.forEach(event => {
        const href = `${baseUrl}/${req.params.calendarId}/${event.id}.ics`;
        const etag = caldavService.generateEventETag(event);

        responses.push(`<d:response>
          <d:href>${href}</d:href>
          <d:propstat>
            <d:prop>
              <d:getetag>"${etag}"</d:getetag>
              <d:getcontenttype>text/calendar; component=VEVENT</d:getcontenttype>
            </d:prop>
            <d:status>HTTP/1.1 200 OK</d:status>
          </d:propstat>
        </d:response>`);
      });

      const xmlResponse = `<?xml version="1.0" encoding="UTF-8"?>
<d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  ${responses.join('\n')}
</d:multistatus>`;

      res.set({
        'Content-Type': 'application/xml; charset=utf-8',
        'DAV': '1, 2, calendar-access'
      });
      res.status(207).send(xmlResponse);
    }

    logger.info('CalDAV PROPFIND on calendar', {
      calendarId: req.params.calendarId,
      userId: req.user.id,
      depth
    });
  } catch (error) {
    logger.error('CalDAV PROPFIND on calendar failed', {
      error: error.message,
      calendarId: req.params.calendarId
    });

    if (error.message === 'Calendar not found') {
      res.status(404).send('Calendar not found');
    } else {
      res.status(500).send('Internal Server Error');
    }
  }
});

/**
 * REPORT - Calendar query (get events in date range)
 *
 * Used by clients to:
 * - Get events in a specific date range
 * - Sync calendar changes
 */
router.report('/:calendarId/',  async (req, res) => {
  try {
    const baseUrl = `${req.protocol}://${req.get('host')}/api/groupware/caldav`;

    // Get calendar
    const calendar = await caldavService.getCalendarByPath(
      req.user.id,
      req.params.calendarId
    );

    // Parse calendar-query filter from request body
    const filter = caldavService.parseCalendarQuery(req.rawBody || '');

    // Get events based on filter
    const events = await calendarService.listEvents({
      calendarId: req.params.calendarId,
      startDate: filter.start,
      endDate: filter.end,
      limit: 1000,
      offset: 0
    });

    // Generate XML response
    const xmlResponse = caldavService.generateCalendarQueryResponse(
      events.events,
      calendar,
      baseUrl
    );

    res.set({
      'Content-Type': 'application/xml; charset=utf-8',
      'DAV': '1, 2, calendar-access'
    });
    res.status(207).send(xmlResponse);

    logger.info('CalDAV REPORT (calendar-query)', {
      calendarId: req.params.calendarId,
      userId: req.user.id,
      eventCount: events.events.length,
      filter
    });
  } catch (error) {
    logger.error('CalDAV REPORT failed', {
      error: error.message,
      calendarId: req.params.calendarId
    });

    if (error.message === 'Calendar not found') {
      res.status(404).send('Calendar not found');
    } else {
      res.status(500).send('Internal Server Error');
    }
  }
});

/**
 * GET - Retrieve calendar or event
 *
 * - GET /caldav/{calendarId}/ - Get all events (iCal format)
 * - GET /caldav/{calendarId}/{eventId}.ics - Get specific event
 */
router.get('/:calendarId/',  async (req, res) => {
  try {
    // Export entire calendar as iCal
    const ical = await calendarService.exportToICal(req.params.calendarId);

    res.set({
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="${req.params.calendarId}.ics"`
    });
    res.status(200).send(ical);

    logger.info('CalDAV GET calendar', {
      calendarId: req.params.calendarId,
      userId: req.user.id
    });
  } catch (error) {
    logger.error('CalDAV GET calendar failed', {
      error: error.message,
      calendarId: req.params.calendarId
    });

    if (error.message.includes('not found')) {
      res.status(404).send('Calendar not found');
    } else {
      res.status(500).send('Internal Server Error');
    }
  }
});

/**
 * GET - Retrieve specific event
 */
router.get('/:calendarId/:eventId',  async (req, res) => {
  try {
    const event = await caldavService.getEventByPath(
      req.params.calendarId,
      req.params.eventId
    );

    const ical = caldavService.eventToICal(event);
    const etag = caldavService.generateEventETag(event);

    res.set({
      'Content-Type': 'text/calendar; charset=utf-8',
      'ETag': `"${etag}"`,
      'Last-Modified': event.updatedAt.toUTCString()
    });
    res.status(200).send(ical);

    logger.info('CalDAV GET event', {
      eventId: req.params.eventId,
      calendarId: req.params.calendarId
    });
  } catch (error) {
    logger.error('CalDAV GET event failed', {
      error: error.message,
      eventId: req.params.eventId
    });

    if (error.message === 'Event not found') {
      res.status(404).send('Event not found');
    } else {
      res.status(500).send('Internal Server Error');
    }
  }
});

/**
 * PUT - Create or update event
 *
 * CalDAV clients use PUT to create new events or update existing ones
 */
router.put('/:calendarId/:eventId',  async (req, res) => {
  try {
    // Verify calendar access
    const calendar = await caldavService.getCalendarByPath(
      req.user.id,
      req.params.calendarId
    );

    // Parse iCalendar data from request body
    let icalData = '';
    req.setEncoding('utf8');
    req.on('data', chunk => {
      icalData += chunk;
    });

    await new Promise((resolve, reject) => {
      req.on('end', () => resolve());
      req.on('error', reject);
    });

    // Parse event data
    const eventData = caldavService.parseICal(icalData);

    // Add required fields
    eventData.createdBy = req.user.id;

    // Check if event exists (for update)
    const eventId = req.params.eventId.replace(/\.ics$/, '');
    let existingEvent = null;

    try {
      existingEvent = await caldavService.getEventByPath(
        req.params.calendarId,
        eventId
      );
    } catch (e) {
      // Event doesn't exist, will create new one
    }

    // Create or update event
    const event = await caldavService.createOrUpdateEvent(
      req.params.calendarId,
      eventData,
      existingEvent ? existingEvent.id : eventId
    );

    const etag = caldavService.generateEventETag(event);

    res.set({
      'ETag': `"${etag}"`,
      'Content-Type': 'text/calendar; charset=utf-8'
    });

    if (existingEvent) {
      res.status(204).end(); // 204 No Content for updates
    } else {
      res.status(201).end(); // 201 Created for new events
    }

    logger.info('CalDAV PUT event', {
      eventId: event.id,
      calendarId: req.params.calendarId,
      action: existingEvent ? 'update' : 'create'
    });
  } catch (error) {
    logger.error('CalDAV PUT event failed', {
      error: error.message,
      eventId: req.params.eventId,
      calendarId: req.params.calendarId
    });

    if (error.message === 'Calendar not found') {
      res.status(404).send('Calendar not found');
    } else {
      res.status(500).send('Internal Server Error');
    }
  }
});

/**
 * DELETE - Delete event
 */
router.delete('/:calendarId/:eventId',  async (req, res) => {
  try {
    // Verify calendar access
    await caldavService.getCalendarByPath(
      req.user.id,
      req.params.calendarId
    );

    // Get event
    const event = await caldavService.getEventByPath(
      req.params.calendarId,
      req.params.eventId
    );

    // Delete event
    await caldavService.deleteEvent(event.id);

    res.status(204).end(); // 204 No Content

    logger.info('CalDAV DELETE event', {
      eventId: event.id,
      calendarId: req.params.calendarId
    });
  } catch (error) {
    logger.error('CalDAV DELETE event failed', {
      error: error.message,
      eventId: req.params.eventId,
      calendarId: req.params.calendarId
    });

    if (error.message === 'Event not found' || error.message === 'Calendar not found') {
      res.status(404).send(error.message);
    } else {
      res.status(500).send('Internal Server Error');
    }
  }
});

/**
 * HEAD - Check if resource exists
 */
router.head('/:calendarId/:eventId',  async (req, res) => {
  try {
    const event = await caldavService.getEventByPath(
      req.params.calendarId,
      req.params.eventId
    );

    const etag = caldavService.generateEventETag(event);

    res.set({
      'ETag': `"${etag}"`,
      'Content-Type': 'text/calendar; charset=utf-8',
      'Last-Modified': event.updatedAt.toUTCString()
    });
    res.status(200).end();
  } catch (error) {
    res.status(404).end();
  }
});

module.exports = router;
