/**
 * ═══════════════════════════════════════════════════════════════
 * Exprsn Timeline - API Client
 * ═══════════════════════════════════════════════════════════════
 * Handles all API communication with the Timeline service
 */

class TimelineAPI {
    constructor() {
        this.baseURL = window.location.origin;
        this.token = localStorage.getItem('exprsn_token') || 'demo-token';
    }

    /**
     * Make API request with authentication
     */
    async request(endpoint, options = {}) {
        const url = `${this.baseURL}${endpoint}`;
        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.token}`,
            ...options.headers
        };

        try {
            const response = await fetch(url, {
                ...options,
                headers
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || data.error || 'Request failed');
            }

            return data;
        } catch (error) {
            console.error('API request failed:', error);
            throw error;
        }
    }

    // ═══════════════════════════════════════════════════════════
    // Posts API
    // ═══════════════════════════════════════════════════════════

    /**
     * Create a new post
     */
    async createPost({ content, visibility = 'public', mediaIds = [], replyTo = null, quoteOf = null }) {
        return this.request('/api/posts', {
            method: 'POST',
            body: JSON.stringify({
                content,
                visibility,
                mediaIds,
                replyTo,
                quoteOf
            })
        });
    }

    /**
     * Get a single post by ID
     */
    async getPost(postId) {
        return this.request(`/api/posts/${postId}`);
    }

    /**
     * Update a post
     */
    async updatePost(postId, { content }) {
        return this.request(`/api/posts/${postId}`, {
            method: 'PUT',
            body: JSON.stringify({ content })
        });
    }

    /**
     * Delete a post
     */
    async deletePost(postId) {
        return this.request(`/api/posts/${postId}`, {
            method: 'DELETE'
        });
    }

    // ═══════════════════════════════════════════════════════════
    // Timeline/Feed API
    // ═══════════════════════════════════════════════════════════

    /**
     * Get home timeline feed
     */
    async getHomeFeed({ page = 1, limit = 20 } = {}) {
        return this.request(`/api/timeline?page=${page}&limit=${limit}`);
    }

    /**
     * Get global public timeline
     */
    async getGlobalFeed({ page = 1, limit = 20 } = {}) {
        return this.request(`/api/timeline/global?page=${page}&limit=${limit}`);
    }

    /**
     * Get explore/discovery feed
     */
    async getExploreFeed({ page = 1, limit = 20 } = {}) {
        return this.request(`/api/timeline/explore?page=${page}&limit=${limit}`);
    }

    /**
     * Get trending posts
     */
    async getTrendingFeed({ page = 1, limit = 20 } = {}) {
        return this.request(`/api/timeline/trending?page=${page}&limit=${limit}`);
    }

    /**
     * Get user's own posts
     */
    async getUserPosts(userId, { page = 1, limit = 20 } = {}) {
        return this.request(`/api/timeline/user/${userId}?page=${page}&limit=${limit}`);
    }

    // ═══════════════════════════════════════════════════════════
    // Interactions API
    // ═══════════════════════════════════════════════════════════

    /**
     * Like a post
     */
    async likePost(postId) {
        return this.request(`/api/interactions/${postId}/like`, {
            method: 'POST'
        });
    }

    /**
     * Unlike a post
     */
    async unlikePost(postId) {
        return this.request(`/api/interactions/${postId}/like`, {
            method: 'DELETE'
        });
    }

    /**
     * Repost a post
     */
    async repostPost(postId) {
        return this.request(`/api/interactions/${postId}/repost`, {
            method: 'POST'
        });
    }

    /**
     * Undo repost
     */
    async undoRepost(postId) {
        return this.request(`/api/interactions/${postId}/repost`, {
            method: 'DELETE'
        });
    }

    /**
     * Bookmark a post
     */
    async bookmarkPost(postId) {
        return this.request(`/api/interactions/${postId}/bookmark`, {
            method: 'POST'
        });
    }

    /**
     * Remove bookmark
     */
    async removeBookmark(postId) {
        return this.request(`/api/interactions/${postId}/bookmark`, {
            method: 'DELETE'
        });
    }

    /**
     * Add comment to post
     */
    async commentPost(postId, { content }) {
        return this.request(`/api/interactions/${postId}/comment`, {
            method: 'POST',
            body: JSON.stringify({ content })
        });
    }

    // ═══════════════════════════════════════════════════════════
    // Lists API
    // ═══════════════════════════════════════════════════════════

    /**
     * Get user's lists
     */
    async getLists() {
        return this.request('/api/lists');
    }

    /**
     * Create a new list
     */
    async createList({ name, description, isPrivate = false }) {
        return this.request('/api/lists', {
            method: 'POST',
            body: JSON.stringify({ name, description, isPrivate })
        });
    }

    /**
     * Get posts from a list
     */
    async getListPosts(listId, { page = 1, limit = 20 } = {}) {
        return this.request(`/api/lists/${listId}/posts?page=${page}&limit=${limit}`);
    }

    /**
     * Add user to list
     */
    async addToList(listId, userId) {
        return this.request(`/api/lists/${listId}/members`, {
            method: 'POST',
            body: JSON.stringify({ userId })
        });
    }

    /**
     * Remove user from list
     */
    async removeFromList(listId, userId) {
        return this.request(`/api/lists/${listId}/members/${userId}`, {
            method: 'DELETE'
        });
    }

    // ═══════════════════════════════════════════════════════════
    // Search API
    // ═══════════════════════════════════════════════════════════

    /**
     * Search posts
     */
    async searchPosts({ query, page = 1, limit = 20 } = {}) {
        return this.request(`/api/search/posts?q=${encodeURIComponent(query)}&page=${page}&limit=${limit}`);
    }

    /**
     * Search users
     */
    async searchUsers({ query, page = 1, limit = 20 } = {}) {
        return this.request(`/api/search/users?q=${encodeURIComponent(query)}&page=${page}&limit=${limit}`);
    }

    /**
     * Search hashtags
     */
    async searchHashtags({ query, page = 1, limit = 20 } = {}) {
        return this.request(`/api/search/hashtags?q=${encodeURIComponent(query)}&page=${page}&limit=${limit}`);
    }

    // ═══════════════════════════════════════════════════════════
    // Job Monitoring API
    // ═══════════════════════════════════════════════════════════

    /**
     * Get job queue stats
     */
    async getJobStats() {
        return this.request('/api/jobs/stats');
    }

    /**
     * Get active jobs
     */
    async getActiveJobs() {
        return this.request('/api/jobs/active');
    }

    /**
     * Get failed jobs
     */
    async getFailedJobs() {
        return this.request('/api/jobs/failed');
    }

    // ═══════════════════════════════════════════════════════════
    // Health API
    // ═══════════════════════════════════════════════════════════

    /**
     * Get service health
     */
    async getHealth() {
        return this.request('/health');
    }
}

// Export singleton instance
const api = new TimelineAPI();
