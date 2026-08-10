/**
 * Exprsn BlueSky - Main JavaScript
 * AT Protocol Social Platform
 */

// ==========================================
// GLOBALS
// ==========================================
let socket = null;
let currentUser = null;

// ==========================================
// INITIALIZATION
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
    initializeTheme();
    initializeNotifications();
    initializeSocket();
});

function initializeApp() {
    // Fetch current user if logged in
    fetchCurrentUser();

    // Initialize tooltips
    const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
    tooltipTriggerList.map(el => new bootstrap.Tooltip(el));

    // Initialize popovers
    const popoverTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="popover"]'));
    popoverTriggerList.map(el => new bootstrap.Popover(el));

    // Setup global error handler
    window.addEventListener('error', (event) => {
        console.error('Global error:', event.error);
    });

    // Setup unhandled promise rejection handler
    window.addEventListener('unhandledrejection', (event) => {
        console.error('Unhandled promise rejection:', event.reason);
    });
}

async function fetchCurrentUser() {
    try {
        const response = await fetch('/api/auth/me');
        const data = await response.json();

        if (data.success) {
            currentUser = data.data.user;
        }
    } catch (error) {
        console.error('Failed to fetch current user:', error);
    }
}

// ==========================================
// THEME MANAGEMENT
// ==========================================
function initializeTheme() {
    const themeToggle = document.getElementById('themeToggle');
    if (!themeToggle) return;

    // Load saved theme
    const savedTheme = localStorage.getItem('theme') || 'light';
    setTheme(savedTheme);

    // Theme toggle click handler
    themeToggle.addEventListener('click', () => {
        const currentTheme = document.documentElement.getAttribute('data-bs-theme');
        const newTheme = currentTheme === 'light' ? 'dark' : 'light';
        setTheme(newTheme);
    });
}

function setTheme(theme) {
    document.documentElement.setAttribute('data-bs-theme', theme);
    localStorage.setItem('theme', theme);

    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
        const icon = themeToggle.querySelector('i');
        icon.className = theme === 'light' ? 'bi bi-moon-fill' : 'bi bi-sun-fill';
    }
}

// ==========================================
// NOTIFICATION SYSTEM
// ==========================================
function initializeNotifications() {
    // Request notification permission
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }

    // Load initial notification count
    updateNotificationBadge();
}

async function updateNotificationBadge() {
    try {
        const response = await fetch('/api/notifications/unread-count');
        const data = await response.json();

        if (data.success) {
            const count = data.data.count;
            updateBadge('notificationBadge', count);
            updateBadge('sidebarNotificationBadge', count);
            updateBadge('bottomNavNotificationBadge', count);
        }
    } catch (error) {
        console.error('Failed to update notification badge:', error);
    }
}

function updateBadge(badgeId, count) {
    const badge = document.getElementById(badgeId);
    if (!badge) return;

    if (count > 0) {
        badge.textContent = count > 99 ? '99+' : count;
        badge.style.display = 'inline';
    } else {
        badge.style.display = 'none';
    }
}

// ==========================================
// WEBSOCKET CONNECTION
// ==========================================
function initializeSocket() {
    if (typeof io === 'undefined') {
        console.warn('Socket.IO not loaded');
        return;
    }

    socket = io();

    socket.on('connect', () => {
        console.log('Socket connected');
    });

    socket.on('disconnect', () => {
        console.log('Socket disconnected');
    });

    // Notification events
    socket.on('notification:new', (data) => {
        showNotification(data);
        updateNotificationBadge();
    });

    // Post events
    socket.on('post:new', (data) => {
        // Reload feed if on home page
        if (typeof loadFeed === 'function') {
            // Don't auto-reload, show a banner instead
            showNewPostsBanner();
        }
    });

    // Message events
    socket.on('message:new', (data) => {
        updateMessageBadge();
        if (typeof handleNewMessage === 'function') {
            handleNewMessage(data);
        }
    });
}

