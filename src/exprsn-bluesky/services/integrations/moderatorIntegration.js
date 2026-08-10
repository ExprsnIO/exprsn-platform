const { serviceRequest } = require('@exprsn/shared');
const { logger } = require('@exprsn/shared');

const MODERATOR_SERVICE_URL = process.env.MODERATOR_SERVICE_URL || 'http://localhost:3006';

class ModeratorIntegration {
  async moderateContent(content, type = 'text') {
    try {
      const response = await serviceRequest({
        method: 'POST',
        url: `${MODERATOR_SERVICE_URL}/api/moderate`,
        data: {
          content,
          type,
          source: 'bluesky'
        },
        serviceName: 'exprsn-bluesky',
        resource: `${MODERATOR_SERVICE_URL}/api/moderate/*`,
        permissions: { write: true }
      });

      return response.data;
    } catch (error) {
      logger.error('Failed to moderate content', {
        error: error.message,
        type
      });
      throw error;
    }
  }

  async reportContent(reportData) {
    try {
      const response = await serviceRequest({
        method: 'POST',
        url: `${MODERATOR_SERVICE_URL}/api/reports`,
        data: {
          ...reportData,
          source: 'bluesky'
        },
        serviceName: 'exprsn-bluesky',
        resource: `${MODERATOR_SERVICE_URL}/api/reports/*`,
        permissions: { write: true }
      });

      return response.data;
    } catch (error) {
      logger.error('Failed to submit report', {
        error: error.message
      });
      throw error;
    }
  }

  async checkLabel(did, label) {
    try {
      const response = await serviceRequest({
        method: 'GET',
        url: `${MODERATOR_SERVICE_URL}/api/labels/${did}/${label}`,
        serviceName: 'exprsn-bluesky',
        resource: `${MODERATOR_SERVICE_URL}/api/labels/*`,
        permissions: { read: true }
      });

      return response.data;
    } catch (error) {
      logger.error('Failed to check label', {
        error: error.message,
        did,
        label
      });
      return null;
    }
  }
}

module.exports = new ModeratorIntegration();
