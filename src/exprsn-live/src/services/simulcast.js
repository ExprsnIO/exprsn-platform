/**
 * Simulcast Streaming Service
 * Manages simultaneous streaming to multiple platforms using FFmpeg
 */

const { spawn } = require('child_process');
const EventEmitter = require('events');
const logger = require('../utils/logger');
const ffmpegService = require('./ffmpeg');

class SimulcastService extends EventEmitter {
  constructor() {
    super();
    this.activeStreams = new Map(); // streamId -> { processes, destinations }
    this.streamMetrics = new Map(); // streamId -> metrics
  }

  /**
   * Start simulcasting to multiple platforms
   * @param {string} streamId - Stream identifier
   * @param {string} inputSource - RTMP input source URL
   * @param {Array} destinations - Array of destination configs
   * @returns {Promise<Object>} Simulcast session info
   */
  async startSimulcast(streamId, inputSource, destinations) {
    try {
      if (this.activeStreams.has(streamId)) {
        throw new Error('Stream is already active');
      }

      logger.info('Starting simulcast', {
        streamId,
        destinationCount: destinations.length,
        platforms: destinations.map(d => d.platform)
      });

      const processes = [];
      const streamInfo = {
        streamId,
        inputSource,
        destinations: [],
        startedAt: new Date(),
        status: 'starting'
      };

      // Initialize metrics
      this.streamMetrics.set(streamId, {
        startTime: Date.now(),
        bytesSent: 0,
        framesSent: 0,
        errors: [],
        destinationMetrics: {}
      });

      // Start FFmpeg process for each destination
      for (const destination of destinations) {
        try {
          const process = await this._startDestinationStream(
            streamId,
            inputSource,
            destination
          );

          processes.push({
            platform: destination.platform,
            destinationId: destination.id,
            process,
            status: 'running'
          });

          streamInfo.destinations.push({
            id: destination.id,
            platform: destination.platform,
            status: 'connected'
          });

          logger.info('Destination stream started', {
            streamId,
            platform: destination.platform,
            destinationId: destination.id
          });
        } catch (error) {
          logger.error('Failed to start destination stream', {
            streamId,
            platform: destination.platform,
            error: error.message
          });

          streamInfo.destinations.push({
            id: destination.id,
            platform: destination.platform,
            status: 'error',
            error: error.message
          });
        }
      }

      if (processes.length === 0) {
        throw new Error('Failed to start any destination streams');
      }

      streamInfo.status = 'live';
      this.activeStreams.set(streamId, {
        ...streamInfo,
        processes
      });

      this.emit('simulcast:started', { streamId, destinations: streamInfo.destinations });

      return streamInfo;
    } catch (error) {
      logger.error('Failed to start simulcast', { streamId, error: error.message });
      throw error;
    }
  }

  /**
   * Start streaming to a single destination
   * @private
   */
  async _startDestinationStream(streamId, inputSource, destination) {
    const ffmpeg = ffmpegService.getFFmpegPath();
    const rtmpUrl = `${destination.rtmpUrl}/${destination.streamKey}`;

    // Build FFmpeg arguments based on destination platform
    const args = this._buildFFmpegArgs(inputSource, rtmpUrl, destination);

    logger.debug('Starting FFmpeg process', {
      streamId,
      platform: destination.platform,
      args: args.filter(a => !a.includes(destination.streamKey)) // Don't log stream key
    });

    const process = spawn(ffmpeg, args);
    const metrics = this.streamMetrics.get(streamId);

    // Initialize destination metrics
    if (metrics) {
      metrics.destinationMetrics[destination.id] = {
        platform: destination.platform,
        bytesSent: 0,
        framesSent: 0,
        bitrate: 0,
        fps: 0,
        lastUpdate: Date.now()
      };
    }

    // Parse FFmpeg output for metrics
    process.stderr.on('data', (data) => {
      const output = data.toString();
      this._parseFFmpegOutput(streamId, destination.id, output);
    });

    // Handle process events
    process.on('close', (code) => {
      logger.info('Destination stream ended', {
        streamId,
        platform: destination.platform,
        destinationId: destination.id,
        code
      });

      this._handleDestinationClose(streamId, destination.id, code);
    });

    process.on('error', (error) => {
      logger.error('Destination stream error', {
        streamId,
        platform: destination.platform,
        destinationId: destination.id,
        error: error.message
      });

      this._handleDestinationError(streamId, destination.id, error);
    });

    return process;
  }

