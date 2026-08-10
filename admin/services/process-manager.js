/**
 * ═══════════════════════════════════════════════════════════════════════
 * Process Manager - Start/Stop/Restart Exprsn Services
 * ═══════════════════════════════════════════════════════════════════════
 */

const { spawn } = require('child_process');
const path = require('path');
const axios = require('axios');

class ProcessManager {
  constructor() {
    this.processes = new Map();
    this.baseDir = path.resolve(__dirname, '../../');
  }

  /**
   * Get all registered services
   */
  getAllServices() {
    const services = [
      { name: 'ca', port: 3000, path: 'src/exprsn-ca/index.js', description: 'Certificate Authority', database: 'exprsn_ca', critical: true },
      { name: 'auth', port: 3001, path: 'src/exprsn-auth/src/index.js', description: 'Authentication & OAuth2', database: 'exprsn_auth', critical: true },
      { name: 'spark', port: 3002, path: 'src/exprsn-spark/src/index.js', description: 'Real-time Messaging', database: 'exprsn_spark', critical: false },
      { name: 'timeline', port: 3004, path: 'src/exprsn-timeline/src/index.js', description: 'Social Timeline Feed', database: 'exprsn_timeline', critical: false },
      { name: 'prefetch', port: 3005, path: 'src/exprsn-prefetch/src/index.js', description: 'Timeline Prefetch Cache', database: 'exprsn_prefetch', critical: false },
      { name: 'moderator', port: 3006, path: 'src/exprsn-moderator/src/index.js', description: 'AI Content Moderation', database: 'exprsn_moderator', critical: false },
      { name: 'filevault', port: 3007, path: 'src/exprsn-filevault/src/index.js', description: 'File Storage (S3/Disk/IPFS)', database: 'exprsn_filevault', critical: false },
      { name: 'gallery', port: 3008, path: 'src/exprsn-gallery/src/index.js', description: 'Media Gallery', database: 'exprsn_gallery', critical: false },
      { name: 'live', port: 3009, path: 'src/exprsn-live/src/index.js', description: 'Live Streaming', database: 'exprsn_live', critical: false },
      { name: 'bridge', port: 3010, path: 'src/exprsn-bridge/src/index.js', description: 'API Gateway', database: null, critical: true },
      { name: 'nexus', port: 3011, path: 'src/exprsn-nexus/src/index.js', description: 'Groups & Communities', database: 'exprsn_nexus', critical: false },
      { name: 'pulse', port: 3012, path: 'src/exprsn-pulse/src/index.js', description: 'Analytics & Metrics', database: 'exprsn_pulse', critical: false },
      { name: 'vault', port: 3013, path: 'src/exprsn-vault/src/index.js', description: 'Secrets Management', database: 'exprsn_vault', critical: true },
      { name: 'herald', port: 3014, path: 'src/exprsn-herald/src/index.js', description: 'Notifications (Email/SMS/Push)', database: 'exprsn_herald', critical: false },
      { name: 'setup', port: 3015, path: 'src/exprsn-setup/src/index.js', description: 'Service Discovery', database: 'exprsn_setup', critical: false },
      { name: 'forge', port: 3016, path: 'src/exprsn-forge/src/index.js', description: 'Business Platform (CRM/ERP)', database: 'exprsn_forge', critical: false },
      { name: 'workflow', port: 3017, path: 'src/exprsn-workflow/src/index.js', description: 'Workflow Automation', database: 'exprsn_workflow', critical: false },
      { name: 'svr', port: 5000, path: 'src/exprsn-svr/index.js', description: 'Dynamic Page Server', database: 'exprsn_svr', critical: false }
    ];

    return services.map(s => ({
      ...s,
      status: this.getServiceStatus(s.name),
      pid: this.processes.has(s.name) ? this.processes.get(s.name).pid : null,
      uptime: this.getUptime(s.name)
    }));
  }

  /**
   * Get single service details
   */
  getService(name) {
    const services = this.getAllServices();
    return services.find(s => s.name === name);
  }

