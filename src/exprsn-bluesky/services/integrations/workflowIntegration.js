const { serviceRequest } = require('@exprsn/shared');
const { logger } = require('@exprsn/shared');

const WORKFLOW_SERVICE_URL = process.env.WORKFLOW_SERVICE_URL || 'http://localhost:3017';

class WorkflowIntegration {
  async triggerWorkflow(workflowId, data) {
    try {
      const response = await serviceRequest({
        method: 'POST',
        url: `${WORKFLOW_SERVICE_URL}/api/workflows/${workflowId}/trigger`,
        data: {
          ...data,
          source: 'bluesky'
        },
        serviceName: 'exprsn-bluesky',
        resource: `${WORKFLOW_SERVICE_URL}/api/workflows/*`,
        permissions: { write: true }
      });

      return response.data;
    } catch (error) {
      logger.error('Failed to trigger workflow', {
        error: error.message,
        workflowId
      });
      throw error;
    }
  }

  async triggerEvent(eventType, data) {
    try {
      const response = await serviceRequest({
        method: 'POST',
        url: `${WORKFLOW_SERVICE_URL}/api/events/${eventType}`,
        data: {
          ...data,
          source: 'bluesky'
        },
        serviceName: 'exprsn-bluesky',
        resource: `${WORKFLOW_SERVICE_URL}/api/events/*`,
        permissions: { write: true }
      });

      return response.data;
    } catch (error) {
      logger.error('Failed to trigger workflow event', {
        error: error.message,
        eventType
      });
      // Don't throw - workflows are optional
      return null;
    }
  }

  async onPostCreated(postData) {
    return this.triggerEvent('bluesky.post.created', postData);
  }

  async onFollowCreated(followData) {
    return this.triggerEvent('bluesky.follow.created', followData);
  }

  async onAccountCreated(accountData) {
    return this.triggerEvent('bluesky.account.created', accountData);
  }
}

module.exports = new WorkflowIntegration();
