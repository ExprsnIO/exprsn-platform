/**
 * ═══════════════════════════════════════════════════════════════════════
 * Video Service - Video Processing with FFmpeg
 * ═══════════════════════════════════════════════════════════════════════
 */

const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs').promises;
const { createWriteStream, createReadStream } = require('fs');
const logger = require('../utils/logger');
const config = require('../config');
const crypto = require('crypto');

class VideoService {
  constructor() {
    // Set ffmpeg paths if configured
    if (config.ffmpeg?.path) {
      ffmpeg.setFfmpegPath(config.ffmpeg.path);
    }
    if (config.ffmpeg?.probePath) {
      ffmpeg.setFfprobePath(config.ffmpeg.probePath);
    }
  }

  /**
   * Extract video metadata (duration, resolution, codec, bitrate)
   * @param {Buffer|string} input - Video buffer or file path
   * @returns {Promise<Object>} Metadata object
   */
  async extractMetadata(input) {
    return new Promise((resolve, reject) => {
      try {
        // If input is a Buffer, write to temp file first
        let inputPath = input;
        let tempFile = null;

        const processMetadata = (filePath) => {
          ffmpeg.ffprobe(filePath, (err, metadata) => {
            // Clean up temp file if created
            if (tempFile) {
              fs.unlink(tempFile).catch(e =>
                logger.warn('Failed to delete temp file:', e)
              );
            }

            if (err) {
              logger.error('FFprobe error:', err);
              return reject(new Error('Failed to extract video metadata: ' + err.message));
            }

            // Extract useful metadata
            const videoStream = metadata.streams.find(s => s.codec_type === 'video');
            const audioStream = metadata.streams.find(s => s.codec_type === 'audio');

            const result = {
              duration: metadata.format.duration ? parseFloat(metadata.format.duration) : null,
              size: metadata.format.size ? parseInt(metadata.format.size) : null,
              bitrate: metadata.format.bit_rate ? parseInt(metadata.format.bit_rate) : null,
              format: metadata.format.format_name,

              // Video stream info
              width: videoStream?.width || null,
              height: videoStream?.height || null,
              codec: videoStream?.codec_name || null,
              codecLong: videoStream?.codec_long_name || null,
              fps: this._parseFps(videoStream?.r_frame_rate) || null,
              aspectRatio: videoStream?.display_aspect_ratio || null,
              pixelFormat: videoStream?.pix_fmt || null,

              // Audio stream info
              audioCodec: audioStream?.codec_name || null,
              audioChannels: audioStream?.channels || null,
              audioSampleRate: audioStream?.sample_rate || null,
              audioBitrate: audioStream?.bit_rate ? parseInt(audioStream.bit_rate) : null,

              // Additional metadata
              tags: metadata.format.tags || {},
              streams: metadata.streams.length
            };

            resolve(result);
          });
        };

        if (Buffer.isBuffer(input)) {
          // Write buffer to temp file
          tempFile = path.join(
            config.upload.tempDir,
            `video_${Date.now()}_${crypto.randomBytes(8).toString('hex')}.tmp`
          );

          fs.writeFile(tempFile, input)
            .then(() => processMetadata(tempFile))
            .catch(err => {
              logger.error('Failed to write temp file:', err);
              reject(new Error('Failed to write video to temp file'));
            });
        } else {
          // Input is already a file path
          processMetadata(inputPath);
        }

      } catch (error) {
        logger.error('Extract metadata error:', error);
        reject(error);
      }
    });
  }

  /**
   * Generate thumbnails from video at specific timestamps
   * @param {Buffer|string} input - Video buffer or file path
   * @param {Array<number>} timestamps - Timestamps in seconds [0, 5, 10]
   * @param {Object} options - Size and format options
   * @returns {Promise<Array<Buffer>>} Array of thumbnail buffers
   */
  async generateThumbnails(input, timestamps = null, options = {}) {
    const {
      width = 640,
      format = 'jpeg',
      quality = 85
    } = options;

    return new Promise(async (resolve, reject) => {
      try {
        let inputPath = input;
        let tempVideoFile = null;
        let tempOutputDir = null;

        // Get video duration to calculate default timestamps
        const metadata = await this.extractMetadata(input);
        const duration = metadata.duration;

        // If no timestamps provided, generate 3 evenly spaced
        if (!timestamps) {
          if (duration <= 3) {
            timestamps = [0]; // Very short video, just first frame
          } else if (duration <= 10) {
            timestamps = [0, duration / 2]; // Two thumbnails
          } else {
            // Three thumbnails: start, middle, end (minus 2 seconds)
            timestamps = [0, duration / 2, Math.max(0, duration - 2)];
          }
        }

        // Ensure buffer is written to file
        if (Buffer.isBuffer(input)) {
          tempVideoFile = path.join(
            config.upload.tempDir,
            `video_${Date.now()}_${crypto.randomBytes(8).toString('hex')}.tmp`
          );
          await fs.writeFile(tempVideoFile, input);
          inputPath = tempVideoFile;
        }

        // Create temp output directory
        tempOutputDir = path.join(
          config.upload.tempDir,
          `thumbs_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`
        );
        await fs.mkdir(tempOutputDir, { recursive: true });

        const thumbnails = [];

        // Generate each thumbnail
        for (let i = 0; i < timestamps.length; i++) {
          const timestamp = timestamps[i];
          const outputPath = path.join(tempOutputDir, `thumb_${i}.${format}`);

          await new Promise((resolveThumb, rejectThumb) => {
            ffmpeg(inputPath)
              .seekInput(timestamp)
              .frames(1)
              .size(`${width}x?`)
              .output(outputPath)
              .outputOptions([
                '-q:v', quality.toString()
              ])
              .on('end', () => resolveThumb())
              .on('error', (err) => {
                logger.error(`Thumbnail generation failed at ${timestamp}s:`, err);
                rejectThumb(err);
              })
              .run();
          });

          // Read the generated thumbnail
          const thumbBuffer = await fs.readFile(outputPath);
          thumbnails.push({
            buffer: thumbBuffer,
            timestamp,
            format,
            index: i
          });
        }

        // Cleanup
        if (tempVideoFile) {
          await fs.unlink(tempVideoFile).catch(() => {});
        }
        if (tempOutputDir) {
          await fs.rm(tempOutputDir, { recursive: true, force: true }).catch(() => {});
        }

        resolve(thumbnails);

      } catch (error) {
        logger.error('Generate thumbnails error:', error);
        reject(new Error('Failed to generate video thumbnails: ' + error.message));
      }
    });
  }

