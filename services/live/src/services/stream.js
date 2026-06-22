/**
 * Stream Service
 * Business logic for managing live streams
 */

const { Stream, Recording, Participant } = require('../models');
const cloudflareService = require('./cloudflare');
const { getProvider } = require('./streamProvider');
const logger = require('../utils/logger');
const crypto = require('crypto');

class StreamService {
  /**
   * Default stream share metrics
   * @returns {Object} Share metrics shape
   */
  getDefaultShareMetrics() {
    return {
      linkSharedCount: 0,
      linkOpenedCount: 0,
      watchStartedCount: 0,
      bySource: {},
      lastEventAt: null
    };
  }

  /**
   * Create a new live stream
   * @param {Object} streamData - Stream creation data
   * @param {string} userId - User ID creating the stream
   * @returns {Promise<Object>} Created stream
   */
  async createStream(streamData, userId) {
    try {
      const { title, description, visibility = 'public', isRecording = true } = streamData;

      // Generate unique stream key
      const streamKey = crypto.randomBytes(32).toString('hex');

      // Provision the live input on the configured ingest provider
      // (Cloudflare Stream or the self-hosted SRS server).
      const input = await getProvider().createLiveInput({
        streamKey,
        recording: {
          mode: isRecording ? 'automatic' : 'off'
        },
        meta: {
          title,
          userId
        }
      });

      // Create stream in database. `cloudflare_stream_id` doubles as the
      // provider's live-input id (the SRS adapter returns the stream key).
      const stream = await Stream.create({
        user_id: userId,
        title,
        description,
        stream_key: input.streamKey || streamKey,
        cloudflare_stream_id: input.uid,
        rtmp_url: input.rtmpUrl,
        hls_url: input.hlsUrl || input.webRTCUrl,
        visibility,
        is_recording: isRecording,
        status: 'pending'
      });

      logger.info('Stream created', { streamId: stream.id, userId });

      return this.formatStream(stream);
    } catch (error) {
      logger.error('Failed to create stream:', error);
      throw error;
    }
  }

  /**
   * Get stream by ID
   * @param {string} streamId - Stream ID
   * @returns {Promise<Object|null>} Stream data
   */
  async getStream(streamId) {
    try {
      const stream = await Stream.findByPk(streamId, {
        include: [
          {
            model: Participant,
            as: 'viewers',
            where: { status: 'connected' },
            required: false
          }
        ]
      });

      if (!stream) {
        return null;
      }

      return this.formatStream(stream);
    } catch (error) {
      logger.error('Failed to get stream:', error);
      throw error;
    }
  }

  /**
   * List streams
   * @param {Object} filters - Filter options
   * @returns {Promise<Object>} Paginated streams
   */
  async listStreams(filters = {}) {
    try {
      const {
        status = null,
        visibility = null,
        userId = null,
        limit = 20,
        offset = 0
      } = filters;

      const where = {};
      if (status) where.status = status;
      if (visibility) where.visibility = visibility;
      if (userId) where.user_id = userId;

      const { count, rows } = await Stream.findAndCountAll({
        where,
        limit: parseInt(limit),
        offset: parseInt(offset),
        order: [['created_at', 'DESC']],
        include: [
          {
            model: Participant,
            as: 'viewers',
            where: { status: 'connected' },
            required: false
          }
        ]
      });

      return {
        streams: rows.map(stream => this.formatStream(stream)),
        pagination: {
          total: count,
          limit: parseInt(limit),
          offset: parseInt(offset)
        }
      };
    } catch (error) {
      logger.error('Failed to list streams:', error);
      throw error;
    }
  }

  /**
   * Start a stream
   * @param {string} streamId - Stream ID
   * @returns {Promise<Object>} Updated stream
   */
  async startStream(streamId) {
    try {
      const stream = await Stream.findByPk(streamId);
      if (!stream) {
        throw new Error('Stream not found');
      }

      await stream.update({
        status: 'live',
        started_at: new Date()
      });

      logger.info('Stream started', { streamId });

      return this.formatStream(stream);
    } catch (error) {
      logger.error('Failed to start stream:', error);
      throw error;
    }
  }

  /**
   * End a stream
   * @param {string} streamId - Stream ID
   * @returns {Promise<Object>} Updated stream
   */
  async endStream(streamId) {
    try {
      const stream = await Stream.findByPk(streamId);
      if (!stream) {
        throw new Error('Stream not found');
      }

      const ended_at = new Date();
      const duration_seconds = stream.started_at
        ? Math.floor((ended_at - stream.started_at) / 1000)
        : 0;

      await stream.update({
        status: 'ended',
        ended_at,
        duration_seconds
      });

      // End all viewer connections
      await Participant.update(
        { status: 'disconnected', left_at: ended_at },
        { where: { stream_id: streamId, status: 'connected' } }
      );

      logger.info('Stream ended', { streamId, duration_seconds });

      return this.formatStream(stream);
    } catch (error) {
      logger.error('Failed to end stream:', error);
      throw error;
    }
  }

  /**
   * Update stream details
   * @param {string} streamId - Stream ID
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object>} Updated stream
   */
  async updateStream(streamId, updates) {
    try {
      const stream = await Stream.findByPk(streamId);
      if (!stream) {
        throw new Error('Stream not found');
      }

      const { title, description, visibility } = updates;
      const updateData = {};

      if (title !== undefined) updateData.title = title;
      if (description !== undefined) updateData.description = description;
      if (visibility !== undefined) updateData.visibility = visibility;

      await stream.update(updateData);

      logger.info('Stream updated', { streamId });

      return this.formatStream(stream);
    } catch (error) {
      logger.error('Failed to update stream:', error);
      throw error;
    }
  }

