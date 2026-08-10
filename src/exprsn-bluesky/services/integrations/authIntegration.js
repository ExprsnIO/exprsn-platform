const { serviceRequest } = require('@exprsn/shared');
const { logger } = require('@exprsn/shared');

const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || 'http://localhost:3001';

class AuthIntegration {
  async createUser(userData) {
    try {
      const response = await serviceRequest({
        method: 'POST',
        url: `${AUTH_SERVICE_URL}/api/users`,
        data: userData,
        serviceName: 'exprsn-bluesky',
        resource: `${AUTH_SERVICE_URL}/api/users/*`,
        permissions: { write: true }
      });

      return response.data;
    } catch (error) {
      logger.error('Failed to create user in auth service', {
        error: error.message
      });
      throw error;
    }
  }

  async getUser(userId) {
    try {
      const response = await serviceRequest({
        method: 'GET',
        url: `${AUTH_SERVICE_URL}/api/users/${userId}`,
        serviceName: 'exprsn-bluesky',
        resource: `${AUTH_SERVICE_URL}/api/users/*`,
        permissions: { read: true }
      });

      return response.data;
    } catch (error) {
      logger.error('Failed to get user from auth service', {
        error: error.message,
        userId
      });
      throw error;
    }
  }

  async updateUser(userId, updates) {
    try {
      const response = await serviceRequest({
        method: 'PUT',
        url: `${AUTH_SERVICE_URL}/api/users/${userId}`,
        data: updates,
        serviceName: 'exprsn-bluesky',
        resource: `${AUTH_SERVICE_URL}/api/users/*`,
        permissions: { update: true }
      });

      return response.data;
    } catch (error) {
      logger.error('Failed to update user in auth service', {
        error: error.message,
        userId
      });
      throw error;
    }
  }

  async validateToken(token) {
    try {
      const response = await serviceRequest({
        method: 'POST',
        url: `${AUTH_SERVICE_URL}/api/auth/validate`,
        data: { token },
        serviceName: 'exprsn-bluesky',
        resource: `${AUTH_SERVICE_URL}/api/auth/*`,
        permissions: { read: true }
      });

      return response.data;
    } catch (error) {
      logger.error('Failed to validate token', {
        error: error.message
      });
      return null;
    }
  }
}

module.exports = new AuthIntegration();
