/**
 * ═══════════════════════════════════════════════════════════════════════
 * Checksum Utilities
 * ═══════════════════════════════════════════════════════════════════════
 */

const crypto = require('crypto');
const fs = require('fs').promises;
const { createReadStream } = require('fs');
const logger = require('./logger');

/**
 * Calculate SHA256 hash of buffer
 */
async function calculateSHA256(buffer) {
  try {
    if (!buffer) {
      throw new Error('Buffer is required');
    }

    const hash = crypto.createHash('sha256');
    hash.update(buffer);
    return hash.digest('hex');
  } catch (error) {
    logger.error('Failed to calculate SHA256', { error: error.message });
    throw error;
  }
}

/**
 * Calculate SHA256 hash of file stream
 */
async function calculateSHA256FromStream(stream) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');

    stream.on('data', (chunk) => {
      hash.update(chunk);
    });

    stream.on('end', () => {
      resolve(hash.digest('hex'));
    });

    stream.on('error', (error) => {
      reject(error);
    });
  });
}

/**
 * Calculate SHA256 hash of file path
 */
async function calculateSHA256FromFile(filePath) {
  try {
    const stream = createReadStream(filePath);
    return await calculateSHA256FromStream(stream);
  } catch (error) {
    logger.error('Failed to calculate SHA256 from file', {
      error: error.message,
      filePath
    });
    throw error;
  }
}

/**
 * Calculate MD5 hash of buffer
 */
async function calculateMD5(buffer) {
  try {
    if (!buffer) {
      throw new Error('Buffer is required');
    }

    const hash = crypto.createHash('md5');
    hash.update(buffer);
    return hash.digest('hex');
  } catch (error) {
    logger.error('Failed to calculate MD5', { error: error.message });
    throw error;
  }
}

/**
 * Verify checksum matches expected value
 */
async function verifyChecksum(buffer, expectedChecksum, algorithm = 'sha256') {
  try {
    let calculatedChecksum;

    switch (algorithm.toLowerCase()) {
      case 'sha256':
        calculatedChecksum = await calculateSHA256(buffer);
        break;
      case 'md5':
        calculatedChecksum = await calculateMD5(buffer);
        break;
      default:
        throw new Error(`Unsupported algorithm: ${algorithm}`);
    }

    const matches = calculatedChecksum === expectedChecksum;

    if (!matches) {
      logger.warn('Checksum mismatch', {
        algorithm,
        expected: expectedChecksum,
        calculated: calculatedChecksum
      });
    }

    return matches;
  } catch (error) {
    logger.error('Failed to verify checksum', { error: error.message });
    throw error;
  }
}

/**
 * Calculate multiple hashes for buffer
 */
async function calculateMultipleHashes(buffer) {
  try {
    const hashes = {};

    // SHA256
    const sha256Hash = crypto.createHash('sha256');
    sha256Hash.update(buffer);
    hashes.sha256 = sha256Hash.digest('hex');

    // MD5
    const md5Hash = crypto.createHash('md5');
    md5Hash.update(buffer);
    hashes.md5 = md5Hash.digest('hex');

    // SHA1
    const sha1Hash = crypto.createHash('sha1');
    sha1Hash.update(buffer);
    hashes.sha1 = sha1Hash.digest('hex');

    return hashes;
  } catch (error) {
    logger.error('Failed to calculate multiple hashes', {
      error: error.message
    });
    throw error;
  }
}

/**
 * Calculate hash with progress callback
 */
async function calculateHashWithProgress(filePath, onProgress) {
  return new Promise(async (resolve, reject) => {
    try {
      const stats = await fs.stat(filePath);
      const totalSize = stats.size;
      let processedSize = 0;

      const hash = crypto.createHash('sha256');
      const stream = createReadStream(filePath);

      stream.on('data', (chunk) => {
        hash.update(chunk);
        processedSize += chunk.length;

        if (onProgress) {
          onProgress({
            processed: processedSize,
            total: totalSize,
            percentage: (processedSize / totalSize) * 100
          });
        }
      });

      stream.on('end', () => {
        resolve(hash.digest('hex'));
      });

      stream.on('error', (error) => {
        reject(error);
      });
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Generate random hash for testing
 */
function generateRandomHash(algorithm = 'sha256') {
  const randomData = crypto.randomBytes(32);
  const hash = crypto.createHash(algorithm);
  hash.update(randomData);
  return hash.digest('hex');
}

/**
 * Compare two checksums safely (timing attack resistant)
 */
function compareChecksums(checksum1, checksum2) {
  if (!checksum1 || !checksum2) {
    return false;
  }

  if (checksum1.length !== checksum2.length) {
    return false;
  }

  return crypto.timingSafeEqual(
    Buffer.from(checksum1, 'hex'),
    Buffer.from(checksum2, 'hex')
  );
}

/**
 * Calculate content-based hash for deduplication
 */
async function calculateContentHash(buffer) {
  // Use SHA256 for content-based deduplication
  return await calculateSHA256(buffer);
}

/**
 * Validate checksum format
 */
function validateChecksumFormat(checksum, algorithm = 'sha256') {
  if (!checksum) {
    return false;
  }

  const formats = {
    sha256: /^[a-f0-9]{64}$/i,
    md5: /^[a-f0-9]{32}$/i,
    sha1: /^[a-f0-9]{40}$/i
  };

  const pattern = formats[algorithm.toLowerCase()];

  if (!pattern) {
    logger.warn('Unknown checksum algorithm', { algorithm });
    return false;
  }

  return pattern.test(checksum);
}

module.exports = {
  calculateSHA256,
  calculateSHA256FromStream,
  calculateSHA256FromFile,
  calculateMD5,
  verifyChecksum,
  calculateMultipleHashes,
  calculateHashWithProgress,
  generateRandomHash,
  compareChecksums,
  calculateContentHash,
  validateChecksumFormat
};
