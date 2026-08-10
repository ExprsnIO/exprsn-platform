/**
 * Configuration Management Routes
 * Provides endpoints for the Setup dashboard to manage Workflow configurations
 */

const express = require('express');
const router = express.Router();
const { Workflow, WorkflowExecution } = require('../models');
const config = require('../config');
const { logger } = require('@exprsn/shared');

router.get('/:sectionId', async (req, res) => {
  const { sectionId } = req.params;

  try {
    let data;

    switch (sectionId) {
      case 'workflow-templates':
        data = await getWorkflowTemplates();
        break;
      case 'workflow-executions':
        data = await getWorkflowExecutions();
        break;
      case 'workflow-settings':
        data = await getWorkflowSettings();
        break;
      default:
        return res.status(404).json({ success: false, error: 'Configuration section not found' });
    }

    res.json(data);
  } catch (error) {
    logger.error(`Error fetching config for ${sectionId}:`, error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/:sectionId', async (req, res) => {
  const { sectionId } = req.params;
  const configData = req.body;

  try {
    let result;

    switch (sectionId) {
      case 'workflow-settings':
        result = await updateWorkflowSettings(configData);
        break;
      default:
        return res.status(404).json({ success: false, error: 'Configuration section not found' });
    }

    res.json({ success: true, result });
  } catch (error) {
    logger.error(`Error updating config for ${sectionId}:`, error);
    res.status(500).json({ success: false, error: error.message });
  }
});

async function getWorkflowTemplates() {
  const templates = await Workflow.findAll({ where: { is_template: true }, order: [['created_at', 'DESC']], limit: 20 });

  return {
    title: 'Workflow Templates',
    description: 'Pre-built workflow templates',
    actions: ['Create Template', 'Import Template'],
    table: {
      headers: ['Name', 'Steps', 'Created', 'Actions'],
      rows: templates.map(t => [t.name, String(t.steps?.length || 0), new Date(t.created_at).toLocaleDateString(), 'View | Edit | Duplicate'])
    }
  };
}

async function getWorkflowExecutions() {
  const executions = await WorkflowExecution.findAll({ order: [['created_at', 'DESC']], limit: 50 });

  return {
    title: 'Workflow Executions',
    description: 'View and manage workflow executions',
    table: {
      headers: ['Workflow', 'Status', 'Started', 'Duration', 'Actions'],
      rows: executions.map(e => [
        e.workflow_name || e.workflow_id,
        e.status,
        new Date(e.created_at).toLocaleDateString(),
        e.completed_at ? `${Math.round((new Date(e.completed_at) - new Date(e.created_at)) / 1000)}s` : '-',
        'View | Retry | Cancel'
      ])
    }
  };
}

async function getWorkflowSettings() {
  return {
    title: 'Workflow Settings',
    description: 'Configure workflow execution settings',
    fields: [
      { name: 'maxExecutionTime', label: 'Max Execution Time (seconds)', type: 'number', value: config.workflow?.maxExecutionTime || 300 },
      { name: 'maxRetries', label: 'Max Retries', type: 'number', value: config.workflow?.maxRetries || 3 },
      { name: 'enableLogging', label: 'Enable Logging', type: 'checkbox', value: config.workflow?.enableLogging !== false },
      { name: 'enableNotifications', label: 'Enable Notifications', type: 'checkbox', value: config.workflow?.enableNotifications !== false }
    ]
  };
}

async function updateWorkflowSettings(configData) {
  logger.info('Workflow settings updated:', configData);
  if (configData.maxExecutionTime) config.workflow = { ...config.workflow, maxExecutionTime: parseInt(configData.maxExecutionTime) };
  if (configData.maxRetries) config.workflow = { ...config.workflow, maxRetries: parseInt(configData.maxRetries) };
  return { message: 'Workflow settings updated successfully', config: configData };
}

module.exports = router;
