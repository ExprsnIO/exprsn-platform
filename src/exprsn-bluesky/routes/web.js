/**
 * Web Routes - Frontend Page Serving
 * Serves EJS views for the BlueSky web interface
 */

const express = require('express');
const router = express.Router();
const { sequelize } = require('../models');

// ==========================================
// HOME/FEED
// ==========================================
router.get('/', async (req, res) => {
    try {
        res.render('feed/index', {
            title: 'Home',
            currentPage: 'home',
            user: req.user || null
        });
    } catch (error) {
        console.error('Error rendering home page:', error);
        res.status(500).render('error', {
            title: 'Error',
            message: 'Failed to load home page',
            error: process.env.NODE_ENV === 'development' ? error : {}
        });
    }
});

// ==========================================
// EXPLORE
// ==========================================
router.get('/explore', async (req, res) => {
    try {
        res.render('feed/index', {
            title: 'Explore',
            currentPage: 'explore',
            user: req.user || null
        });
    } catch (error) {
        console.error('Error rendering explore page:', error);
        res.status(500).send('Error loading explore page');
    }
});

// ==========================================
// PROFILE
// ==========================================
router.get('/profile/:handle', async (req, res) => {
    try {
        const { handle } = req.params;

        // Fetch profile from database
        const account = await sequelize.models.Account.findOne({
            where: { handle: handle.includes('.') ? handle : `${handle}.exprsn.io` }
        });

        if (!account) {
            return res.status(404).render('error', {
                title: 'Not Found',
                message: 'Profile not found',
                error: {}
            });
        }

        // TODO: Fetch follow counts and post count
        const profile = {
            did: account.did,
            handle: account.handle,
            displayName: account.display_name,
            description: account.description,
            avatar: account.avatar_url,
            banner: account.banner_url,
            isVerified: account.is_verified,
            createdAt: account.created_at,
            followingCount: 0, // TODO: Calculate from relationships
            followersCount: 0, // TODO: Calculate from relationships
            postsCount: 0      // TODO: Calculate from records
        };

        const isOwnProfile = req.user && req.user.did === account.did;
        const isFollowing = false; // TODO: Check if current user follows this profile

        res.render('profile/show', {
            title: profile.displayName || profile.handle,
            currentPage: 'profile',
            user: req.user || null,
            profile,
            isOwnProfile,
            isFollowing
        });
    } catch (error) {
        console.error('Error rendering profile page:', error);
        res.status(500).send('Error loading profile');
    }
});

// ==========================================
// MESSAGES
// ==========================================
router.get('/messages', async (req, res) => {
    try {
        if (!req.user) {
            return res.redirect('/login?redirect=/messages');
        }

        res.render('messages/index', {
            title: 'Messages',
            currentPage: 'messages',
            user: req.user
        });
    } catch (error) {
        console.error('Error rendering messages page:', error);
        res.status(500).send('Error loading messages');
    }
});

// ==========================================
// NOTIFICATIONS
// ==========================================
router.get('/notifications', async (req, res) => {
    try {
        if (!req.user) {
            return res.redirect('/login?redirect=/notifications');
        }

        res.render('feed/index', {
            title: 'Notifications',
            currentPage: 'notifications',
            user: req.user
        });
    } catch (error) {
        console.error('Error rendering notifications page:', error);
        res.status(500).send('Error loading notifications');
    }
});

// ==========================================
// BOOKMARKS
// ==========================================
router.get('/bookmarks', async (req, res) => {
    try {
        if (!req.user) {
            return res.redirect('/login?redirect=/bookmarks');
        }

        res.render('feed/index', {
            title: 'Bookmarks',
            currentPage: 'bookmarks',
            user: req.user
        });
    } catch (error) {
        console.error('Error rendering bookmarks page:', error);
        res.status(500).send('Error loading bookmarks');
    }
});

// ==========================================
// LISTS
// ==========================================
router.get('/lists', async (req, res) => {
    try {
        res.render('feed/index', {
            title: 'Lists',
            currentPage: 'lists',
            user: req.user || null
        });
    } catch (error) {
        console.error('Error rendering lists page:', error);
        res.status(500).send('Error loading lists');
    }
});

// ==========================================
// SETTINGS
// ==========================================
router.get('/settings', async (req, res) => {
    try {
        if (!req.user) {
            return res.redirect('/login?redirect=/settings');
        }

        res.render('feed/index', {
            title: 'Settings',
            currentPage: 'settings',
            user: req.user
        });
    } catch (error) {
        console.error('Error rendering settings page:', error);
        res.status(500).send('Error loading settings');
    }
});

// ==========================================
// POST DETAIL
// ==========================================
router.get('/post/:id', async (req, res) => {
    try {
        const { id } = req.params;

        // TODO: Fetch post from database
        res.render('feed/index', {
            title: 'Post',
            currentPage: 'home',
            user: req.user || null
        });
    } catch (error) {
        console.error('Error rendering post page:', error);
        res.status(500).send('Error loading post');
    }
});

// ==========================================
// STATIC PAGES
// ==========================================
router.get('/about', (req, res) => {
    res.render('feed/index', {
        title: 'About',
        currentPage: 'about',
        user: req.user || null
    });
});

router.get('/help', (req, res) => {
    res.render('feed/index', {
        title: 'Help',
        currentPage: 'help',
        user: req.user || null
    });
});

router.get('/terms', (req, res) => {
    res.render('feed/index', {
        title: 'Terms of Service',
        currentPage: 'terms',
        user: req.user || null
    });
});

router.get('/privacy', (req, res) => {
    res.render('feed/index', {
        title: 'Privacy Policy',
        currentPage: 'privacy',
        user: req.user || null
    });
});

module.exports = router;
