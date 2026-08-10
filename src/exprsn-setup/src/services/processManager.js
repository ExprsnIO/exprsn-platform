/**
 * ═══════════════════════════════════════════════════════════════════════
 * Process Manager
 * Manages lifecycle of Exprsn microservices
 * ═══════════════════════════════════════════════════════════════════════
 */

const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs').promises;
const logger = require('../utils/logger');

class ProcessManager {
  constructor() {
    this.processes = new Map();
    this.serviceConfigs = {
      ca: { name: 'Certificate Authority', port: 3000, dir: 'exprsn-ca', script: 'index.js' },
      auth: { name: 'Authentication', port: 3001, dir: 'exprsn-auth', script: 'index.js' },
      spark: { name: 'Messaging', port: 3002, dir: 'exprsn-spark', script: 'index.js' },
      timeline: { name: 'Timeline', port: 3004, dir: 'exprsn-timeline', script: 'index.js' },
      prefetch: { name: 'Prefetch', port: 3005, dir: 'exprsn-prefetch', script: 'index.js' },
      moderator: { name: 'Moderator', port: 3006, dir: 'exprsn-moderator', script: 'index.js' },
      filevault: { name: 'FileVault', port: 3007, dir: 'exprsn-filevault', script: 'index.js' },
      gallery: { name: 'Gallery', port: 3008, dir: 'exprsn-gallery', script: 'index.js' },
      live: { name: 'Live', port: 3009, dir: 'exprsn-live', script: 'index.js' },
      bridge: { name: 'Bridge', port: 3010, dir: 'exprsn-bridge', script: 'index.js' },
      nexus: { name: 'Nexus', port: 3011, dir: 'exprsn-nexus', script: 'index.js' },
      pulse: { name: 'Pulse', port: 3012, dir: 'exprsn-pulse', script: 'index.js' },
      vault: { name: 'Vault', port: 3013, dir: 'exprsn-vault', script: 'index.js' },
      herald: { name: 'Herald', port: 3014, dir: 'exprsn-herald', script: 'index.js' },
      setup: { name: 'Setup', port: 3015, dir: 'exprsn-setup', script: 'src/index.js' },
      forge: { name: 'Forge', port: 3016, dir: 'exprsn-forge', script: 'index.js' },
      workflow: { name: 'Workflow', port: 3017, dir: 'exprsn-workflow', script: 'index.js' },
      svr: { name: 'SVR', port: 5001, dir: 'exprsn-svr', script: 'index.js' }
    };
  }

  /**
   * Start a service
   */
  async startService(serviceId) {
    try {
      const config = this.serviceConfigs[serviceId];
      if (!config) {
        throw new Error(`Unknown service: ${serviceId}`);
      }

      // Check if already running
      const isRunning = await this.isServiceRunning(serviceId);
      if (isRunning) {
        logger.warn(`Service ${serviceId} is already running`);
        return { success: true, message: 'Service already running', alreadyRunning: true };
      }

      // Kill any process on the port first
      await this.killProcessOnPort(config.port);

      // Start the service
      const servicePath = path.join(__dirname, '../../../', config.dir);
      const scriptPath = path.join(servicePath, config.script);

      logger.info(`Starting service ${serviceId} at ${servicePath}`);

      const child = spawn('node', [scriptPath], {
        cwd: servicePath,
        env: {
          ...process.env,
          PORT: config.port,
          NODE_ENV: process.env.NODE_ENV || 'development'
        },
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe']
      });

      // Store process info
      this.processes.set(serviceId, {
        pid: child.pid,
        config,
        process: child,
        startedAt: Date.now(),
        logs: []
      });

      // Capture logs
      child.stdout.on('data', (data) => {
        this.handleLog(serviceId, 'info', data.toString());
      });

      child.stderr.on('data', (data) => {
        this.handleLog(serviceId, 'error', data.toString());
      });

      child.on('exit', (code) => {
        logger.info(`Service ${serviceId} exited with code ${code}`);
        this.processes.delete(serviceId);
      });

      // Unref to allow parent to exit
      child.unref();

      // Wait a bit to ensure it started
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Verify it's running
      const running = await this.isServiceRunning(serviceId);
      if (!running) {
        throw new Error('Service failed to start');
      }

      logger.info(`Service ${serviceId} started successfully on port ${config.port}`);

      return {
        success: true,
        message: `Service ${config.name} started`,
        pid: child.pid,
        port: config.port
      };

    } catch (error) {
      logger.error(`Failed to start service ${serviceId}:`, error);
      throw error;
    }
  }

