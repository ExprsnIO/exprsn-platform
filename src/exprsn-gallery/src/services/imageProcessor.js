/**
 * ═══════════════════════════════════════════════════════════
 * Advanced Image Processing Service
 * Handles image transformations, filters, and optimizations
 * ═══════════════════════════════════════════════════════════
 */

const sharp = require('sharp');
const path = require('path');
const fs = require('fs').promises;
const logger = require('../utils/logger');

class ImageProcessorService {
  constructor() {
    this.supportedFormats = ['jpeg', 'png', 'webp', 'avif', 'tiff', 'gif'];
    this.defaultQuality = 85;
  }

  /**
   * Process and optimize image
   * @param {string} inputPath - Input image path
   * @param {Object} options - Processing options
   * @returns {Promise<Object>} Processing result
   */
  async processImage(inputPath, options = {}) {
    try {
      logger.info('Processing image', { inputPath, options });

      const image = sharp(inputPath);
      const metadata = await image.metadata();

      // Apply transformations
      if (options.resize) {
        image.resize(options.resize);
      }

      if (options.crop) {
        image.extract(options.crop);
      }

      if (options.rotate) {
        image.rotate(options.rotate);
      }

      if (options.flip) {
        image.flip();
      }

      if (options.flop) {
        image.flop();
      }

      // Apply filters
      if (options.blur) {
        image.blur(options.blur);
      }

      if (options.sharpen) {
        image.sharpen(options.sharpen);
      }

      if (options.grayscale) {
        image.grayscale();
      }

      if (options.normalize) {
        image.normalize();
      }

      if (options.brightness) {
        image.modulate({ brightness: options.brightness });
      }

      if (options.saturation) {
        image.modulate({ saturation: options.saturation });
      }

      if (options.hue) {
        image.modulate({ hue: options.hue });
      }

      // Apply advanced filters
      if (options.filter) {
        await this._applyAdvancedFilter(image, options.filter);
      }

      // Format conversion and optimization
      const outputFormat = options.format || metadata.format;
      const quality = options.quality || this.defaultQuality;

      await this._applyFormatOptimization(image, outputFormat, quality);

      // Output
      const outputPath = options.outputPath || this._generateOutputPath(inputPath, outputFormat);
      await image.toFile(outputPath);

      const outputMetadata = await sharp(outputPath).metadata();

      logger.info('Image processed successfully', {
        inputPath,
        outputPath,
        inputSize: metadata.size,
        outputSize: outputMetadata.size,
        compression: ((1 - outputMetadata.size / metadata.size) * 100).toFixed(2) + '%'
      });

      return {
        success: true,
        outputPath,
        metadata: outputMetadata,
        originalSize: metadata.size,
        newSize: outputMetadata.size,
        compressionRatio: ((1 - outputMetadata.size / metadata.size) * 100).toFixed(2)
      };

    } catch (error) {
      logger.error('Image processing failed', {
        error: error.message,
        inputPath
      });

      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Generate multiple sizes/formats of an image
   * @param {string} inputPath - Input image path
   * @param {Array} variants - Array of variant configurations
   * @returns {Promise<Array>} Array of generated variants
   */
  async generateVariants(inputPath, variants = []) {
    const defaultVariants = [
      { name: 'thumbnail', width: 150, height: 150, fit: 'cover' },
      { name: 'small', width: 400, height: 400, fit: 'inside' },
      { name: 'medium', width: 800, height: 800, fit: 'inside' },
      { name: 'large', width: 1600, height: 1600, fit: 'inside' },
      { name: 'webp_large', width: 1600, height: 1600, fit: 'inside', format: 'webp' }
    ];

    const variantsToGenerate = variants.length > 0 ? variants : defaultVariants;
    const results = [];

    for (const variant of variantsToGenerate) {
      try {
        const outputPath = this._getVariantPath(inputPath, variant.name);

        const result = await this.processImage(inputPath, {
          resize: {
            width: variant.width,
            height: variant.height,
            fit: variant.fit || 'inside',
            withoutEnlargement: true
          },
          format: variant.format,
          quality: variant.quality || this.defaultQuality,
          outputPath
        });

        if (result.success) {
          results.push({
            name: variant.name,
            path: outputPath,
            ...result
          });
        }

      } catch (error) {
        logger.error('Variant generation failed', {
          variant: variant.name,
          error: error.message
        });
      }
    }

    return results;
  }

  /**
   * Extract dominant colors from image
   * @param {string} imagePath - Image path
   * @param {number} count - Number of colors to extract
   * @returns {Promise<Array>} Array of dominant colors
   */
  async extractDominantColors(imagePath, count = 5) {
    try {
      const { data, info } = await sharp(imagePath)
        .resize(100, 100, { fit: 'inside' })
        .raw()
        .toBuffer({ resolveWithObject: true });

      const pixels = [];
      for (let i = 0; i < data.length; i += info.channels) {
        pixels.push({
          r: data[i],
          g: data[i + 1],
          b: data[i + 2]
        });
      }

      // Simple k-means clustering to find dominant colors
      const colors = this._kMeansClustering(pixels, count);

      return colors.map(color => ({
        rgb: `rgb(${color.r}, ${color.g}, ${color.b})`,
        hex: this._rgbToHex(color.r, color.g, color.b)
      }));

    } catch (error) {
      logger.error('Color extraction failed', {
        error: error.message,
        imagePath
      });
      return [];
    }
  }

  /**
   * Apply watermark to image
   * @param {string} imagePath - Image path
   * @param {string} watermarkPath - Watermark image path
   * @param {Object} options - Watermark options
   * @returns {Promise<string>} Output path
   */
  async applyWatermark(imagePath, watermarkPath, options = {}) {
    try {
      const position = options.position || 'southeast';
      const opacity = options.opacity || 0.5;

      const watermark = await sharp(watermarkPath)
        .resize(options.width || 200)
        .composite([{
          input: Buffer.from([255, 255, 255, Math.floor(255 * opacity)]),
          raw: { width: 1, height: 1, channels: 4 },
          tile: true,
          blend: 'dest-in'
        }])
        .toBuffer();

      const outputPath = options.outputPath || this._generateOutputPath(imagePath, 'watermarked');

      await sharp(imagePath)
        .composite([{
          input: watermark,
          gravity: position
        }])
        .toFile(outputPath);

      logger.info('Watermark applied', { imagePath, outputPath });

      return outputPath;

    } catch (error) {
      logger.error('Watermark application failed', {
        error: error.message,
        imagePath
      });
      throw error;
    }
  }

  /**
   * Convert image to different format
   * @param {string} inputPath - Input image path
   * @param {string} format - Target format
   * @param {Object} options - Conversion options
   * @returns {Promise<string>} Output path
   */
  async convertFormat(inputPath, format, options = {}) {
    if (!this.supportedFormats.includes(format)) {
      throw new Error(`Unsupported format: ${format}`);
    }

    const outputPath = options.outputPath || this._generateOutputPath(inputPath, format);
    const quality = options.quality || this.defaultQuality;

    const image = sharp(inputPath);

    await this._applyFormatOptimization(image, format, quality);
    await image.toFile(outputPath);

    logger.info('Format conversion complete', {
      inputPath,
      outputPath,
      format
    });

    return outputPath;
  }

  /**
   * Apply advanced filter to image
   */
  async _applyAdvancedFilter(image, filter) {
    switch (filter) {
      case 'sepia':
        image.tint({ r: 112, g: 66, b: 20 });
        break;

      case 'vintage':
        image.modulate({ brightness: 1.1, saturation: 0.8 });
        image.tint({ r: 255, g: 250, b: 240 });
        break;

      case 'dramatic':
        image.normalize();
        image.modulate({ brightness: 0.9, saturation: 1.3 });
        image.sharpen();
        break;

      case 'polaroid':
        image.modulate({ brightness: 1.1, saturation: 0.9 });
        image.tint({ r: 255, g: 255, b: 250 });
        break;

      case 'cool':
        image.tint({ r: 200, g: 220, b: 255 });
        break;

      case 'warm':
        image.tint({ r: 255, g: 230, b: 200 });
        break;

      case 'high_contrast':
        image.normalize();
        image.linear(1.3, -(0.3 * 128));
        break;

      default:
        // No filter applied
        break;
    }
  }

  /**
   * Apply format-specific optimization
   */
  async _applyFormatOptimization(image, format, quality) {
    switch (format) {
      case 'jpeg':
        image.jpeg({
          quality,
          progressive: true,
          mozjpeg: true
        });
        break;

      case 'png':
        image.png({
          quality,
          compressionLevel: 9,
          progressive: true
        });
        break;

      case 'webp':
        image.webp({
          quality,
          lossless: false,
          nearLossless: false,
          smartSubsample: true
        });
        break;

      case 'avif':
        image.avif({
          quality,
          lossless: false,
          effort: 4
        });
        break;

      case 'tiff':
        image.tiff({
          quality,
          compression: 'lzw'
        });
        break;

      default:
        // Use default settings
        break;
    }
  }

  /**
   * Simple k-means clustering for color extraction
   */
  _kMeansClustering(pixels, k) {
    // Initialize centroids randomly
    let centroids = pixels.slice(0, k);

    for (let iteration = 0; iteration < 10; iteration++) {
      const clusters = Array.from({ length: k }, () => []);

      // Assign pixels to nearest centroid
      pixels.forEach(pixel => {
        let minDist = Infinity;
        let clusterIndex = 0;

        centroids.forEach((centroid, i) => {
          const dist = this._colorDistance(pixel, centroid);
          if (dist < minDist) {
            minDist = dist;
            clusterIndex = i;
          }
        });

        clusters[clusterIndex].push(pixel);
      });

      // Update centroids
      centroids = clusters.map(cluster => {
        if (cluster.length === 0) return centroids[0];

        const sum = cluster.reduce(
          (acc, pixel) => ({
            r: acc.r + pixel.r,
            g: acc.g + pixel.g,
            b: acc.b + pixel.b
          }),
          { r: 0, g: 0, b: 0 }
        );

        return {
          r: Math.round(sum.r / cluster.length),
          g: Math.round(sum.g / cluster.length),
          b: Math.round(sum.b / cluster.length)
        };
      });
    }

    return centroids;
  }

  /**
   * Calculate Euclidean distance between colors
   */
  _colorDistance(c1, c2) {
    return Math.sqrt(
      Math.pow(c1.r - c2.r, 2) +
      Math.pow(c1.g - c2.g, 2) +
      Math.pow(c1.b - c2.b, 2)
    );
  }

  /**
   * Convert RGB to hex
   */
  _rgbToHex(r, g, b) {
    return '#' + [r, g, b].map(x => {
      const hex = x.toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    }).join('');
  }

  /**
   * Generate output path
   */
  _generateOutputPath(inputPath, suffix) {
    const parsed = path.parse(inputPath);
    return path.join(parsed.dir, `${parsed.name}_${suffix}${parsed.ext}`);
  }

  /**
   * Get variant path
   */
  _getVariantPath(inputPath, variantName) {
    const parsed = path.parse(inputPath);
    return path.join(parsed.dir, `${parsed.name}_${variantName}${parsed.ext}`);
  }
}

module.exports = new ImageProcessorService();
