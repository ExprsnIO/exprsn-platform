const axios = require('axios');
const logger = require('../../utils/logger');
const serviceDiscovery = require('./serviceDiscovery');

class WorkflowIntegration {
  constructor() {
    this.enabled = process.env.ENABLE_WORKFLOWS === 'true';
  }

  /**
   * Execute a workflow
   */
  async executeWorkflow(workflowId, input, context = {}) {
    if (!this.enabled) {
      logger.warn('Workflow integration disabled');
      return {
        success: false,
        error: 'Workflow integration disabled'
      };
    }

    try {
      const workflowUrl = await serviceDiscovery.discover('exprsn-workflow');

      const response = await axios.post(
        `${workflowUrl}/api/workflows/${workflowId}/execute`,
        {
          input,
          context: {
            ...context,
            source: 'exprsn-forge',
            timestamp: Date.now()
          }
        },
        {
          timeout: 60000 // 1 minute timeout
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
      logger.error('Workflow execution failed', {
        workflowId,
        error: error.message
      });

      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get workflow execution status
   */
  async getExecutionStatus(executionId) {
    if (!this.enabled) {
      return {
        success: false,
        error: 'Workflow integration disabled'
      };
    }

    try {
      const workflowUrl = await serviceDiscovery.discover('exprsn-workflow');

      const response = await axios.get(
        `${workflowUrl}/api/executions/${executionId}`,
        { timeout: 5000 }
      );

      return {
        success: true,
        execution: response.data.execution
      };
    } catch (error) {
      logger.error('Failed to get execution status', {
        executionId,
        error: error.message
      });

      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Create a new workflow
   */
  async createWorkflow(workflowDefinition) {
    if (!this.enabled) {
      return {
        success: false,
        error: 'Workflow integration disabled'
      };
    }

    try {
      const workflowUrl = await serviceDiscovery.discover('exprsn-workflow');

      const response = await axios.post(
        `${workflowUrl}/api/workflows`,
        workflowDefinition,
        { timeout: 10000 }
      );

      logger.info('Workflow created', {
        workflowId: response.data.workflow.id,
        name: response.data.workflow.name
      });

      return {
        success: true,
        workflow: response.data.workflow
      };
    } catch (error) {
      logger.error('Failed to create workflow', {
        error: error.message
      });

      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * List workflows with optional filters
   */
  async listWorkflows(filters = {}) {
    if (!this.enabled) {
      return {
        success: false,
        error: 'Workflow integration disabled'
      };
    }

    try {
      const workflowUrl = await serviceDiscovery.discover('exprsn-workflow');

      const response = await axios.get(
        `${workflowUrl}/api/workflows`,
        {
          params: filters,
          timeout: 5000
        }
      );

      return {
        success: true,
        workflows: response.data.workflows,
        total: response.data.total
      };
    } catch (error) {
      logger.error('Failed to list workflows', {
        error: error.message
      });

      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Trigger workflow based on event
   */
  async triggerWorkflowByEvent(eventType, eventData) {
    if (!this.enabled) {
      return {
        success: false,
        error: 'Workflow integration disabled'
      };
    }

    try {
      const workflowUrl = await serviceDiscovery.discover('exprsn-workflow');

      const response = await axios.post(
        `${workflowUrl}/api/workflows/trigger`,
        {
          eventType,
          eventData,
          source: 'exprsn-forge'
        },
        { timeout: 10000 }
      );

      logger.info('Workflow triggered by event', {
        eventType,
        triggered: response.data.triggered
      });

      return {
        success: true,
        executions: response.data.executions
      };
    } catch (error) {
      logger.error('Failed to trigger workflow by event', {
        eventType,
        error: error.message
      });

      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Subscribe to workflow events
   */
  async subscribeToWorkflowEvents(callback) {
    if (!this.enabled) {
      logger.warn('Workflow integration disabled');
      return;
    }

    try {
      const workflowUrl = await serviceDiscovery.discover('exprsn-workflow');

      // This would typically use Socket.IO or WebSocket
      // For now, this is a placeholder for future implementation
      logger.info('Workflow event subscription started', {
        workflowUrl
      });

      // TODO: Implement Socket.IO connection to workflow service
      // const socket = io(workflowUrl);
      // socket.on('workflow.completed', callback);
      // socket.on('workflow.failed', callback);
    } catch (error) {
      logger.error('Failed to subscribe to workflow events', {
        error: error.message
      });
    }
  }

  /**
   * Common workflow triggers for Forge entities
   */
  async triggerLeadWorkflow(leadId, action) {
    return await this.triggerWorkflowByEvent('lead.' + action, { leadId });
  }

  async triggerContactWorkflow(contactId, action) {
    return await this.triggerWorkflowByEvent('contact.' + action, { contactId });
  }

  async triggerCompanyWorkflow(companyId, action) {
    return await this.triggerWorkflowByEvent('company.' + action, { companyId });
  }

  async triggerOpportunityWorkflow(opportunityId, action) {
    return await this.triggerWorkflowByEvent('opportunity.' + action, { opportunityId });
  }

  async triggerInvoiceWorkflow(invoiceId, action) {
    return await this.triggerWorkflowByEvent('invoice.' + action, { invoiceId });
  }

  async triggerTaskWorkflow(taskId, action) {
    return await this.triggerWorkflowByEvent('task.' + action, { taskId });
  }
}

module.exports = new WorkflowIntegration();
