/**
 * ═══════════════════════════════════════════════════════════
 * Recording Service
 * Manages stream and room recording lifecycle
 * ═══════════════════════════════════════════════════════════
 */

const { Recording, Stream, Room } = require('../models');
const cloudflareService = require('./cloudflare');
const logger = require('../utils/logger');

class RecordingService {
  /**
   * Create a recording entry
   * @param {Object} data - Recording data
   * @returns {Promise<Object>} Created recording
   */
  async createRecording(data) {
    try {
      const recording = await Recording.create({
        streamId: data.streamId || null,
        roomId: data.roomId || null,
        title: data.title,
        description: data.description || null,
        startedAt: new Date(),
        status: 'recording',
        fileSize: 0,
        duration: 0
      });

      logger.info('Recording created', {
        recordingId: recording.id,
        streamId: data.streamId,
        roomId: data.roomId
      });

      return recording;

    } catch (error) {
      logger.error('Recording creation failed', {
        error: error.message,
        data
      });
      throw error;
    }
  }

  /**
   * Get recording by ID
   * @param {string} recordingId - Recording ID
   * @returns {Promise<Object>} Recording data
   */
  async getRecording(recordingId) {
    try {
      const recording = await Recording.findByPk(recordingId, {
        include: [
          { model: Stream, required: false },
          { model: Room, required: false }
        ]
      });

      if (!recording) {
        throw new Error('Recording not found');
      }

      return recording;

    } catch (error) {
      logger.error('Get recording failed', {
        error: error.message,
        recordingId
      });
      throw error;
    }
  }

  /**
   * List recordings
   * @param {Object} filters - Filter options
   * @returns {Promise<Array>} List of recordings
   */
  async listRecordings(filters = {}) {
    try {
      const where = {};

      if (filters.streamId) {
        where.streamId = filters.streamId;
      }

      if (filters.roomId) {
        where.roomId = filters.roomId;
      }

      if (filters.status) {
        where.status = filters.status;
      }

      const recordings = await Recording.findAll({
        where,
        include: [
          { model: Stream, required: false },
          { model: Room, required: false }
        ],
        order: [['createdAt', 'DESC']],
        limit: filters.limit || 50
      });

      return recordings;

    } catch (error) {
      logger.error('List recordings failed', {
        error: error.message,
        filters
      });
      throw error;
    }
  }

  /**
   * Start recording for a stream
   * @param {string} streamId - Stream ID
   * @returns {Promise<Object>} Recording data
   */
  async startStreamRecording(streamId) {
    try {
      const stream = await Stream.findByPk(streamId);

      if (!stream) {
        throw new Error('Stream not found');
      }

      const recording = await this.createRecording({
        streamId,
        title: `${stream.title} - Recording`,
        description: `Recorded stream from ${new Date().toLocaleString()}`
      });

      await stream.update({
        recordingEnabled: true,
        recordingStatus: 'recording'
      });

      logger.info('Stream recording started', {
        streamId,
        recordingId: recording.id
      });

      return recording;

    } catch (error) {
      logger.error('Start stream recording failed', {
        error: error.message,
        streamId
      });
      throw error;
    }
  }

  /**
   * Stop recording
   * @param {string} recordingId - Recording ID
   * @returns {Promise<Object>} Recording data
   */
  async stopRecording(recordingId) {
    try {
      const recording = await Recording.findByPk(recordingId);

      if (!recording) {
        throw new Error('Recording not found');
      }

      const duration = Math.floor((Date.now() - new Date(recording.startedAt)) / 1000);

      await recording.update({
        endedAt: new Date(),
        duration,
        status: 'processing'
      });

      // Update stream/room status
      if (recording.streamId) {
        await Stream.update(
          { recordingStatus: 'stopped' },
          { where: { id: recording.streamId } }
        );
      }

      if (recording.roomId) {
        await Room.update(
          { recordingStatus: 'stopped' },
          { where: { id: recording.roomId } }
        );
      }

      logger.info('Recording stopped', {
        recordingId,
        duration
      });

      // Trigger post-processing
      this._processRecording(recordingId);

      return recording;

    } catch (error) {
      logger.error('Stop recording failed', {
        error: error.message,
        recordingId
      });
      throw error;
    }
  }

  /**
   * Process recording (transcoding, thumbnails, etc.)
   * @param {string} recordingId - Recording ID
   */
  async _processRecording(recordingId) {
    try {
      const recording = await Recording.findByPk(recordingId);

      if (!recording) {
        logger.error('Recording not found for processing', { recordingId });
        return;
      }

      logger.info('Processing recording', { recordingId });

      // Generate thumbnails at different timestamps
      const thumbnails = await this._generateThumbnails(recording);

      // Transcode to different qualities if needed
      const variants = await this._transcodeRecording(recording);

      // Update recording with processing results
      await recording.update({
        status: 'completed',
        thumbnails: JSON.stringify(thumbnails),
        variants: JSON.stringify(variants),
        processedAt: new Date()
      });

      logger.info('Recording processing completed', {
        recordingId,
        thumbnails: thumbnails.length,
        variants: variants.length
      });

    } catch (error) {
      logger.error('Recording processing failed', {
        error: error.message,
        recordingId
      });

      await Recording.update(
        {
          status: 'failed',
          error: error.message
        },
        { where: { id: recordingId } }
      );
    }
  }

