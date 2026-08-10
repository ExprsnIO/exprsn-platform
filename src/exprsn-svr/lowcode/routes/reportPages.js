/**
 * Report Pages Routes - Serve report UI pages
 */

const express = require('express');
const router = express.Router();

/**
 * GET /lowcode/reports - Reports Manager
 */
router.get('/reports', async (req, res) => {
  const { applicationId } = req.query;

  if (!applicationId) {
    return res.status(400).send('Application ID is required');
  }

  try {
    const { Application } = require('../models');
    const application = await Application.findByPk(applicationId);

    res.render('reports-manager', {
      title: 'Reports Manager',
      applicationId,
      application
    });
  } catch (error) {
    console.error('[Report Pages] Failed to load application:', error);
    res.status(500).send('Failed to load application');
  }
});

/**
 * GET /lowcode/report-designer - Report Designer
 */
router.get('/report-designer', async (req, res) => {
  const { applicationId, reportId } = req.query;

  if (!applicationId) {
    return res.status(400).send('Application ID is required');
  }

  res.render('report-designer', {
    title: 'Report Designer',
    applicationId,
    reportId: reportId || null
  });
});

/**
 * GET /lowcode/dashboards - Dashboards Manager
 */
router.get('/dashboards', async (req, res) => {
  const { appId } = req.query;

  if (!appId) {
    return res.status(400).send('Application ID is required');
  }

  try {
    const { Application } = require('../models');
    const application = await Application.findByPk(appId);

    res.render('dashboards-manager', {
      title: 'Dashboards Manager',
      appId,
      application
    });
  } catch (error) {
    console.error('[Report Pages] Failed to load application:', error);
    res.status(500).send('Failed to load application');
  }
});

module.exports = router;
