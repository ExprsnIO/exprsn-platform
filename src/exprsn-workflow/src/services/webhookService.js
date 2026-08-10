const crypto = require('crypto');
const { Workflow, WorkflowExecution } = require('../models');
const executionEngine = require('./executionEngine');
const auditService = require('./auditService');
const logger = require('../utils/logger');

/**
 * Webhook Service
 * Manages webhook-triggered workflow executions with HMAC signature verification
 */
class WebhookService {
  constructor() {
    this.webhooks = new Map(); // workflowId -> webhook config
  }

  /**
   * Generate webhook secret for a workflow
   */
  generateWebhookSecret() {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Generate HMAC signature for webhook payload
   */
  generateSignature(payload, secret) {
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(JSON.stringify(payload));
    return hmac.digest('hex');
  }

  /**
   * Verify webhook signature
   */
  verifySignature(payload, signature, secret) {
    const expectedSignature = this.generateSignature(payload, secret);

    // Use timing-safe comparison to prevent timing attacks
    try {
      return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
      );
    } catch (error) {
      return false;
    }
  }

  /**
   * Enable webhook for a workflow
   */
  async enableWebhook(workflowId, config = {}) {
    const workflow = await Workflow.findByPk(workflowId);

    if (!workflow) {
      throw new Error('Workflow not found');
    }

    // Generate webhook secret if not provided
    const secret = config.secret || this.generateWebhookSecret();

    // Update workflow trigger config
    const webhookConfig = {
      enabled: true,
      secret,
      requireSignature: config.requireSignature !== false,
      allowedIPs: config.allowedIPs || [],
      allowedOrigins: config.allowedOrigins || [],
      rateLimit: config.rateLimit || {
        maxRequests: 100,
        windowMs: 60000 // 1 minute
      },
      inputMapping: config.inputMapping || {}, // Map webhook body to workflow inputs
      headers: config.headers || {} // Required headers
    };

    await workflow.update({
      trigger_type: 'webhook',
      trigger_config: webhookConfig
    });

    // Cache webhook config
    this.webhooks.set(workflowId, webhookConfig);

    // Log audit event
    await auditService.logWorkflowUpdate(workflow, { trigger_config: webhookConfig }, null);

    logger.info('Webhook enabled for workflow', {
      workflowId,
      requireSignature: webhookConfig.requireSignature
    });

    return {
      workflowId,
      webhookUrl: `/api/webhooks/${workflowId}`,
      secret: webhookConfig.requireSignature ? secret : null,
      config: {
        requireSignature: webhookConfig.requireSignature,
        rateLimit: webhookConfig.rateLimit
      }
    };
  }

  /**
   * Disable webhook for a workflow
   */
  async disableWebhook(workflowId) {
    const workflow = await Workflow.findByPk(workflowId);

    if (!workflow) {
      throw new Error('Workflow not found');
    }

    const triggerConfig = {
      ...(workflow.trigger_config || {}),
      enabled: false
    };

    await workflow.update({
      trigger_config: triggerConfig
    });

    // Remove from cache
    this.webhooks.delete(workflowId);

    logger.info('Webhook disabled for workflow', { workflowId });

    return workflow;
  }

  /**
   * Get webhook configuration for a workflow
   */
  async getWebhookConfig(workflowId) {
    const workflow = await Workflow.findByPk(workflowId);

    if (!workflow) {
      throw new Error('Workflow not found');
    }

    if (workflow.trigger_type !== 'webhook') {
      return {
        enabled: false,
        message: 'Workflow is not configured for webhook triggers'
      };
    }

    const config = workflow.trigger_config || {};

    return {
      enabled: config.enabled !== false,
      webhookUrl: `/api/webhooks/${workflowId}`,
      requireSignature: config.requireSignature !== false,
      allowedIPs: config.allowedIPs || [],
      allowedOrigins: config.allowedOrigins || [],
      rateLimit: config.rateLimit || { maxRequests: 100, windowMs: 60000 },
      inputMapping: config.inputMapping || {},
      headers: config.headers || {},
      hasSecret: !!config.secret
    };
  }

  /**
   * Regenerate webhook secret
   */
  async regenerateSecret(workflowId) {
    const workflow = await Workflow.findByPk(workflowId);

    if (!workflow) {
      throw new Error('Workflow not found');
    }

    if (workflow.trigger_type !== 'webhook') {
      throw new Error('Workflow is not configured for webhook triggers');
    }

    const newSecret = this.generateWebhookSecret();

    const triggerConfig = {
      ...(workflow.trigger_config || {}),
      secret: newSecret
    };

    await workflow.update({
      trigger_config: triggerConfig
    });

    // Update cache
    if (this.webhooks.has(workflowId)) {
      const cached = this.webhooks.get(workflowId);
      cached.secret = newSecret;
      this.webhooks.set(workflowId, cached);
    }

    // Log audit event
    await auditService.logWorkflowUpdate(workflow, { trigger_config: { secret: '***REGENERATED***' } }, null);

    logger.info('Webhook secret regenerated', { workflowId });

    return {
      workflowId,
      secret: newSecret
    };
  }

