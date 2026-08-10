/**
 * API Routes - AJAX Endpoints for Frontend
 * Provides JSON data for the BlueSky web interface
 */

const express = require('express');
const router = express.Router();
const { sequelize } = require('../models');
const { Op } = require('sequelize');

// ==========================================
// FEED ENDPOINTS
// ==========================================
router.get('/feed/forYou', async (req, res) => {
    try {
        const { limit = 20, cursor } = req.query;

        // Fetch posts from records table with nested includes
        const posts = await sequelize.models.Record.findAll({
            where: {
                collection: 'io.exprsn.timeline.post'
            },
            limit: parseInt(limit) + 1,
            order: [['created_at', 'DESC']],
            include: [{
                model: sequelize.models.Repository,
                as: 'repository',
                required: true,
                include: [{
                    model: sequelize.models.Account,
                    as: 'account',
                    required: true,
                    attributes: ['did', 'handle', 'displayName', 'avatarCid', 'isVerified']
                }]
            }]
        });

        const hasMore = posts.length > parseInt(limit);
        const items = hasMore ? posts.slice(0, -1) : posts;

        const formattedPosts = items.map(post => {
            const value = post.value; // value is already an object (JSONB)
            const account = post.repository.account;
            return {
                id: post.rkey,
                uri: post.uri,
                cid: post.cid,
                author: {
                    did: account.did,
                    handle: account.handle,
                    displayName: account.displayName,
                    avatar: account.avatarCid ? `/api/blobs/${account.avatarCid}` : null,
                    isVerified: account.isVerified
                },
                text: value.text || '',
                facets: value.facets || [],
                embed: value.embed || null,
                tags: value.tags || [],
                visibility: value.visibility || 'public',
                createdAt: value.createdAt || post.created_at,
                stats: {
                    likes: 0, // TODO: Count likes
                    reposts: 0, // TODO: Count reposts
                    replies: 0 // TODO: Count replies
                },
                viewer: {
                    liked: false, // TODO: Check if user liked
                    reposted: false, // TODO: Check if user reposted
                    bookmarked: false // TODO: Check if user bookmarked
                }
            };
        });

        res.json({
            success: true,
            data: {
                posts: formattedPosts,
                nextCursor: hasMore ? items[items.length - 1].id : null,
                hasMore
            }
        });
    } catch (error) {
        console.error('Error fetching feed:', error);
        res.status(500).json({
            success: false,
            error: 'INTERNAL_ERROR',
            message: 'Failed to fetch feed'
        });
    }
});

router.get('/feed/following', async (req, res) => {
    // TODO: Implement following feed
    res.json({
        success: true,
        data: {
            posts: [],
            nextCursor: null,
            hasMore: false
        }
    });
});

router.get('/feed/author/:handle', async (req, res) => {
    try {
        const { handle } = req.params;
        const { limit = 20 } = req.query;

        // Find account with repository
        const account = await sequelize.models.Account.findOne({
            where: { handle: handle.includes('.') ? handle : `${handle}.exprsn.io` },
            include: [{
                model: sequelize.models.Repository,
                as: 'repository',
                required: true
            }]
        });

        if (!account) {
            return res.status(404).json({
                success: false,
                error: 'NOT_FOUND',
                message: 'Account not found'
            });
        }

        // Fetch posts by this author using repository_id
        const posts = await sequelize.models.Record.findAll({
            where: {
                collection: 'io.exprsn.timeline.post',
                repositoryId: account.repository.id
            },
            limit: parseInt(limit),
            order: [['created_at', 'DESC']]
        });

        const formattedPosts = posts.map(post => {
            const value = post.value; // value is already an object (JSONB)
            return {
                id: post.rkey,
                uri: post.uri,
                cid: post.cid,
                author: {
                    did: account.did,
                    handle: account.handle,
                    displayName: account.displayName,
                    avatar: account.avatarCid ? `/api/blobs/${account.avatarCid}` : null,
                    isVerified: account.isVerified
                },
                text: value.text || '',
                embed: value.embed || null,
                tags: value.tags || [],
                createdAt: value.createdAt || post.created_at,
                stats: {
                    likes: 0,
                    reposts: 0,
                    replies: 0
                }
            };
        });

        res.json({
            success: true,
            data: {
                posts: formattedPosts,
                nextCursor: null,
                hasMore: false
            }
        });
    } catch (error) {
        console.error('Error fetching author feed:', error);
        res.status(500).json({
            success: false,
            error: 'INTERNAL_ERROR',
            message: 'Failed to fetch posts'
        });
    }
});

