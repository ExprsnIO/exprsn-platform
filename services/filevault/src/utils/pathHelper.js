/**
 * ═══════════════════════════════════════════════════════════════════════
 * Path Helper Utilities
 * ═══════════════════════════════════════════════════════════════════════
 */

const path = require('path');
const logger = require('./logger');

class PathHelper {
  /**
   * Build safe file path from components
   */
  buildPath(...components) {
    try {
      // Filter out empty components
      const cleanComponents = components.filter(c => c && c !== '');

      if (cleanComponents.length === 0) {
        return '/';
      }

      // Normalize each component
      const normalizedComponents = cleanComponents.map(c =>
        this.normalizePathComponent(c)
      );

      // Join and normalize
      let fullPath = path.join(...normalizedComponents);

      // Ensure leading slash for absolute-like paths
      if (!fullPath.startsWith('/')) {
        fullPath = '/' + fullPath;
      }

      // Validate the resulting path
      if (!this.validatePath(fullPath)) {
        throw new Error('Invalid path constructed');
      }

      return fullPath;
    } catch (error) {
      logger.error('Failed to build path', {
        error: error.message,
        components
      });
      throw error;
    }
  }

  /**
   * Normalize path component (remove dangerous characters)
   */
  normalizePathComponent(component) {
    if (!component) {
      return '';
    }

    // Convert to string
    let normalized = String(component);

    // Remove directory traversal attempts
    normalized = normalized.replace(/\.\./g, '');

    // Remove null bytes
    normalized = normalized.replace(/\0/g, '');

    // Remove leading/trailing slashes
    normalized = normalized.replace(/^\/+|\/+$/g, '');

    // Replace multiple slashes with single
    normalized = normalized.replace(/\/+/g, '/');

    // Remove leading/trailing spaces
    normalized = normalized.trim();

    return normalized;
  }

  /**
   * Normalize full path
   */
  normalizePath(filePath) {
    try {
      if (!filePath) {
        return '/';
      }

      // Convert to string
      let normalized = String(filePath);

      // Remove null bytes
      normalized = normalized.replace(/\0/g, '');

      // Normalize using path module
      normalized = path.normalize(normalized);

      // Replace backslashes with forward slashes (Windows compatibility)
      normalized = normalized.replace(/\\/g, '/');

      // Replace multiple slashes with single
      normalized = normalized.replace(/\/+/g, '/');

      // Ensure leading slash
      if (!normalized.startsWith('/')) {
        normalized = '/' + normalized;
      }

      // Remove trailing slash (except for root)
      if (normalized.length > 1 && normalized.endsWith('/')) {
        normalized = normalized.slice(0, -1);
      }

      return normalized;
    } catch (error) {
      logger.error('Failed to normalize path', {
        error: error.message,
        filePath
      });
      return '/';
    }
  }

