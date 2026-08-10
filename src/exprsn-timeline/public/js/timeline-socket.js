/**
 * ═══════════════════════════════════════════════════════════════
 * Exprsn Timeline - Socket.IO Client
 * ═══════════════════════════════════════════════════════════════
 * Handles real-time updates via Socket.IO
 */

class TimelineSocket {
    constructor() {
        this.socket = null;
        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;

        this.connect();
    }

    /**
     * Connect to Socket.IO server
     */
    connect() {
        const socketURL = window.location.origin;

        this.socket = io(socketURL, {
            path: '/socket.io',
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            reconnectionAttempts: this.maxReconnectAttempts
        });

        this.setupEventListeners();
    }

    /**
     * Setup Socket.IO event listeners
     */
    setupEventListeners() {
        // Connection events
        this.socket.on('connect', () => this.handleConnect());
        this.socket.on('disconnect', (reason) => this.handleDisconnect(reason));
        this.socket.on('connect_error', (error) => this.handleConnectError(error));
        this.socket.on('reconnect', (attemptNumber) => this.handleReconnect(attemptNumber));
        this.socket.on('reconnect_attempt', (attemptNumber) => this.handleReconnectAttempt(attemptNumber));
        this.socket.on('reconnect_failed', () => this.handleReconnectFailed());

        // Timeline events
        this.socket.on('new_post', (post) => this.handleNewPost(post));
        this.socket.on('post_liked', (data) => this.handlePostLiked(data));
        this.socket.on('post_reposted', (data) => this.handlePostReposted(data));
        this.socket.on('post_commented', (data) => this.handlePostCommented(data));
        this.socket.on('post_deleted', (data) => this.handlePostDeleted(data));
        this.socket.on('post_updated', (post) => this.handlePostUpdated(post));

        // Notification events
        this.socket.on('notification', (notification) => this.handleNotification(notification));

        // Trending events
        this.socket.on('trending_update', (data) => this.handleTrendingUpdate(data));

        // User activity events
        this.socket.on('user_online', (data) => this.handleUserOnline(data));
        this.socket.on('user_offline', (data) => this.handleUserOffline(data));
    }

    /**
     * Handle successful connection
     */
    handleConnect() {
        console.log('✅ Connected to Timeline WebSocket');
        this.isConnected = true;
        this.reconnectAttempts = 0;

        this.updateConnectionStatus('online', 'Connected');

        // Join user's personal channel
        const userId = window.timelineUI?.currentUserId;
        if (userId) {
            this.socket.emit('join_user_channel', { userId });
        }

        // Show success notification
        if (window.timelineUI) {
            window.timelineUI.showSuccess('Connected to real-time updates');
        }
    }

    /**
     * Handle disconnection
     */
    handleDisconnect(reason) {
        console.log('⚠️ Disconnected from WebSocket:', reason);
        this.isConnected = false;

        this.updateConnectionStatus('offline', 'Disconnected');

        if (reason === 'io server disconnect') {
            // Server explicitly disconnected - try to reconnect
            this.socket.connect();
        }
    }

    /**
     * Handle connection error
     */
    handleConnectError(error) {
        console.error('❌ WebSocket connection error:', error);
        this.updateConnectionStatus('offline', 'Connection error');
    }

    /**
     * Handle reconnection
     */
    handleReconnect(attemptNumber) {
        console.log(`✅ Reconnected after ${attemptNumber} attempts`);
        this.isConnected = true;
        this.reconnectAttempts = 0;

        this.updateConnectionStatus('online', 'Reconnected');

        if (window.timelineUI) {
            window.timelineUI.showSuccess('Reconnected to server');
        }
    }

    /**
     * Handle reconnection attempt
     */
    handleReconnectAttempt(attemptNumber) {
        console.log(`🔄 Reconnection attempt ${attemptNumber}/${this.maxReconnectAttempts}`);
        this.reconnectAttempts = attemptNumber;

        this.updateConnectionStatus('offline', `Reconnecting (${attemptNumber}/${this.maxReconnectAttempts})...`);
    }

    /**
     * Handle reconnection failure
     */
    handleReconnectFailed() {
        console.error('❌ Failed to reconnect after maximum attempts');
        this.updateConnectionStatus('offline', 'Connection failed');

        if (window.timelineUI) {
            window.timelineUI.showError('Failed to connect to real-time updates. Please refresh the page.');
        }
    }

    /**
     * Update connection status UI
     */
    updateConnectionStatus(status, message) {
        const statusElement = document.getElementById('connectionStatus');
        if (!statusElement) return;

        const indicator = statusElement.querySelector('.status-indicator');
        const text = statusElement.querySelector('span');

        if (indicator) {
            indicator.className = `status-indicator ${status}`;
        }

        if (text) {
            text.textContent = message;
        }
    }

    /**
     * Handle new post from WebSocket
     */
    handleNewPost(post) {
        console.log('📝 New post received:', post.id);

        // Only add to feed if on home or global feed
        if (!window.timelineUI) return;

        const currentFeed = window.timelineUI.currentFeed;
        if (currentFeed === 'home' || currentFeed === 'global') {
            // Show notification banner
            this.showNewPostBanner(post);
        }
    }

