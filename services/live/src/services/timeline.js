/**
 * Timeline Service
 * Video timeline editing for pre-recorded webinars and events
 */

const { TimelineSegment, Event } = require('../models');
const logger = require('../utils/logger');
const ffmpegService = require('./ffmpeg');
const path = require('path');
const fs = require('fs').promises;

class TimelineService {
  /**
   * Create a timeline segment
   * @param {string} eventId - Event ID
   * @param {Object} segmentData - Segment data
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Created segment
   */
  async createSegment(eventId, segmentData, userId) {
    try {
      const {
        segmentType = 'main_content',
        title,
        description = null,
        orderIndex,
        startTimeMs,
        endTimeMs,
        sourceVideoUrl = null,
        sourceStartMs = 0,
        sourceEndMs = null,
        isSkippable = true,
        thumbnailUrl = null,
        transitions = null,
        audioSettings = null,
        overlays = [],
        markers = []
      } = segmentData;

      const durationMs = endTimeMs - startTimeMs;

      if (durationMs <= 0) {
        throw new Error('Invalid segment duration');
      }

      const segment = await TimelineSegment.create({
        event_id: eventId,
        user_id: userId,
        segment_type: segmentType,
        title,
        description,
        order_index: orderIndex,
        start_time_ms: startTimeMs,
        end_time_ms: endTimeMs,
        duration_ms: durationMs,
        source_video_url: sourceVideoUrl,
        source_start_ms: sourceStartMs,
        source_end_ms: sourceEndMs,
        is_skippable: isSkippable,
        thumbnail_url: thumbnailUrl,
        transitions: transitions || {
          in: { type: 'none', duration_ms: 0 },
          out: { type: 'none', duration_ms: 0 }
        },
        audio_settings: audioSettings || {
          volume: 1.0,
          fade_in_ms: 0,
          fade_out_ms: 0,
          muted: false
        },
        overlays,
        markers
      });

      logger.info('Timeline segment created', {
        segmentId: segment.id,
        eventId,
        duration: durationMs
      });

      return this.formatSegment(segment);
    } catch (error) {
      logger.error('Failed to create timeline segment:', error);
      throw error;
    }
  }

  /**
   * Get segment by ID
   * @param {string} segmentId - Segment ID
   * @returns {Promise<Object|null>} Segment data
   */
  async getSegment(segmentId) {
    try {
      const segment = await TimelineSegment.findByPk(segmentId);

      if (!segment) {
        return null;
      }

      return this.formatSegment(segment);
    } catch (error) {
      logger.error('Failed to get segment:', error);
      throw error;
    }
  }

  /**
   * List segments for an event
   * @param {string} eventId - Event ID
   * @returns {Promise<Array>} Ordered list of segments
   */
  async listSegments(eventId) {
    try {
      const segments = await TimelineSegment.findAll({
        where: { event_id: eventId },
        order: [['order_index', 'ASC']]
      });

      return segments.map(segment => this.formatSegment(segment));
    } catch (error) {
      logger.error('Failed to list segments:', error);
      throw error;
    }
  }

  /**
   * Update segment
   * @param {string} segmentId - Segment ID
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object>} Updated segment
   */
  async updateSegment(segmentId, updates) {
    try {
      const segment = await TimelineSegment.findByPk(segmentId);
      if (!segment) {
        throw new Error('Segment not found');
      }

      const allowedUpdates = [
        'title',
        'description',
        'order_index',
        'start_time_ms',
        'end_time_ms',
        'source_video_url',
        'source_start_ms',
        'source_end_ms',
        'is_skippable',
        'thumbnail_url',
        'transitions',
        'audio_settings',
        'overlays',
        'markers'
      ];

      const updateData = {};
      allowedUpdates.forEach(field => {
        if (updates[field] !== undefined) {
          const dbField = field.replace(/([A-Z])/g, '_$1').toLowerCase();
          updateData[dbField] = updates[field];
        }
      });

      // Recalculate duration if times changed
      if (updates.startTimeMs !== undefined || updates.endTimeMs !== undefined) {
        const startMs = updates.startTimeMs || segment.start_time_ms;
        const endMs = updates.endTimeMs || segment.end_time_ms;
        updateData.duration_ms = endMs - startMs;
      }

      await segment.update(updateData);

      logger.info('Timeline segment updated', { segmentId });

      return this.formatSegment(segment);
    } catch (error) {
      logger.error('Failed to update segment:', error);
      throw error;
    }
  }

