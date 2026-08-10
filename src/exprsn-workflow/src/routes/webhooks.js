const express = require('express');
const router = express.Router();
const webhookService = require('../services/webhookService');
const { validateToken, requireRole } = require('../middleware/auth');
const logger = require('../utils/logger');
const rateLimit = require('express-rate-limit');
const Joi = require('joi');

/**
 * Rate limiter for webhook endpoints
 */
const webhookLimiter = rateLimit({
  windowMs: 60000, // 1 minute
  max: 100, // 100 requests per minute per IP
  message: 'Too many webhook requests, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  // Use custom key generator to rate limit per workflow
  keyGenerator: (req) => {
    return `${req.ip}-${req.params.workflowId || 'global'}`;
  }
});

/**
 * Validation schema for webhook configuration
 */
const webhookConfigSchema = Joi.object({
  requireSignature: Joi.boolean().default(true),
  allowedIPs: Joi.array().items(Joi.string().ip()).default([]),
  allowedOrigins: Joi.array().items(Joi.string()).default([]),
  rateLimit: Joi.object({
    maxRequests: Joi.number().integer().min(1).max(10000).default(100),
    windowMs: Joi.number().integer().min(1000).max(3600000).default(60000)
  }).default(),
  inputMapping: Joi.object().pattern(Joi.string(), Joi.string()).default({}),
  headers: Joi.object().pattern(Joi.string(), Joi.string()).default({})
});

/**
 * @route   POST /api/webhooks/workflows/:workflowId/enable
 * @desc    Enable webhook for a workflow
 * @access  Private
 */