  /**
   * Start a service
   */
  async startService(name) {
    if (this.processes.has(name)) {
      throw new Error(`Service ${name} is already running`);
    }

    const service = this.getService(name);
    if (!service) {
      throw new Error(`Service ${name} not found`);
    }

    const scriptPath = path.join(this.baseDir, service.path);

    const proc = spawn('node', [scriptPath], {
      cwd: this.baseDir,
      env: { ...process.env, PORT: service.port },
      detached: false,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    // Store process info
    this.processes.set(name, {
      process: proc,
      pid: proc.pid,
      startedAt: Date.now(),
      logs: []
    });

    // Capture stdout
    proc.stdout.on('data', (data) => {
      const log = data.toString();
      this.addLog(name, 'stdout', log);
      console.log(`[${name}] ${log}`);

      // Emit via Socket.IO
      if (global.adminIO) {
        global.adminIO.emit('service:log', { service: name, type: 'stdout', message: log });
      }
    });

    // Capture stderr
    proc.stderr.on('data', (data) => {
      const log = data.toString();
      this.addLog(name, 'stderr', log);
      console.error(`[${name}] ${log}`);

      if (global.adminIO) {
        global.adminIO.emit('service:log', { service: name, type: 'stderr', message: log });
      }
    });

    // Handle process exit
    proc.on('exit', (code, signal) => {
      console.log(`[${name}] Exited with code ${code}, signal ${signal}`);
      this.processes.delete(name);

      if (global.adminIO) {
        global.adminIO.emit('service:stopped', { service: name, code, signal });
      }
    });

    // Handle errors
    proc.on('error', (error) => {
      console.error(`[${name}] Error:`, error);
      this.processes.delete(name);

      if (global.adminIO) {
        global.adminIO.emit('service:error', { service: name, error: error.message });
      }
    });

    // Wait a bit to see if it starts successfully
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Check if still running
    if (!this.processes.has(name)) {
      throw new Error(`Service ${name} failed to start`);
    }

    return {
      success: true,
      service: name,
      pid: proc.pid,
      port: service.port
    };
  }

  /**
   * Stop a service
   */
  async stopService(name) {
    if (!this.processes.has(name)) {
      throw new Error(`Service ${name} is not running`);
    }

    const processInfo = this.processes.get(name);
    const proc = processInfo.process;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        // Force kill if graceful shutdown fails
        proc.kill('SIGKILL');
        reject(new Error(`Service ${name} did not stop gracefully, force killed`));
      }, 10000);

      proc.on('exit', () => {
        clearTimeout(timeout);
        this.processes.delete(name);
        resolve({ success: true, service: name });
      });

      // Send SIGTERM for graceful shutdown
      proc.kill('SIGTERM');
    });
  }

  /**
   * Restart a service
   */
  async restartService(name) {
    const wasRunning = this.processes.has(name);

    if (wasRunning) {
      await this.stopService(name);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    return await this.startService(name);
  }

  /**
   * Get service status
   */
  getServiceStatus(name) {
    if (this.processes.has(name)) {
      return 'running';
    }
    return 'stopped';
  }

  /**
   * Get service uptime in seconds
   */
  getUptime(name) {
    if (!this.processes.has(name)) {
      return 0;
    }

    const processInfo = this.processes.get(name);
    return Math.floor((Date.now() - processInfo.startedAt) / 1000);
  }

  /**
   * Get service logs
   */
  getServiceLogs(name, lines = 100) {
    if (!this.processes.has(name)) {
      return [];
    }

    const processInfo = this.processes.get(name);
    return processInfo.logs.slice(-lines);
  }

  /**
   * Add log entry
   */
  addLog(name, type, message) {
    if (!this.processes.has(name)) {
      return;
    }

    const processInfo = this.processes.get(name);
    processInfo.logs.push({
      timestamp: new Date().toISOString(),
      type,
      message: message.trim()
    });

    // Keep only last 1000 log entries
    if (processInfo.logs.length > 1000) {
      processInfo.logs = processInfo.logs.slice(-1000);
    }
  }

  /**
   * Check service health via HTTP
   */
  async checkServiceHealth(name) {
    const service = this.getService(name);
    if (!service) {
      return { healthy: false, error: 'Service not found' };
    }

    if (this.getServiceStatus(name) !== 'running') {
      return { healthy: false, error: 'Service not running' };
    }

    try {
      const response = await axios.get(`http://localhost:${service.port}/health`, {
        timeout: 5000
      });

      return {
        healthy: true,
        status: response.status,
        data: response.data
      };
    } catch (error) {
      return {
        healthy: false,
        error: error.message
      };
    }
  }

  /**
   * Start all services
   */
  async startAll() {
    const services = this.getAllServices();
    const results = [];

    for (const service of services) {
      try {
        if (this.getServiceStatus(service.name) === 'stopped') {
          const result = await this.startService(service.name);
          results.push({ service: service.name, success: true, result });
        }
      } catch (error) {
        results.push({ service: service.name, success: false, error: error.message });
      }
    }

    return results;
  }

  /**
   * Stop all services
   */
  async stopAll() {
    const services = this.getAllServices();
    const results = [];

    for (const service of services) {
      try {
        if (this.getServiceStatus(service.name) === 'running') {
          const result = await this.stopService(service.name);
          results.push({ service: service.name, success: true, result });
        }
      } catch (error) {
        results.push({ service: service.name, success: false, error: error.message });
      }
    }

    return results;
  }

  /**
   * Get system status
   */
  getSystemStatus() {
    const services = this.getAllServices();
    const running = services.filter(s => s.status === 'running').length;
    const stopped = services.filter(s => s.status === 'stopped').length;

    return {
      total: services.length,
      running,
      stopped,
      services: services.map(s => ({
        name: s.name,
        status: s.status,
        port: s.port,
        uptime: s.uptime,
        pid: s.pid
      }))
    };
  }
}

module.exports = ProcessManager;
