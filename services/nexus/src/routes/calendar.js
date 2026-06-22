const express = require('express');
const router = express.Router();
const { optionalToken, requireToken } = require('../middleware/tokenAuth');
const icalService = require('../services/icalService');
const caldavService = require('../services/caldavService');
const carddavService = require('../services/carddavService');

/**
 * ═══════════════════════════════════════════════════════════
 * Calendar Integration Routes
 * iCal export, CalDAV, and CardDAV support
 * ═══════════════════════════════════════════════════════════
 */

/**
 * GET /api/calendar/events/:id/ical
 * Export single event as iCal
 */
router.get('/events/:id/ical',
  optionalToken,
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const baseUrl = `${req.protocol}://${req.get('host')}`;

      const ical = await icalService.generateEventICal(id, baseUrl);

      res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="event-${id}.ics"`);
      res.send(ical);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/calendar/groups/:groupId/ical
 * Export group calendar as iCal
 */
router.get('/groups/:groupId/ical',
  optionalToken,
  async (req, res, next) => {
    try {
      const { groupId } = req.params;
      const {
        upcoming = 'true',
        limit = 100
      } = req.query;

      const ical = await icalService.generateGroupCalendar(groupId, {
        upcoming: upcoming === 'true',
        limit: Math.min(parseInt(limit), 500)
      });

      res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="group-${groupId}.ics"`);
      res.send(ical);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/calendar/users/:userId/ical
 * Export user's calendar as iCal
 */
router.get('/users/:userId/ical',
  requireToken,
  async (req, res, next) => {
    try {
      const { userId } = req.params;
      const tokenUserId = req.token.data.userId;

      // Users can only export their own calendar
      if (userId !== tokenUserId) {
        return res.status(403).json({
          error: 'FORBIDDEN',
          message: 'You can only export your own calendar'
        });
      }

      const {
        upcoming = 'true',
        limit = 100
      } = req.query;

      const ical = await icalService.generateUserCalendar(userId, {
        upcoming: upcoming === 'true',
        limit: Math.min(parseInt(limit), 500)
      });

      res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="my-events.ics"`);
      res.send(ical);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * ═══════════════════════════════════════════════════════════
 * CalDAV Routes (RFC 4791)
 * ═══════════════════════════════════════════════════════════
 */

/**
 * GET /api/caldav/users/:userId/calendars
 * Get user's calendar collection (PROPFIND)
 */
router.get('/caldav/users/:userId/calendars',
  requireToken,
  async (req, res, next) => {
    try {
      const { userId } = req.params;
      const tokenUserId = req.token.data.userId;

      if (userId !== tokenUserId) {
        return res.status(403).json({
          error: 'FORBIDDEN',
          message: 'Access denied'
        });
      }

      const collection = await caldavService.getUserCalendarCollection(userId);

      res.json({
        success: true,
        collection
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/caldav/groups/:groupId/calendar
 * Get group calendar (CalDAV format)
 */
router.get('/caldav/groups/:groupId/calendar',
  optionalToken,
  async (req, res, next) => {
    try {
      const { groupId } = req.params;
      const { syncToken, timeRange } = req.query;

      const properties = await caldavService.getCalendarProperties('group', groupId);

      res.json({
        success: true,
        properties,
        syncToken: caldavService.generateSyncToken()
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/caldav/groups/:groupId/events
 * Get events for CalDAV sync (REPORT method)
 */
router.get('/caldav/groups/:groupId/events',
  optionalToken,
  async (req, res, next) => {
    try {
      const { groupId } = req.params;
      const { syncToken, timeRangeStart, timeRangeEnd } = req.query;

      const timeRange = (timeRangeStart && timeRangeEnd) ? {
        start: parseInt(timeRangeStart),
        end: parseInt(timeRangeEnd)
      } : null;

      const events = await caldavService.getEventsForSync('group', groupId, {
        syncToken,
        timeRange
      });

      res.json({
        success: true,
        events,
        syncToken: caldavService.generateSyncToken()
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * ═══════════════════════════════════════════════════════════
 * CardDAV Routes (RFC 6352)
 * ═══════════════════════════════════════════════════════════
 */

/**
 * GET /api/carddav/users/:userId/addressbooks
 * Get user's addressbook collection (PROPFIND)
 */
router.get('/carddav/users/:userId/addressbooks',
  requireToken,
  async (req, res, next) => {
    try {
      const { userId } = req.params;
      const tokenUserId = req.token.data.userId;

      if (userId !== tokenUserId) {
        return res.status(403).json({
          error: 'FORBIDDEN',
          message: 'Access denied'
        });
      }

      const collection = await carddavService.getUserAddressbookCollection(userId);

      res.json({
        success: true,
        collection
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/carddav/groups/:groupId/contacts
 * Get group members as vCards
 */
router.get('/carddav/groups/:groupId/contacts',
  optionalToken,
  async (req, res, next) => {
    try {
      const { groupId } = req.params;
      const { format = 'json' } = req.query;

      const vcards = await carddavService.getGroupMembersAsVCards(groupId);

      if (format === 'vcf') {
        // Return as vCard file
        const vcfContent = vcards.map(v => v.vcard).join('\r\n\r\n');
        res.setHeader('Content-Type', 'text/vcard; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="group-${groupId}-contacts.vcf"`);
        res.send(vcfContent);
      } else {
        // Return as JSON
        res.json({
          success: true,
          contacts: vcards,
          count: vcards.length
        });
      }
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/carddav/groups/:groupId/addressbook
 * Get addressbook properties for a group
 */
router.get('/carddav/groups/:groupId/addressbook',
  optionalToken,
  async (req, res, next) => {
    try {
      const { groupId } = req.params;

      const properties = await carddavService.getAddressbookProperties(groupId);

      res.json({
        success: true,
        properties,
        syncToken: carddavService.generateSyncToken()
      });
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;