  /**
   * Delete segment
   * @param {string} segmentId - Segment ID
   * @returns {Promise<boolean>} Success status
   */
  async deleteSegment(segmentId) {
    try {
      const segment = await TimelineSegment.findByPk(segmentId);
      if (!segment) {
        throw new Error('Segment not found');
      }

      await segment.destroy();

      logger.info('Timeline segment deleted', { segmentId });

      return true;
    } catch (error) {
      logger.error('Failed to delete segment:', error);
      throw error;
    }
  }

  /**
   * Reorder segments
   * @param {string} eventId - Event ID
   * @param {Array<{id: string, orderIndex: number}>} newOrder - New order
   * @returns {Promise<boolean>} Success status
   */
  async reorderSegments(eventId, newOrder) {
    try {
      // Update each segment's order_index
      for (const item of newOrder) {
        await TimelineSegment.update(
          { order_index: item.orderIndex },
          { where: { id: item.id, event_id: eventId } }
        );
      }

      logger.info('Timeline segments reordered', {
        eventId,
        count: newOrder.length
      });

      return true;
    } catch (error) {
      logger.error('Failed to reorder segments:', error);
      throw error;
    }
  }

  /**
   * Add marker to segment
   * @param {string} segmentId - Segment ID
   * @param {Object} marker - Marker data
   * @returns {Promise<Object>} Updated segment
   */
  async addMarker(segmentId, marker) {
    try {
      const segment = await TimelineSegment.findByPk(segmentId);
      if (!segment) {
        throw new Error('Segment not found');
      }

      const markers = segment.markers || [];
      markers.push({
        id: require('crypto').randomBytes(8).toString('hex'),
        time_ms: marker.timeMs,
        label: marker.label,
        type: marker.type || 'custom',
        metadata: marker.metadata || {}
      });

      // Sort markers by time
      markers.sort((a, b) => a.time_ms - b.time_ms);

      await segment.update({ markers });

      logger.info('Marker added to segment', { segmentId, markerTime: marker.timeMs });

      return this.formatSegment(segment);
    } catch (error) {
      logger.error('Failed to add marker:', error);
      throw error;
    }
  }

  /**
   * Remove marker from segment
   * @param {string} segmentId - Segment ID
   * @param {string} markerId - Marker ID
   * @returns {Promise<Object>} Updated segment
   */
  async removeMarker(segmentId, markerId) {
    try {
      const segment = await TimelineSegment.findByPk(segmentId);
      if (!segment) {
        throw new Error('Segment not found');
      }

      const markers = (segment.markers || []).filter(m => m.id !== markerId);

      await segment.update({ markers });

      logger.info('Marker removed from segment', { segmentId, markerId });

      return this.formatSegment(segment);
    } catch (error) {
      logger.error('Failed to remove marker:', error);
      throw error;
    }
  }

  /**
   * Generate video from timeline
   * @param {string} eventId - Event ID
   * @param {Object} options - Export options
   * @returns {Promise<Object>} Export result
   */
  async generateVideo(eventId, options = {}) {
    try {
      const segments = await this.listSegments(eventId);

      if (segments.length === 0) {
        throw new Error('No segments to generate video from');
      }

      const event = await Event.findByPk(eventId);
      if (!event) {
        throw new Error('Event not found');
      }

      // Create temporary directory for processing
      const tempDir = path.join(__dirname, '../../temp', eventId);
      await fs.mkdir(tempDir, { recursive: true });

      const processedSegments = [];

      // Process each segment
      for (const segment of segments) {
        const segmentFile = path.join(tempDir, `segment_${segment.order_index}.mp4`);

        if (segment.source_video_url) {
          // Trim segment from source video
          const startSeconds = segment.source_start_ms / 1000;
          const duration = segment.duration_ms / 1000;

          await ffmpegService.trimVideo(
            segment.source_video_url,
            segmentFile,
            startSeconds,
            duration
          );
        } else if (event.recording_url) {
          // Use main event recording
          const startSeconds = segment.start_time_ms / 1000;
          const duration = segment.duration_ms / 1000;

          await ffmpegService.trimVideo(
            event.recording_url,
            segmentFile,
            startSeconds,
            duration
          );
        } else {
          logger.warn('No source video for segment', { segmentId: segment.id });
          continue;
        }

        processedSegments.push(segmentFile);
      }

      // Concatenate all segments
      const outputPath = path.join(tempDir, `final_${eventId}.mp4`);
      await ffmpegService.concatenateVideos(processedSegments, outputPath);

      logger.info('Timeline video generated', {
        eventId,
        segments: segments.length,
        outputPath
      });

      // TODO: Upload to file storage service
      // For now, return local path
      return {
        success: true,
        videoPath: outputPath,
        segments: segments.length,
        totalDuration: segments.reduce((sum, s) => sum + s.duration_ms, 0)
      };
    } catch (error) {
      logger.error('Failed to generate video from timeline:', error);
      throw error;
    }
  }