  /**
   * Transcode video to web-compatible format (MP4 H.264)
   * @param {Buffer|string} input - Video buffer or file path
   * @param {Object} options - Transcoding options
   * @returns {Promise<Buffer>} Transcoded video buffer
   */
  async transcodeToWebFormat(input, options = {}) {
    const {
      width = null,
      height = null,
      videoBitrate = '1500k',
      audioBitrate = '128k',
      quality = 'medium' // fast, medium, slow
    } = options;

    return new Promise(async (resolve, reject) => {
      try {
        let inputPath = input;
        let tempVideoFile = null;
        const outputPath = path.join(
          config.upload.tempDir,
          `transcoded_${Date.now()}_${crypto.randomBytes(8).toString('hex')}.mp4`
        );

        // Ensure buffer is written to file
        if (Buffer.isBuffer(input)) {
          tempVideoFile = path.join(
            config.upload.tempDir,
            `video_${Date.now()}_${crypto.randomBytes(8).toString('hex')}.tmp`
          );
          await fs.writeFile(tempVideoFile, input);
          inputPath = tempVideoFile;
        }

        const command = ffmpeg(inputPath)
          .videoCodec('libx264')
          .audioCodec('aac')
          .audioBitrate(audioBitrate)
          .videoBitrate(videoBitrate)
          .format('mp4')
          .outputOptions([
            '-preset', quality,
            '-movflags', '+faststart', // Enable streaming
            '-pix_fmt', 'yuv420p' // Maximum compatibility
          ]);

        // Apply resolution if specified
        if (width && height) {
          command.size(`${width}x${height}`);
        } else if (width) {
          command.size(`${width}x?`);
        } else if (height) {
          command.size(`?x${height}`);
        }

        command
          .output(outputPath)
          .on('progress', (progress) => {
            logger.debug('Transcoding progress:', progress);
          })
          .on('end', async () => {
            try {
              const buffer = await fs.readFile(outputPath);

              // Cleanup
              await fs.unlink(outputPath).catch(() => {});
              if (tempVideoFile) {
                await fs.unlink(tempVideoFile).catch(() => {});
              }

              resolve(buffer);
            } catch (err) {
              reject(err);
            }
          })
          .on('error', (err) => {
            logger.error('Transcoding error:', err);

            // Cleanup on error
            fs.unlink(outputPath).catch(() => {});
            if (tempVideoFile) {
              fs.unlink(tempVideoFile).catch(() => {});
            }

            reject(new Error('Failed to transcode video: ' + err.message));
          })
          .run();

      } catch (error) {
        logger.error('Transcode to web format error:', error);
        reject(error);
      }
    });
  }

  /**
   * Generate multiple quality versions (360p, 480p, 720p, 1080p)
   * @param {Buffer|string} input - Video file
   * @param {Array<string>} qualities - ['360p', '720p', '1080p']
   * @returns {Promise<Array<{quality, buffer, size, bitrate}>>}
   */
  async generateMultipleQualities(input, qualities = ['480p', '720p']) {
    const qualitySettings = {
      '360p': { height: 360, bitrate: '800k', audioBitrate: '96k' },
      '480p': { height: 480, bitrate: '1200k', audioBitrate: '128k' },
      '720p': { height: 720, bitrate: '2500k', audioBitrate: '128k' },
      '1080p': { height: 1080, bitrate: '5000k', audioBitrate: '192k' }
    };

    const results = [];

    for (const quality of qualities) {
      const settings = qualitySettings[quality];
      if (!settings) {
        logger.warn(`Unknown quality setting: ${quality}`);
        continue;
      }

      try {
        const buffer = await this.transcodeToWebFormat(input, {
          height: settings.height,
          videoBitrate: settings.bitrate,
          audioBitrate: settings.audioBitrate,
          quality: 'medium'
        });

        results.push({
          quality,
          buffer,
          size: buffer.length,
          bitrate: settings.bitrate,
          height: settings.height
        });

        logger.info(`Generated ${quality} version`, { size: buffer.length });

      } catch (error) {
        logger.error(`Failed to generate ${quality} version:`, error);
        // Continue with other qualities
      }
    }

    return results;
  }

