/**
 * ═══════════════════════════════════════════════════════════════════════
 * Services Routes - Complete Service Management
 * ═══════════════════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const ProcessManager = require('../services/process-manager');

const pm = new ProcessManager();

// Get all services
router.get('/', async (req, res) => {
  try {
    const services = pm.getAllServices();
    res.json({ success: true, services });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get service details
router.get('/:name', async (req, res) => {
  try {
    const service = pm.getService(req.params.name);
    if (!service) {
      return res.status(404).json({ success: false, error: 'Service not found' });
    }
    res.json({ success: true, service });
  } catch (error) {
    res.status(404).json({ success: false, error: error.message });
  }
});

// Start service
router.post('/:name/start', async (req, res) => {
  try {
    const result = await pm.startService(req.params.name);

    // Emit Socket.IO event
    if (global.adminIO) {
      global.adminIO.emit('service:started', {
        service: req.params.name,
        pid: result.pid,
        port: result.port
      });
    }

    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Stop service
router.post('/:name/stop', async (req, res) => {
  try {
    const result = await pm.stopService(req.params.name);

    // Emit Socket.IO event
    if (global.adminIO) {
      global.adminIO.emit('service:stopped', { service: req.params.name });
    }

    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Restart service
router.post('/:name/restart', async (req, res) => {
  try {
    const result = await pm.restartService(req.params.name);

    // Emit Socket.IO event
    if (global.adminIO) {
      global.adminIO.emit('service:restarted', {
        service: req.params.name,
        pid: result.pid
      });
    }

    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get service status
router.get('/:name/status', async (req, res) => {
  try {
    const service = pm.getService(req.params.name);
    if (!service) {
      return res.status(404).json({ success: false, error: 'Service not found' });
    }

    const health = await pm.checkServiceHealth(req.params.name);

    res.json({
      success: true,
      status: {
        name: service.name,
        status: service.status,
        running: service.status === 'running',
        uptime: service.uptime,
        port: service.port,
        pid: service.pid,
        health
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get service logs
router.get('/:name/logs', async (req, res) => {
  try {
    const lines = parseInt(req.query.lines) || 100;
    const logs = pm.getServiceLogs(req.params.name, lines);

    res.json({ success: true, logs });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Start all services
router.post('/bulk/start-all', async (req, res) => {
  try {
    const results = await pm.startAll();
    res.json({ success: true, results });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Stop all services
router.post('/bulk/stop-all', async (req, res) => {
  try {
    const results = await pm.stopAll();
    res.json({ success: true, results });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get system status
router.get('/system/status', async (req, res) => {
  try {
    const status = pm.getSystemStatus();
    res.json({ success: true, status });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