async function updateMessageBadge() {
    try {
        const response = await fetch('/api/messages/unread-count');
        const data = await response.json();

        if (data.success) {
            const count = data.data.count;
            updateBadge('sidebarMessageBadge', count);
            updateBadge('bottomNavMessageBadge', count);
        }
    } catch (error) {
        console.error('Failed to update message badge:', error);
    }
}

function showNewPostsBanner() {
    const banner = document.createElement('div');
    banner.className = 'alert alert-info alert-dismissible fade show fixed-top m-3';
    banner.style.zIndex = '9999';
    banner.innerHTML = `
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        <i class="bi bi-arrow-clockwise me-2"></i>
        New posts available
        <button class="btn btn-sm btn-primary ms-3" onclick="location.reload()">Refresh</button>
    `;
    document.body.appendChild(banner);

    // Auto-dismiss after 10 seconds
    setTimeout(() => {
        banner.remove();
    }, 10000);
}

// ==========================================
// TOAST NOTIFICATIONS
// ==========================================
function showToast(message, type = 'info', duration = 3000) {
    const container = document.querySelector('.toast-container');
    if (!container) {
        console.error('Toast container not found');
        return;
    }

    const iconMap = {
        success: 'bi-check-circle-fill text-success',
        error: 'bi-x-circle-fill text-danger',
        warning: 'bi-exclamation-triangle-fill text-warning',
        info: 'bi-info-circle-fill text-info'
    };

    const toastId = 'toast-' + Date.now();
    const toastEl = document.createElement('div');
    toastEl.id = toastId;
    toastEl.className = 'toast';
    toastEl.setAttribute('role', 'alert');
    toastEl.setAttribute('aria-live', 'assertive');
    toastEl.setAttribute('aria-atomic', 'true');

    toastEl.innerHTML = `
        <div class="toast-header">
            <i class="bi ${iconMap[type] || iconMap.info} me-2"></i>
            <strong class="me-auto">${type.charAt(0).toUpperCase() + type.slice(1)}</strong>
            <button type="button" class="btn-close" data-bs-dismiss="toast"></button>
        </div>
        <div class="toast-body">${message}</div>
    `;

    container.appendChild(toastEl);

    const toast = new bootstrap.Toast(toastEl, { delay: duration });
    toast.show();

    // Remove from DOM after hiding
    toastEl.addEventListener('hidden.bs.toast', () => {
        toastEl.remove();
    });
}

function showNotification(notification) {
    showToast(notification.message, 'info');

    // Show browser notification if permission granted
    if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('Exprsn BlueSky', {
            body: notification.message,
            icon: '/images/logo.png'
        });
    }
}

// ==========================================
// POST INTERACTIONS
// ==========================================
async function toggleLike(postId) {
    try {
        const response = await fetch(`/api/posts/${postId}/like`, {
            method: 'POST'
        });

        const data = await response.json();

        if (data.success) {
            const postCard = document.querySelector(`[data-post-id="${postId}"]`);
            if (postCard) {
                const likeBtn = postCard.querySelector('.post-actions button:nth-child(3)');
                const icon = likeBtn.querySelector('i');
                const countSpan = likeBtn.querySelector('span');

                if (data.data.liked) {
                    icon.classList.remove('bi-heart');
                    icon.classList.add('bi-heart-fill');
                    likeBtn.classList.add('text-danger');
                } else {
                    icon.classList.remove('bi-heart-fill');
                    icon.classList.add('bi-heart');
                    likeBtn.classList.remove('text-danger');
                }

                if (countSpan) {
                    countSpan.textContent = formatCount(data.data.likeCount);
                } else if (data.data.likeCount > 0) {
                    const span = document.createElement('span');
                    span.className = 'small';
                    span.textContent = formatCount(data.data.likeCount);
                    likeBtn.appendChild(span);
                }
            }
        }
    } catch (error) {
        console.error('Failed to toggle like:', error);
        showToast('Failed to update like', 'error');
    }
}

