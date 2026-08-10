/**
 * AI Assistant Routes
 *
 * Endpoints for AI-powered features in the Low-Code Platform:
 * - Schema suggestions (natural language → entity creation)
 * - Code generation (form logic, validation rules)
 * - Data transformations (cleansing, enrichment)
 * - Workflow optimization
 * - Conversation sessions
 */

const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { Op } = require('sequelize');
const Joi = require('joi');

// Models
const {
  AIProviderConfig,
  AIAgentTemplate,
  AIAgentConfiguration,
  AIExecutionLog,
  AISchemaSuggestion,
  AIDataTransformation,
  AIConversationSession,
  AIConversationMessage,
  AIWorkflowOptimization,
  AIDecisionEvaluation,
} = require('../models/ai');

// Services
const { getInstance: getAIService } = require('../services/ai/AIAgentService');
const aiService = getAIService();

// Middleware
const { asyncHandler } = require('@exprsn/shared');

// ═══════════════════════════════════════════════════════════
// PROVIDER MANAGEMENT
// ═══════════════════════════════════════════════════════════

/**
 * GET /api/ai/providers
 * List available AI providers
 */
router.get('/providers', asyncHandler(async (req, res) => {
  const providers = await AIProviderConfig.scope('active').findAll({
    attributes: [
      'id',
      'providerName',
      'providerType',
      'displayName',
      'availableModels',
      'isDefault',
      'priority',
      'healthStatus',
    ],
  });

  res.json({
    success: true,
    data: providers,
  });
}));

/**
 * GET /api/ai/providers/:id/health
 * Check provider health
 */
router.get('/providers/:id/health', asyncHandler(async (req, res) => {
  const provider = await AIProviderConfig.findByPk(req.params.id);

  if (!provider) {
    return res.status(404).json({
      success: false,
      error: 'Provider not found',
    });
  }

  // TODO: Implement actual health check
  const isHealthy = provider.isHealthy();

  res.json({
    success: true,
    data: {
      providerName: provider.providerName,
      healthStatus: provider.healthStatus,
      lastHealthCheck: provider.lastHealthCheck,
      isHealthy,
    },
  });
}));

// ═══════════════════════════════════════════════════════════
// SCHEMA SUGGESTIONS
// ═══════════════════════════════════════════════════════════

/**
 * POST /api/ai/suggest/entity
 * Generate entity schema from natural language description
 *
 * Body:
 * {
 *   "prompt": "Create a customer entity with name, email, phone, and address",
 *   "applicationId": "uuid",
 *   "context": { ... }
 * }
 */
router.post('/suggest/entity', asyncHandler(async (req, res) => {
  const schema = Joi.object({
    prompt: Joi.string().required().min(10).max(2000),
    applicationId: Joi.string().uuid().required(),
    context: Joi.object().optional(),
  });

  const { error, value } = schema.validate(req.body);
  if (error) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: error.details[0].message,
    });
  }

  const { prompt, applicationId, context } = value;
  const userId = req.user?.id || '00000000-0000-0000-0000-000000000000'; // TODO: Get from auth

  // Get or create schema designer template
  let template = await AIAgentTemplate.findOne({
    where: {
      templateType: 'schema_designer',
      isSystem: true,
    },
  });

  if (!template) {
    return res.status(500).json({
      success: false,
      error: 'AI_NOT_CONFIGURED',
      message: 'AI schema designer template not found. Run seed data.',
    });
  }

  // Execute AI agent
  const result = await aiService.execute({
    templateId: template.id,
    executionType: 'schema_suggestion',
    targetType: 'entity',
    targetId: null,
    prompt,
    context: {
      applicationId,
      ...context,
    },
    userId,
  });

  // Parse the schema suggestion
  const suggestedSchema = result.structured;

  // Create schema suggestion record
  const suggestion = await AISchemaSuggestion.create({
    executionLogId: result.executionLogId,
    applicationId,
    entityId: null,
    suggestionType: 'new_entity',
    suggestedSchema,
    reasoning: suggestedSchema.reasoning || 'AI-generated entity schema',
    confidenceScore: suggestedSchema.confidence || 85,
    userPrompt: prompt,
    status: 'pending',
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
    createdBy: userId,
  });

  res.json({
    success: true,
    data: {
      suggestionId: suggestion.id,
      schema: suggestedSchema,
      reasoning: suggestion.reasoning,
      confidenceScore: suggestion.confidenceScore,
      cost: result.cost,
      usage: result.usage,
    },
  });
}));

