/**
 * ═══════════════════════════════════════════════════════════
 * Application-HTML Integration API Routes
 * ═══════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const AppHtmlIntegrationService = require('../services/AppHtmlIntegrationService');

/**
 * GET /api/applications/:appId/html-project
 * Get or create HTML project for application
 */
router.get('/applications/:appId/html-project', async (req, res) => {
  try {
    const { appId } = req.params;
    const userId = req.user?.id || '00000000-0000-0000-0000-000000000000';

    const result = await AppHtmlIntegrationService.getOrCreateHtmlProject(appId, userId);

    res.json(result);
  } catch (error) {
    console.error('Error getting HTML project:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get HTML project'
    });
  }
});

/**
 * POST /api/applications/:appId/sync-to-html
 * Sync application changes to HTML project
 */
router.post('/applications/:appId/sync-to-html', async (req, res) => {
  try {
    const { appId } = req.params;

    const result = await AppHtmlIntegrationService.syncAppToHtml(appId);

    res.json(result);
  } catch (error) {
    console.error('Error syncing to HTML:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to sync to HTML'
    });
  }
});

/**
 * GET /api/applications/:appId/html-ide-url
 * Get HTML IDE URL for application
 */
router.get('/applications/:appId/html-ide-url', async (req, res) => {
  try {
    const { appId } = req.params;
    const userId = req.user?.id || '00000000-0000-0000-0000-000000000000';

    // Get or create HTML project
    const result = await AppHtmlIntegrationService.getOrCreateHtmlProject(appId, userId);

    if (!result.success) {
      return res.status(400).json(result);
    }

    const ideUrl = `/lowcode/html-ide?projectId=${result.project.id}`;

    res.json({
      success: true,
      url: ideUrl,
      projectId: result.project.id,
      created: result.created
    });
  } catch (error) {
    console.error('Error getting HTML IDE URL:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get HTML IDE URL'
    });
  }
});

module.exports = router;