  /**
   * Generate thumbnails for recording
   * @param {Object} recording - Recording object
   * @returns {Promise<Array>} Thumbnail URLs
   */
  async _generateThumbnails(recording) {
    try {
      // If using Cloudflare Stream
      if (recording.cloudflareVideoId) {
        const videoDetails = await cloudflareService.getVideo(recording.cloudflareVideoId);
        return videoDetails.thumbnails || [];
      }

      // Otherwise use local processing (FFmpeg)
      return [];

    } catch (error) {
      logger.error('Thumbnail generation failed', {
        error: error.message,
        recordingId: recording.id
      });
      return [];
    }
  }

  /**
   * Transcode recording to different qualities
   * @param {Object} recording - Recording object
   * @returns {Promise<Array>} Variant URLs
   */
  async _transcodeRecording(recording) {
    try {
      // If using Cloudflare Stream, variants are handled automatically
      if (recording.cloudflareVideoId) {
        return [];
      }

      // Otherwise implement local transcoding logic
      return [];

    } catch (error) {
      logger.error('Transcoding failed', {
        error: error.message,
        recordingId: recording.id
      });
      return [];
    }
  }

  /**
   * Delete recording
   * @param {string} recordingId - Recording ID
   * @returns {Promise<boolean>} Success status
   */
  async deleteRecording(recordingId) {
    try {
      const recording = await Recording.findByPk(recordingId);

      if (!recording) {
        throw new Error('Recording not found');
      }

      // Delete from Cloudflare if applicable
      if (recording.cloudflareVideoId) {
        await cloudflareService.deleteVideo(recording.cloudflareVideoId);
      }

      await recording.destroy();

      logger.info('Recording deleted', { recordingId });

      return true;

    } catch (error) {
      logger.error('Recording deletion failed', {
        error: error.message,
        recordingId
      });
      throw error;
    }
  }

  /**
   * Get playback URL for recording
   * @param {string} recordingId - Recording ID
   * @param {Object} options - Playback options
   * @returns {Promise<string>} Playback URL
   */
  async getPlaybackUrl(recordingId, options = {}) {
    try {
      const recording = await Recording.findByPk(recordingId);

      if (!recording) {
        throw new Error('Recording not found');
      }

      if (recording.status !== 'completed') {
        throw new Error('Recording not ready for playback');
      }

      // If using Cloudflare Stream
      if (recording.cloudflareVideoId) {
        const url = cloudflareService.getPlaybackUrl(recording.cloudflareVideoId);

        // Generate signed URL if private
        if (options.signed) {
          const expiry = options.expiry || 3600; // 1 hour default
          return cloudflareService.generateSignedUrl(recording.cloudflareVideoId, expiry);
        }

        return url;
      }

      // Otherwise return local storage URL
      return recording.fileUrl || null;

    } catch (error) {
      logger.error('Get playback URL failed', {
        error: error.message,
        recordingId
      });
      throw error;
    }
  }

  /**
   * Get download URL for recording
   * @param {string} recordingId - Recording ID
   * @returns {Promise<string>} Download URL
   */
  async getDownloadUrl(recordingId) {
    try {
      const recording = await Recording.findByPk(recordingId);

      if (!recording) {
        throw new Error('Recording not found');
      }

      if (recording.status !== 'completed') {
        throw new Error('Recording not ready for download');
      }

      // If using Cloudflare Stream
      if (recording.cloudflareVideoId) {
        return cloudflareService.getDownloadUrl(recording.cloudflareVideoId);
      }

      // Otherwise return local storage URL
      return recording.fileUrl || null;

    } catch (error) {
      logger.error('Get download URL failed', {
        error: error.message,
        recordingId
      });
      throw error;
    }
  }

  /**
   * Update recording metadata
   * @param {string} recordingId - Recording ID
   * @param {Object} updates - Metadata updates
   * @returns {Promise<Object>} Updated recording
   */
  async updateRecordingMetadata(recordingId, updates) {
    try {
      const recording = await Recording.findByPk(recordingId);

      if (!recording) {
        throw new Error('Recording not found');
      }

      await recording.update(updates);

      logger.info('Recording metadata updated', {
        recordingId,
        updates
      });

      return recording;

    } catch (error) {
      logger.error('Update recording metadata failed', {
        error: error.message,
        recordingId,
        updates
      });
      throw error;
    }
  }

  /**
   * Get recording statistics
   * @param {string} recordingId - Recording ID
   * @returns {Promise<Object>} Recording statistics
   */
  async getRecordingStats(recordingId) {
    try {
      const recording = await Recording.findByPk(recordingId);

      if (!recording) {
        throw new Error('Recording not found');
      }

      // If using Cloudflare Stream, get analytics
      if (recording.cloudflareVideoId) {
        const analytics = await cloudflareService.getVideoAnalytics(recording.cloudflareVideoId);

        return {
          recordingId,
          duration: recording.duration,
          fileSize: recording.fileSize,
          views: analytics.views || 0,
          uniqueViewers: analytics.uniqueViewers || 0,
          watchTime: analytics.watchTime || 0,
          status: recording.status
        };
      }

      return {
        recordingId,
        duration: recording.duration,
        fileSize: recording.fileSize,
        status: recording.status
      };

    } catch (error) {
      logger.error('Get recording stats failed', {
        error: error.message,
        recordingId
      });
      throw error;
    }
  }
}

module.exports = new RecordingService();