/**
 * POST /api/ai/suggest/fields
 * Suggest additional fields for an existing entity
 */
router.post('/suggest/fields', asyncHandler(async (req, res) => {
  const schema = Joi.object({
    prompt: Joi.string().required().min(10).max(2000),
    entityId: Joi.string().uuid().required(),
    existingFields: Joi.array().items(Joi.object()).optional(),
    context: Joi.object().optional(),
  });

  const { error, value } = schema.validate(req.body);
  if (error) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: error.details[0].message,
    });
  }

  const { prompt, entityId, existingFields, context } = value;
  const userId = req.user?.id || '00000000-0000-0000-0000-000000000000';

  // Get template
  const template = await AIAgentTemplate.findOne({
    where: {
      templateType: 'schema_designer',
      isSystem: true,
    },
  });

  if (!template) {
    return res.status(500).json({
      success: false,
      error: 'AI_NOT_CONFIGURED',
      message: 'AI schema designer template not found.',
    });
  }

  // Execute AI with existing schema context
  const result = await aiService.execute({
    templateId: template.id,
    executionType: 'field_suggestion',
    targetType: 'entity',
    targetId: entityId,
    prompt: `${prompt}\n\nExisting fields: ${JSON.stringify(existingFields)}`,
    context: {
      entityId,
      existingFields,
      ...context,
    },
    userId,
  });

  const suggestedFields = result.structured;

  // Create suggestion record
  const suggestion = await AISchemaSuggestion.create({
    executionLogId: result.executionLogId,
    entityId,
    suggestionType: 'add_field',
    suggestedSchema: suggestedFields,
    reasoning: suggestedFields.reasoning || 'AI-suggested fields',
    confidenceScore: suggestedFields.confidence || 85,
    userPrompt: prompt,
    status: 'pending',
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    createdBy: userId,
  });

  res.json({
    success: true,
    data: {
      suggestionId: suggestion.id,
      fields: suggestedFields,
      reasoning: suggestion.reasoning,
      confidenceScore: suggestion.confidenceScore,
    },
  });
}));

/**
 * GET /api/ai/suggestions
 * List schema suggestions (with filters)
 */
router.get('/suggestions', asyncHandler(async (req, res) => {
  const { applicationId, entityId, status, limit = 50 } = req.query;

  const where = {};
  if (applicationId) where.applicationId = applicationId;
  if (entityId) where.entityId = entityId;
  if (status) where.status = status;

  const suggestions = await AISchemaSuggestion.findAll({
    where,
    order: [['created_at', 'DESC']],
    limit: Math.min(parseInt(limit), 100),
    include: [
      {
        model: AIExecutionLog,
        as: 'executionLog',
        attributes: ['id', 'model', 'tokensInput', 'tokensOutput', 'estimatedCost'],
      },
    ],
  });

  res.json({
    success: true,
    data: suggestions,
  });
}));

/**
 * POST /api/ai/suggestions/:id/approve
 * Approve a schema suggestion
 */
router.post('/suggestions/:id/approve', asyncHandler(async (req, res) => {
  const suggestion = await AISchemaSuggestion.findByPk(req.params.id);

  if (!suggestion) {
    return res.status(404).json({
      success: false,
      error: 'Suggestion not found',
    });
  }

  const userId = req.user?.id || '00000000-0000-0000-0000-000000000000';
  await suggestion.approve(userId, req.body.feedback);

  res.json({
    success: true,
    data: suggestion,
  });
}));

