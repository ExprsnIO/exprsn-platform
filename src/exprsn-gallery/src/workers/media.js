/**
 * ═══════════════════════════════════════════════════════════════════════
 * Media Worker - Background Processing for Media
 * ═══════════════════════════════════════════════════════════════════════
 */

const { mediaQueue } = require('../queues/mediaQueue');
const videoService = require('../services/videoService');
const mediaService = require('../services/mediaService');
const Media = require('../models/Media');
const logger = require('../utils/logger');
const fs = require('fs').promises;
const path = require('path');
const config = require('../config');

/**
 * Process video job
 */
mediaQueue.process('process-video', async (job) => {
  const { mediaId, filePath, options = {} } = job.data;

  try {
    logger.info('Processing video', { mediaId, filePath, jobId: job.id });

    // Update status to 'processing'
    await Media.update(mediaId, { status: 'processing' });

    // Update job progress
    await job.progress(10);

    // Extract metadata
    logger.info('Extracting video metadata', { mediaId });
    const metadata = await videoService.extractMetadata(filePath);

    await job.progress(30);

    // Generate thumbnails
    logger.info('Generating video thumbnails', { mediaId });
    const thumbs = await videoService.generateThumbnails(filePath, null, {
      width: 640,
      format: 'jpeg',
      quality: 85
    });

    await job.progress(50);

    // Save thumbnails to storage
    const thumbnails = [];
    for (const thumb of thumbs) {
      const thumbFilename = `video_${mediaId}_thumb_${thumb.timestamp}_${Date.now()}.${thumb.format}`;
      const thumbPath = await mediaService.saveThumbnail(thumb.buffer, thumbFilename);

      thumbnails.push({
        size: 'thumbnail',
        timestamp: thumb.timestamp,
        filename: thumbFilename,
        path: thumbPath,
        url: mediaService.buildThumbnailUrl(thumbFilename)
      });
    }

    await job.progress(70);

    // Optionally transcode to web format if needed
    let transcodedPath = null;
    if (options.transcode && !this._isWebCompatible(metadata.codec, metadata.format)) {
      logger.info('Transcoding video to web format', { mediaId });

      const transcodedBuffer = await videoService.transcodeToWebFormat(filePath, {
        videoBitrate: '1500k',
        audioBitrate: '128k',
        quality: 'medium'
      });

      // Save transcoded version
      transcodedPath = await mediaService.saveMediaFile(
        transcodedBuffer,
        `transcoded_${path.basename(filePath)}`
      );

      logger.info('Video transcoded', { mediaId, transcodedPath });
    }

    await job.progress(90);

    // Update media record with metadata and thumbnails
    const updateData = {
      status: 'ready',
      metadata: metadata,
      thumbnails: thumbnails,
      thumbnail_url: thumbnails[0]?.url || null,
      duration: metadata.duration,
      width: metadata.width,
      height: metadata.height,
      videoCodec: metadata.codec,
      audioCodec: metadata.audioCodec,
      fps: metadata.fps,
      bitrate: metadata.bitrate
    };

    if (transcodedPath) {
      updateData.transcodedPath = transcodedPath;
    }

    await Media.update(mediaId, updateData);

    await job.progress(100);

    logger.info('Video processed successfully', {
      mediaId,
      duration: metadata.duration,
      resolution: `${metadata.width}x${metadata.height}`,
      thumbnails: thumbnails.length
    });

    return {
      mediaId,
      metadata,
      thumbnails,
      transcodedPath
    };

  } catch (error) {
    logger.error('Video processing failed', {
      mediaId,
      error: error.message,
      stack: error.stack
    });

    // Update status to 'failed'
    await Media.update(mediaId, {
      status: 'failed',
      processingError: error.message
    }).catch(err => {
      logger.error('Failed to update media status:', err);
    });

    throw error; // Will trigger retry
  }
});

/**
 * Process thumbnail generation job
 */
mediaQueue.process('generate-thumbnails', async (job) => {
  const { mediaId, filePath, options = {} } = job.data;

  try {
    logger.info('Generating thumbnails', { mediaId, filePath, jobId: job.id });

    await job.progress(20);

    const media = await Media.findById(mediaId);
    if (!media) {
      throw new Error('Media not found');
    }

    let thumbnails = [];

    if (media.media_type === 'video') {
      // Generate video thumbnails
      const thumbs = await videoService.generateThumbnails(filePath, options.timestamps || null, {
        width: options.width || 640,
        format: options.format || 'jpeg',
        quality: options.quality || 85
      });

      await job.progress(60);

      // Save thumbnails
      for (const thumb of thumbs) {
        const thumbFilename = `video_${mediaId}_thumb_${thumb.timestamp}_${Date.now()}.${thumb.format}`;
        const thumbPath = await mediaService.saveThumbnail(thumb.buffer, thumbFilename);

        thumbnails.push({
          size: 'thumbnail',
          timestamp: thumb.timestamp,
          filename: thumbFilename,
          path: thumbPath,
          url: mediaService.buildThumbnailUrl(thumbFilename)
        });
      }

    } else if (media.media_type === 'image') {
      // Generate image thumbnails
      const buffer = await fs.readFile(filePath);
      thumbnails = await mediaService.generateThumbnails(buffer, path.basename(filePath));
    }

    await job.progress(90);

    // Update media with new thumbnails
    await Media.update(mediaId, {
      thumbnails: thumbnails,
      thumbnail_url: thumbnails[0]?.url || null
    });

    await job.progress(100);

    logger.info('Thumbnails generated successfully', {
      mediaId,
      count: thumbnails.length
    });

    return { mediaId, thumbnails };

  } catch (error) {
    logger.error('Thumbnail generation failed', {
      mediaId,
      error: error.message
    });
    throw error;
  }
});

