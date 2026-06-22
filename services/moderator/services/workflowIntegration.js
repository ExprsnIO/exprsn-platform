/**
 * ═══════════════════════════════════════════════════════════
 * Workflow Service Integration
 * Handles communication with Exprsn Workflow service for
 * automated moderation workflows
 * ═══════════════════════════════════════════════════════════
 */

const axios = require('axios');
const logger = require('../src/utils/logger');

const WORKFLOW_SERVICE_URL = process.env.WORKFLOW_SERVICE_URL || 'http://localhost:3017';

class WorkflowIntegrationService {
  /**
   * Trigger content moderation workflow
   * @param {Object} content - Content to moderate
   * @param {Object} context - Additional context
   * @returns {Promise<Object>} Workflow execution result
   */
  async triggerModerationWorkflow(content, context = {}) {
    try {
      logger.info('Triggering moderation workflow', {
        contentId: content.id,
        contentType: content.type
      });

      const response = await axios.post(
        `${WORKFLOW_SERVICE_URL}/api/workflows/trigger/content-moderation`,
        {
          trigger: {
            type: 'content_submitted',
            data: {
              contentId: content.id,
              contentType: content.type,
              content: content.text || content.body,
              authorId: content.authorId,
              metadata: content.metadata || {},
              ...context
            }
          }
        },
        {
          headers: this._getHeaders(),
          timeout: 30000
        }
      );

      logger.info('Moderation workflow triggered', {
        executionId: response.data.executionId,
        workflowId: response.data.workflowId
      });

      return {
        success: true,
        executionId: response.data.executionId,
        workflowId: response.data.workflowId
      };

    } catch (error) {
      logger.error('Failed to trigger moderation workflow', {
        error: error.message,
        contentId: content.id
      });

      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get workflow execution status
   * @param {string} executionId - Workflow execution ID
   * @returns {Promise<Object>} Execution status
   */
  async getExecutionStatus(executionId) {
    try {
      const response = await axios.get(
        `${WORKFLOW_SERVICE_URL}/api/executions/${executionId}`,
        {
          headers: this._getHeaders(),
          timeout: 10000
        }
      );

      return {
        success: true,
        execution: response.data
      };

    } catch (error) {
      logger.error('Failed to get execution status', {
        error: error.message,
        executionId
      });

      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * List active moderation workflows
   * @returns {Promise<Array>} Active workflows
   */
  async listActiveWorkflows() {
    try {
      const response = await axios.get(
        `${WORKFLOW_SERVICE_URL}/api/workflows`,
        {
          params: {
            enabled: true,
            tags: 'moderation'
          },
          headers: this._getHeaders(),
          timeout: 10000
        }
      );

      return response.data.workflows || [];

    } catch (error) {
      logger.error('Failed to list workflows', { error: error.message });
      return [];
    }
  }

  /**
   * Create a moderation workflow
   * @param {Object} workflow - Workflow definition
   * @returns {Promise<Object>} Created workflow
   */
  async createWorkflow(workflow) {
    try {
      const response = await axios.post(
        `${WORKFLOW_SERVICE_URL}/api/workflows`,
        {
          name: workflow.name,
          description: workflow.description,
          trigger: workflow.trigger || {
            type: 'manual',
            event: 'content_submitted'
          },
          steps: workflow.steps,
          enabled: workflow.enabled !== false,
          tags: ['moderation', ...(workflow.tags || [])]
        },
        {
          headers: this._getHeaders(),
          timeout: 15000
        }
      );

      logger.info('Workflow created', {
        workflowId: response.data.id,
        name: workflow.name
      });

      return {
        success: true,
        workflow: response.data
      };

    } catch (error) {
      logger.error('Failed to create workflow', {
        error: error.message,
        name: workflow.name
      });

      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Update a workflow
   * @param {string} workflowId - Workflow ID
   * @param {Object} updates - Updates to apply
   * @returns {Promise<Object>} Updated workflow
   */
  async updateWorkflow(workflowId, updates) {
    try {
      const response = await axios.put(
        `${WORKFLOW_SERVICE_URL}/api/workflows/${workflowId}`,
        updates,
        {
          headers: this._getHeaders(),
          timeout: 15000
        }
      );

      logger.info('Workflow updated', { workflowId });

      return {
        success: true,
        workflow: response.data
      };

    } catch (error) {
      logger.error('Failed to update workflow', {
        error: error.message,
        workflowId
      });

      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Delete a workflow
   * @param {string} workflowId - Workflow ID
   * @returns {Promise<Object>} Deletion result
   */
  async deleteWorkflow(workflowId) {
    try {
      await axios.delete(
        `${WORKFLOW_SERVICE_URL}/api/workflows/${workflowId}`,
        {
          headers: this._getHeaders(),
          timeout: 10000
        }
      );

      logger.info('Workflow deleted', { workflowId });

      return {
        success: true
      };

    } catch (error) {
      logger.error('Failed to delete workflow', {
        error: error.message,
        workflowId
      });

      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Execute workflow with custom data
   * @param {string} workflowId - Workflow ID
   * @param {Object} data - Input data
   * @returns {Promise<Object>} Execution result
   */
  async executeWorkflow(workflowId, data) {
    try {
      const response = await axios.post(
        `${WORKFLOW_SERVICE_URL}/api/workflows/${workflowId}/execute`,
        { input: data },
        {
          headers: this._getHeaders(),
          timeout: 30000
        }
      );

      logger.info('Workflow executed', {
        workflowId,
        executionId: response.data.executionId
      });

      return {
        success: true,
        executionId: response.data.executionId,
        result: response.data.result
      };

    } catch (error) {
      logger.error('Failed to execute workflow', {
        error: error.message,
        workflowId
      });

      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Register moderation action callback
   * This allows Workflow service to call back with moderation decisions
   * @param {Function} callback - Callback function
   */
  registerCallback(callback) {
    this.callback = callback;
    logger.info('Moderation callback registered');
  }

  /**
   * Handle callback from Workflow service
   * @param {Object} data - Callback data
   */
  async handleCallback(data) {
    try {
      logger.info('Received workflow callback', {
        executionId: data.executionId,
        action: data.action
      });

      if (this.callback) {
        await this.callback(data);
      }

      return { success: true };

    } catch (error) {
      logger.error('Failed to handle workflow callback', {
        error: error.message,
        executionId: data.executionId
      });

      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Create default moderation workflows
   * Sets up common automated moderation workflows
   */
  async createDefaultWorkflows() {
    const defaultWorkflows = [
      {
        name: 'Auto-moderate Spam',
        description: 'Automatically detect and remove spam content',
        trigger: {
          type: 'event',
          event: 'content_submitted'
        },
        steps: [
          {
            type: 'service',
            name: 'Analyze Content',
            config: {
              service: 'moderator',
              endpoint: '/api/moderate/analyze',
              method: 'POST'
            }
          },
          {
            type: 'condition',
            name: 'Check if Spam',
            config: {
              condition: 'analysis.flagged && analysis.categories.includes("spam")'
            },
            onTrue: [
              {
                type: 'service',
                name: 'Remove Content',
                config: {
                  service: 'moderator',
                  endpoint: '/api/moderate/{{contentId}}/remove',
                  method: 'POST',
                  body: {
                    reason: 'Automated spam detection'
                  }
                }
              }
            ]
          }
        ],
        enabled: false,
        tags: ['spam', 'auto-moderate']
      },
      {
        name: 'Flag High-Risk Content',
        description: 'Flag content with high-risk AI scores for manual review',
        trigger: {
          type: 'event',
          event: 'content_submitted'
        },
        steps: [
          {
            type: 'service',
            name: 'AI Analysis',
            config: {
              service: 'moderator',
              endpoint: '/api/moderate/analyze',
              method: 'POST'
            }
          },
          {
            type: 'condition',
            name: 'Check Risk Score',
            config: {
              condition: 'analysis.confidence > 0.8'
            },
            onTrue: [
              {
                type: 'service',
                name: 'Add to Queue',
                config: {
                  service: 'moderator',
                  endpoint: '/api/queue',
                  method: 'POST',
                  body: {
                    contentId: '{{contentId}}',
                    priority: 'high',
                    aiScore: '{{analysis.confidence}}',
                    aiRecommendation: '{{analysis.recommendation}}'
                  }
                }
              },
              {
                type: 'notification',
                name: 'Notify Moderators',
                config: {
                  channel: 'email',
                  recipients: ['moderators@exprsn.io'],
                  subject: 'High-risk content flagged',
                  template: 'high_risk_content'
                }
              }
            ]
          }
        ],
        enabled: false,
        tags: ['high-risk', 'manual-review']
      }
    ];

    const results = [];
    for (const workflow of defaultWorkflows) {
      const result = await this.createWorkflow(workflow);
      results.push(result);
    }

    logger.info('Default workflows created', {
      count: results.filter(r => r.success).length,
      total: defaultWorkflows.length
    });

    return results;
  }

  /**
   * Get request headers with CA token
   * @private
   */
  _getHeaders() {
    const headers = {
      'Content-Type': 'application/json'
    };

    // Add CA token if available
    const caToken = process.env.CA_TOKEN || '';
    if (caToken) {
      headers['Authorization'] = `Bearer ${caToken}`;
    }

    return headers;
  }
}

module.exports = new WorkflowIntegrationService();