/**
 * POST /api/ai/suggestions/:id/reject
 * Reject a schema suggestion
 */
router.post('/suggestions/:id/reject', asyncHandler(async (req, res) => {
  const suggestion = await AISchemaSuggestion.findByPk(req.params.id);

  if (!suggestion) {
    return res.status(404).json({
      success: false,
      error: 'Suggestion not found',
    });
  }

  const userId = req.user?.id || '00000000-0000-0000-0000-000000000000';
  await suggestion.reject(userId, req.body.feedback);

  res.json({
    success: true,
    data: suggestion,
  });
}));

/**
 * POST /api/ai/suggestions/:id/apply
 * Apply a schema suggestion (creates the entity/fields)
 */
router.post('/suggestions/:id/apply', asyncHandler(async (req, res) => {
  const suggestion = await AISchemaSuggestion.findByPk(req.params.id);

  if (!suggestion) {
    return res.status(404).json({
      success: false,
      error: 'Suggestion not found',
    });
  }

  if (!suggestion.canApply()) {
    return res.status(400).json({
      success: false,
      error: 'Cannot apply this suggestion',
      message: 'Suggestion must be approved and not expired',
    });
  }

  // TODO: Actually create the entity/fields using the Entity service
  // For now, just mark as applied
  await suggestion.markApplied({
    success: true,
    entityId: uuidv4(), // Placeholder
  });

  res.json({
    success: true,
    data: {
      suggestion,
      message: 'Schema suggestion applied successfully',
    },
  });
}));

// ═══════════════════════════════════════════════════════════
// CONVERSATION SESSIONS
// ═══════════════════════════════════════════════════════════

/**
 * POST /api/ai/chat
 * Start or continue an AI conversation
 */
router.post('/chat', asyncHandler(async (req, res) => {
  const schema = Joi.object({
    sessionId: Joi.string().uuid().optional(),
    message: Joi.string().required().min(1).max(4000),
    sessionType: Joi.string().valid('schema_design', 'data_query', 'workflow_builder', 'general_assistant').default('general_assistant'),
    applicationId: Joi.string().uuid().optional(),
    context: Joi.object().optional(),
  });

  const { error, value } = schema.validate(req.body);
  if (error) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: error.details[0].message,
    });
  }

  const { sessionId, message, sessionType, applicationId, context } = value;
  const userId = req.user?.id || '00000000-0000-0000-0000-000000000000';

  let session;
  if (sessionId) {
    // Continue existing session
    session = await AIConversationSession.findByPk(sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found',
      });
    }
  } else {
    // Create new session
    session = await AIConversationSession.create({
      userId,
      applicationId,
      sessionType,
      context: context || {},
    });
  }

  // Add user message
  await session.addMessage('user', message);

  // Get template for session type
  const templateTypeMap = {
    schema_design: 'schema_designer',
    data_query: 'query_builder',
    workflow_builder: 'workflow_optimizer',
    general_assistant: 'general_assistant',
  };

  const template = await AIAgentTemplate.findOne({
    where: {
      templateType: templateTypeMap[sessionType],
      isSystem: true,
    },
  });

  if (!template) {
    return res.status(500).json({
      success: false,
      error: 'AI_NOT_CONFIGURED',
      message: `No template found for ${sessionType}`,
    });
  }

  // Get conversation history for context
  const messages = await session.getMessages();
  const conversationHistory = messages.map(m => ({
    role: m.role,
    content: m.content,
  }));

  // Execute AI
  const result = await aiService.execute({
    templateId: template.id,
    executionType: `conversation_${sessionType}`,
    targetType: 'conversation',
    targetId: session.id,
    prompt: message,
    context: {
      ...session.context,
      conversationHistory: conversationHistory.slice(-10), // Last 10 messages
      ...context,
    },
    userId,
    sessionId: session.id,
  });

  // Add assistant response
  await session.addMessage('assistant', result.response, result.structured);

  res.json({
    success: true,
    data: {
      sessionId: session.id,
      response: result.response,
      structured: result.structured,
      cost: result.cost,
      usage: result.usage,
    },
  });
}));