async function toggleRepost(postId) {
    try {
        const response = await fetch(`/api/posts/${postId}/repost`, {
            method: 'POST'
        });

        const data = await response.json();

        if (data.success) {
            const postCard = document.querySelector(`[data-post-id="${postId}"]`);
            if (postCard) {
                const repostBtn = postCard.querySelector('.post-actions button:nth-child(2)');
                const icon = repostBtn.querySelector('i');
                const countSpan = repostBtn.querySelector('span');

                if (data.data.reposted) {
                    icon.classList.remove('bi-arrow-repeat');
                    icon.classList.add('bi-arrow-repeat-fill');
                    repostBtn.classList.add('text-success');
                    showToast('Post reposted', 'success');
                } else {
                    icon.classList.remove('bi-arrow-repeat-fill');
                    icon.classList.add('bi-arrow-repeat');
                    repostBtn.classList.remove('text-success');
                    showToast('Repost removed', 'info');
                }

                if (countSpan) {
                    countSpan.textContent = formatCount(data.data.repostCount);
                } else if (data.data.repostCount > 0) {
                    const span = document.createElement('span');
                    span.className = 'small';
                    span.textContent = formatCount(data.data.repostCount);
                    repostBtn.appendChild(span);
                }
            }
        }
    } catch (error) {
        console.error('Failed to toggle repost:', error);
        showToast('Failed to update repost', 'error');
    }
}

async function toggleBookmark(postId) {
    try {
        const response = await fetch(`/api/posts/${postId}/bookmark`, {
            method: 'POST'
        });

        const data = await response.json();

        if (data.success) {
            const postCard = document.querySelector(`[data-post-id="${postId}"]`);
            if (postCard) {
                const bookmarkBtn = postCard.querySelector('.post-actions button:last-child');
                const icon = bookmarkBtn.querySelector('i');

                if (data.data.bookmarked) {
                    icon.classList.remove('bi-bookmark');
                    icon.classList.add('bi-bookmark-fill');
                    bookmarkBtn.classList.add('text-primary');
                    showToast('Post bookmarked', 'success');
                } else {
                    icon.classList.remove('bi-bookmark-fill');
                    icon.classList.add('bi-bookmark');
                    bookmarkBtn.classList.remove('text-primary');
                    showToast('Bookmark removed', 'info');
                }
            }
        }
    } catch (error) {
        console.error('Failed to toggle bookmark:', error);
        showToast('Failed to update bookmark', 'error');
    }
}

function replyToPost(postId) {
    // Open create post modal with reply context
    const modal = new bootstrap.Modal(document.getElementById('createPostModal'));
    modal.show();
    // TODO: Set reply context
    showToast('Reply functionality coming soon', 'info');
}

function sharePost(postId) {
    const postUrl = `${window.location.origin}/post/${postId}`;

    if (navigator.share) {
        navigator.share({
            title: 'Share Post',
            url: postUrl
        }).catch(err => console.error('Share failed:', err));
    } else {
        // Fallback: copy to clipboard
        navigator.clipboard.writeText(postUrl).then(() => {
            showToast('Link copied to clipboard', 'success');
        }).catch(err => {
            console.error('Failed to copy:', err);
            showToast('Failed to copy link', 'error');
        });
    }
}

async function deletePost(postId) {
    if (!confirm('Are you sure you want to delete this post?')) return;

    try {
        const response = await fetch(`/api/posts/${postId}`, {
            method: 'DELETE'
        });

        const data = await response.json();

        if (data.success) {
            const postCard = document.querySelector(`[data-post-id="${postId}"]`);
            if (postCard) {
                postCard.remove();
            }
            showToast('Post deleted', 'success');
        }
    } catch (error) {
        console.error('Failed to delete post:', error);
        showToast('Failed to delete post', 'error');
    }
}

function copyPostLink(postId) {
    const postUrl = `${window.location.origin}/post/${postId}`;
    navigator.clipboard.writeText(postUrl).then(() => {
        showToast('Link copied to clipboard', 'success');
    }).catch(err => {
        console.error('Failed to copy:', err);
        showToast('Failed to copy link', 'error');
    });
}

