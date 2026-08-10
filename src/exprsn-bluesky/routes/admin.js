const express = require('express');
const router = express.Router();
const { asyncHandler, validateCAToken, requirePermissions } = require('@exprsn/shared');
const { Account, Repository, Record, Blob, Event, Subscription } = require('../models');
const queueService = require('../services/queueService');
const { sequelize } = require('../config/database');

// Admin dashboard (EJS view)
router.get('/', (req, res) => {
  res.render('admin/dashboard', {
    title: 'Bluesky PDS Admin',
    user: req.user
  });
});

// Stats API
router.get('/api/stats',
  validateCAToken,
  requirePermissions({ read: true }),
  asyncHandler(async (req, res) => {
    const [
      accountCount,
      activeAccountCount,
      recordCount,
      blobCount,
      eventCount,
      subscriptionCount,
      queueStats
    ] = await Promise.all([
      Account.count(),
      Account.count({ where: { status: 'active' } }),
      Record.count(),
      Blob.count(),
      Event.count(),
      Subscription.count(),
      queueService.getStats()
    ]);

    // Get recent activity
    const recentEvents = await Event.findAll({
      order: [['created_at', 'DESC']],
      limit: 10,
      include: [{
        model: Account,
        as: 'account',
        attributes: ['did', 'handle']
      }]
    });

    res.json({
      success: true,
      data: {
        accounts: {
          total: accountCount,
          active: activeAccountCount
        },
        records: recordCount,
        blobs: blobCount,
        events: eventCount,
        subscriptions: subscriptionCount,
        queues: queueStats,
        recentActivity: recentEvents
      }
    });
  })
);

// Accounts list (EJS view)
router.get('/accounts', (req, res) => {
  res.render('admin/accounts', {
    title: 'Accounts'
  });
});

// Accounts list API
router.get('/api/accounts',
  validateCAToken,
  requirePermissions({ read: true }),
  asyncHandler(async (req, res) => {
    const { page = 1, limit = 20, search, status } = req.query;
    const offset = (page - 1) * limit;

    const where = {};
    if (search) {
      where[sequelize.Op.or] = [
        { handle: { [sequelize.Op.iLike]: `%${search}%` } },
        { displayName: { [sequelize.Op.iLike]: `%${search}%` } },
        { email: { [sequelize.Op.iLike]: `%${search}%` } }
      ];
    }
    if (status) {
      where.status = status;
    }

    const { count, rows: accounts } = await Account.findAndCountAll({
      where,
      include: [{
        model: Repository,
        as: 'repository'
      }],
      attributes: {
        exclude: ['privateKey', 'recoveryKey']
      },
      order: [['created_at', 'DESC']],
      limit: parseInt(limit),
      offset
    });

    res.json({
      success: true,
      data: {
        accounts,
        pagination: {
          total: count,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(count / limit)
        }
      }
    });
  })
);

// Events/firehose viewer (EJS view)
router.get('/events', (req, res) => {
  res.render('admin/events', {
    title: 'Event Firehose'
  });
});

// Queue management (EJS view)
router.get('/queues', (req, res) => {
  res.render('admin/queues', {
    title: 'Queue Management'
  });
});

module.exports = router;
