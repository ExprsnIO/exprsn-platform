/**
 * ═══════════════════════════════════════════════════════════════
 * Exprsn Timeline - UI Logic
 * ═══════════════════════════════════════════════════════════════
 * Handles all UI interactions and rendering
 */

class TimelineUI {
    constructor() {
        this.currentFeed = 'home';
        this.currentPage = 1;
        this.currentUserId = 'demo-user-id'; // Would come from auth
        this.posts = [];
        this.isLoading = false;

        this.init();
    }

    /**
     * Initialize UI
     */
    init() {
        this.setupEventListeners();
        this.loadInitialFeed();
        this.loadTrendingTopics();
        this.loadSuggestedUsers();
        this.setupTheme();
    }

    /**
     * Setup all event listeners
     */
    setupEventListeners() {
        // Compose button
        document.getElementById('composeBtn')?.addEventListener('click', () => this.showComposer());
        document.getElementById('closeComposer')?.addEventListener('click', () => this.hideComposer());

        // Post content
        const postContent = document.getElementById('postContent');
        postContent?.addEventListener('input', (e) => this.updateCharCount(e.target.value));

        // Publish button
        document.getElementById('publishBtn')?.addEventListener('click', () => this.publishPost());

        // Feed navigation
        document.querySelectorAll('.nav-item[data-feed]').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                this.switchFeed(item.dataset.feed);
            });
        });

        // Load more
        document.getElementById('loadMoreBtn')?.addEventListener('click', () => this.loadMore());

        // Theme toggle
        document.getElementById('themeToggle')?.addEventListener('click', () => this.toggleTheme());

        // User menu
        document.getElementById('userMenuBtn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleUserMenu();
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', () => this.closeUserMenu());

        // Modal
        document.getElementById('closeModal')?.addEventListener('click', () => this.closeModal());
        document.getElementById('modalOverlay')?.addEventListener('click', () => this.closeModal());

        // Search
        const searchInput = document.getElementById('searchInput');
        let searchTimeout;
        searchInput?.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => this.handleSearch(e.target.value), 500);
        });
    }

    /**
     * Load initial feed
     */
    async loadInitialFeed() {
        this.currentPage = 1;
        this.posts = [];
        await this.loadFeed();
    }

    /**
     * Load feed based on current settings
     */
    async loadFeed() {
        if (this.isLoading) return;

        this.isLoading = true;
        this.showLoading();

        try {
            let response;
            const options = { page: this.currentPage, limit: 20 };

            switch (this.currentFeed) {
                case 'home':
                    response = await api.getHomeFeed(options);
                    break;
                case 'global':
                    response = await api.getGlobalFeed(options);
                    break;
                case 'explore':
                    response = await api.getExploreFeed(options);
                    break;
                case 'trending':
                    response = await api.getTrendingFeed(options);
                    break;
                default:
                    response = await api.getHomeFeed(options);
            }

            if (this.currentPage === 1) {
                this.posts = response.posts || [];
                this.renderPosts();
            } else {
                this.posts.push(...(response.posts || []));
                this.appendPosts(response.posts || []);
            }

            this.showLoadMoreButton(response.pagination?.hasMore);
        } catch (error) {
            console.error('Failed to load feed:', error);
            this.showError('Failed to load posts. Please try again.');
        } finally {
            this.isLoading = false;
            this.hideLoading();
        }
    }

    /**
     * Switch to different feed
     */
    async switchFeed(feedType) {
        if (this.currentFeed === feedType) return;

        this.currentFeed = feedType;
        this.currentPage = 1;

        // Update navigation
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.toggle('active', item.dataset.feed === feedType);
        });

        // Update feed title
        const feedTitles = {
            home: 'Home Feed',
            global: 'Global Timeline',
            explore: 'Explore',
            trending: 'Trending Posts',
            bookmarks: 'Bookmarks',
            lists: 'Lists'
        };
        document.getElementById('feedTitle').textContent = feedTitles[feedType] || 'Timeline';

        await this.loadInitialFeed();
    }

    /**
     * Render all posts
     */
    renderPosts() {
        const feed = document.getElementById('postsFeed');
        if (!feed) return;

        if (this.posts.length === 0) {
            feed.innerHTML = this.getEmptyState();
            return;
        }

        feed.innerHTML = this.posts.map(post => this.renderPostCard(post)).join('');
        this.attachPostEventListeners();
    }

    /**
     * Append new posts to feed
     */
    appendPosts(posts) {
        const feed = document.getElementById('postsFeed');
        if (!feed) return;

        const html = posts.map(post => this.renderPostCard(post)).join('');
        feed.insertAdjacentHTML('beforeend', html);
        this.attachPostEventListeners();
    }

    /**
     * Render a single post card
     */
    renderPostCard(post) {
        const timeAgo = this.getTimeAgo(post.createdAt);
        const isLiked = post.userLiked || false;
        const isReposted = post.userReposted || false;
        const isBookmarked = post.userBookmarked || false;

        return `
            <article class="post-card" data-post-id="${post.id}">
                <div class="post-header">
                    <div class="post-avatar">
                        <i class="fas fa-user-circle"></i>
                    </div>
                    <div class="post-meta">
                        <div class="post-author">
                            <span class="author-name">${this.escapeHtml(post.authorName || 'Anonymous')}</span>
                            <span class="author-username">@${this.escapeHtml(post.authorUsername || 'user')}</span>
                            <span class="post-timestamp">${timeAgo}</span>
                        </div>
                    </div>
                </div>
                <div class="post-content">
                    ${this.formatPostContent(post.content)}
                </div>
                <div class="post-actions">
                    <button class="action-btn comment-btn" data-action="comment" data-post-id="${post.id}">
                        <i class="far fa-comment"></i>
                        <span>${post.commentCount || 0}</span>
                    </button>
                    <button class="action-btn repost-btn ${isReposted ? 'reposted' : ''}" data-action="repost" data-post-id="${post.id}">
                        <i class="fas fa-retweet"></i>
                        <span>${post.repostCount || 0}</span>
                    </button>
                    <button class="action-btn like-btn ${isLiked ? 'liked' : ''}" data-action="like" data-post-id="${post.id}">
                        <i class="${isLiked ? 'fas' : 'far'} fa-heart"></i>
                        <span>${post.likeCount || 0}</span>
                    </button>
                    <button class="action-btn bookmark-btn ${isBookmarked ? 'bookmarked' : ''}" data-action="bookmark" data-post-id="${post.id}">
                        <i class="${isBookmarked ? 'fas' : 'far'} fa-bookmark"></i>
                    </button>
                </div>
            </article>
        `;
    }

    /**
     * Attach event listeners to post actions
     */
    attachPostEventListeners() {
        // Post card clicks (open modal)
        document.querySelectorAll('.post-card').forEach(card => {
            card.addEventListener('click', (e) => {
                if (!e.target.closest('.action-btn')) {
                    this.openPostModal(card.dataset.postId);
                }
            });
        });

        // Action buttons
        document.querySelectorAll('.action-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const action = btn.dataset.action;
                const postId = btn.dataset.postId;
                await this.handlePostAction(action, postId, btn);
            });
        });
    }

    /**
     * Handle post actions (like, repost, etc.)
     */
    async handlePostAction(action, postId, button) {
        try {
            switch (action) {
                case 'like':
                    await this.toggleLike(postId, button);
                    break;
                case 'repost':
                    await this.toggleRepost(postId, button);
                    break;
                case 'bookmark':
                    await this.toggleBookmark(postId, button);
                    break;
                case 'comment':
                    this.openCommentModal(postId);
                    break;
            }
        } catch (error) {
            console.error(`Failed to ${action} post:`, error);
            this.showError(`Failed to ${action} post`);
        }
    }

    /**
     * Toggle like on post
     */
    async toggleLike(postId, button) {
        const isLiked = button.classList.contains('liked');
        const countSpan = button.querySelector('span');
        const icon = button.querySelector('i');

        try {
            if (isLiked) {
                await api.unlikePost(postId);
                button.classList.remove('liked');
                icon.classList.replace('fas', 'far');
                countSpan.textContent = parseInt(countSpan.textContent) - 1;
            } else {
                await api.likePost(postId);
                button.classList.add('liked');
                icon.classList.replace('far', 'fas');
                countSpan.textContent = parseInt(countSpan.textContent) + 1;
            }
        } catch (error) {
            throw error;
        }
    }

    /**
     * Toggle repost
     */
    async toggleRepost(postId, button) {
        const isReposted = button.classList.contains('reposted');
        const countSpan = button.querySelector('span');

        try {
            if (isReposted) {
                await api.undoRepost(postId);
                button.classList.remove('reposted');
                countSpan.textContent = parseInt(countSpan.textContent) - 1;
            } else {
                await api.repostPost(postId);
                button.classList.add('reposted');
                countSpan.textContent = parseInt(countSpan.textContent) + 1;
            }
        } catch (error) {
            throw error;
        }
    }

    /**
     * Toggle bookmark
     */
    async toggleBookmark(postId, button) {
        const isBookmarked = button.classList.contains('bookmarked');
        const icon = button.querySelector('i');

        try {
            if (isBookmarked) {
                await api.removeBookmark(postId);
                button.classList.remove('bookmarked');
                icon.classList.replace('fas', 'far');
            } else {
                await api.bookmarkPost(postId);
                button.classList.add('bookmarked');
                icon.classList.replace('far', 'fas');
            }
        } catch (error) {
            throw error;
        }
    }

    /**
     * Show post composer
     */
    showComposer() {
        const composer = document.getElementById('postComposer');
        if (composer) {
            composer.style.display = 'block';
            document.getElementById('postContent').focus();
        }
    }

    /**
     * Hide post composer
     */
    hideComposer() {
        const composer = document.getElementById('postComposer');
        if (composer) {
            composer.style.display = 'none';
            document.getElementById('postContent').value = '';
            this.updateCharCount('');
        }
    }

    /**
     * Update character count
     */
    updateCharCount(content) {
        const charCount = document.getElementById('charCount');
        const publishBtn = document.getElementById('publishBtn');

        if (charCount) {
            charCount.textContent = content.length;
        }

        if (publishBtn) {
            publishBtn.disabled = content.trim().length === 0 || content.length > 500;
        }
    }

    /**
     * Publish new post
     */
    async publishPost() {
        const content = document.getElementById('postContent').value.trim();
        const visibility = document.getElementById('visibilitySelect').value;

        if (!content) return;

        try {
            const response = await api.createPost({ content, visibility });
            this.hideComposer();
            this.showSuccess('Post published successfully!');

            // Add new post to feed
            if (this.currentFeed === 'home') {
                this.posts.unshift(response.post);
                this.renderPosts();
            }
        } catch (error) {
            console.error('Failed to publish post:', error);
            this.showError('Failed to publish post. Please try again.');
        }
    }

    /**
     * Load more posts
     */
    async loadMore() {
        this.currentPage++;
        await this.loadFeed();
    }

    /**
     * Open post details modal
     */
    async openPostModal(postId) {
        try {
            const response = await api.getPost(postId);
            const post = response.post;

            const modalBody = document.getElementById('modalBody');
            if (modalBody) {
                modalBody.innerHTML = this.renderPostDetail(post);
            }

            const modal = document.getElementById('postModal');
            if (modal) {
                modal.classList.add('show');
            }
        } catch (error) {
            console.error('Failed to load post:', error);
            this.showError('Failed to load post details');
        }
    }

    /**
     * Close modal
     */
    closeModal() {
        const modal = document.getElementById('postModal');
        if (modal) {
            modal.classList.remove('show');
        }
    }

    /**
     * Render post detail view
     */
    renderPostDetail(post) {
        return `
            <div class="post-detail">
                ${this.renderPostCard(post)}
                <div class="comments-section">
                    <h4>Comments</h4>
                    <!-- Comments would be loaded here -->
                </div>
            </div>
        `;
    }

    /**
     * Load trending topics
     */
    async loadTrendingTopics() {
        const container = document.getElementById('trendingTopics');
        if (!container) return;

        // Mock data for demo
        const topics = [
            { topic: '#Technology', count: 1234 },
            { topic: '#News', count: 892 },
            { topic: '#Sports', count: 654 },
            { topic: '#Entertainment', count: 432 }
        ];

        container.innerHTML = topics.map(item => `
            <div class="trending-item">
                <div class="trending-topic">${item.topic}</div>
                <div class="trending-count">${this.formatNumber(item.count)} posts</div>
            </div>
        `).join('');
    }

    /**
     * Load suggested users
     */
    async loadSuggestedUsers() {
        const container = document.getElementById('suggestedUsers');
        if (!container) return;

        // Mock data for demo
        const users = [
            { name: 'John Doe', username: 'johndoe' },
            { name: 'Jane Smith', username: 'janesmith' },
            { name: 'Bob Johnson', username: 'bobjohnson' }
        ];

        container.innerHTML = users.map(user => `
            <div class="suggestion-item">
                <div class="post-avatar">
                    <i class="fas fa-user-circle"></i>
                </div>
                <div>
                    <div class="author-name">${user.name}</div>
                    <div class="author-username">@${user.username}</div>
                </div>
            </div>
        `).join('');
    }

    /**
     * Handle search
     */
    async handleSearch(query) {
        if (!query.trim()) return;

        try {
            const response = await api.searchPosts({ query });
            this.posts = response.posts || [];
            this.renderPosts();
            document.getElementById('feedTitle').textContent = `Search: ${query}`;
        } catch (error) {
            console.error('Search failed:', error);
        }
    }

    /**
     * Theme management
     */
    setupTheme() {
        const savedTheme = localStorage.getItem('theme') || 'light';
        document.documentElement.setAttribute('data-theme', savedTheme);
        this.updateThemeIcon(savedTheme);
    }

    toggleTheme() {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'light' ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        this.updateThemeIcon(newTheme);
    }

    updateThemeIcon(theme) {
        const icon = document.querySelector('#themeToggle i');
        if (icon) {
            icon.className = theme === 'light' ? 'fas fa-moon' : 'fas fa-sun';
        }
    }

    /**
     * User menu toggle
     */
    toggleUserMenu() {
        const dropdown = document.getElementById('userDropdown');
        if (dropdown) {
            dropdown.classList.toggle('show');
        }
    }

    closeUserMenu() {
        const dropdown = document.getElementById('userDropdown');
        if (dropdown) {
            dropdown.classList.remove('show');
        }
    }

    /**
     * UI State Management
     */
    showLoading() {
        const indicator = document.getElementById('loadingIndicator');
        if (indicator) {
            indicator.style.display = 'flex';
        }
    }

    hideLoading() {
        const indicator = document.getElementById('loadingIndicator');
        if (indicator) {
            indicator.style.display = 'none';
        }
    }

    showLoadMoreButton(hasMore) {
        const container = document.getElementById('loadMoreContainer');
        if (container) {
            container.style.display = hasMore ? 'block' : 'none';
        }
    }

    /**
     * Notifications
     */
    showSuccess(message) {
        this.showToast(message, 'success');
    }

    showError(message) {
        this.showToast(message, 'error');
    }

    showToast(message, type = 'info') {
        const container = document.getElementById('toastContainer');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;

        container.appendChild(toast);

        setTimeout(() => {
            toast.remove();
        }, 3000);
    }

    /**
     * Utility functions
     */
    getEmptyState() {
        return `
            <div class="empty-state">
                <i class="fas fa-inbox"></i>
                <h3>No posts yet</h3>
                <p>Be the first to share something!</p>
            </div>
        `;
    }

    formatPostContent(content) {
        // Basic formatting: links, mentions, hashtags
        return this.escapeHtml(content)
            .replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank">$1</a>')
            .replace(/@(\w+)/g, '<a href="/user/$1">@$1</a>')
            .replace(/#(\w+)/g, '<a href="/hashtag/$1">#$1</a>');
    }

    getTimeAgo(timestamp) {
        const now = Date.now();
        const then = new Date(timestamp).getTime();
        const diff = now - then;

        const seconds = Math.floor(diff / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (days > 0) return `${days}d`;
        if (hours > 0) return `${hours}h`;
        if (minutes > 0) return `${minutes}m`;
        return `${seconds}s`;
    }

    formatNumber(num) {
        if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
        if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
        return num.toString();
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Initialize UI when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.timelineUI = new TimelineUI();
});