  /**
   * Build FFmpeg arguments for specific platform
   * @private
   */
  _buildFFmpegArgs(inputSource, rtmpUrl, destination) {
    const settings = destination.settings || {};
    const resolution = settings.resolution || '1920x1080';
    const bitrate = settings.bitrate || 4500;
    const framerate = settings.framerate || 30;
    const preset = settings.preset || 'veryfast';
    const keyframeInterval = settings.keyframeInterval || 2;

    // Platform-specific optimizations
    const platformPresets = {
      youtube: {
        profile: 'high',
        level: '4.2',
        preset: 'fast'
      },
      twitch: {
        profile: 'main',
        level: '4.1',
        preset: 'veryfast'
      },
      facebook: {
        profile: 'main',
        level: '4.0',
        preset: 'veryfast'
      },
      cloudflare: {
        profile: 'main',
        level: '4.1',
        preset: 'medium'
      }
    };

    const platformPreset = platformPresets[destination.platform] || platformPresets.twitch;

    return [
      // Input
      '-re', // Read input at native frame rate
      '-i', inputSource,
      '-stream_loop', '-1', // Loop input if file

      // Video encoding
      '-c:v', 'libx264',
      '-preset', platformPreset.preset,
      '-profile:v', platformPreset.profile,
      '-level', platformPreset.level,
      '-b:v', `${bitrate}k`,
      '-maxrate', `${bitrate}k`,
      '-bufsize', `${bitrate * 2}k`,
      '-r', framerate.toString(),
      '-s', resolution,
      '-pix_fmt', 'yuv420p',
      '-g', (framerate * keyframeInterval).toString(), // Keyframe interval
      '-keyint_min', (framerate * keyframeInterval).toString(),
      '-sc_threshold', '0', // Disable scene change detection

      // Audio encoding
      '-c:a', 'aac',
      '-b:a', '160k',
      '-ar', '44100',
      '-ac', '2',

      // RTMP output
      '-f', 'flv',
      '-flvflags', 'no_duration_filesize',
      rtmpUrl
    ];
  }

  /**
   * Parse FFmpeg output for metrics
   * @private
   */
  _parseFFmpegOutput(streamId, destinationId, output) {
    const metrics = this.streamMetrics.get(streamId);
    if (!metrics || !metrics.destinationMetrics[destinationId]) return;

    const destMetrics = metrics.destinationMetrics[destinationId];

    // Extract frame number
    const frameMatch = output.match(/frame=\s*(\d+)/);
    if (frameMatch) {
      destMetrics.framesSent = parseInt(frameMatch[1]);
    }

    // Extract FPS
    const fpsMatch = output.match(/fps=\s*([\d.]+)/);
    if (fpsMatch) {
      destMetrics.fps = parseFloat(fpsMatch[1]);
    }

    // Extract bitrate
    const bitrateMatch = output.match(/bitrate=\s*([\d.]+)kbits/);
    if (bitrateMatch) {
      destMetrics.bitrate = parseFloat(bitrateMatch[1]);
    }

    // Extract size (bytes)
    const sizeMatch = output.match(/size=\s*(\d+)kB/);
    if (sizeMatch) {
      destMetrics.bytesSent = parseInt(sizeMatch[1]) * 1024;
    }

    destMetrics.lastUpdate = Date.now();

    // Emit metrics update
    if (destMetrics.framesSent % 300 === 0) { // Every ~10 seconds at 30fps
      this.emit('metrics:update', {
        streamId,
        destinationId,
        metrics: { ...destMetrics }
      });
    }

    // Check for errors
    if (output.includes('error') || output.includes('failed')) {
      logger.warn('FFmpeg error detected', { streamId, destinationId, output });
      metrics.errors.push({
        destinationId,
        timestamp: Date.now(),
        message: output
      });
    }
  }

  /**
   * Handle destination stream close
   * @private
   */
  _handleDestinationClose(streamId, destinationId, code) {
    const stream = this.activeStreams.get(streamId);
    if (!stream) return;

    const processInfo = stream.processes.find(p => p.destinationId === destinationId);
    if (processInfo) {
      processInfo.status = code === 0 ? 'stopped' : 'error';
    }

    this.emit('destination:closed', { streamId, destinationId, code });

    // Check if all destinations have stopped
    const allStopped = stream.processes.every(p =>
      p.status === 'stopped' || p.status === 'error'
    );

    if (allStopped) {
      this.emit('simulcast:ended', { streamId });
      this.activeStreams.delete(streamId);
    }
  }

  /**
   * Handle destination stream error
   * @private
   */
  _handleDestinationError(streamId, destinationId, error) {
    this.emit('destination:error', { streamId, destinationId, error: error.message });
  }

  /**
   * Stop simulcast for a stream
   * @param {string} streamId - Stream identifier
   * @returns {Promise<boolean>} Success status
   */
  async stopSimulcast(streamId) {
    const stream = this.activeStreams.get(streamId);
    if (!stream) {
      throw new Error('Stream not found');
    }

    logger.info('Stopping simulcast', { streamId });

    // Kill all FFmpeg processes
    for (const processInfo of stream.processes) {
      if (processInfo.process && !processInfo.process.killed) {
        processInfo.process.kill('SIGTERM');
        processInfo.status = 'stopping';
      }
    }

    // Wait for processes to exit (with timeout)
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Force kill any remaining processes
    for (const processInfo of stream.processes) {
      if (processInfo.process && !processInfo.process.killed) {
        processInfo.process.kill('SIGKILL');
      }
    }

    this.activeStreams.delete(streamId);
    this.emit('simulcast:stopped', { streamId });

    logger.info('Simulcast stopped', { streamId });
    return true;
  }

