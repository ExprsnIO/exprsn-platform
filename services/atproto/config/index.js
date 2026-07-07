/**
 * ═══════════════════════════════════════════════════════════
 * atproto module configuration
 *
 * The AT-Protocol bridge: ingest the Bluesky firehose into the existing
 * moderation pipeline, operate as a labeler, and serve our own label firehose.
 * Reuses the platform's shared Redis/Postgres; adds an ATPROTO_* namespace.
 * ═══════════════════════════════════════════════════════════
 */

require('dotenv').config();

const num = (v, d) => (v === undefined || v === '' ? d : parseInt(v, 10));
const float = (v, d) => (v === undefined || v === '' ? d : parseFloat(v));
const bool = (v, d) => (v === undefined ? d : String(v).toLowerCase() === 'true');
const list = (v) =>
  (v ? String(v).split(',').map((s) => s.trim()).filter(Boolean) : []);
// Parse a JSON object from env; returns null on empty/invalid so callers fall
// back to their hardcoded defaults (configurable, but never breaks on bad JSON).
const json = (v) => {
  if (v === undefined || v === '') return null;
  try {
    const parsed = JSON.parse(v);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (_) {
    return null;
  }
};

const config = {
  enabled: bool(process.env.ATPROTO_ENABLED, false),

  // ── Inbound firehose (ingest) ──────────────────────────────────────────
  firehose: {
    // 'jetstream' (JSON, default) | 'subscribeRepos' (raw CBOR/CAR)
    transport: process.env.ATPROTO_FIREHOSE_TRANSPORT || 'jetstream',
    jetstreamUrl:
      process.env.ATPROTO_JETSTREAM_URL ||
      'wss://jetstream2.us-east.bsky.network/subscribe',
    relayUrl:
      process.env.ATPROTO_RELAY_URL ||
      'wss://bsky.network/xrpc/com.atproto.sync.subscribeRepos',
    wantedCollections: list(process.env.ATPROTO_WANTED_COLLECTIONS).length
      ? list(process.env.ATPROTO_WANTED_COLLECTIONS)
      : ['app.bsky.feed.post'],
    // Volume control: process this fraction of matching events (0..1).
    sampleRate: float(process.env.ATPROTO_SAMPLE_RATE, 1),
    // If non-empty, ONLY moderate posts authored by these DIDs.
    authorAllowlist: list(process.env.ATPROTO_AUTHOR_ALLOWLIST),
    // Pause reading when the moderation queue backs up past this depth.
    backpressureHigh: num(process.env.ATPROTO_BACKPRESSURE_HIGH, 5000),
    backpressureLow: num(process.env.ATPROTO_BACKPRESSURE_LOW, 1000),
    // Persist the cursor every N events.
    cursorPersistEvery: num(process.env.ATPROTO_CURSOR_PERSIST_EVERY, 200),
  },

  // ── Labeler identity (outbound) ────────────────────────────────────────
  labeler: {
    did: process.env.ATPROTO_DID || null,
    didMethod: process.env.ATPROTO_DID_METHOD || 'web', // 'web' | 'plc'
    // Public host the labeler is reachable at (used in did:web + service entry).
    host: process.env.ATPROTO_LABELER_HOST || process.env.PUBLIC_HOST || 'localhost:8443',
    // Reference to the signing key material (env var name, vault id, or a
    // multibase-encoded private key for dev). NEVER the raw key in prod.
    signingKeyRef: process.env.ATPROTO_SIGNING_KEY_REF || 'ATPROTO_SIGNING_KEY',
    // Dev-only inline private key (multibase/hex). Prefer signingKeyRef → vault.
    signingKey: process.env.ATPROTO_SIGNING_KEY || null,
    // Label values we declare in app.bsky.labeler.service.
    labelValues: list(process.env.ATPROTO_LABEL_VALUES).length
      ? list(process.env.ATPROTO_LABEL_VALUES)
      : ['spam', 'nsfw', 'toxic', 'hate', 'violence', 'negative-sentiment', '!warn', '!hide'],
    // ── Verdict → label mapping overrides (see src/labeler/verdictMapper.js) ──
    // Optional per-category score thresholds (0..100). JSON object keyed by
    // category (toxic/nsfw/spam/violence/hate). Merges over the mapper defaults;
    // unset categories keep their default. e.g. {"toxic":60,"nsfw":50}
    verdictThresholds: json(process.env.ATPROTO_VERDICT_THRESHOLDS) || null,
    // Optional moderator-action → system-label-value map. JSON object, e.g.
    // {"reject":"!hide","escalate":"!hide"}. Merges over the mapper defaults.
    actionLabels: json(process.env.ATPROTO_ACTION_LABELS) || null,
    // Negative-sentiment score (0..100) at/above which we apply the
    // 'negative-sentiment' label value.
    sentimentLabelThreshold: num(process.env.ATPROTO_SENTIMENT_LABEL_THRESHOLD, 80),
    // PLC directory for resolving + submitting did:plc operations.
    plcDirectoryUrl: process.env.ATPROTO_PLC_DIRECTORY_URL || 'https://plc.directory',
    // PDS account that hosts the labeler repo (for did:plc publishing).
    pds: {
      url: process.env.ATPROTO_PDS_URL || null,
      handle: process.env.ATPROTO_PDS_HANDLE || null,
      password: process.env.ATPROTO_PDS_PASSWORD || null,
      // Email token for com.atproto.identity.signPlcOperation (operator-supplied).
      plcToken: process.env.ATPROTO_PLC_TOKEN || null,
    },
    // Secret seeding per-user did:exprsn derivation. Falls back to the platform
    // service-token secret. Changing it re-keys every user's did:exprsn.
    userDidSecret: process.env.ATPROTO_USER_DID_SECRET || process.env.SERVICE_TOKEN_SECRET || null,
  },

  // ── Feed generator (app.bsky.feed.generator) ──────────────────────────
  feed: {
    rkey: process.env.ATPROTO_FEED_RKEY || 'exprsn-clean',
    name: process.env.ATPROTO_FEED_NAME || 'Exprsn Clean',
    description:
      process.env.ATPROTO_FEED_DESCRIPTION ||
      'Exprsn-moderated feed: ingested posts carrying our moderation labels, with hidden content removed.',
  },

  // ── Consume external labelers (inbound moderation feed) ────────────────
  consume: {
    // Comma-separated labelers to subscribe to. Each entry is either a labeler
    // DID (did:exprsn:… / did:web:…) resolved to its #atproto_labeler endpoint,
    // or a full wss:// subscribeLabels URL.
    labelers: list(process.env.ATPROTO_SUBSCRIBE_LABELERS),
    // If true, drop inbound labels whose signature fails to verify; otherwise
    // store them flagged verified=false.
    requireVerified: bool(process.env.ATPROTO_CONSUME_REQUIRE_VERIFIED, false),
    // Labelers we TRUST enough to drive moderation: a verified inbound label from
    // one of these triggers our AI moderation on the post + (for severe values)
    // an auto-action. Subset of `labelers`.
    trustedLabelers: list(process.env.ATPROTO_TRUSTED_LABELERS),
    // Label values that auto-hide content when emitted by a trusted labeler.
    autoActionValues: list(process.env.ATPROTO_AUTOACTION_VALUES).length
      ? list(process.env.ATPROTO_AUTOACTION_VALUES)
      : ['!hide', 'porn', 'sexual', 'nudity', 'csam', 'child-sexual-abuse-material'],
    // Public AppView used to fetch post content for the AI pass.
    appviewUrl: process.env.ATPROTO_APPVIEW_URL || 'https://public.api.bsky.app',
  },

  // ── Input size caps (DoS guards) ───────────────────────────────────────
  // Bounds on data we buffer from remote peers. Oversized upstream responses /
  // frames are rejected instead of buffering unbounded.
  limits: {
    // Max bytes read from a PDS XRPC response body (pdsClient).
    pdsMaxBodyBytes: num(process.env.ATPROTO_PDS_MAX_BODY_BYTES, 1_000_000),
    // Max bytes read from an AppView response body (appviewClient).
    appviewMaxBodyBytes: num(process.env.ATPROTO_APPVIEW_MAX_BODY_BYTES, 1_000_000),
    // Max ws frame size (bytes) on the label streams: inbound frames from
    // external labelers (labelConsumer) and inbound frames on our own
    // subscribeLabels server. `ws` defaults to 100 MiB without this.
    labelWsMaxPayload: num(process.env.ATPROTO_LABEL_WS_MAX_PAYLOAD, 1_000_000),
  },

  // ── Moderation dead-letter queue (RabbitMQ) ───────────────────────────
  // When a 'moderate-atproto' Bull job exhausts its retries, the failed DID
  // item is routed to a RabbitMQ dead-letter queue so it isn't silently lost.
  // A consumer in the worker then bounded-re-drives it (up to maxRedrive) back
  // onto the Bull queue, or records it permanently failed. DID-method-agnostic:
  // covers did:web / did:plc / did:exprsn alike.
  //   ATPROTO_MODERATION_DLQ      'false' to disable DLQ routing (default on)
  //   ATPROTO_DLQ_MAX_REDRIVE     max times a dead-lettered item is re-enqueued (default 2)
  moderationDlq: {
    enabled: process.env.ATPROTO_MODERATION_DLQ !== 'false',
    exchange: 'exprsn.atproto.moderation',
    queue: 'exprsn.atproto.moderation.dlq',
    maxRedrive: num(process.env.ATPROTO_DLQ_MAX_REDRIVE, 2),
  },

  // Shared Redis (Bull) — same instance/db as the moderator so we enqueue onto
  // its 'moderation' queue. The `|| 3` mirrors services/moderator/config/index.js
  // exactly (incl. the REDIS_DB=0 → 3 quirk) so both attach to the same queue.
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: num(process.env.REDIS_PORT, 6379),
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB, 10) || 3,
  },
};

module.exports = config;
