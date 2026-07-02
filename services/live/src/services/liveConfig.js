/**
 * Live configuration service — typed, persisted (LiveConfig) settings with
 * sane defaults, plus helpers the room/stream APIs use to ENFORCE limits and
 * policy. Sections: limits, provider, recording, roompolicy, moderation.
 */

const LiveConfig = require('../models/LiveConfig');
const logger = require('../utils/logger');

const DEFAULTS = {
  limits: {
    maxLiveRooms: 25,               // concurrent active rooms platform-wide
    maxParticipantsPerRoom: 50,
    maxBitrateKbps: 6000,
    maxResolution: '1080p',         // 720p | 1080p | 4K
    maxStreamDurationMin: 240,
    maxSimulcastDestinations: 3
  },
  provider: {
    streamingProvider: 'srs',       // srs | cloudflare
    srsRtmpUrl: 'rtmp://localhost:1935/live',
    srsHlsBase: 'http://localhost:8085/live',
    srsApiUrl: 'http://localhost:1985'
  },
  recording: {
    recordingEnabled: true,
    autoRecord: false,
    format: 'mp4',                  // mp4 | hls
    quality: 'source',              // source | 1080p | 720p
    retentionDays: 30
  },
  roompolicy: {
    defaultJoinPolicy: 'open',      // open | invite | request
    whoCanPublish: 'host',          // host | all
    allowGuests: true,
    lockable: true
  },
  moderation: {
    profanityFilter: false,
    autoMuteOnJoin: false,
    requireApproval: false,
    bannedWords: '',
    maxWarnings: 3
  }
};

function defaultsFor(section) {
  return DEFAULTS[section] ? { ...DEFAULTS[section] } : {};
}

/** Merge persisted overrides over defaults for a section. */
async function getSection(section) {
  const base = defaultsFor(section);
  try {
    const row = await LiveConfig.findByPk(section);
    return row && row.data ? { ...base, ...row.data } : base;
  } catch (error) {
    logger.error('Failed to load live config section', { section, error: error.message });
    return base;
  }
}

/** Persist a partial patch for a section; returns the merged section. */
async function setSection(section, patch = {}) {
  const merged = { ...(await getSection(section)), ...patch };
  // Keep only known keys so junk isn't stored.
  const allowed = Object.keys(defaultsFor(section));
  const clean = {};
  for (const k of allowed) if (merged[k] !== undefined) clean[k] = merged[k];
  await LiveConfig.upsert({ section, data: clean });
  logger.info('Live config section saved', { section });
  return clean;
}

async function getAll() {
  const out = {};
  for (const section of Object.keys(DEFAULTS)) out[section] = await getSection(section);
  return out;
}

// ── enforcement helpers ─────────────────────────────────────────────────────

async function limits() { return getSection('limits'); }
async function roomPolicy() { return getSection('roompolicy'); }

module.exports = { DEFAULTS, defaultsFor, getSection, setSection, getAll, limits, roomPolicy };
