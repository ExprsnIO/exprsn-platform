'use strict';

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const num = (v, d) => (v === undefined || v === '' ? d : parseInt(v, 10));
const bool = (v, d) => (v === undefined ? d : String(v).toLowerCase() === 'true');

const config = {
  env: process.env.NODE_ENV || 'development',

  // Public org-signup governance (FEAT-033). The org whose
  // settings.allowUserRegistration / requireEmailVerification govern anonymous
  // org signup. Defaults to 'platform'; signupPolicyService falls back to the
  // earliest-created org when this slug isn't found. Policy resolves fail-closed.
  platformOrgSlug: process.env.PLATFORM_ORG_SLUG || 'platform',

  // Single exposed HTTPS edge.
  http: {
    host: process.env.HOST || '0.0.0.0',
    httpsPort: num(process.env.HTTPS_PORT, 8443),
    // Optional plain-HTTP port that only issues 301s to HTTPS. Set to 0 to disable.
    httpRedirectPort: num(process.env.HTTP_REDIRECT_PORT, 8080),
    corsOrigin: process.env.CORS_ORIGIN || '*',
    trustProxy: bool(process.env.TRUST_PROXY, false),
  },

  tls: {
    enabled: bool(process.env.TLS_ENABLED, true),
    certPath: process.env.TLS_CERT_PATH || path.join(__dirname, '../../certs/platform.crt'),
    keyPath: process.env.TLS_KEY_PATH || path.join(__dirname, '../../certs/platform.key'),
    caPath: process.env.TLS_CA_PATH || null,
  },

  // ONE Postgres database; every module isolates its tables in its own schema.
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: num(process.env.DB_PORT, 5432),
    name: process.env.DB_NAME || 'exprsn',
    user: process.env.DB_USER || 'exprsn',
    password: process.env.DB_PASSWORD || 'exprsn',
    ssl: bool(process.env.DB_SSL, false),
    poolMin: num(process.env.DB_POOL_MIN, 2),
    poolMax: num(process.env.DB_POOL_MAX, 20),
    logging: bool(process.env.DB_LOGGING, false),
  },

  // One shared Redis instance; modules separate keyspaces by prefix / db number.
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: num(process.env.REDIS_PORT, 6379),
    password: process.env.REDIS_PASSWORD || undefined,
    db: num(process.env.REDIS_DB, 0),
  },

  // Shared Elasticsearch cluster (spark / timeline / filevault search indices).
  elasticsearch: {
    node: process.env.ELASTICSEARCH_NODE || 'http://localhost:9200',
    username: process.env.ELASTICSEARCH_USERNAME || undefined,
    password: process.env.ELASTICSEARCH_PASSWORD || undefined,
  },

  // RabbitMQ broker (extras). Probed via its management HTTP API for health.
  rabbitmq: {
    host: process.env.RABBITMQ_HOST || 'localhost',
    port: num(process.env.RABBITMQ_PORT, 5672),
    mgmtPort: num(process.env.RABBITMQ_MGMT_PORT, 15672),
    user: process.env.RABBITMQ_USER || 'guest',
    password: process.env.RABBITMQ_PASSWORD || 'guest',
  },

  // Service-to-service auth used by @exprsn/shared serviceRequest().
  // No insecure default — undefined when unset. Prefer SERVICE_TOKEN_SECRET
  // derived per-service tokens (see shared/utils/serviceToken.js).
  serviceToken: process.env.SERVICE_TOKEN,

  // Observability (SP-5 / R3). Prometheus metrics on /metrics (optionally token-
  // gated); error tracking activates only when SENTRY_DSN is set.
  metrics: {
    enabled: bool(process.env.METRICS_ENABLED, true),
    // When set, GET /metrics requires `Authorization: Bearer <token>`.
    token: process.env.METRICS_TOKEN || null,
  },
  sentry: {
    dsn: process.env.SENTRY_DSN || null,
  },

  // Extensibility framework feature flags. Both default OFF so the plugins and
  // low-code modules load inert and never affect the MVP critical path. Sandbox
  // (native-JS) execution is gated separately as the highest-risk surface.
  features: {
    pluginsEnabled: bool(process.env.PLUGINS_ENABLED, false),
    pluginsScriptEnabled: bool(process.env.PLUGINS_SCRIPT_ENABLED, false),
    lowcodeEnabled: bool(process.env.LOWCODE_ENABLED, false),
    cortexEnabled: bool(process.env.CORTEX_ENABLED, false),
  },

  // Cortex — local-LLM agents/guardrails module (FEAT-021). Inference runs on
  // an external OpenAI-compatible llama.cpp router; nothing here is a cloud API.
  cortex: {
    llmBaseUrl: process.env.CORTEX_LLM_BASE_URL || 'http://127.0.0.1:8080/v1',
    brainModel: process.env.CORTEX_BRAIN_MODEL || 'qwen3-30b-a3b',
    judgeModel: process.env.CORTEX_JUDGE_MODEL || process.env.CORTEX_BRAIN_MODEL || 'qwen3-30b-a3b',
    dataDir: process.env.CORTEX_DATA_DIR || path.join(__dirname, '../../data/cortex'),
    taskConcurrency: num(process.env.CORTEX_TASK_CONCURRENCY, 1),
    llmConcurrency: num(process.env.CORTEX_LLM_CONCURRENCY, 2),
    // Vision (FEAT-030, ADR 0002). A THIRD model role, not an overload of the
    // brain: the router serves it separately and the façade preflights that it
    // actually advertises `image` in its input_modalities. Unset = vision off.
    visionModel: process.env.CORTEX_VISION_MODEL || null,
    // Its own pool: `withSlot` serializes ALL completions, so a queue of async
    // image jobs on the shared pool would starve interactive text chat.
    visionConcurrency: num(process.env.CORTEX_VISION_CONCURRENCY, 1),
    // Generous: vision runs only on the async worker, never a request path, and
    // an LRU model swap alone costs ~53s (measured).
    visionTimeoutMs: num(process.env.CORTEX_VISION_TIMEOUT_MS, 120000),
    // Decode guards for untrusted uploads.
    visionMaxEdge: num(process.env.CORTEX_VISION_MAX_EDGE, 1024),
    visionMaxPixels: num(process.env.CORTEX_VISION_MAX_PIXELS, 50000000), // decompression bomb
    visionMaxFrames: num(process.env.CORTEX_VISION_MAX_FRAMES, 3), // animated GIF/WebP sampling
    pythonToolsEnabled: bool(process.env.CORTEX_PYTHON_TOOLS_ENABLED, false),
    toolAllowPrivateHosts: bool(process.env.CORTEX_TOOL_ALLOW_PRIVATE_HOSTS, false),
    moderate: bool(process.env.CORTEX_MODERATE, false),
    cacheTtl: num(process.env.CORTEX_CACHE_TTL, 3600),
  },
};

// Resolve the public base URL each module is reachable at, now that they share
// one origin. e.g. https://localhost:8443/spark. Used to repoint the legacy
// *_SERVICE_URL env vars so in-process modules still find each other if they
// fall back to HTTP calls.
const scheme = config.tls.enabled ? 'https' : 'http';
const publicHost = process.env.PUBLIC_HOST || `localhost:${config.http.httpsPort}`;
config.baseUrl = `${scheme}://${publicHost}`;

config.tlsAvailable = () =>
  config.tls.enabled &&
  fs.existsSync(config.tls.certPath) &&
  fs.existsSync(config.tls.keyPath);

module.exports = config;