  /**
   * Extract audio track from video
   * @param {Buffer|string} input - Video file
   * @returns {Promise<Buffer>} Audio buffer (MP3)
   */
  async extractAudio(input) {
    return new Promise(async (resolve, reject) => {
      try {
        let inputPath = input;
        let tempVideoFile = null;
        const outputPath = path.join(
          config.upload.tempDir,
          `audio_${Date.now()}_${crypto.randomBytes(8).toString('hex')}.mp3`
        );

        // Ensure buffer is written to file
        if (Buffer.isBuffer(input)) {
          tempVideoFile = path.join(
            config.upload.tempDir,
            `video_${Date.now()}_${crypto.randomBytes(8).toString('hex')}.tmp`
          );
          await fs.writeFile(tempVideoFile, input);
          inputPath = tempVideoFile;
        }

        ffmpeg(inputPath)
          .noVideo()
          .audioCodec('libmp3lame')
          .audioBitrate('192k')
          .format('mp3')
          .output(outputPath)
          .on('end', async () => {
            try {
              const buffer = await fs.readFile(outputPath);

              // Cleanup
              await fs.unlink(outputPath).catch(() => {});
              if (tempVideoFile) {
                await fs.unlink(tempVideoFile).catch(() => {});
              }

              resolve(buffer);
            } catch (err) {
              reject(err);
            }
          })
          .on('error', (err) => {
            logger.error('Audio extraction error:', err);

            // Cleanup on error
            fs.unlink(outputPath).catch(() => {});
            if (tempVideoFile) {
              fs.unlink(tempVideoFile).catch(() => {});
            }

            reject(new Error('Failed to extract audio: ' + err.message));
          })
          .run();

      } catch (error) {
        logger.error('Extract audio error:', error);
        reject(error);
      }
    });
  }

  /**
   * Get video duration in seconds
   * @param {Buffer|string} input - Video file
   * @returns {Promise<number>} Duration in seconds
   */
  async getDuration(input) {
    try {
      const metadata = await this.extractMetadata(input);
      return metadata.duration;
    } catch (error) {
      logger.error('Get duration error:', error);
      throw error;
    }
  }

  /**
   * Generate video preview/animated thumbnail (GIF or WebP)
   * @param {Buffer|string} input - Video file
   * @param {Object} options - Preview options
   * @returns {Promise<Buffer>} Animated preview buffer
   */
  async generateAnimatedPreview(input, options = {}) {
    const {
      duration = 3,
      fps = 10,
      width = 320,
      format = 'gif'
    } = options;

    return new Promise(async (resolve, reject) => {
      try {
        let inputPath = input;
        let tempVideoFile = null;
        const outputPath = path.join(
          config.upload.tempDir,
          `preview_${Date.now()}_${crypto.randomBytes(8).toString('hex')}.${format}`
        );

        // Ensure buffer is written to file
        if (Buffer.isBuffer(input)) {
          tempVideoFile = path.join(
            config.upload.tempDir,
            `video_${Date.now()}_${crypto.randomBytes(8).toString('hex')}.tmp`
          );
          await fs.writeFile(tempVideoFile, input);
          inputPath = tempVideoFile;
        }

        const command = ffmpeg(inputPath)
          .seekInput(0)
          .duration(duration)
          .size(`${width}x?`)
          .fps(fps)
          .output(outputPath);

        if (format === 'gif') {
          command.outputOptions([
            '-vf', 'fps=' + fps + ',scale=' + width + ':-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse'
          ]);
        }

        command
          .on('end', async () => {
            try {
              const buffer = await fs.readFile(outputPath);

              // Cleanup
              await fs.unlink(outputPath).catch(() => {});
              if (tempVideoFile) {
                await fs.unlink(tempVideoFile).catch(() => {});
              }

              resolve(buffer);
            } catch (err) {
              reject(err);
            }
          })
          .on('error', (err) => {
            logger.error('Animated preview generation error:', err);

            // Cleanup on error
            fs.unlink(outputPath).catch(() => {});
            if (tempVideoFile) {
              fs.unlink(tempVideoFile).catch(() => {});
            }

            reject(new Error('Failed to generate animated preview: ' + err.message));
          })
          .run();

      } catch (error) {
        logger.error('Generate animated preview error:', error);
        reject(error);
      }
    });
  }

  /**
   * Parse FPS from fraction string
   * @private
   */
  _parseFps(fpsString) {
    if (!fpsString) return null;

    if (fpsString.includes('/')) {
      const [num, den] = fpsString.split('/').map(Number);
      return Math.round((num / den) * 100) / 100;
    }

    return parseFloat(fpsString);
  }
}

// Singleton instance
const videoService = new VideoService();

module.exports = videoService;
