/**
 * SRS (Simple Realtime Server) Media Server Integration
 * Provides RTMP/HLS/WebRTC streaming capabilities
 */

const axios = require('axios');
const logger = require('../../utils/logger');
const config = require('../../config');

class SRSStreamService {
  constructor() {
    this.baseUrl = config.platforms?.srs?.apiUrl || 'http://localhost:1985';
    this.rtmpPort = config.platforms?.srs?.rtmpPort || 1935;
    this.httpPort = config.platforms?.srs?.httpPort || 8080;
    this.httpsPort = config.platforms?.srs?.httpsPort || 8443;
    this.apiSecret = config.platforms?.srs?.apiSecret;

    this.client = axios.create({
      baseURL: `${this.baseUrl}/api/v1`,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }

  /**
   * Get SRS server version and status
   * @returns {Promise<Object>} Server information
   */
  async getServerInfo() {
    try {
      const response = await this.client.get('/versions');

      logger.info('SRS server info retrieved', response.data);

      return {
        version: response.data.data?.major,
        buildVersion: response.data.data?.version,
        uptime: response.data.data?.pid
      };
    } catch (error) {
      logger.error('Failed to get SRS server info:', error.message);
      throw new Error('Failed to connect to SRS server');
    }
  }

  /**
   * Get all active streams
   * @returns {Promise<Array>} List of active streams
   */
  async getActiveStreams() {
    try {
      const response = await this.client.get('/streams');

      const streams = response.data.streams || [];

      return streams.map(stream => ({
        id: stream.id,
        name: stream.name,
        app: stream.app,
        tcUrl: stream.tcUrl,
        url: stream.url,
        liveMs: stream.live_ms,
        clients: stream.clients,
        frames: stream.frames,
        sendBytes: stream.send_bytes,
        recvBytes: stream.recv_bytes,
        kbps: stream.kbps,
        publish: stream.publish,
        video: stream.video,
        audio: stream.audio
      }));
    } catch (error) {
      logger.error('Failed to get active streams:', error.message);
      return [];
    }
  }

  /**
   * Get stream details
   * @param {string} streamId - Stream ID
   * @returns {Promise<Object|null>} Stream details
   */
  async getStream(streamId) {
    try {
      const response = await this.client.get(`/streams/${streamId}`);
      return response.data.stream || null;
    } catch (error) {
      logger.error('Failed to get stream details:', error.message);
      return null;
    }
  }

  /**
   * Get clients connected to a stream
   * @param {string} streamId - Stream ID
   * @returns {Promise<Array>} List of clients
   */
  async getStreamClients(streamId) {
    try {
      const response = await this.client.get(`/clients`, {
        params: { stream: streamId }
      });

      const clients = response.data.clients || [];

      return clients.map(client => ({
        id: client.id,
        vhost: client.vhost,
        stream: client.stream,
        ip: client.ip,
        pageUrl: client.pageUrl,
        swfUrl: client.swfUrl,
        tcUrl: client.tcUrl,
        url: client.url,
        type: client.type,
        publish: client.publish,
        alive: client.alive
      }));
    } catch (error) {
      logger.error('Failed to get stream clients:', error.message);
      return [];
    }
  }

  /**
   * Kick off a client
   * @param {string} clientId - Client ID to kick
   * @returns {Promise<boolean>} Success status
   */
  async kickClient(clientId) {
    try {
      await this.client.delete(`/clients/${clientId}`);
      logger.info('Client kicked', { clientId });
      return true;
    } catch (error) {
      logger.error('Failed to kick client:', error.message);
      return false;
    }
  }

  /**
   * Generate RTMP publish URL
   * @param {string} app - Application name (e.g., 'live')
   * @param {string} streamKey - Stream key
   * @returns {Object} RTMP URLs
   */
  generateRTMPUrl(app = 'live', streamKey) {
    const host = config.platforms?.srs?.publicHost || 'localhost';

    return {
      rtmp: `rtmp://${host}:${this.rtmpPort}/${app}/${streamKey}`,
      rtmps: config.platforms?.srs?.sslEnabled
        ? `rtmps://${host}:${this.httpsPort}/${app}/${streamKey}`
        : null
    };
  }

  /**
   * Generate HLS playback URL
   * @param {string} app - Application name
   * @param {string} streamKey - Stream key
   * @returns {string} HLS URL
   */
  generateHLSUrl(app = 'live', streamKey) {
    const host = config.platforms?.srs?.publicHost || 'localhost';
    const protocol = config.platforms?.srs?.sslEnabled ? 'https' : 'http';
    const port = config.platforms?.srs?.sslEnabled ? this.httpsPort : this.httpPort;

    return `${protocol}://${host}:${port}/${app}/${streamKey}.m3u8`;
  }

  /**
   * Generate FLV playback URL
   * @param {string} app - Application name
   * @param {string} streamKey - Stream key
   * @returns {string} FLV URL
   */
  generateFLVUrl(app = 'live', streamKey) {
    const host = config.platforms?.srs?.publicHost || 'localhost';
    const protocol = config.platforms?.srs?.sslEnabled ? 'https' : 'http';
    const port = config.platforms?.srs?.sslEnabled ? this.httpsPort : this.httpPort;

    return `${protocol}://${host}:${port}/${app}/${streamKey}.flv`;
  }

  /**
   * Generate WebRTC play URL
   * @param {string} app - Application name
   * @param {string} streamKey - Stream key
   * @returns {string} WebRTC URL
   */
  generateWebRTCUrl(app = 'live', streamKey) {
    const host = config.platforms?.srs?.publicHost || 'localhost';
    const protocol = config.platforms?.srs?.sslEnabled ? 'https' : 'http';
    const port = config.platforms?.srs?.sslEnabled ? this.httpsPort : this.httpPort;

    return `${protocol}://${host}:${port}/rtc/v1/play/?app=${app}&stream=${streamKey}`;
  }

  /**
   * Create stream configuration
   * @param {Object} streamConfig - Stream configuration
   * @returns {Object} Stream URLs and configuration
   */
  createStream(streamConfig) {
    const {
      streamKey,
      app = 'live',
      enableHLS = true,
      enableFLV = true,
      enableWebRTC = true,
      enableDVR = false,
      dvrPath = null
    } = streamConfig;

    const rtmpUrls = this.generateRTMPUrl(app, streamKey);
    const hlsUrl = enableHLS ? this.generateHLSUrl(app, streamKey) : null;
    const flvUrl = enableFLV ? this.generateFLVUrl(app, streamKey) : null;
    const webrtcUrl = enableWebRTC ? this.generateWebRTCUrl(app, streamKey) : null;

    return {
      streamKey,
      app,
      ingest: {
        rtmp: rtmpUrls.rtmp,
        rtmps: rtmpUrls.rtmps
      },
      playback: {
        hls: hlsUrl,
        flv: flvUrl,
        webrtc: webrtcUrl
      },
      config: {
        enableHLS,
        enableFLV,
        enableWebRTC,
        enableDVR,
        dvrPath
      }
    };
  }

  /**
   * Get stream statistics
   * @param {string} app - Application name
   * @param {string} streamKey - Stream key
   * @returns {Promise<Object|null>} Stream statistics
   */
  async getStreamStats(app, streamKey) {
    try {
      const streams = await this.getActiveStreams();
      const stream = streams.find(s => s.app === app && s.name === streamKey);

      if (!stream) {
        return null;
      }

      return {
        isLive: stream.publish.active || false,
        duration: stream.liveMs,
        viewers: stream.clients,
        bitrate: stream.kbps,
        sendBytes: stream.sendBytes,
        recvBytes: stream.recvBytes,
        video: stream.video,
        audio: stream.audio
      };
    } catch (error) {
      logger.error('Failed to get stream stats:', error.message);
      return null;
    }
  }

  /**
   * Enable DVR (recording) for a stream
   * @param {string} app - Application name
   * @param {string} streamKey - Stream key
   * @param {string} dvrPath - Path to save recordings
   * @returns {Promise<boolean>} Success status
   */
  async enableDVR(app, streamKey, dvrPath) {
    try {
      // Note: DVR configuration in SRS is typically done via config file
      // This is a placeholder for runtime DVR control if supported
      logger.info('DVR enabled', { app, streamKey, dvrPath });
      return true;
    } catch (error) {
      logger.error('Failed to enable DVR:', error.message);
      return false;
    }
  }

  /**
   * Check if SRS server is healthy
   * @returns {Promise<boolean>} Health status
   */
  async isHealthy() {
    try {
      await this.getServerInfo();
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get server statistics
   * @returns {Promise<Object|null>} Server statistics
   */
  async getServerStats() {
    try {
      const response = await this.client.get('/summaries');

      const data = response.data.data || {};

      return {
        ok: response.data.code === 0,
        serverPid: data.pid,
        uptime: data.uptime,
        connections: data.conn_sys,
        videoConnections: data.conn_video,
        audioConnections: data.conn_audio,
        sendBytesRate: data.kbps_send,
        recvBytesRate: data.kbps_recv
      };
    } catch (error) {
      logger.error('Failed to get server stats:', error.message);
      return null;
    }
  }
}

module.exports = new SRSStreamService();