// ==========================================
// USER INTERACTIONS
// ==========================================
async function followUser(handle) {
    try {
        const response = await fetch('/api/social/follow', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ handle })
        });

        const data = await response.json();

        if (data.success) {
            showToast('Now following @' + handle, 'success');
            // Update UI
            location.reload();
        }
    } catch (error) {
        console.error('Failed to follow user:', error);
        showToast('Failed to follow user', 'error');
    }
}

async function muteUser(handle) {
    if (!confirm(`Mute @${handle}? You won't see their posts in your feed.`)) return;

    try {
        const response = await fetch('/api/social/mute', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ handle })
        });

        const data = await response.json();

        if (data.success) {
            showToast('User muted', 'success');
        }
    } catch (error) {
        console.error('Failed to mute user:', error);
        showToast('Failed to mute user', 'error');
    }
}

async function blockUser(handle) {
    if (!confirm(`Block @${handle}? They won't be able to see your posts or interact with you.`)) return;

    try {
        const response = await fetch('/api/social/block', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ handle })
        });

        const data = await response.json();

        if (data.success) {
            showToast('User blocked', 'success');
        }
    } catch (error) {
        console.error('Failed to block user:', error);
        showToast('Failed to block user', 'error');
    }
}

function reportPost(postId) {
    showToast('Report functionality coming soon', 'info');
}

function reportUser(handle) {
    showToast('Report functionality coming soon', 'info');
}

// ==========================================
// UTILITY FUNCTIONS
// ==========================================
function formatCount(count) {
    if (!count || count === 0) return '';
    if (count < 1000) return count.toString();
    if (count < 1000000) return (count / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
    return (count / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
}

function formatTimestamp(timestamp) {
    if (!timestamp) return '';

    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;

    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (seconds < 60) return `${seconds}s`;
    if (minutes < 60) return `${minutes}m`;
    if (hours < 24) return `${hours}h`;
    if (days < 7) return `${days}d`;

    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function throttle(func, limit) {
    let inThrottle;
    return function(...args) {
        if (!inThrottle) {
            func.apply(this, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
}

// ==========================================
// POST RENDERING
// ==========================================
function renderPost(post) {
    // This is a simplified version - actual rendering should use the post-card partial
    return `
        <div class="card border-0 border-bottom rounded-0 post-card" data-post-id="${post.id || post.rkey}">
            <div class="card-body p-3">
                <div class="d-flex gap-3">
                    <img src="${post.author?.avatar || '/images/default-avatar.png'}"
                         alt="${post.author?.displayName || post.author?.handle}"
                         class="rounded-circle"
                         style="width: 48px; height: 48px; object-fit: cover;">
                    <div class="flex-grow-1">
                        <div class="fw-semibold">${post.author?.displayName || post.author?.handle}</div>
                        <div class="post-text mt-2">${escapeHtml(post.text || '')}</div>
                        <div class="d-flex gap-3 mt-3">
                            <button class="btn btn-sm btn-light" onclick="replyToPost('${post.id}')">
                                <i class="bi bi-chat"></i>
                            </button>
                            <button class="btn btn-sm btn-light" onclick="toggleRepost('${post.id}')">
                                <i class="bi bi-arrow-repeat"></i>
                            </button>
                            <button class="btn btn-sm btn-light" onclick="toggleLike('${post.id}')">
                                <i class="bi bi-heart"></i>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function renderPosts(posts) {
    const container = document.getElementById('feedPosts');
    if (!container) return;

    posts.forEach(post => {
        const postHtml = renderPost(post);
        container.insertAdjacentHTML('beforeend', postHtml);
    });
}

// ==========================================
// IMAGE VIEWER
// ==========================================
function openImageViewer(postId, imageIndex) {
    showToast('Image viewer coming soon', 'info');
    // TODO: Implement lightbox/gallery viewer
}

// ==========================================
// EXPORT
// ==========================================
window.ExprnBlueSky = {
    toggleLike,
    toggleRepost,
    toggleBookmark,
    replyToPost,
    sharePost,
    deletePost,
    copyPostLink,
    followUser,
    muteUser,
    blockUser,
    reportPost,
    reportUser,
    showToast,
    formatCount,
    formatTimestamp
};
