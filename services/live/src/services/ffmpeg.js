/**
 * FFmpeg Management Service
 * Handles FFmpeg installation, version management, and video processing
 */

const fs = require('fs').promises;
const path = require('path');
const https = require('https');
const { spawn, exec } = require('child_process');
const { promisify } = require('util');
const logger = require('../utils/logger');
const os = require('os');

const execAsync = promisify(exec);

class FFmpegService {
  constructor() {
    this.ffmpegDir = path.join(__dirname, '../../bin/ffmpeg');
    this.ffmpegPath = null;
    this.ffprobePath = null;
    this.version = null;
    this.isInstalled = false;

    // Platform-specific download URLs
    this.downloadUrls = {
      darwin: {
        arm64: 'https://evermeet.cx/ffmpeg/ffmpeg-6.1.zip',
        x64: 'https://evermeet.cx/ffmpeg/ffmpeg-6.1.zip'
      },
      linux: {
        x64: 'https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz'
      },
      win32: {
        x64: 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip'
      }
    };
  }

  /**
   * Initialize FFmpeg service
   * Checks for existing installation or downloads FFmpeg
   */
  async initialize() {
    try {
      // First, check if ffmpeg is already in PATH
      const systemFFmpeg = await this.checkSystemFFmpeg();
      if (systemFFmpeg) {
        this.ffmpegPath = 'ffmpeg';
        this.ffprobePath = 'ffprobe';
        this.isInstalled = true;
        this.version = systemFFmpeg.version;
        logger.info('Using system FFmpeg', { version: this.version });
        return true;
      }

      // Check for local installation
      const localFFmpeg = await this.checkLocalFFmpeg();
      if (localFFmpeg) {
        this.isInstalled = true;
        this.version = localFFmpeg.version;
        logger.info('Using local FFmpeg', { version: this.version });
        return true;
      }

      // Download and install FFmpeg
      logger.info('FFmpeg not found, downloading...');
      await this.downloadAndInstall();
      return true;
    } catch (error) {
      logger.error('Failed to initialize FFmpeg:', error);
      return false;
    }
  }

