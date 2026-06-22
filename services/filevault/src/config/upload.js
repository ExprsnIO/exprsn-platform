/**
 * ═══════════════════════════════════════════════════════════════════════
 * Upload Configuration
 * ═══════════════════════════════════════════════════════════════════════
 */

module.exports = {
  // Maximum file size (10GB default)
  maxFileSize: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024 * 1024,

  // Maximum chunk size for chunked uploads (10MB default)
  maxChunkSize: parseInt(process.env.MAX_UPLOAD_CHUNK_SIZE) || 10 * 1024 * 1024,

  // Maximum versions per file
  maxVersionsPerFile: parseInt(process.env.MAX_VERSIONS_PER_FILE) || 100,

  // Allowed MIME types (empty array = allow all)
  allowedMimeTypes: process.env.ALLOWED_MIME_TYPES
    ? process.env.ALLOWED_MIME_TYPES.split(',')
    : [],

  // Blocked MIME types
  blockedMimeTypes: [
    'application/x-msdownload',
    'application/x-msdos-program',
    'application/x-executable'
  ],

  // Image processing options
  image: {
    // Auto-resize large images
    autoResize: process.env.IMAGE_AUTO_RESIZE === 'true',
    maxWidth: parseInt(process.env.IMAGE_MAX_WIDTH) || 4096,
    maxHeight: parseInt(process.env.IMAGE_MAX_HEIGHT) || 4096,

    // Compression quality (1-100)
    quality: parseInt(process.env.IMAGE_QUALITY) || 85,

    // Generate thumbnails automatically
    autoThumbnail: process.env.IMAGE_AUTO_THUMBNAIL !== 'false',
    thumbnailSizes: ['small', 'medium', 'large']
  },

  // Deduplication
  deduplication: {
    enabled: process.env.ENABLE_DEDUPLICATION !== 'false',
    algorithm: 'sha256'
  },

  // Security
  security: {
    // Virus scanning (requires ClamAV or similar)
    virusScanEnabled: process.env.ENABLE_VIRUS_SCANNING === 'true',

    // Validate file content matches declared MIME type
    validateFileType: true,

    // Scan for malicious content
    scanForMalware: true
  },

  // Temporary upload directory
  tempDir: process.env.UPLOAD_TEMP_DIR || '/tmp/filevault-uploads',

  // Cleanup temporary files after (milliseconds)
  tempFileExpiry: 24 * 60 * 60 * 1000, // 24 hours

  // Concurrent uploads per user
  maxConcurrentUploads: parseInt(process.env.MAX_CONCURRENT_UPLOADS) || 5
};
