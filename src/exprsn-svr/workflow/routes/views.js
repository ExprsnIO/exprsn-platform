/**
 * View Routes for Workflow Service
 * Handles server-side rendering of EJS templates
 */

const express = require('express');
const router = express.Router();
const { Workflow, WorkflowExecution } = require('../models');
const { Op } = require('sequelize');

/**
 * Landing Page
 */
router.get('/', async (req, res) => {
  try {
    let stats;
    try {
      stats = {
        totalWorkflows: await Workflow.count(),
        activeWorkflows: await Workflow.count({ where: { status: 'active' } }),
        totalExecutions: await WorkflowExecution.count(),
        successfulExecutions: await WorkflowExecution.count({ where: { status: 'completed' } })
      };
    } catch (dbError) {
      console.warn('Database unavailable, using mock stats:', dbError.message);
      stats = {
        totalWorkflows: 0,
        activeWorkflows: 0,
        totalExecutions: 0,
        successfulExecutions: 0
      };
    }

    res.render('index', {
      title: 'Workflow',
      currentPath: req.path,
      user: req.user || null,
      stats
    });
  } catch (error) {
    console.error('Error rendering index:', error);
    res.render('index', {
      title: 'Workflow',
      currentPath: req.path,
      user: req.user || null,
      stats: {
        totalWorkflows: 0,
        activeWorkflows: 0,
        totalExecutions: 0,
        successfulExecutions: 0
      }
    });
  }
});

/**
 * Workflow Management Dashboard (Unified)
 */
router.get('/dashboard', (req, res) => {
  res.redirect('/dashboard.html');
});

/**
 * Workflow Designer Page (redirects to static HTML designer)
 */
router.get('/designer', (req, res) => {
  res.redirect('/designer.html');
});

/**
 * Visual Workflow Designer (Exprsn Kicks Integration)
 */
router.get('/visual-designer', (req, res) => {
  res.render('visual-designer', {
    title: 'Visual Workflow Designer',
    currentPath: req.path,
    user: req.user || { username: 'Demo User', id: 'demo-id' }
  });
});

/**
 * My Workflows Page
 */
router.get('/workflows', async (req, res) => {
  try {
    const userId = req.user?.id || 'demo-id';

    const workflows = await Workflow.findAll({
      where: { created_by: userId },
      order: [['updated_at', 'DESC']],
      limit: 50
    });

    const stats = {
      total: await Workflow.count({ where: { created_by: userId } }),
      active: await Workflow.count({ where: { created_by: userId, status: 'active' } }),
      inactive: await Workflow.count({ where: { created_by: userId, status: 'inactive' } })
    };

    res.render('workflows', {
      title: 'My Workflows',
      currentPath: req.path,
      user: req.user || { username: 'Demo User', id: 'demo-id' },
      workflows,
      stats
    });
  } catch (error) {
    console.error('Error rendering workflows:', error);
    res.render('workflows', {
      title: 'My Workflows',
      currentPath: req.path,
      user: req.user || { username: 'Demo User', id: 'demo-id' },
      workflows: [],
      stats: {
        total: 0,
        active: 0,
        inactive: 0
      }
    });
  }
});

/**
 * Workflow Executions Page
 */
router.get('/executions', async (req, res) => {
  try {
    const executions = await WorkflowExecution.findAll({
      include: [{ model: Workflow, as: 'workflow' }],
      order: [['started_at', 'DESC']],
      limit: 50
    });

    const stats = {
      total: await WorkflowExecution.count(),
      completed: await WorkflowExecution.count({ where: { status: 'completed' } }),
      failed: await WorkflowExecution.count({ where: { status: 'failed' } }),
      running: await WorkflowExecution.count({ where: { status: 'running' } })
    };

    res.render('executions', {
      title: 'Executions',
      currentPath: req.path,
      user: req.user || { username: 'Demo User', id: 'demo-id' },
      executions,
      stats
    });
  } catch (error) {
    console.error('Error rendering executions:', error);
    res.render('executions', {
      title: 'Executions',
      currentPath: req.path,
      user: req.user || { username: 'Demo User', id: 'demo-id' },
      executions: [],
      stats: {
        total: 0,
        completed: 0,
        failed: 0,
        running: 0
      }
    });
  }
});

/**
 * Workflow Templates Page
 */
router.get('/templates', async (req, res) => {
  try {
    const templates = await Workflow.findAll({
      where: { is_template: true },
      order: [['name', 'ASC']],
      limit: 50
    });

    res.render('templates', {
      title: 'Workflow Templates',
      currentPath: req.path,
      user: req.user || { username: 'Demo User', id: 'demo-id' },
      templates
    });
  } catch (error) {
    console.error('Error rendering templates:', error);
    res.render('templates', {
      title: 'Workflow Templates',
      currentPath: req.path,
      user: req.user || { username: 'Demo User', id: 'demo-id' },
      templates: []
    });
  }
});

/**
 * Workflow Detail Page
 */
router.get('/workflows/:id', async (req, res) => {
  try {
    const workflow = await Workflow.findByPk(req.params.id);

    if (!workflow) {
      return res.status(404).render('error', {
        title: 'Workflow Not Found',
        currentPath: req.path,
        user: req.user || null,
        message: 'The requested workflow could not be found.'
      });
    }

    const executions = await WorkflowExecution.findAll({
      where: { workflow_id: req.params.id },
      order: [['started_at', 'DESC']],
      limit: 10
    });

    res.render('workflow-detail', {
      title: workflow.name,
      currentPath: req.path,
      user: req.user || { username: 'Demo User', id: 'demo-id' },
      workflow,
      executions
    });
  } catch (error) {
    console.error('Error rendering workflow detail:', error);
    res.status(500).render('error', {
      title: 'Error',
      currentPath: req.path,
      user: req.user || null,
      message: 'An error occurred while loading the workflow.'
    });
  }
});

module.exports = router;