  /**
   * Stop a service
   */
  async stopService(serviceId) {
    try {
      const config = this.serviceConfigs[serviceId];
      if (!config) {
        throw new Error(`Unknown service: ${serviceId}`);
      }

      logger.info(`Stopping service ${serviceId}`);

      // Kill process on port
      await this.killProcessOnPort(config.port);

      // Remove from tracking
      this.processes.delete(serviceId);

      logger.info(`Service ${serviceId} stopped`);

      return {
        success: true,
        message: `Service ${config.name} stopped`
      };

    } catch (error) {
      logger.error(`Failed to stop service ${serviceId}:`, error);
      throw error;
    }
  }

  /**
   * Restart a service
   */
  async restartService(serviceId) {
    try {
      logger.info(`Restarting service ${serviceId}`);

      await this.stopService(serviceId);
      await new Promise(resolve => setTimeout(resolve, 1000));
      const result = await this.startService(serviceId);

      return {
        success: true,
        message: `Service ${this.serviceConfigs[serviceId].name} restarted`,
        ...result
      };

    } catch (error) {
      logger.error(`Failed to restart service ${serviceId}:`, error);
      throw error;
    }
  }

  /**
   * Check if service is running
   */
  async isServiceRunning(serviceId) {
    const config = this.serviceConfigs[serviceId];
    if (!config) return false;

    return new Promise((resolve) => {
      exec(`lsof -ti:${config.port}`, (error, stdout) => {
        resolve(!error && stdout.trim().length > 0);
      });
    });
  }

  /**
   * Get service status
   */
  async getServiceStatus(serviceId) {
    const config = this.serviceConfigs[serviceId];
    if (!config) {
      throw new Error(`Unknown service: ${serviceId}`);
    }

    const isRunning = await this.isServiceRunning(serviceId);
    const processInfo = this.processes.get(serviceId);

    return {
      id: serviceId,
      name: config.name,
      port: config.port,
      running: isRunning,
      pid: processInfo?.pid,
      uptime: processInfo ? Math.floor((Date.now() - processInfo.startedAt) / 1000) : 0,
      logs: processInfo?.logs.slice(-50) || []
    };
  }

  /**
   * Get all services status
   */
  async getAllServicesStatus() {
    const statuses = await Promise.all(
      Object.keys(this.serviceConfigs).map(serviceId => this.getServiceStatus(serviceId))
    );

    return statuses;
  }

  /**
   * Kill process on port
   */
  async killProcessOnPort(port) {
    return new Promise((resolve) => {
      exec(`lsof -ti:${port}`, (error, stdout) => {
        if (error || !stdout.trim()) {
          resolve();
          return;
        }

        const pid = stdout.trim();
        exec(`kill -9 ${pid}`, (killError) => {
          if (killError) {
            logger.warn(`Failed to kill process on port ${port}:`, killError);
          }
          setTimeout(resolve, 500);
        });
      });
    });
  }

  /**
   * Handle log output
   */
  handleLog(serviceId, level, message) {
    const processInfo = this.processes.get(serviceId);
    if (!processInfo) return;

    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      message: message.trim(),
      service: serviceId
    };

    // Store last 100 logs
    processInfo.logs.push(logEntry);
    if (processInfo.logs.length > 100) {
      processInfo.logs.shift();
    }

    // Emit to Socket.IO if available
    if (global.io) {
      global.io.emit('log:entry', logEntry);
    }

    logger.info(`[${serviceId}] ${message.trim()}`);
  }

  /**
   * Get service logs
   */
  getServiceLogs(serviceId, limit = 50) {
    const processInfo = this.processes.get(serviceId);
    if (!processInfo) {
      return [];
    }

    return processInfo.logs.slice(-limit);
  }

  /**
   * Stream logs for a service
   */
  streamLogs(serviceId, callback) {
    const processInfo = this.processes.get(serviceId);
    if (!processInfo) {
      callback(new Error('Service not running'));
      return null;
    }

    // Return existing logs first
    processInfo.logs.forEach(callback);

    // Set up streaming
    const listener = (log) => {
      if (log.service === serviceId) {
        callback(null, log);
      }
    };

    if (global.io) {
      global.io.on('log:entry', listener);
    }

    return () => {
      if (global.io) {
        global.io.off('log:entry', listener);
      }
    };
  }
}

// Singleton instance
const processManager = new ProcessManager();

module.exports = processManager;