// ==========================================
// POST ENDPOINTS
// ==========================================
router.post('/posts', async (req, res) => {
    try {
        // TODO: Implement post creation with file uploads
        // This would involve creating a new record in the database
        // For now, return a mock response

        res.status(201).json({
            success: true,
            message: 'Post created successfully',
            data: {
                id: 'mock-post-id',
                uri: 'at://did:web:example/io.exprsn.timeline.post/mock-post-id'
            }
        });
    } catch (error) {
        console.error('Error creating post:', error);
        res.status(500).json({
            success: false,
            error: 'INTERNAL_ERROR',
            message: 'Failed to create post'
        });
    }
});

router.post('/posts/:id/like', async (req, res) => {
    try {
        // TODO: Implement like functionality
        res.json({
            success: true,
            data: {
                liked: true,
                likeCount: 1
            }
        });
    } catch (error) {
        console.error('Error toggling like:', error);
        res.status(500).json({
            success: false,
            error: 'INTERNAL_ERROR',
            message: 'Failed to toggle like'
        });
    }
});

router.post('/posts/:id/repost', async (req, res) => {
    try {
        // TODO: Implement repost functionality
        res.json({
            success: true,
            data: {
                reposted: true,
                repostCount: 1
            }
        });
    } catch (error) {
        console.error('Error toggling repost:', error);
        res.status(500).json({
            success: false,
            error: 'INTERNAL_ERROR',
            message: 'Failed to toggle repost'
        });
    }
});

router.post('/posts/:id/bookmark', async (req, res) => {
    try {
        // TODO: Implement bookmark functionality
        res.json({
            success: true,
            data: {
                bookmarked: true
            }
        });
    } catch (error) {
        console.error('Error toggling bookmark:', error);
        res.status(500).json({
            success: false,
            error: 'INTERNAL_ERROR',
            message: 'Failed to toggle bookmark'
        });
    }
});

