/**
 * View Routes for Timeline Service
 * Handles server-side rendering of EJS templates
 */

const express = require('express');
const router = express.Router();
const db = require('../models');
const { Op } = require('sequelize');

/**
 * Landing Page
 */
router.get('/', async (req, res) => {
  try {
    const stats = {
      totalPosts: await db.Post.count(),
      activePosts: await db.Post.count({ where: { status: 'published' } }),
      totalLists: await db.List.count(),
      totalUsers: await db.Post.count({
        distinct: true,
        col: 'user_id'
      })
    };

    res.render('index', {
      title: 'Timeline',
      currentPath: req.path,
      user: req.user || null,
      stats
    });
  } catch (error) {
    console.error('Error rendering index:', error);
    res.render('index', {
      title: 'Timeline',
      currentPath: req.path,
      user: req.user || null,
      stats: {
        totalPosts: 0,
        activePosts: 0,
        totalLists: 0,
        totalUsers: 0
      }
    });
  }
});

/**
 * Feed Page
 */
router.get('/feed', (req, res) => {
  res.render('feed', {
    title: 'Feed',
    currentPath: req.path,
    user: req.user || { username: 'Demo User', id: 'demo-id' }
  });
});

/**
 * My Posts Page
 */
router.get('/posts', async (req, res) => {
  try {
    const userId = req.user?.id || 'demo-id';

    const stats = {
      totalPosts: await db.Post.count({ where: { user_id: userId } }),
      publishedPosts: await db.Post.count({ where: { user_id: userId, status: 'published' } }),
      draftPosts: await db.Post.count({ where: { user_id: userId, status: 'draft' } }),
      scheduledPosts: await db.Post.count({ where: { user_id: userId, status: 'scheduled' } })
    };

    const posts = await db.Post.findAll({
      where: { user_id: userId },
      order: [['created_at', 'DESC']],
      limit: 50
    });

    res.render('posts', {
      title: 'My Posts',
      currentPath: req.path,
      user: req.user || { username: 'Demo User', id: 'demo-id' },
      stats,
      posts
    });
  } catch (error) {
    console.error('Error rendering posts:', error);
    res.render('posts', {
      title: 'My Posts',
      currentPath: req.path,
      user: req.user || { username: 'Demo User', id: 'demo-id' },
      stats: {
        totalPosts: 0,
        publishedPosts: 0,
        draftPosts: 0,
        scheduledPosts: 0
      },
      posts: []
    });
  }
});

/**
 * Lists Page
 */
router.get('/lists', async (req, res) => {
  try {
    const userId = req.user?.id || 'demo-id';

    const lists = await db.List.findAll({
      where: { owner_id: userId },
      include: [
        {
          model: db.ListMember,
          as: 'members'
        }
      ],
      order: [['created_at', 'DESC']]
    });

    res.render('lists', {
      title: 'Lists',
      currentPath: req.path,
      user: req.user || { username: 'Demo User', id: 'demo-id' },
      lists
    });
  } catch (error) {
    console.error('Error rendering lists:', error);
    res.render('lists', {
      title: 'Lists',
      currentPath: req.path,
      user: req.user || { username: 'Demo User', id: 'demo-id' },
      lists: []
    });
  }
});

/**
 * Search Page
 */
router.get('/search', (req, res) => {
  res.render('search', {
    title: 'Search',
    currentPath: req.path,
    user: req.user || { username: 'Demo User', id: 'demo-id' },
    query: req.query.q || ''
  });
});

module.exports = router;