  /**
   * Delete a stream
   * @param {string} streamId - Stream ID
   * @returns {Promise<boolean>} Success status
   */
  async deleteStream(streamId) {
    try {
      const stream = await Stream.findByPk(streamId);
      if (!stream) {
        throw new Error('Stream not found');
      }

      // Delete from Cloudflare if exists
      if (stream.cloudflare_stream_id) {
        await getProvider().deleteLiveInput(stream.cloudflare_stream_id);
      }

      // Delete from database (cascades to participants and recordings)
      await stream.destroy();

      logger.info('Stream deleted', { streamId });

      return true;
    } catch (error) {
      logger.error('Failed to delete stream:', error);
      throw error;
    }
  }

  /**
   * Add viewer to stream
   * @param {string} streamId - Stream ID
   * @param {string} userId - User ID
   * @param {string} socketId - Socket connection ID
   * @returns {Promise<Object>} Participant data
   */
  async addViewer(streamId, userId, socketId) {
    try {
      const stream = await Stream.findByPk(streamId);
      if (!stream) {
        throw new Error('Stream not found');
      }

      // Create participant
      const participant = await Participant.create({
        user_id: userId,
        stream_id: streamId,
        socket_id: socketId,
        role: 'viewer',
        status: 'connected',
        joined_at: new Date()
      });

      // Update viewer count
      const viewerCount = await Participant.count({
        where: { stream_id: streamId, status: 'connected' }
      });

      await stream.update({
        viewer_count: viewerCount,
        peak_viewer_count: Math.max(stream.peak_viewer_count, viewerCount)
      });

      logger.info('Viewer added to stream', {
        streamId,
        userId,
        viewerCount
      });

      return participant;
    } catch (error) {
      logger.error('Failed to add viewer:', error);
      throw error;
    }
  }

  /**
   * Remove viewer from stream
   * @param {string} streamId - Stream ID
   * @param {string} socketId - Socket connection ID
   * @returns {Promise<boolean>} Success status
   */
  async removeViewer(streamId, socketId) {
    try {
      const participant = await Participant.findOne({
        where: { stream_id: streamId, socket_id: socketId }
      });

      if (!participant) {
        return false;
      }

      const left_at = new Date();
      const duration_seconds = Math.floor((left_at - participant.joined_at) / 1000);

      await participant.update({
        status: 'disconnected',
        left_at,
        duration_seconds
      });

      // Update viewer count
      const viewerCount = await Participant.count({
        where: { stream_id: streamId, status: 'connected' }
      });

      await Stream.update(
        { viewer_count: viewerCount },
        { where: { id: streamId } }
      );

      logger.info('Viewer removed from stream', {
        streamId,
        participantId: participant.id,
        duration_seconds
      });

      return true;
    } catch (error) {
      logger.error('Failed to remove viewer:', error);
      return false;
    }
  }

  /**
   * Get stream recordings
   * @param {string} streamId - Stream ID
   * @returns {Promise<Array>} List of recordings
   */
  async getStreamRecordings(streamId) {
    try {
      const recordings = await Recording.findAll({
        where: { stream_id: streamId },
        order: [['created_at', 'DESC']]
      });

      return recordings;
    } catch (error) {
      logger.error('Failed to get stream recordings:', error);
      throw error;
    }
  }

  /**
   * Track share funnel events for a stream
   * @param {string} streamId - Stream ID
   * @param {string} eventType - Share event type
   * @param {Object} options - Optional event metadata
   * @returns {Promise<Object>} Updated share metrics
   */
  async trackShareEvent(streamId, eventType, options = {}) {
    try {
      const stream = await Stream.findByPk(streamId);
      if (!stream) {
        throw new Error('Stream not found');
      }

      const metadata = stream.metadata || {};
      const shareMetrics = {
        ...this.getDefaultShareMetrics(),
        ...(metadata.shareMetrics || {})
      };

      if (!shareMetrics.bySource || typeof shareMetrics.bySource !== 'object') {
        shareMetrics.bySource = {};
      }

      if (eventType === 'link_shared') {
        shareMetrics.linkSharedCount += 1;
      } else if (eventType === 'link_opened') {
        shareMetrics.linkOpenedCount += 1;
      } else if (eventType === 'watch_started') {
        shareMetrics.watchStartedCount += 1;
      } else {
        throw new Error(`Unsupported event type: ${eventType}`);
      }

      const source = options.source ? String(options.source).slice(0, 50) : 'unknown';
      shareMetrics.bySource[source] = (shareMetrics.bySource[source] || 0) + 1;
      shareMetrics.lastEventAt = new Date().toISOString();

      if (options.ref) {
        shareMetrics.lastRef = String(options.ref).slice(0, 128);
      }

      await stream.update({
        metadata: {
          ...metadata,
          shareMetrics
        }
      });

      logger.info('Stream share event tracked', {
        streamId,
        eventType,
        source
      });

      return shareMetrics;
    } catch (error) {
      logger.error('Failed to track stream share event:', error);
      throw error;
    }
  }

  /**
   * Format stream for API response
   * @param {Object} stream - Stream model instance
   * @returns {Object} Formatted stream
   */
  formatStream(stream) {
    const data = stream.toJSON();

    // Don't expose sensitive data
    delete data.stream_key;
    delete data.cloudflare_stream_id;

    // Add computed fields
    data.isLive = data.status === 'live';
    data.currentViewers = data.viewers?.length || 0;
    data.share_metrics = data.metadata?.shareMetrics || this.getDefaultShareMetrics();

    return data;
  }
}

module.exports = new StreamService();