  /**
   * Check if FFmpeg is available in system PATH
   */
  async checkSystemFFmpeg() {
    try {
      const { stdout } = await execAsync('ffmpeg -version');
      const match = stdout.match(/ffmpeg version ([^\s]+)/);
      if (match) {
        return { version: match[1] };
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Check for local FFmpeg installation
   */
  async checkLocalFFmpeg() {
    try {
      const platform = os.platform();
      const ext = platform === 'win32' ? '.exe' : '';

      this.ffmpegPath = path.join(this.ffmpegDir, `ffmpeg${ext}`);
      this.ffprobePath = path.join(this.ffmpegDir, `ffprobe${ext}`);

      await fs.access(this.ffmpegPath);

      const { stdout } = await execAsync(`"${this.ffmpegPath}" -version`);
      const match = stdout.match(/ffmpeg version ([^\s]+)/);

      if (match) {
        return { version: match[1] };
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Download and install FFmpeg
   */
  async downloadAndInstall() {
    const platform = os.platform();
    const arch = os.arch();

    if (!this.downloadUrls[platform] || !this.downloadUrls[platform][arch]) {
      throw new Error(`Unsupported platform: ${platform} ${arch}`);
    }

    const downloadUrl = this.downloadUrls[platform][arch];

    // Create bin directory
    await fs.mkdir(this.ffmpegDir, { recursive: true });

    logger.info('Downloading FFmpeg', { platform, arch, url: downloadUrl });

    // For development purposes, we'll provide instructions instead of auto-download
    logger.warn('FFmpeg auto-download not implemented yet');
    logger.info('Please install FFmpeg manually:');
    logger.info('  macOS: brew install ffmpeg');
    logger.info('  Ubuntu: sudo apt install ffmpeg');
    logger.info('  Windows: Download from https://ffmpeg.org/download.html');

    throw new Error('FFmpeg not installed. Please install manually.');
  }

  /**
   * Get FFmpeg binary path
   */
  getFFmpegPath() {
    if (!this.isInstalled) {
      throw new Error('FFmpeg is not installed');
    }
    return this.ffmpegPath;
  }

  /**
   * Get FFprobe binary path
   */
  getFFprobePath() {
    if (!this.isInstalled) {
      throw new Error('FFmpeg is not installed');
    }
    return this.ffprobePath;
  }

  /**
   * Get video metadata using ffprobe
   */
  async getVideoMetadata(videoPath) {
    try {
      const ffprobe = this.getFFprobePath();

      const { stdout } = await execAsync(
        `"${ffprobe}" -v quiet -print_format json -show_format -show_streams "${videoPath}"`
      );

      const metadata = JSON.parse(stdout);

      return {
        duration: parseFloat(metadata.format.duration),
        size: parseInt(metadata.format.size),
        bitrate: parseInt(metadata.format.bit_rate),
        format: metadata.format.format_name,
        streams: metadata.streams.map(stream => ({
          type: stream.codec_type,
          codec: stream.codec_name,
          width: stream.width,
          height: stream.height,
          frameRate: stream.avg_frame_rate,
          bitrate: stream.bit_rate
        }))
      };
    } catch (error) {
      logger.error('Failed to get video metadata:', error);
      throw error;
    }
  }

  /**
   * Convert video to different format
   */
  async convertVideo(inputPath, outputPath, options = {}) {
    return new Promise((resolve, reject) => {
      const ffmpeg = this.getFFmpegPath();

      const args = [
        '-i', inputPath,
        '-c:v', options.videoCodec || 'libx264',
        '-c:a', options.audioCodec || 'aac',
        '-b:v', options.videoBitrate || '2500k',
        '-b:a', options.audioBitrate || '128k',
        '-preset', options.preset || 'medium',
        '-y', // Overwrite output
        outputPath
      ];

      logger.info('Converting video', { inputPath, outputPath, options });

      const process = spawn(ffmpeg, args);

      let stderr = '';

      process.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      process.on('close', (code) => {
        if (code === 0) {
          logger.info('Video conversion completed', { outputPath });
          resolve({ success: true, outputPath });
        } else {
          logger.error('Video conversion failed', { code, stderr });
          reject(new Error(`FFmpeg exited with code ${code}`));
        }
      });

      process.on('error', (error) => {
        logger.error('FFmpeg process error:', error);
        reject(error);
      });
    });
  }

  /**
   * Extract audio from video
   */
  async extractAudio(inputPath, outputPath, options = {}) {
    return new Promise((resolve, reject) => {
      const ffmpeg = this.getFFmpegPath();

      const args = [
        '-i', inputPath,
        '-vn', // No video
        '-c:a', options.codec || 'libmp3lame',
        '-b:a', options.bitrate || '192k',
        '-y',
        outputPath
      ];

      const process = spawn(ffmpeg, args);

      process.on('close', (code) => {
        if (code === 0) {
          resolve({ success: true, outputPath });
        } else {
          reject(new Error(`FFmpeg exited with code ${code}`));
        }
      });

      process.on('error', reject);
    });
  }

  /**
   * Generate thumbnail from video
   */
  async generateThumbnail(inputPath, outputPath, timeOffset = '00:00:01') {
    return new Promise((resolve, reject) => {
      const ffmpeg = this.getFFmpegPath();

      const args = [
        '-i', inputPath,
        '-ss', timeOffset,
        '-vframes', '1',
        '-q:v', '2',
        '-y',
        outputPath
      ];

      const process = spawn(ffmpeg, args);

      process.on('close', (code) => {
        if (code === 0) {
          resolve({ success: true, outputPath });
        } else {
          reject(new Error(`FFmpeg exited with code ${code}`));
        }
      });

      process.on('error', reject);
    });
  }

  /**
   * Trim video segment
   */
  async trimVideo(inputPath, outputPath, startTime, duration) {
    return new Promise((resolve, reject) => {
      const ffmpeg = this.getFFmpegPath();

      const args = [
        '-i', inputPath,
        '-ss', startTime.toString(),
        '-t', duration.toString(),
        '-c', 'copy', // Copy codec for fast trimming
        '-y',
        outputPath
      ];

      logger.info('Trimming video', { inputPath, startTime, duration });

      const process = spawn(ffmpeg, args);

      process.on('close', (code) => {
        if (code === 0) {
          logger.info('Video trimming completed', { outputPath });
          resolve({ success: true, outputPath });
        } else {
          reject(new Error(`FFmpeg exited with code ${code}`));
        }
      });

      process.on('error', reject);
    });
  }

  /**
   * Concatenate multiple videos
   */
  async concatenateVideos(inputPaths, outputPath) {
    try {
      // Create concat file
      const concatFilePath = path.join(this.ffmpegDir, 'concat_list.txt');
      const concatContent = inputPaths.map(p => `file '${p}'`).join('\n');
      await fs.writeFile(concatFilePath, concatContent);

      return new Promise((resolve, reject) => {
        const ffmpeg = this.getFFmpegPath();

        const args = [
          '-f', 'concat',
          '-safe', '0',
          '-i', concatFilePath,
          '-c', 'copy',
          '-y',
          outputPath
        ];

        logger.info('Concatenating videos', { count: inputPaths.length });

        const process = spawn(ffmpeg, args);

        process.on('close', async (code) => {
          // Clean up concat file
          await fs.unlink(concatFilePath).catch(() => {});

          if (code === 0) {
            logger.info('Video concatenation completed', { outputPath });
            resolve({ success: true, outputPath });
          } else {
            reject(new Error(`FFmpeg exited with code ${code}`));
          }
        });

        process.on('error', reject);
      });
    } catch (error) {
      logger.error('Failed to concatenate videos:', error);
      throw error;
    }
  }

  /**
   * Stream to RTMP destination
   */
  createRTMPStream(inputSource, rtmpUrl, options = {}) {
    const ffmpeg = this.getFFmpegPath();

    const args = [
      '-re', // Read input at native frame rate
      '-i', inputSource,
      '-c:v', options.videoCodec || 'libx264',
      '-preset', options.preset || 'veryfast',
      '-b:v', options.videoBitrate || '2500k',
      '-maxrate', options.maxBitrate || '2500k',
      '-bufsize', options.bufferSize || '5000k',
      '-pix_fmt', 'yuv420p',
      '-g', options.keyframeInterval || '50',
      '-c:a', options.audioCodec || 'aac',
      '-b:a', options.audioBitrate || '128k',
      '-ar', '44100',
      '-f', 'flv',
      rtmpUrl
    ];

    logger.info('Starting RTMP stream', { rtmpUrl, options });

    const process = spawn(ffmpeg, args);

    process.stderr.on('data', (data) => {
      // Parse ffmpeg output for progress/stats
      const output = data.toString();
      if (output.includes('frame=')) {
        logger.debug('FFmpeg stream progress', { output: output.trim() });
      }
    });

    process.on('close', (code) => {
      logger.info('RTMP stream ended', { code });
    });

    process.on('error', (error) => {
      logger.error('RTMP stream error:', error);
    });

    return process;
  }
}

// Export singleton instance
module.exports = new FFmpegService();