    /**
     * Show new post banner
     */
    showNewPostBanner(post) {
        const feed = document.getElementById('postsFeed');
        if (!feed) return;

        const banner = document.createElement('div');
        banner.className = 'new-post-banner';
        banner.innerHTML = `
            <span>New post available</span>
            <button class="btn-link">Load new posts</button>
        `;

        banner.style.cssText = `
            position: sticky;
            top: 160px;
            z-index: 10;
            padding: 12px 16px;
            background: var(--color-primary);
            color: white;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 12px;
            border-radius: 8px;
            margin-bottom: 16px;
            cursor: pointer;
        `;

        banner.querySelector('button').addEventListener('click', () => {
            window.timelineUI.loadInitialFeed();
            banner.remove();
        });

        feed.insertBefore(banner, feed.firstChild);
    }

    /**
     * Handle post liked event
     */
    handlePostLiked(data) {
        console.log('❤️ Post liked:', data);

        const { postId, userId, likeCount } = data;

        // Update like count in UI
        const postCard = document.querySelector(`[data-post-id="${postId}"]`);
        if (postCard) {
            const likeBtn = postCard.querySelector('.like-btn');
            if (likeBtn) {
                const countSpan = likeBtn.querySelector('span');
                if (countSpan) {
                    countSpan.textContent = likeCount;
                }
            }
        }
    }

    /**
     * Handle post reposted event
     */
    handlePostReposted(data) {
        console.log('🔄 Post reposted:', data);

        const { postId, userId, repostCount } = data;

        // Update repost count in UI
        const postCard = document.querySelector(`[data-post-id="${postId}"]`);
        if (postCard) {
            const repostBtn = postCard.querySelector('.repost-btn');
            if (repostBtn) {
                const countSpan = repostBtn.querySelector('span');
                if (countSpan) {
                    countSpan.textContent = repostCount;
                }
            }
        }
    }

    /**
     * Handle post commented event
     */
    handlePostCommented(data) {
        console.log('💬 Post commented:', data);

        const { postId, userId, commentCount } = data;

        // Update comment count in UI
        const postCard = document.querySelector(`[data-post-id="${postId}"]`);
        if (postCard) {
            const commentBtn = postCard.querySelector('.comment-btn');
            if (commentBtn) {
                const countSpan = commentBtn.querySelector('span');
                if (countSpan) {
                    countSpan.textContent = commentCount;
                }
            }
        }
    }

    /**
     * Handle post deleted event
     */
    handlePostDeleted(data) {
        console.log('🗑️ Post deleted:', data);

        const { postId } = data;

        // Remove post from UI
        const postCard = document.querySelector(`[data-post-id="${postId}"]`);
        if (postCard) {
            postCard.style.transition = 'opacity 0.3s ease';
            postCard.style.opacity = '0';

            setTimeout(() => {
                postCard.remove();
            }, 300);
        }
    }

    /**
     * Handle post updated event
     */
    handlePostUpdated(post) {
        console.log('✏️ Post updated:', post);

        const { id, content } = post;

        // Update post content in UI
        const postCard = document.querySelector(`[data-post-id="${id}"]`);
        if (postCard) {
            const contentDiv = postCard.querySelector('.post-content');
            if (contentDiv && window.timelineUI) {
                contentDiv.innerHTML = window.timelineUI.formatPostContent(content);
            }
        }
    }

    /**
     * Handle notification
     */
    handleNotification(notification) {
        console.log('🔔 Notification received:', notification);

        // Update notification badge
        const badge = document.getElementById('notificationsBadge');
        if (badge) {
            const currentCount = parseInt(badge.textContent) || 0;
            badge.textContent = currentCount + 1;

            if (currentCount === 0) {
                badge.style.display = 'flex';
            }
        }

        // Show toast notification
        if (window.timelineUI) {
            const message = this.formatNotificationMessage(notification);
            window.timelineUI.showSuccess(message);
        }
    }

    /**
     * Format notification message
     */
    formatNotificationMessage(notification) {
        const { type, data } = notification;

        switch (type) {
            case 'like':
                return `${data.userName} liked your post`;
            case 'repost':
                return `${data.userName} reposted your post`;
            case 'comment':
                return `${data.userName} commented on your post`;
            case 'follow':
                return `${data.userName} started following you`;
            default:
                return 'New notification';
        }
    }

    /**
     * Handle trending update
     */
    handleTrendingUpdate(data) {
        console.log('🔥 Trending topics updated:', data);

        // Update trending topics widget
        if (window.timelineUI) {
            window.timelineUI.loadTrendingTopics();
        }
    }

    /**
     * Handle user online
     */
    handleUserOnline(data) {
        console.log('👤 User online:', data.userId);
        // Could update user presence indicators
    }

    /**
     * Handle user offline
     */
    handleUserOffline(data) {
        console.log('👤 User offline:', data.userId);
        // Could update user presence indicators
    }

    /**
     * Emit custom event
     */
    emit(event, data) {
        if (this.socket && this.isConnected) {
            this.socket.emit(event, data);
        } else {
            console.warn('Socket not connected. Event not sent:', event);
        }
    }

    /**
     * Join a specific channel
     */
    joinChannel(channel) {
        this.emit('join_channel', { channel });
    }

    /**
     * Leave a specific channel
     */
    leaveChannel(channel) {
        this.emit('leave_channel', { channel });
    }

    /**
     * Disconnect socket
     */
    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
        }
    }
}

// Initialize Socket.IO when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.timelineSocket = new TimelineSocket();
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (window.timelineSocket) {
        window.timelineSocket.disconnect();
    }
});