  /**
   * Generate timeline thumbnails
   * @param {string} eventId - Event ID
   * @returns {Promise<Array>} Generated thumbnails
   */
  async generateThumbnails(eventId) {
    try {
      const segments = await this.listSegments(eventId);
      const thumbnails = [];

      for (const segment of segments) {
        if (!segment.source_video_url && !segment.thumbnail_url) {
          continue;
        }

        const videoSource = segment.source_video_url || segment.thumbnail_url;
        const thumbnailPath = path.join(
          __dirname,
          '../../temp/thumbnails',
          `segment_${segment.id}.jpg`
        );

        await fs.mkdir(path.dirname(thumbnailPath), { recursive: true });

        // Generate thumbnail at 1 second into segment
        const timeOffset = (segment.source_start_ms + 1000) / 1000;

        await ffmpegService.generateThumbnail(
          videoSource,
          thumbnailPath,
          timeOffset.toString()
        );

        thumbnails.push({
          segmentId: segment.id,
          thumbnailPath
        });

        // Update segment with thumbnail
        await TimelineSegment.update(
          { thumbnail_url: thumbnailPath },
          { where: { id: segment.id } }
        );
      }

      logger.info('Timeline thumbnails generated', {
        eventId,
        count: thumbnails.length
      });

      return thumbnails;
    } catch (error) {
      logger.error('Failed to generate thumbnails:', error);
      throw error;
    }
  }

  /**
   * Get timeline statistics
   * @param {string} eventId - Event ID
   * @returns {Promise<Object>} Timeline statistics
   */
  async getTimelineStats(eventId) {
    try {
      const segments = await this.listSegments(eventId);

      const stats = {
        totalSegments: segments.length,
        totalDuration: segments.reduce((sum, s) => sum + s.duration_ms, 0),
        segmentsByType: {},
        averageSegmentDuration: 0,
        longestSegment: null,
        shortestSegment: null
      };

      // Group by type
      segments.forEach(segment => {
        if (!stats.segmentsByType[segment.segment_type]) {
          stats.segmentsByType[segment.segment_type] = 0;
        }
        stats.segmentsByType[segment.segment_type]++;
      });

      // Calculate averages
      if (segments.length > 0) {
        stats.averageSegmentDuration = stats.totalDuration / segments.length;

        const sortedByDuration = [...segments].sort((a, b) => b.duration_ms - a.duration_ms);
        stats.longestSegment = sortedByDuration[0];
        stats.shortestSegment = sortedByDuration[sortedByDuration.length - 1];
      }

      return stats;
    } catch (error) {
      logger.error('Failed to get timeline stats:', error);
      throw error;
    }
  }

  /**
   * Format segment for API response
   * @param {Object} segment - Segment model instance
   * @returns {Object} Formatted segment
   */
  formatSegment(segment) {
    const data = segment.toJSON();

    // Add computed fields
    data.durationSeconds = Math.floor(data.duration_ms / 1000);
    data.startTimeSeconds = Math.floor(data.start_time_ms / 1000);
    data.endTimeSeconds = Math.floor(data.end_time_ms / 1000);

    return data;
  }
}

module.exports = new TimelineService();
