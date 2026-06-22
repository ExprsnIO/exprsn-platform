/**
 * ═══════════════════════════════════════════════════════════════════════
 * FileVault Hashing Utilities
 * ═══════════════════════════════════════════════════════════════════════
 */

const crypto = require('crypto');
const { Readable } = require('stream');

/**
 * Calculate SHA-256 hash of a buffer
 * @param {Buffer} buffer - Data buffer
 * @returns {string} Hex-encoded hash
 */
function calculateSHA256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Calculate SHA-256 hash of a stream
 * @param {ReadableStream} stream - Data stream
 * @returns {Promise<string>} Hex-encoded hash
 */
function calculateSHA256Stream(stream) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    stream.on('data', chunk => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

/**
 * Calculate MD5 hash for ETag
 * @param {Buffer} buffer - Data buffer
 * @returns {string} Hex-encoded hash
 */
function calculateMD5(buffer) {
  return crypto.createHash('md5').update(buffer).digest('hex');
}

/**
 * Generate content-addressable key
 * @param {string} hash - Content hash
 * @param {string} [prefix=''] - Optional prefix
 * @returns {string} Storage key
 */
function generateStorageKey(hash, prefix = '') {
  // Use hash prefix for directory structure: ab/cd/abcd1234...
  const dir1 = hash.substring(0, 2);
  const dir2 = hash.substring(2, 4);
  return prefix ? `${prefix}/${dir1}/${dir2}/${hash}` : `${dir1}/${dir2}/${hash}`;
}

module.exports = {
  calculateSHA256,
  calculateSHA256Stream,
  calculateMD5,
  generateStorageKey
};
