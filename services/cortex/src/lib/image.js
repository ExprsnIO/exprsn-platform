'use strict';

/**
 * ═══════════════════════════════════════════════════════════
 * Image normalization for the vision path (FEAT-030, ADR 0002 §4).
 *
 * Everything here runs on UNTRUSTED user uploads before a single byte reaches
 * the model, so the order of operations matters:
 *
 *   1. bounded decode      — `limitInputPixels` rejects decompression bombs
 *                            (a 100 KB PNG can expand to tens of GB of RGBA).
 *   2. auto-orient         — `.rotate()` bakes in the EXIF Orientation tag,
 *                            otherwise a rotated photo is analysed sideways.
 *   3. re-encode, no meta  — sharp drops metadata unless `.withMetadata()` is
 *                            called, so this strips EXIF/GPS. Never add it back.
 *   4. downscale           — cap the long edge; a 4000px photo costs context and
 *                            buys nothing for moderation/tagging.
 *
 * Animated GIF/WebP: frame 0 is often a title card or blank, so a still-only
 * read is a trivial moderation bypass. We sample evenly across pages.
 * ═══════════════════════════════════════════════════════════
 */

const sharp = require('sharp');
const config = require('../config');

// Formats we will decode. Anything else is rejected rather than guessed at.
const SUPPORTED = ['png', 'jpeg', 'jpg', 'gif', 'webp', 'avif', 'tiff', 'heif'];
const ANIMATED = ['gif', 'webp'];

class UnsupportedImageError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UnsupportedImageError';
    this.code = 'UNSUPPORTED_IMAGE';
    this.statusCode = 415;
  }
}

function decodeOpts(extra = {}) {
  return { limitInputPixels: config.cortex.visionMaxPixels, ...extra };
}

async function probe(buffer) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) {
    throw new UnsupportedImageError('empty image buffer');
  }
  let meta;
  try {
    // `pages: -1` reads ALL pages, so `meta.pages` reports the real frame count
    // of an animated GIF/WebP. Without it sharp reports 1 and frame sampling
    // would silently degrade to "frame 0 only" — a moderation bypass.
    meta = await sharp(buffer, decodeOpts({ pages: -1 })).metadata();
  } catch (err) {
    // Covers corrupt input AND the pixel-limit trip; both are client errors.
    throw new UnsupportedImageError(`cannot decode image: ${err.message}`);
  }
  if (!meta.format || !SUPPORTED.includes(meta.format)) {
    throw new UnsupportedImageError(`unsupported image format: ${meta.format || 'unknown'}`);
  }
  return meta;
}

// One page → one JPEG buffer, oriented, stripped, and downscaled.
async function renderPage(buffer, meta, page) {
  const maxEdge = config.cortex.visionMaxEdge;
  const animated = ANIMATED.includes(meta.format) && (meta.pages || 1) > 1;
  const input = animated ? sharp(buffer, decodeOpts({ page })) : sharp(buffer, decodeOpts());
  return input
    .rotate() // apply EXIF orientation before we discard the metadata
    .resize({ width: maxEdge, height: maxEdge, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 85 }) // re-encode WITHOUT .withMetadata() → EXIF/GPS gone
    .toBuffer();
}

/**
 * Which pages of an animated image to sample: evenly spaced, always including
 * the first and last frame. `want` frames out of `pages`.
 */
function frameIndices(pages, want) {
  const n = Math.max(1, Math.min(want, pages));
  if (n === 1 || pages <= 1) return [0];
  const idx = Array.from({ length: n }, (_, i) => Math.round((i * (pages - 1)) / (n - 1)));
  return [...new Set(idx)];
}

/**
 * Normalize an upload into 1..N model-ready JPEG frames.
 * Returns { frames: Buffer[], meta: { format, width, height, pages, sampled } }.
 * Throws UnsupportedImageError on anything we won't decode.
 */
async function normalize(buffer) {
  const meta = await probe(buffer);
  const pages = meta.pages || 1;
  const animated = ANIMATED.includes(meta.format) && pages > 1;

  const indices = animated ? frameIndices(pages, config.cortex.visionMaxFrames) : [0];

  const frames = [];
  for (const page of indices) {
    frames.push(await renderPage(buffer, meta, page));
  }

  return {
    frames,
    meta: {
      format: meta.format,
      width: meta.width,
      height: meta.height,
      pages,
      sampled: indices.length,
    },
  };
}

/** data: URI for the OpenAI `image_url` content part. */
function toDataUri(jpegBuffer) {
  return `data:image/jpeg;base64,${jpegBuffer.toString('base64')}`;
}

module.exports = { normalize, probe, toDataUri, frameIndices, UnsupportedImageError, SUPPORTED };