  /**
   * Validate path for security issues
   */
  validatePath(filePath) {
    if (!filePath) {
      return false;
    }

    // Check for directory traversal
    if (filePath.includes('..')) {
      logger.warn('Directory traversal detected', { filePath });
      return false;
    }

    // Check for null bytes
    if (filePath.includes('\0')) {
      logger.warn('Null byte in path', { filePath });
      return false;
    }

    // Check for excessive length
    if (filePath.length > 4096) {
      logger.warn('Path too long', { filePath, length: filePath.length });
      return false;
    }

    // Check for invalid characters
    const invalidChars = /[<>"|?*\x00-\x1F]/;
    if (invalidChars.test(filePath)) {
      logger.warn('Invalid characters in path', { filePath });
      return false;
    }

    return true;
  }

  /**
   * Get parent directory path
   */
  getParentPath(filePath) {
    const normalized = this.normalizePath(filePath);

    if (normalized === '/') {
      return '/';
    }

    const parentPath = path.dirname(normalized);
    return this.normalizePath(parentPath);
  }

  /**
   * Get filename from path
   */
  getFilename(filePath) {
    const normalized = this.normalizePath(filePath);
    return path.basename(normalized);
  }

  /**
   * Get directory from path
   */
  getDirectory(filePath) {
    const normalized = this.normalizePath(filePath);
    return path.dirname(normalized);
  }

  /**
   * Get file extension
   */
  getExtension(filePath) {
    return path.extname(filePath).toLowerCase();
  }

  /**
   * Get basename without extension
   */
  getBasename(filePath) {
    const filename = this.getFilename(filePath);
    return path.basename(filename, path.extname(filename));
  }

  /**
   * Join path components safely
   */
  joinPath(...components) {
    return this.buildPath(...components);
  }

  /**
   * Resolve relative path against base path
   */
  resolvePath(basePath, relativePath) {
    try {
      const normalizedBase = this.normalizePath(basePath);
      const normalizedRelative = this.normalizePath(relativePath);

      // If relative path is absolute, return it
      if (normalizedRelative.startsWith('/')) {
        return normalizedRelative;
      }

      // Join paths
      return this.buildPath(normalizedBase, normalizedRelative);
    } catch (error) {
      logger.error('Failed to resolve path', {
        error: error.message,
        basePath,
        relativePath
      });
      throw error;
    }
  }

  /**
   * Check if path is within allowed directory
   */
  isWithinDirectory(filePath, allowedDirectory) {
    try {
      const normalizedPath = this.normalizePath(filePath);
      const normalizedDirectory = this.normalizePath(allowedDirectory);

      // Ensure directory ends with slash for comparison
      const directoryWithSlash = normalizedDirectory.endsWith('/')
        ? normalizedDirectory
        : normalizedDirectory + '/';

      return normalizedPath === normalizedDirectory ||
             normalizedPath.startsWith(directoryWithSlash);
    } catch (error) {
      logger.error('Failed to check path containment', {
        error: error.message,
        filePath,
        allowedDirectory
      });
      return false;
    }
  }

  /**
   * Get relative path from base to target
   */
  getRelativePath(basePath, targetPath) {
    try {
      const normalizedBase = this.normalizePath(basePath);
      const normalizedTarget = this.normalizePath(targetPath);

      return path.relative(normalizedBase, normalizedTarget);
    } catch (error) {
      logger.error('Failed to get relative path', {
        error: error.message,
        basePath,
        targetPath
      });
      return '';
    }
  }

  /**
   * Get path depth (number of directory levels)
   */
  getPathDepth(filePath) {
    const normalized = this.normalizePath(filePath);

    if (normalized === '/') {
      return 0;
    }

    const parts = normalized.split('/').filter(p => p !== '');
    return parts.length;
  }

  /**
   * Get all path components
   */
  getPathComponents(filePath) {
    const normalized = this.normalizePath(filePath);

    if (normalized === '/') {
      return ['/'];
    }

    return normalized.split('/').filter(p => p !== '');
  }

  /**
   * Check if path is root
   */
  isRoot(filePath) {
    const normalized = this.normalizePath(filePath);
    return normalized === '/';
  }

  /**
   * Sanitize path for use in URLs
   */
  sanitizeForUrl(filePath) {
    const normalized = this.normalizePath(filePath);
    return encodeURIComponent(normalized);
  }

  /**
   * Generate unique path if path already exists
   */
  generateUniquePath(basePath, preferredName) {
    const ext = path.extname(preferredName);
    const basename = path.basename(preferredName, ext);

    let counter = 1;
    let uniqueName = preferredName;

    // This is a simplified version
    // In production, check against database or filesystem

    while (counter < 1000) {
      uniqueName = `${basename} (${counter})${ext}`;
      counter++;

      // Check if path exists (simplified)
      const fullPath = this.buildPath(basePath, uniqueName);

      // In production, check if this path exists
      // For now, just return the generated path
      if (counter === 2) {
        return uniqueName;
      }
    }

    // If we exhausted counters, add timestamp
    const timestamp = Date.now();
    return `${basename}_${timestamp}${ext}`;
  }

  /**
   * Convert Windows path to Unix path
   */
  toUnixPath(filePath) {
    if (!filePath) {
      return '';
    }

    return filePath.replace(/\\/g, '/');
  }

  /**
   * Check if paths are equal (normalized comparison)
   */
  pathsEqual(path1, path2) {
    const normalized1 = this.normalizePath(path1);
    const normalized2 = this.normalizePath(path2);

    return normalized1 === normalized2;
  }
}

module.exports = new PathHelper();
