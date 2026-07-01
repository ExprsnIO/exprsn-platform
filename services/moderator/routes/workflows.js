/**
 * ═══════════════════════════════════════════════════════════
 * Workflow Routes
 * Admin CRUD + manual execution for moderation workflows, backed
 * by the local workflowEngine (durable Bull runtime). Replaces the
 * former external Workflow-service proxy.
 *
 * Whole router is admin-only.
 * ═══════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const logger = require('../src/utils/logger');
const requireAdmin = require('../src/middleware/requireAdmin');
const engine = require('../services/workflowEngine');

router.use(requireAdmin);

/** Sample context used when Execute is invoked without one. */
function sampleContext() {
  const text = 'This is a sample content item for workflow testing.';
  return {
    contentType: 'text',
    contentId: 'sample',
    sourceService: 'manual',
    userId: null,
    contentText: text,
    scores: {},
    content: { contentType: 'text', contentText: text, sourceService: 'manual' }
  };
}

// ── Execution history (declared before param routes) ──────────────────────────

/**
 * GET /api/workflows/executions
 * Recent workflow executions.
 */
router.get('/executions', async (req, res) => {
  try {
    const executions = await engine.listExecutions(50);
    res.json({ success: true, executions });
  } catch (error) {
    logger.error('Failed to list executions', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to list executions' });
  }
});

/**
 * GET /api/workflows/executions/recent
 * Alias for /executions.
 */
router.get('/executions/recent', async (req, res) => {
  try {
    const executions = await engine.listExecutions(50);
    res.json({ success: true, executions });
  } catch (error) {
    logger.error('Failed to list executions', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to list executions' });
  }
});

/**
 * GET /api/workflows/executions/:id
 * A single execution record.
 */
router.get('/executions/:id', async (req, res) => {
  try {
    const execution = await engine.getExecution(req.params.id);
    if (!execution) {
      return res.status(404).json({ success: false, error: 'Execution not found' });
    }
    res.json({ success: true, execution });
  } catch (error) {
    logger.error('Failed to get execution', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to get execution' });
  }
});

// ── Workflow listing ──────────────────────────────────────────────────────────

/**
 * GET /api/workflows
 * List all workflows.
 */
router.get('/', async (req, res) => {
  try {
    const workflows = await engine.listWorkflows();
    res.json({ success: true, workflows, count: workflows.length });
  } catch (error) {
    logger.error('Failed to list workflows', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to list workflows' });
  }
});

/**
 * GET /api/workflows/active
 * Enabled workflows only.
 */
router.get('/active', async (req, res) => {
  try {
    const workflows = (await engine.listWorkflows()).filter((w) => w && w.enabled !== false);
    res.json({ success: true, workflows, count: workflows.length });
  } catch (error) {
    logger.error('Failed to list active workflows', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to list active workflows' });
  }
});

// ── Workflow CRUD ─────────────────────────────────────────────────────────────

/**
 * POST /api/workflows
 * Create a workflow (id generated if missing).
 */
router.post('/', async (req, res) => {
  try {
    const spec = req.body || {};
    if (!spec.name && !spec.id) {
      return res.status(400).json({ success: false, error: 'Missing required field: name' });
    }
    const workflow = await engine.saveWorkflow(spec);
    res.status(201).json({ success: true, workflow });
  } catch (error) {
    logger.error('Failed to create workflow', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to create workflow' });
  }
});

/**
 * PUT /api/workflows/:id
 * Update a workflow (merges over the existing definition).
 */
router.put('/:id', async (req, res) => {
  try {
    const existing = await engine.getWorkflow(req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Workflow not found' });
    }
    const merged = { ...existing, ...(req.body || {}), id: req.params.id };
    const workflow = await engine.saveWorkflow(merged);
    res.json({ success: true, workflow });
  } catch (error) {
    logger.error('Failed to update workflow', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to update workflow' });
  }
});

/**
 * DELETE /api/workflows/:id
 * Remove a workflow.
 */
router.delete('/:id', async (req, res) => {
  try {
    const result = await engine.deleteWorkflow(req.params.id);
    res.json({ success: true, ...result });
  } catch (error) {
    logger.error('Failed to delete workflow', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to delete workflow' });
  }
});

/**
 * POST /api/workflows/:id/execute
 * Manually run a workflow (durable, queued). Returns ids the UI can poll.
 */
router.post('/:id/execute', async (req, res) => {
  try {
    const workflow = await engine.getWorkflow(req.params.id);
    if (!workflow) {
      return res.status(404).json({ success: false, error: 'Workflow not found' });
    }
    const context = (req.body && req.body.context) || sampleContext();
    const result = await engine.runWorkflow(req.params.id, context, 'manual');
    res.json({ success: true, ...result });
  } catch (error) {
    logger.error('Failed to execute workflow', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to execute workflow' });
  }
});

module.exports = router;
