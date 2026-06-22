/**
 * ═══════════════════════════════════════════════════════════════════════
 * File Validation Utilities
 * ═══════════════════════════════════════════════════════════════════════
 */

const path = require('path');
const { fromBuffer } = require('file-type');
const logger = require('./logger');

class FileValidator {
  /**
   * Validate MIME type against allowed list
   */
  validateMimeType(file, allowedMimeTypes) {
    if (!allowedMimeTypes || allowedMimeTypes.length === 0) {
      return true;
    }

    const fileMimeType = file.mimetype || file.mime_type;

    // Check exact match
    if (allowedMimeTypes.includes(fileMimeType)) {
      return true;
    }

    // Check wildcard patterns (e.g., "image/*")
    for (const allowedType of allowedMimeTypes) {
      if (allowedType.endsWith('/*')) {
        const baseType = allowedType.replace('/*', '');
        if (fileMimeType && fileMimeType.startsWith(baseType + '/')) {
          return true;
        }
      }
    }

    logger.warn('MIME type validation failed', {
      fileMimeType,
      allowedMimeTypes
    });

    return false;
  }

  /**
   * Validate file size
   */
  validateFileSize(file, maxSize) {
    if (!maxSize) {
      return true;
    }

    const fileSize = file.size || 0;

    if (fileSize > maxSize) {
      logger.warn('File size validation failed', {
        fileSize,
        maxSize
      });
      return false;
    }

    return true;
  }

  /**
   * Sanitize filename to prevent security issues
   */
  sanitizeFilename(filename) {
    if (!filename) {
      return 'untitled';
    }

    // Remove directory traversal attempts
    let sanitized = filename.replace(/\.\./g, '');

    // Remove null bytes
    sanitized = sanitized.replace(/\0/g, '');

    // Remove control characters
    sanitized = sanitized.replace(/[\x00-\x1F\x7F]/g, '');

    // Remove leading/trailing spaces and dots
    sanitized = sanitized.trim().replace(/^\.+/, '');

    // Replace problematic characters
    sanitized = sanitized.replace(/[<>:"|?*]/g, '_');

    // Limit length
    const maxLength = 255;
    if (sanitized.length > maxLength) {
      const ext = path.extname(sanitized);
      const basename = path.basename(sanitized, ext);
      sanitized = basename.substring(0, maxLength - ext.length) + ext;
    }

    // Ensure we have a valid filename
    if (!sanitized || sanitized === '') {
      sanitized = 'untitled';
    }

    return sanitized;
  }

  /**
   * Detect actual file type from buffer (not just extension)
   */
  async detectFileType(buffer) {
    try {
      if (!buffer || buffer.length === 0) {
        return null;
      }

      const result = await fromBuffer(buffer);

      if (result) {
        return result.mime;
      }

      return null;
    } catch (error) {
      logger.error('File type detection failed', { error: error.message });
      return null;
    }
  }

  /**
   * Validate file extension
   */
  validateExtension(filename, allowedExtensions) {
    if (!allowedExtensions || allowedExtensions.length === 0) {
      return true;
    }

    const ext = path.extname(filename).toLowerCase();

    const isAllowed = allowedExtensions.some(allowed => {
      const normalizedAllowed = allowed.startsWith('.') ? allowed : '.' + allowed;
      return ext === normalizedAllowed.toLowerCase();
    });

    if (!isAllowed) {
      logger.warn('Extension validation failed', {
        filename,
        extension: ext,
        allowedExtensions
      });
    }

    return isAllowed;
  }

  /**
   * Check if filename has dangerous extension
   */
  hasDangerousExtension(filename) {
    const dangerousExtensions = [
      '.exe', '.bat', '.cmd', '.com', '.pif', '.scr',
      '.vbs', '.js', '.jar', '.app', '.deb', '.rpm',
      '.dmg', '.pkg', '.sh', '.run'
    ];

    const ext = path.extname(filename).toLowerCase();
    return dangerousExtensions.includes(ext);
  }

  /**
   * Validate file path for security
   */
  validatePath(filePath) {
    // Check for directory traversal
    if (filePath.includes('..')) {
      logger.warn('Path traversal detected', { filePath });
      return false;
    }

    // Check for absolute paths
    if (path.isAbsolute(filePath)) {
      logger.warn('Absolute path detected', { filePath });
      return false;
    }

    // Check for null bytes
    if (filePath.includes('\0')) {
      logger.warn('Null byte in path', { filePath });
      return false;
    }

    return true;
  }

  /**
   * Get safe MIME type
   */
  getSafeMimeType(filename, declaredMimeType = null) {
    const mime = require('mime-types');

    // Use declared MIME type if it looks safe
    if (declaredMimeType && this.isSafeMimeType(declaredMimeType)) {
      return declaredMimeType;
    }

    // Detect from filename
    const detectedMimeType = mime.lookup(filename);

    if (detectedMimeType && this.isSafeMimeType(detectedMimeType)) {
      return detectedMimeType;
    }

    // Default to binary
    return 'application/octet-stream';
  }

  /**
   * Check if MIME type is safe
   */
  isSafeMimeType(mimeType) {
    const dangerousMimeTypes = [
      'application/x-msdownload',
      'application/x-msdos-program',
      'application/x-executable',
      'application/x-sh',
      'text/x-sh'
    ];

    return !dangerousMimeTypes.includes(mimeType);
  }

  /**
   * Validate image file
   */
  async validateImage(buffer) {
    try {
      const sharp = require('sharp');
      const metadata = await sharp(buffer).metadata();

      return {
        valid: true,
        width: metadata.width,
        height: metadata.height,
        format: metadata.format
      };
    } catch (error) {
      logger.error('Image validation failed', { error: error.message });
      return {
        valid: false,
        error: error.message
      };
    }
  }

  /**
   * Check if file is likely malicious
   */
  async scanFile(buffer) {
    // This is a placeholder for virus scanning
    // In production, integrate with ClamAV or similar

    // Basic checks
    const checks = [];

    // Check for executable signatures
    if (this.hasExecutableSignature(buffer)) {
      checks.push({
        type: 'executable_signature',
        severity: 'high',
        message: 'File contains executable signature'
      });
    }

    // Check for script tags (for uploaded HTML/SVG)
    if (this.hasScriptTags(buffer)) {
      checks.push({
        type: 'script_tags',
        severity: 'medium',
        message: 'File contains script tags'
      });
    }

    const isSafe = checks.filter(c => c.severity === 'high').length === 0;

    return {
      safe: isSafe,
      checks
    };
  }

  /**
   * Check for executable signatures
   */
  hasExecutableSignature(buffer) {
    if (!buffer || buffer.length < 4) {
      return false;
    }

    // Check for common executable signatures
    const signatures = [
      Buffer.from('MZ'),        // PE executable
      Buffer.from('\x7FELF'),   // ELF executable
      Buffer.from('#!/'),       // Script shebang
    ];

    for (const signature of signatures) {
      if (buffer.slice(0, signature.length).equals(signature)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check for script tags in buffer
   */
  hasScriptTags(buffer) {
    if (!buffer || buffer.length === 0) {
      return false;
    }

    try {
      const text = buffer.toString('utf8', 0, Math.min(buffer.length, 10000));
      return /<script/i.test(text) || /javascript:/i.test(text);
    } catch (error) {
      return false;
    }
  }

  /**
   * Format bytes to human readable
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }
}

module.exports = new FileValidator();
