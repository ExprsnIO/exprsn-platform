const { serviceRequest } = require('@exprsn/shared');
const { logger } = require('@exprsn/shared');

const SPARK_SERVICE_URL = process.env.SPARK_SERVICE_URL || 'http://localhost:3002';

class SparkIntegration {
  async sendMessage(messageData) {
    try {
      const response = await serviceRequest({
        method: 'POST',
        url: `${SPARK_SERVICE_URL}/api/messages`,
        data: {
          ...messageData,
          source: 'bluesky'
        },
        serviceName: 'exprsn-bluesky',
        resource: `${SPARK_SERVICE_URL}/api/messages/*`,
        permissions: { write: true }
      });

      return response.data;
    } catch (error) {
      logger.error('Failed to send message via Spark', {
        error: error.message
      });
      throw error;
    }
  }

  async getConversation(conversationId) {
    try {
      const response = await serviceRequest({
        method: 'GET',
        url: `${SPARK_SERVICE_URL}/api/conversations/${conversationId}`,
        serviceName: 'exprsn-bluesky',
        resource: `${SPARK_SERVICE_URL}/api/conversations/*`,
        permissions: { read: true }
      });

      return response.data;
    } catch (error) {
      logger.error('Failed to get conversation from Spark', {
        error: error.message,
        conversationId
      });
      throw error;
    }
  }

  async createConversation(participants) {
    try {
      const response = await serviceRequest({
        method: 'POST',
        url: `${SPARK_SERVICE_URL}/api/conversations`,
        data: {
          participants,
          source: 'bluesky'
        },
        serviceName: 'exprsn-bluesky',
        resource: `${SPARK_SERVICE_URL}/api/conversations/*`,
        permissions: { write: true }
      });

      return response.data;
    } catch (error) {
      logger.error('Failed to create conversation in Spark', {
        error: error.message
      });
      throw error;
    }
  }
}

module.exports = new SparkIntegration();
