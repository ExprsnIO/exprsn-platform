/**
 * Stream Service
 * Business logic for managing live streams
 */

const { Stream, Recording, Participant } = require('../models');
const cloudflareService = require('./cloudflare');
const logger = require('../utils/logger');
const crypto = require('crypto');

class StreamService {
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

      // Create Cloudflare live input
      const cloudflareInput = await cloudflareService.createLiveInput({
        recording: {
          mode: isRecording ? 'automatic' : 'off'
        },
        meta: {
          title,
          userId
        }
      });

      // Create stream in database
      const stream = await Stream.create({
        user_id: userId,
        title,
        description,
        stream_key: streamKey,
        cloudflare_stream_id: cloudflareInput.uid,
        rtmp_url: cloudflareInput.rtmpUrl,
        hls_url: cloudflareInput.webRTCUrl,
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
        await cloudflareService.deleteLiveInput(stream.cloudflare_stream_id);
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

    return data;
  }
}

module.exports = new StreamService();
