'use strict';

/**
 * Pluggable live-stream ingest provider.
 *
 * The live module supports two ingest backends, selected by
 * `config.streaming.provider` (env STREAMING_PROVIDER):
 *   - 'cloudflare' — Cloudflare Stream (SaaS; needs CLOUDFLARE_ACCOUNT_ID +
 *     CLOUDFLARE_API_TOKEN). Provisions a live input over the Cloudflare API.
 *   - anything else ('selfhosted'/'srs', the default-friendly local option) —
 *     a self-hosted SRS server (Dockerized; see docker-compose `srs`). SRS
 *     accepts any stream key pushed to it, so provisioning a live input is just
 *     minting a key and composing the ingest/playback URLs — no remote API call,
 *     so it never fails for missing credentials.
 *
 * Both providers expose the same surface used by stream.js:
 *   createLiveInput({ streamKey?, recording, meta }) ->
 *     { uid, rtmpUrl, streamKey, hlsUrl, webRTCUrl, status }
 *   getLiveInput(uid) -> same shape
 *   deleteLiveInput(uid) -> { success }
 */
const crypto = require('crypto');
const config = require('../config');
const logger = require('../utils/logger');
const cloudflareService = require('./cloudflare');
const srsService = require('./platforms/srs');

const srsAdapter = {
  async createLiveInput(options = {}) {
    const streamKey = options.streamKey || crypto.randomBytes(16).toString('hex');
    const s = srsService.createStream({ streamKey, app: 'live', enableHLS: true });
    return {
      uid: streamKey, // self-hosted: the stream key IS the input id
      rtmpUrl: s.ingest.rtmp,
      rtmpsUrl: s.ingest.rtmps,
      streamKey,
      hlsUrl: s.playback.hls,
      webRTCUrl: s.playback.webrtc,
      status: 'ready',
    };
  },
  async getLiveInput(uid) {
    const s = srsService.createStream({ streamKey: uid, app: 'live', enableHLS: true });
    return {
      uid,
      rtmpUrl: s.ingest.rtmp,
      streamKey: uid,
      hlsUrl: s.playback.hls,
      webRTCUrl: s.playback.webrtc,
      status: 'ready',
    };
  },
  async deleteLiveInput() {
    // SRS has no persistent "live input" object to delete; the key simply stops
    // working once the publisher disconnects. Nothing to clean up remotely.
    return { success: true };
  },
  async getLiveInputRecordings() {
    return [];
  },
};

function getProvider() {
  if (config.streaming.provider === 'cloudflare') {
    return cloudflareService;
  }
  return srsAdapter;
}

logger.info('Live stream ingest provider selected', { provider: config.streaming.provider });

module.exports = { getProvider };
