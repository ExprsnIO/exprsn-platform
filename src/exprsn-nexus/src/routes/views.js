/**
 * View Routes for Nexus Service
 * Handles server-side rendering of EJS templates
 */

const express = require('express');
const router = express.Router();
const { Group, GroupMember, Event, GroupCategory, GroupTrendingStats } = require('../models');
const { Op } = require('sequelize');

/**
 * Landing Page
 */
router.get('/', async (req, res) => {
  try {
    const stats = {
      totalGroups: await Group.count(),
      activeGroups: await Group.count({ where: { status: 'active' } }),
      totalEvents: await Event.count(),
      totalMembers: await GroupMember.count()
    };

    res.render('index', {
      title: 'Nexus',
      currentPath: req.path,
      user: req.user || null,
      stats
    });
  } catch (error) {
    console.error('Error rendering index:', error);
    res.render('index', {
      title: 'Nexus',
      currentPath: req.path,
      user: req.user || null,
      stats: {
        totalGroups: 0,
        activeGroups: 0,
        totalEvents: 0,
        totalMembers: 0
      }
    });
  }
});

/**
 * Dashboard Page
 */
router.get('/dashboard', async (req, res) => {
  try {
    const userId = req.user?.id || 'demo-id';

    const myGroupsCount = await GroupMember.count({ where: { user_id: userId } });
    const upcomingEventsCount = await Event.count({
      where: {
        start_time: { [Op.gte]: new Date() }
      }
    });

    const myGroups = await GroupMember.findAll({
      where: { user_id: userId },
      include: [{ model: Group, as: 'group' }],
      limit: 6,
      order: [['createdAt', 'DESC']]
    });

    const upcomingEvents = await Event.findAll({
      where: {
        start_time: { [Op.gte]: new Date() }
      },
      limit: 5,
      order: [['start_time', 'ASC']]
    });

    res.render('dashboard', {
      title: 'Dashboard',
      currentPath: req.path,
      user: req.user || { username: 'Demo User', id: 'demo-id' },
      stats: {
        myGroupsCount,
        upcomingEventsCount
      },
      myGroups,
      upcomingEvents
    });
  } catch (error) {
    console.error('Error rendering dashboard:', error);
    res.render('dashboard', {
      title: 'Dashboard',
      currentPath: req.path,
      user: req.user || { username: 'Demo User', id: 'demo-id' },
      stats: {
        myGroupsCount: 0,
        upcomingEventsCount: 0
      },
      myGroups: [],
      upcomingEvents: []
    });
  }
});

/**
 * Discover Page
 */
router.get('/discover', async (req, res) => {
  try {
    const trendingGroups = await Group.findAll({
      include: [
        {
          model: GroupTrendingStats,
          as: 'trendingStats',
          required: false
        }
      ],
      where: { status: 'active', visibility: 'public' },
      order: [[{ model: GroupTrendingStats, as: 'trendingStats' }, 'score', 'DESC']],
      limit: 12
    });

    res.render('discover', {
      title: 'Discover',
      currentPath: req.path,
      user: req.user || { username: 'Demo User', id: 'demo-id' },
      trendingGroups
    });
  } catch (error) {
    console.error('Error rendering discover:', error);
    res.render('discover', {
      title: 'Discover',
      currentPath: req.path,
      user: req.user || { username: 'Demo User', id: 'demo-id' },
      trendingGroups: []
    });
  }
});

/**
 * My Groups Page
 */
router.get('/groups', async (req, res) => {
  try {
    const userId = req.user?.id || 'demo-id';

    const memberships = await GroupMember.findAll({
      where: { user_id: userId },
      include: [{ model: Group, as: 'group' }],
      order: [['createdAt', 'DESC']]
    });

    res.render('groups', {
      title: 'My Groups',
      currentPath: req.path,
      user: req.user || { username: 'Demo User', id: 'demo-id' },
      memberships
    });
  } catch (error) {
    console.error('Error rendering groups:', error);
    res.render('groups', {
      title: 'My Groups',
      currentPath: req.path,
      user: req.user || { username: 'Demo User', id: 'demo-id' },
      memberships: []
    });
  }
});

/**
 * Events Page
 */
router.get('/events', async (req, res) => {
  try {
    const events = await Event.findAll({
      where: {
        start_time: { [Op.gte]: new Date() }
      },
      include: [{ model: Group, as: 'group' }],
      order: [['start_time', 'ASC']],
      limit: 50
    });

    res.render('events', {
      title: 'Events',
      currentPath: req.path,
      user: req.user || { username: 'Demo User', id: 'demo-id' },
      events
    });
  } catch (error) {
    console.error('Error rendering events:', error);
    res.render('events', {
      title: 'Events',
      currentPath: req.path,
      user: req.user || { username: 'Demo User', id: 'demo-id' },
      events: []
    });
  }
});

/**
 * Calendar Page
 */
router.get('/calendar', (req, res) => {
  res.render('calendar', {
    title: 'Calendar',
    currentPath: req.path,
    user: req.user || { username: 'Demo User', id: 'demo-id' }
  });
});

/**
 * Group Detail Page
 */
router.get('/groups/:id', async (req, res) => {
  try {
    const group = await Group.findByPk(req.params.id, {
      include: [
        { model: GroupMember, as: 'members' },
        { model: Event, as: 'events' }
      ]
    });

    if (!group) {
      return res.status(404).render('error', {
        title: 'Group Not Found',
        currentPath: req.path,
        user: req.user || null,
        message: 'The requested group could not be found.'
      });
    }

    res.render('group-detail', {
      title: group.name,
      currentPath: req.path,
      user: req.user || { username: 'Demo User', id: 'demo-id' },
      group
    });
  } catch (error) {
    console.error('Error rendering group detail:', error);
    res.status(500).render('error', {
      title: 'Error',
      currentPath: req.path,
      user: req.user || null,
      message: 'An error occurred while loading the group.'
    });
  }
});

module.exports = router;