/**
 * GET /api/ai/chat/:sessionId
 * Get conversation history
 */
router.get('/chat/:sessionId', asyncHandler(async (req, res) => {
  const session = await AIConversationSession.findByPk(req.params.sessionId);

  if (!session) {
    return res.status(404).json({
      success: false,
      error: 'Session not found',
    });
  }

  const messages = await session.getMessages();

  res.json({
    success: true,
    data: {
      session,
      messages,
    },
  });
}));

/**
 * GET /api/ai/chat
 * List user's conversation sessions
 */
router.get('/chat', asyncHandler(async (req, res) => {
  const userId = req.user?.id || '00000000-0000-0000-0000-000000000000';
  const { applicationId, sessionType, isActive, limit = 50 } = req.query;

  const where = { userId };
  if (applicationId) where.applicationId = applicationId;
  if (sessionType) where.sessionType = sessionType;
  if (isActive !== undefined) where.isActive = isActive === 'true';

  const sessions = await AIConversationSession.findAll({
    where,
    order: [['last_message_at', 'DESC']],
    limit: Math.min(parseInt(limit), 100),
  });

  res.json({
    success: true,
    data: sessions,
  });
}));

/**
 * DELETE /api/ai/chat/:sessionId
 * End a conversation session
 */
router.delete('/chat/:sessionId', asyncHandler(async (req, res) => {
  const session = await AIConversationSession.findByPk(req.params.sessionId);

  if (!session) {
    return res.status(404).json({
      success: false,
      error: 'Session not found',
    });
  }

  await session.end();

  res.json({
    success: true,
    message: 'Session ended',
  });
}));

// ═══════════════════════════════════════════════════════════
// STATISTICS & MONITORING
// ═══════════════════════════════════════════════════════════

/**
 * GET /api/ai/stats
 * Get AI usage statistics
 */
router.get('/stats', asyncHandler(async (req, res) => {
  const { startDate, endDate, groupBy = 'day' } = req.query;
  const userId = req.user?.id;

  const where = {};
  if (userId) where.userId = userId;
  if (startDate && endDate) {
    where.createdAt = {
      [Op.between]: [new Date(startDate), new Date(endDate)],
    };
  }

  const logs = await AIExecutionLog.findAll({
    where,
    attributes: [
      [AIExecutionLog.sequelize.fn('COUNT', AIExecutionLog.sequelize.col('id')), 'count'],
      [AIExecutionLog.sequelize.fn('SUM', AIExecutionLog.sequelize.col('tokens_input')), 'totalInputTokens'],
      [AIExecutionLog.sequelize.fn('SUM', AIExecutionLog.sequelize.col('tokens_output')), 'totalOutputTokens'],
      [AIExecutionLog.sequelize.fn('SUM', AIExecutionLog.sequelize.col('estimated_cost')), 'totalCost'],
      [AIExecutionLog.sequelize.fn('AVG', AIExecutionLog.sequelize.col('duration_ms')), 'avgDuration'],
      'status',
      'execution_type',
    ],
    group: ['status', 'execution_type'],
  });

  res.json({
    success: true,
    data: logs,
  });
}));

/**
 * GET /api/ai/execution-logs
 * Get execution logs with filters
 */
router.get('/execution-logs', asyncHandler(async (req, res) => {
  const { status, executionType, limit = 50 } = req.query;
  const userId = req.user?.id;

  const where = {};
  if (userId) where.userId = userId;
  if (status) where.status = status;
  if (executionType) where.executionType = executionType;

  const logs = await AIExecutionLog.findAll({
    where,
    order: [['created_at', 'DESC']],
    limit: Math.min(parseInt(limit), 100),
    include: [
      {
        model: AIAgentTemplate,
        as: 'template',
        attributes: ['id', 'name', 'templateType'],
      },
    ],
  });

  res.json({
    success: true,
    data: logs,
  });
}));

module.exports = router;