  /**
   * Stop streaming to a specific destination
   * @param {string} streamId - Stream identifier
   * @param {string} destinationId - Destination identifier
   * @returns {Promise<boolean>} Success status
   */
  async stopDestination(streamId, destinationId) {
    const stream = this.activeStreams.get(streamId);
    if (!stream) {
      throw new Error('Stream not found');
    }

    const processInfo = stream.processes.find(p => p.destinationId === destinationId);
    if (!processInfo) {
      throw new Error('Destination not found');
    }

    if (processInfo.process && !processInfo.process.killed) {
      processInfo.process.kill('SIGTERM');
      processInfo.status = 'stopped';

      logger.info('Destination stopped', { streamId, destinationId });
      this.emit('destination:stopped', { streamId, destinationId });

      return true;
    }

    return false;
  }

  /**
   * Add a new destination to an active simulcast
   * @param {string} streamId - Stream identifier
   * @param {Object} destination - Destination configuration
   * @returns {Promise<Object>} Destination info
   */
  async addDestination(streamId, destination) {
    const stream = this.activeStreams.get(streamId);
    if (!stream) {
      throw new Error('Stream not found');
    }

    logger.info('Adding destination to active simulcast', {
      streamId,
      platform: destination.platform
    });

    try {
      const process = await this._startDestinationStream(
        streamId,
        stream.inputSource,
        destination
      );

      const processInfo = {
        platform: destination.platform,
        destinationId: destination.id,
        process,
        status: 'running'
      };

      stream.processes.push(processInfo);

      const destinationInfo = {
        id: destination.id,
        platform: destination.platform,
        status: 'connected'
      };

      stream.destinations.push(destinationInfo);

      this.emit('destination:added', { streamId, destination: destinationInfo });

      return destinationInfo;
    } catch (error) {
      logger.error('Failed to add destination', {
        streamId,
        platform: destination.platform,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get current metrics for a stream
   * @param {string} streamId - Stream identifier
   * @returns {Object|null} Stream metrics
   */
  getMetrics(streamId) {
    return this.streamMetrics.get(streamId) || null;
  }

  /**
   * Get status of active simulcast
   * @param {string} streamId - Stream identifier
   * @returns {Object|null} Stream status
   */
  getStatus(streamId) {
    const stream = this.activeStreams.get(streamId);
    if (!stream) return null;

    return {
      streamId: stream.streamId,
      status: stream.status,
      startedAt: stream.startedAt,
      destinations: stream.destinations.map(d => ({
        id: d.id,
        platform: d.platform,
        status: d.status
      })),
      uptime: Date.now() - new Date(stream.startedAt).getTime()
    };
  }

  /**
   * Get all active streams
   * @returns {Array} List of active streams
   */
  getActiveStreams() {
    return Array.from(this.activeStreams.values()).map(stream => ({
      streamId: stream.streamId,
      status: stream.status,
      startedAt: stream.startedAt,
      destinationCount: stream.destinations.length,
      destinations: stream.destinations.map(d => ({
        id: d.id,
        platform: d.platform,
        status: d.status
      }))
    }));
  }

  /**
   * Get health status for all destinations
   * @param {string} streamId - Stream identifier
   * @returns {Object} Health status
   */
  getHealth(streamId) {
    const metrics = this.getMetrics(streamId);
    const status = this.getStatus(streamId);

    if (!metrics || !status) {
      return null;
    }

    const health = {
      streamId,
      overall: 'healthy',
      uptime: status.uptime,
      destinations: {}
    };

    // Check each destination
    for (const [destId, destMetrics] of Object.entries(metrics.destinationMetrics)) {
      const timeSinceUpdate = Date.now() - destMetrics.lastUpdate;
      const isStale = timeSinceUpdate > 10000; // 10 seconds
      const hasLowFps = destMetrics.fps > 0 && destMetrics.fps < 20;
      const hasLowBitrate = destMetrics.bitrate > 0 && destMetrics.bitrate < 1000;

      let destHealth = 'healthy';
      const issues = [];

      if (isStale) {
        destHealth = 'stale';
        issues.push('No updates received in last 10 seconds');
      }

      if (hasLowFps) {
        destHealth = 'degraded';
        issues.push(`Low FPS: ${destMetrics.fps.toFixed(1)}`);
      }

      if (hasLowBitrate) {
        destHealth = 'degraded';
        issues.push(`Low bitrate: ${destMetrics.bitrate.toFixed(0)} kbps`);
      }

      health.destinations[destId] = {
        platform: destMetrics.platform,
        health: destHealth,
        metrics: {
          fps: destMetrics.fps,
          bitrate: destMetrics.bitrate,
          framesSent: destMetrics.framesSent,
          bytesSent: destMetrics.bytesSent
        },
        issues
      };

      if (destHealth !== 'healthy') {
        health.overall = 'degraded';
      }
    }

    return health;
  }
}

// Export singleton instance
module.exports = new SimulcastService();