  /**
   * Process incoming webhook request
   */
  async processWebhook(workflowId, payload, headers, clientIp) {
    const startTime = Date.now();

    try {
      // Get workflow
      const workflow = await Workflow.findByPk(workflowId);

      if (!workflow) {
        throw new Error('Workflow not found');
      }

      if (workflow.status !== 'active') {
        throw new Error('Workflow is not active');
      }

      if (workflow.trigger_type !== 'webhook') {
        throw new Error('Workflow is not configured for webhook triggers');
      }

      const config = workflow.trigger_config || {};

      if (config.enabled === false) {
        throw new Error('Webhook is disabled for this workflow');
      }

      // Validate IP whitelist
      if (config.allowedIPs && config.allowedIPs.length > 0) {
        if (!config.allowedIPs.includes(clientIp)) {
          throw new Error('IP address not allowed');
        }
      }

      // Validate required headers
      if (config.headers) {
        for (const [key, value] of Object.entries(config.headers)) {
          if (headers[key.toLowerCase()] !== value) {
            throw new Error(`Required header missing or invalid: ${key}`);
          }
        }
      }

      // Verify signature if required
      if (config.requireSignature !== false) {
        const signature = headers['x-webhook-signature'];

        if (!signature) {
          throw new Error('Webhook signature missing');
        }

        if (!config.secret) {
          throw new Error('Webhook secret not configured');
        }

        const isValid = this.verifySignature(payload, signature, config.secret);

        if (!isValid) {
          throw new Error('Invalid webhook signature');
        }
      }

      // Map webhook payload to workflow inputs
      let inputData = payload;

      if (config.inputMapping && Object.keys(config.inputMapping).length > 0) {
        inputData = {};
        for (const [workflowField, webhookPath] of Object.entries(config.inputMapping)) {
          inputData[workflowField] = this._getNestedValue(payload, webhookPath);
        }
      }

      // Start workflow execution
      const execution = await executionEngine.startExecution(
        workflowId,
        inputData,
        null, // System-initiated
        {
          triggerType: 'webhook',
          triggerData: {
            clientIp,
            headers: this._sanitizeHeaders(headers),
            timestamp: new Date().toISOString()
          }
        }
      );

      const duration = Date.now() - startTime;

      // Log audit event
      await auditService.log({
        eventType: 'execution_start',
        workflowId,
        executionId: execution.id,
        userId: null,
        userIp: clientIp,
        success: true,
        durationMs: duration,
        metadata: {
          trigger: 'webhook',
          signatureVerified: config.requireSignature !== false
        }
      });

      logger.info('Webhook processed successfully', {
        workflowId,
        executionId: execution.id,
        clientIp,
        duration
      });

      return {
        success: true,
        executionId: execution.id,
        message: 'Workflow execution started'
      };
    } catch (error) {
      const duration = Date.now() - startTime;

      // Log audit event for failure
      await auditService.log({
        eventType: 'execution_start',
        workflowId,
        userId: null,
        userIp: clientIp,
        success: false,
        errorMessage: error.message,
        severity: 'error',
        durationMs: duration,
        metadata: {
          trigger: 'webhook'
        }
      });

      logger.error('Webhook processing failed', {
        workflowId,
        clientIp,
        error: error.message,
        duration
      });

      throw error;
    }
  }

  /**
   * Get nested value from object using dot notation
   */
  _getNestedValue(obj, path) {
    if (!path) return obj;

    const keys = path.split('.');
    let value = obj;

    for (const key of keys) {
      if (value && typeof value === 'object' && key in value) {
        value = value[key];
      } else {
        return undefined;
      }
    }

    return value;
  }

  /**
   * Sanitize headers for logging (remove sensitive data)
   */
  _sanitizeHeaders(headers) {
    const sanitized = { ...headers };
    const sensitiveHeaders = ['authorization', 'x-webhook-signature', 'cookie', 'x-api-key'];

    for (const header of sensitiveHeaders) {
      if (sanitized[header]) {
        sanitized[header] = '***REDACTED***';
      }
    }

    return sanitized;
  }

  /**
   * Get webhook statistics for a workflow
   */
  async getWebhookStatistics(workflowId, timeRange = 24 * 60 * 60 * 1000) {
    const cutoffDate = new Date(Date.now() - timeRange);

    const executions = await WorkflowExecution.findAll({
      where: {
        workflow_id: workflowId,
        trigger_type: 'webhook',
        created_at: {
          [require('sequelize').Op.gte]: cutoffDate
        }
      },
      attributes: ['status', 'duration', 'created_at']
    });

    const stats = {
      total: executions.length,
      successful: executions.filter(e => e.status === 'completed').length,
      failed: executions.filter(e => e.status === 'failed').length,
      running: executions.filter(e => e.status === 'running').length,
      averageDuration: 0,
      timeRange: `${timeRange / (60 * 60 * 1000)} hours`
    };

    const completedExecutions = executions.filter(e => e.duration);
    if (completedExecutions.length > 0) {
      const totalDuration = completedExecutions.reduce((sum, e) => sum + e.duration, 0);
      stats.averageDuration = Math.round(totalDuration / completedExecutions.length);
    }

    return stats;
  }

  /**
   * Test webhook (simulate webhook call)
   */
  async testWebhook(workflowId, testPayload = {}) {
    const workflow = await Workflow.findByPk(workflowId);

    if (!workflow) {
      throw new Error('Workflow not found');
    }

    if (workflow.trigger_type !== 'webhook') {
      throw new Error('Workflow is not configured for webhook triggers');
    }

    const config = workflow.trigger_config || {};

    // Generate test signature if required
    let headers = {
      'content-type': 'application/json',
      'user-agent': 'webhook-test/1.0'
    };

    if (config.requireSignature !== false && config.secret) {
      headers['x-webhook-signature'] = this.generateSignature(testPayload, config.secret);
    }

    // Process webhook
    return await this.processWebhook(
      workflowId,
      testPayload,
      headers,
      '127.0.0.1' // Test IP
    );
  }
}

module.exports = new WebhookService();
