const { serviceRequest } = require('@exprsn/shared');
const { logger } = require('@exprsn/shared');

const TIMELINE_SERVICE_URL = process.env.TIMELINE_SERVICE_URL || 'http://localhost:3004';

class TimelineIntegration {
  async createPost(postData) {
    try {
      const response = await serviceRequest({
        method: 'POST',
        url: `${TIMELINE_SERVICE_URL}/api/posts`,
        data: {
          ...postData,
          source: 'bluesky'
        },
        serviceName: 'exprsn-bluesky',
        resource: `${TIMELINE_SERVICE_URL}/api/posts/*`,
        permissions: { write: true }
      });

      return response.data;
    } catch (error) {
      logger.error('Failed to create post in timeline', {
        error: error.message
      });
      throw error;
    }
  }

  async updatePost(postId, updates) {
    try {
      const response = await serviceRequest({
        method: 'PUT',
        url: `${TIMELINE_SERVICE_URL}/api/posts/${postId}`,
        data: updates,
        serviceName: 'exprsn-bluesky',
        resource: `${TIMELINE_SERVICE_URL}/api/posts/*`,
        permissions: { update: true }
      });

      return response.data;
    } catch (error) {
      logger.error('Failed to update post in timeline', {
        error: error.message,
        postId
      });
      throw error;
    }
  }

  async deletePost(postId) {
    try {
      const response = await serviceRequest({
        method: 'DELETE',
        url: `${TIMELINE_SERVICE_URL}/api/posts/${postId}`,
        serviceName: 'exprsn-bluesky',
        resource: `${TIMELINE_SERVICE_URL}/api/posts/*`,
        permissions: { delete: true }
      });

      return response.data;
    } catch (error) {
      logger.error('Failed to delete post in timeline', {
        error: error.message,
        postId
      });
      throw error;
    }
  }

  async getTimeline(userId, options = {}) {
    try {
      const response = await serviceRequest({
        method: 'GET',
        url: `${TIMELINE_SERVICE_URL}/api/timeline/${userId}`,
        params: options,
        serviceName: 'exprsn-bluesky',
        resource: `${TIMELINE_SERVICE_URL}/api/timeline/*`,
        permissions: { read: true }
      });

      return response.data;
    } catch (error) {
      logger.error('Failed to get timeline', {
        error: error.message,
        userId
      });
      throw error;
    }
  }
}

module.exports = new TimelineIntegration();