router.post('/workflows/:workflowId/enable', validateToken, async (req, res) => {
  try {
    const { error, value } = webhookConfigSchema.validate(req.body);

    if (error) {
      return res.status(400).json({
        success: false,
        error: error.details[0].message
      });
    }

    const result = await webhookService.enableWebhook(req.params.workflowId, value);

    logger.info('Webhook enabled', {
      workflowId: req.params.workflowId,
      userId: req.user.id
    });

    res.json({
      success: true,
      data: result,
      message: 'Webhook enabled successfully'
    });
  } catch (error) {
    logger.error('Failed to enable webhook', {
      error: error.message,
      workflowId: req.params.workflowId,
      userId: req.user.id
    });

    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   POST /api/webhooks/workflows/:workflowId/disable
 * @desc    Disable webhook for a workflow
 * @access  Private
 */
router.post('/workflows/:workflowId/disable', validateToken, async (req, res) => {
  try {
    const result = await webhookService.disableWebhook(req.params.workflowId);

    logger.info('Webhook disabled', {
      workflowId: req.params.workflowId,
      userId: req.user.id
    });

    res.json({
      success: true,
      data: result,
      message: 'Webhook disabled successfully'
    });
  } catch (error) {
    logger.error('Failed to disable webhook', {
      error: error.message,
      workflowId: req.params.workflowId,
      userId: req.user.id
    });

    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   GET /api/webhooks/workflows/:workflowId/config
 * @desc    Get webhook configuration
 * @access  Private
 */
router.get('/workflows/:workflowId/config', validateToken, async (req, res) => {
  try {
    const config = await webhookService.getWebhookConfig(req.params.workflowId);

    res.json({
      success: true,
      data: config
    });
  } catch (error) {
    logger.error('Failed to get webhook config', {
      error: error.message,
      workflowId: req.params.workflowId,
      userId: req.user.id
    });

    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   POST /api/webhooks/workflows/:workflowId/regenerate-secret
 * @desc    Regenerate webhook secret
 * @access  Private
 */
router.post('/workflows/:workflowId/regenerate-secret', validateToken, async (req, res) => {
  try {
    const result = await webhookService.regenerateSecret(req.params.workflowId);

    logger.info('Webhook secret regenerated', {
      workflowId: req.params.workflowId,
      userId: req.user.id
    });

    res.json({
      success: true,
      data: result,
      message: 'Webhook secret regenerated successfully'
    });
  } catch (error) {
    logger.error('Failed to regenerate webhook secret', {
      error: error.message,
      workflowId: req.params.workflowId,
      userId: req.user.id
    });

    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   GET /api/webhooks/workflows/:workflowId/statistics
 * @desc    Get webhook statistics
 * @access  Private
 */
router.get('/workflows/:workflowId/statistics', validateToken, async (req, res) => {
  try {
    const timeRange = req.query.timeRange ? parseInt(req.query.timeRange, 10) : 24 * 60 * 60 * 1000;
    const stats = await webhookService.getWebhookStatistics(req.params.workflowId, timeRange);

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    logger.error('Failed to get webhook statistics', {
      error: error.message,
      workflowId: req.params.workflowId,
      userId: req.user.id
    });

    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   POST /api/webhooks/workflows/:workflowId/test
 * @desc    Test webhook with sample payload
 * @access  Private
 */
router.post('/workflows/:workflowId/test', validateToken, async (req, res) => {
  try {
    const testPayload = req.body.payload || { test: true, timestamp: new Date().toISOString() };

    const result = await webhookService.testWebhook(req.params.workflowId, testPayload);

    logger.info('Webhook test executed', {
      workflowId: req.params.workflowId,
      executionId: result.executionId,
      userId: req.user.id
    });

    res.status(202).json({
      success: true,
      data: result,
      message: 'Webhook test executed successfully'
    });
  } catch (error) {
    logger.error('Webhook test failed', {
      error: error.message,
      workflowId: req.params.workflowId,
      userId: req.user.id
    });

    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   POST /api/webhooks/:workflowId
 * @desc    Receive webhook (public endpoint)
 * @access  Public (with signature verification)
 */
router.post('/:workflowId', webhookLimiter, async (req, res) => {
  const startTime = Date.now();

  try {
    const workflowId = req.params.workflowId;
    const payload = req.body;
    const headers = req.headers;
    const clientIp = req.ip || req.connection.remoteAddress;

    // Process webhook
    const result = await webhookService.processWebhook(
      workflowId,
      payload,
      headers,
      clientIp
    );

    const duration = Date.now() - startTime;

    logger.info('Webhook received and processed', {
      workflowId,
      executionId: result.executionId,
      clientIp,
      duration
    });

    res.status(202).json(result);
  } catch (error) {
    const duration = Date.now() - startTime;

    logger.error('Webhook processing failed', {
      workflowId: req.params.workflowId,
      clientIp: req.ip,
      error: error.message,
      duration
    });

    // Return appropriate status codes
    let statusCode = 400;
    if (error.message.includes('not found')) {
      statusCode = 404;
    } else if (error.message.includes('signature') || error.message.includes('IP address')) {
      statusCode = 401;
    } else if (error.message.includes('not active') || error.message.includes('disabled')) {
      statusCode = 403;
    }

    res.status(statusCode).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   GET /api/webhooks/signature/generate
 * @desc    Generate HMAC signature for testing (helper endpoint)
 * @access  Private
 */
router.post('/signature/generate', validateToken, async (req, res) => {
  try {
    const { payload, secret } = req.body;

    if (!payload || !secret) {
      return res.status(400).json({
        success: false,
        error: 'Both payload and secret are required'
      });
    }

    const signature = webhookService.generateSignature(payload, secret);

    res.json({
      success: true,
      data: {
        signature,
        payload,
        algorithm: 'HMAC-SHA256'
      }
    });
  } catch (error) {
    logger.error('Failed to generate signature', {
      error: error.message,
      userId: req.user.id
    });

    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   GET /api/webhooks/documentation
 * @desc    Get webhook integration documentation
 * @access  Public
 */
router.get('/documentation', (req, res) => {
  const documentation = {
    overview: 'Webhook integration allows external systems to trigger workflow executions',

    setup: {
      step1: 'Enable webhook for your workflow via POST /api/webhooks/workflows/:workflowId/enable',
      step2: 'Note the webhook URL and secret returned',
      step3: 'Configure your external system to send POST requests to the webhook URL',
      step4: 'Include the HMAC signature in the x-webhook-signature header'
    },

    signatureGeneration: {
      algorithm: 'HMAC-SHA256',
      header: 'x-webhook-signature',
      example: 'const signature = crypto.createHmac("sha256", secret).update(JSON.stringify(payload)).digest("hex")'
    },

    requestFormat: {
      method: 'POST',
      url: '/api/webhooks/:workflowId',
      headers: {
        'Content-Type': 'application/json',
        'x-webhook-signature': 'hmac-sha256-signature-here'
      },
      body: {
        // Your webhook payload
        // Will be passed as input data to the workflow
      }
    },

    responseFormat: {
      success: {
        status: 202,
        body: {
          success: true,
          executionId: 'uuid',
          message: 'Workflow execution started'
        }
      },
      error: {
        status: '400/401/403/404',
        body: {
          success: false,
          error: 'Error message'
        }
      }
    },

    features: [
      'HMAC-SHA256 signature verification',
      'IP address whitelisting',
      'Rate limiting (configurable)',
      'Input field mapping',
      'Required header validation',
      'Comprehensive audit logging'
    ],

    examples: {
      curl: `curl -X POST https://your-domain.com/api/webhooks/:workflowId \\
  -H "Content-Type: application/json" \\
  -H "x-webhook-signature: YOUR_SIGNATURE" \\
  -d '{"key": "value"}'`,

      javascript: `const crypto = require('crypto');
const axios = require('axios');

const payload = { key: 'value' };
const secret = 'your-webhook-secret';
const signature = crypto.createHmac('sha256', secret)
  .update(JSON.stringify(payload))
  .digest('hex');

await axios.post('https://your-domain.com/api/webhooks/:workflowId', payload, {
  headers: {
    'x-webhook-signature': signature
  }
});`,

      python: `import hmac
import hashlib
import json
import requests

payload = {'key': 'value'}
secret = b'your-webhook-secret'
signature = hmac.new(secret, json.dumps(payload).encode(), hashlib.sha256).hexdigest()

requests.post(
    'https://your-domain.com/api/webhooks/:workflowId',
    json=payload,
    headers={'x-webhook-signature': signature}
)`
    }
  };

  res.json({
    success: true,
    data: documentation
  });
});

module.exports = router;