router.delete('/posts/:id', async (req, res) => {
    try {
        // TODO: Implement post deletion
        res.json({
            success: true,
            message: 'Post deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting post:', error);
        res.status(500).json({
            success: false,
            error: 'INTERNAL_ERROR',
            message: 'Failed to delete post'
        });
    }
});

// ==========================================
// SOCIAL ENDPOINTS
// ==========================================
router.post('/social/follow', async (req, res) => {
    try {
        // TODO: Implement follow functionality
        res.json({
            success: true,
            message: 'User followed successfully'
        });
    } catch (error) {
        console.error('Error following user:', error);
        res.status(500).json({
            success: false,
            error: 'INTERNAL_ERROR',
            message: 'Failed to follow user'
        });
    }
});

router.post('/social/unfollow', async (req, res) => {
    try {
        // TODO: Implement unfollow functionality
        res.json({
            success: true,
            message: 'User unfollowed successfully'
        });
    } catch (error) {
        console.error('Error unfollowing user:', error);
        res.status(500).json({
            success: false,
            error: 'INTERNAL_ERROR',
            message: 'Failed to unfollow user'
        });
    }
});

router.post('/social/mute', async (req, res) => {
    try {
        // TODO: Implement mute functionality
        res.json({
            success: true,
            message: 'User muted successfully'
        });
    } catch (error) {
        console.error('Error muting user:', error);
        res.status(500).json({
            success: false,
            error: 'INTERNAL_ERROR',
            message: 'Failed to mute user'
        });
    }
});

router.post('/social/block', async (req, res) => {
    try {
        // TODO: Implement block functionality
        res.json({
            success: true,
            message: 'User blocked successfully'
        });
    } catch (error) {
        console.error('Error blocking user:', error);
        res.status(500).json({
            success: false,
            error: 'INTERNAL_ERROR',
            message: 'Failed to block user'
        });
    }
});

// ==========================================
// MESSAGES ENDPOINTS
// ==========================================
router.get('/messages/conversations', async (req, res) => {
    try {
        // Fetch conversations from records
        const conversations = await sequelize.models.Record.findAll({
            where: {
                collection: 'io.exprsn.spark.conversation'
            },
            order: [['created_at', 'DESC']]
        });

        const formattedConversations = conversations.map(conv => {
            const value = conv.value; // value is already an object (JSONB)
            return {
                id: conv.rkey,
                name: value.name || 'Conversation',
                isGroup: value.isGroup || false,
                participants: value.participants || [],
                lastMessage: null, // TODO: Fetch last message
                unreadCount: 0, // TODO: Calculate unread count
                createdAt: value.createdAt || conv.created_at
            };
        });

        res.json({
            success: true,
            data: {
                conversations: formattedConversations
            }
        });
    } catch (error) {
        console.error('Error fetching conversations:', error);
        res.status(500).json({
            success: false,
            error: 'INTERNAL_ERROR',
            message: 'Failed to fetch conversations'
        });
    }
});

router.get('/messages/conversations/:id/messages', async (req, res) => {
    try {
        const { id } = req.params;

        // Fetch messages for this conversation with nested includes
        const messages = await sequelize.models.Record.findAll({
            where: {
                collection: 'io.exprsn.spark.message',
                // Query JSONB field for conversationId
                'value.conversationId': id
            },
            order: [['created_at', 'ASC']],
            include: [{
                model: sequelize.models.Repository,
                as: 'repository',
                required: true,
                include: [{
                    model: sequelize.models.Account,
                    as: 'account',
                    required: true,
                    attributes: ['did', 'handle', 'displayName', 'avatarCid']
                }]
            }]
        });

        const formattedMessages = messages.map(msg => {
            const value = msg.value; // value is already an object (JSONB)
            const account = msg.repository.account;
            return {
                id: msg.rkey,
                conversationId: value.conversationId,
                author: {
                    did: account.did,
                    handle: account.handle,
                    displayName: account.displayName,
                    avatar: account.avatarCid ? `/api/blobs/${account.avatarCid}` : null
                },
                content: value.content,
                createdAt: value.createdAt || msg.created_at
            };
        });

        res.json({
            success: true,
            data: {
                messages: formattedMessages
            }
        });
    } catch (error) {
        console.error('Error fetching messages:', error);
        res.status(500).json({
            success: false,
            error: 'INTERNAL_ERROR',
            message: 'Failed to fetch messages'
        });
    }
});

router.post('/messages/conversations/:id/messages', async (req, res) => {
    try {
        // TODO: Implement message sending
        res.status(201).json({
            success: true,
            message: 'Message sent successfully',
            data: {
                id: 'mock-message-id'
            }
        });
    } catch (error) {
        console.error('Error sending message:', error);
        res.status(500).json({
            success: false,
            error: 'INTERNAL_ERROR',
            message: 'Failed to send message'
        });
    }
});

router.get('/messages/unread-count', async (req, res) => {
    try {
        // TODO: Calculate unread message count
        res.json({
            success: true,
            data: {
                count: 0
            }
        });
    } catch (error) {
        console.error('Error fetching unread count:', error);
        res.status(500).json({
            success: false,
            error: 'INTERNAL_ERROR',
            message: 'Failed to fetch unread count'
        });
    }
});

// ==========================================
// NOTIFICATIONS ENDPOINTS
// ==========================================
router.get('/notifications/unread-count', async (req, res) => {
    try {
        // TODO: Calculate unread notification count
        res.json({
            success: true,
            data: {
                count: 0
            }
        });
    } catch (error) {
        console.error('Error fetching notification count:', error);
        res.status(500).json({
            success: false,
            error: 'INTERNAL_ERROR',
            message: 'Failed to fetch notification count'
        });
    }
});

// ==========================================
// SEARCH ENDPOINTS
// ==========================================
router.get('/search/users', async (req, res) => {
    try {
        const { q } = req.query;

        if (!q || q.length < 2) {
            return res.json({
                success: true,
                data: { users: [] }
            });
        }

        const users = await sequelize.models.Account.findAll({
            where: {
                [Op.or]: [
                    { handle: { [Op.like]: `%${q}%` } },
                    { display_name: { [Op.like]: `%${q}%` } }
                ]
            },
            limit: 10,
            attributes: ['did', 'handle', 'display_name', 'avatar_url', 'is_verified']
        });

        res.json({
            success: true,
            data: {
                users: users.map(user => ({
                    did: user.did,
                    handle: user.handle,
                    displayName: user.display_name,
                    avatar: user.avatar_url,
                    isVerified: user.is_verified
                }))
            }
        });
    } catch (error) {
        console.error('Error searching users:', error);
        res.status(500).json({
            success: false,
            error: 'INTERNAL_ERROR',
            message: 'Failed to search users'
        });
    }
});

// ==========================================
// AUTH ENDPOINTS
// ==========================================
router.get('/auth/me', async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                error: 'UNAUTHORIZED',
                message: 'Not authenticated'
            });
        }

        res.json({
            success: true,
            data: {
                user: req.user
            }
        });
    } catch (error) {
        console.error('Error fetching current user:', error);
        res.status(500).json({
            success: false,
            error: 'INTERNAL_ERROR',
            message: 'Failed to fetch user'
        });
    }
});

// ==========================================
// LINK PREVIEW ENDPOINT
// ==========================================
router.get('/link-preview', async (req, res) => {
    try {
        const { url } = req.query;

        // TODO: Implement actual link preview fetching
        // For now, return mock data
        res.json({
            success: true,
            data: {
                url,
                title: 'Link Preview',
                description: 'This is a preview of the linked content',
                image: null
            }
        });
    } catch (error) {
        console.error('Error fetching link preview:', error);
        res.status(500).json({
            success: false,
            error: 'INTERNAL_ERROR',
            message: 'Failed to fetch link preview'
        });
    }
});

module.exports = router;
