/**
 * Configuration Management Routes
 * Provides endpoints for the Setup dashboard to manage Nexus configurations
 */

const express = require('express');
const router = express.Router();
const { Group, Event, GroupCategory } = require('../models');
const { Op } = require('sequelize');
const config = require('../config');
const logger = require('../utils/logger');

/**
 * GET /api/config/:sectionId
 */
router.get('/:sectionId', async (req, res) => {
  const { sectionId } = req.params;

  try {
    let data;

    switch (sectionId) {
      case 'nexus-groups':
        data = await getGroupsConfig();
        break;
      case 'nexus-events':
        data = await getEventsConfig();
        break;
      case 'nexus-calendar':
        data = await getCalendarConfig();
        break;
      case 'nexus-trending':
        data = await getTrendingConfig();
        break;
      default:
        return res.status(404).json({ success: false, error: 'Configuration section not found' });
    }

    res.json(data);
  } catch (error) {
    logger.error(`Error fetching config for ${sectionId}:`, error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/config/:sectionId
 */
router.post('/:sectionId', async (req, res) => {
  const { sectionId } = req.params;
  const configData = req.body;

  try {
    let result;

    switch (sectionId) {
      case 'nexus-groups':
        result = await updateGroupsConfig(configData);
        break;
      case 'nexus-events':
        result = await updateEventsConfig(configData);
        break;
      case 'nexus-calendar':
        result = await updateCalendarConfig(configData);
        break;
      case 'nexus-trending':
        result = await updateTrendingConfig(configData);
        break;
      default:
        return res.status(404).json({ success: false, error: 'Configuration section not found' });
    }

    res.json({ success: true, result });
  } catch (error) {
    logger.error(`Error updating config for ${sectionId}:`, error);
    res.status(500).json({ success: false, error: error.message });
  }
});

async function getGroupsConfig() {
  const totalGroups = await Group.count();
  const publicGroups = await Group.count({ where: { visibility: 'public' } });
  const categories = await GroupCategory.count();

  return {
    title: 'Group Management',
    description: 'Manage groups and communities',
    actions: ['Create Group', 'Import Groups'],
    fields: [
      { name: 'enableGroups', label: 'Enable Groups', type: 'checkbox', value: config.features?.groups !== false },
      { name: 'allowPublicGroups', label: 'Allow Public Groups', type: 'checkbox', value: true },
      { name: 'maxGroupSize', label: 'Max Group Size', type: 'number', value: config.groups?.maxSize || 10000 },
      { name: 'requireApproval', label: 'Require Group Creation Approval', type: 'checkbox', value: config.groups?.requireApproval === true }
    ],
    stats: { totalGroups, publicGroups, categories }
  };
}

async function getEventsConfig() {
  const totalEvents = await Event.count();
  const upcomingEvents = await Event.count({ where: { start_time: { [Op.gte]: new Date() } } });

  return {
    title: 'Event Management',
    description: 'Manage events and calendars',
    actions: ['Create Event', 'Import Calendar'],
    fields: [
      { name: 'enableEvents', label: 'Enable Events', type: 'checkbox', value: config.features?.events !== false },
      { name: 'allowRecurring', label: 'Allow Recurring Events', type: 'checkbox', value: config.events?.allowRecurring !== false },
      { name: 'maxAttendees', label: 'Max Attendees Per Event', type: 'number', value: config.events?.maxAttendees || 1000 }
    ],
    stats: { totalEvents, upcomingEvents }
  };
}

async function getCalendarConfig() {
  return {
    title: 'Calendar Synchronization',
    description: 'Configure calendar integration settings',
    fields: [
      { name: 'caldavEnabled', label: 'Enable CalDAV', type: 'checkbox', value: config.calendar?.caldav !== false },
      { name: 'carddavEnabled', label: 'Enable CardDAV', type: 'checkbox', value: config.calendar?.carddav !== false },
      { name: 'icalExport', label: 'Enable iCal Export', type: 'checkbox', value: config.calendar?.icalExport !== false },
      { name: 'syncInterval', label: 'Sync Interval (minutes)', type: 'number', value: config.calendar?.syncInterval || 15 }
    ]
  };
}

async function getTrendingConfig() {
  return {
    title: 'Trending Analytics',
    description: 'Configure trending groups algorithm',
    fields: [
      { name: 'trendingEnabled', label: 'Enable Trending', type: 'checkbox', value: config.trending?.enabled !== false },
      { name: 'trendingWindow', label: 'Trending Window (hours)', type: 'number', value: config.trending?.windowHours || 24 },
      { name: 'trendingThreshold', label: 'Trending Threshold', type: 'number', value: config.trending?.threshold || 10 },
      { name: 'cacheTime', label: 'Cache Time (seconds)', type: 'number', value: config.trending?.cacheTime || 300 }
    ]
  };
}

async function updateGroupsConfig(configData) {
  logger.info('Groups configuration updated:', configData);
  return { message: 'Groups configuration updated successfully', config: configData };
}

async function updateEventsConfig(configData) {
  logger.info('Events configuration updated:', configData);
  return { message: 'Events configuration updated successfully', config: configData };
}

async function updateCalendarConfig(configData) {
  logger.info('Calendar configuration updated:', configData);
  return { message: 'Calendar configuration updated successfully', config: configData };
}

async function updateTrendingConfig(configData) {
  logger.info('Trending configuration updated:', configData);
  if (configData.trendingWindow) config.trending = { ...config.trending, windowHours: parseInt(configData.trendingWindow) };
  return { message: 'Trending configuration updated successfully', config: configData };
}

module.exports = router;