/**
 * Process AI tagging job
 */
mediaQueue.process('ai-tagging', async (job) => {
  const { mediaId, filePath, mediaType } = job.data;

  try {
    logger.info('Processing AI tagging', { mediaId, mediaType, jobId: job.id });

    await job.progress(20);

    // TODO: Integrate with AI service (Anthropic/OpenAI)
    // This is a placeholder for AI tagging functionality
    // Would call external AI service to analyze image/video and generate tags

    const aiTags = await this._generateAITags(filePath, mediaType);

    await job.progress(80);

    // Update media with AI-generated tags
    const media = await Media.findById(mediaId);
    const existingTags = media.tags || [];
    const newTags = [...new Set([...existingTags, ...aiTags])];

    await Media.update(mediaId, {
      tags: newTags,
      aiTagged: true
    });

    await job.progress(100);

    logger.info('AI tagging completed', {
      mediaId,
      tagsGenerated: aiTags.length
    });

    return { mediaId, tags: aiTags };

  } catch (error) {
    logger.error('AI tagging failed', {
      mediaId,
      error: error.message
    });
    // Don't throw - AI tagging is optional and shouldn't fail the entire process
    return { mediaId, tags: [], error: error.message };
  }
});

/**
 * Process face detection job
 */
mediaQueue.process('face-detection', async (job) => {
  const { mediaId, filePath } = job.data;

  try {
    logger.info('Processing face detection', { mediaId, jobId: job.id });

    await job.progress(20);

    // TODO: Integrate with face detection service
    // This is a placeholder for face detection functionality
    // Would call external service or use local ML model for face detection

    const faces = await this._detectFaces(filePath);

    await job.progress(80);

    // Update media with face data
    await Media.update(mediaId, {
      faceData: faces,
      faceCount: faces.length
    });

    await job.progress(100);

    logger.info('Face detection completed', {
      mediaId,
      facesDetected: faces.length
    });

    return { mediaId, faces };

  } catch (error) {
    logger.error('Face detection failed', {
      mediaId,
      error: error.message
    });
    // Don't throw - face detection is optional
    return { mediaId, faces: [], error: error.message };
  }
});

/**
 * Check if video codec and format are web-compatible
 * @private
 */
function _isWebCompatible(codec, format) {
  const webCodecs = ['h264', 'vp8', 'vp9', 'av1'];
  const webFormats = ['mp4', 'webm'];

  return webCodecs.includes(codec?.toLowerCase()) &&
         webFormats.some(f => format?.toLowerCase().includes(f));
}

/**
 * Generate AI tags (placeholder implementation)
 * @private
 */
async function _generateAITags(filePath, mediaType) {
  // TODO: Implement actual AI tagging integration
  // This would call Anthropic/OpenAI API or other AI service

  logger.debug('AI tagging not yet implemented, returning empty array');
  return [];
}

/**
 * Detect faces (placeholder implementation)
 * @private
 */
async function _detectFaces(filePath) {
  // TODO: Implement actual face detection
  // This would use a face detection library or service

  logger.debug('Face detection not yet implemented, returning empty array');
  return [];
}

/**
 * Graceful shutdown handler
 */
async function shutdown() {
  logger.info('Shutting down media worker gracefully...');

  try {
    // Wait for active jobs to complete (with timeout)
    await mediaQueue.close(30000); // 30 second timeout

    logger.info('Media worker shut down successfully');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown:', error);
    process.exit(1);
  }
}

// Handle shutdown signals
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Handle uncaught errors
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection in worker:', {
    reason,
    promise
  });
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception in worker:', error);
  shutdown();
});

// Log worker startup
logger.info('Media worker started', {
  pid: process.pid,
  concurrency: mediaQueue.settings.concurrency || 1,
  redis: `${config.redis.host}:${config.redis.port}`
});

logger.info('Registered job processors:', [
  'process-video',
  'generate-thumbnails',
  'ai-tagging',
  'face-detection'
]);
