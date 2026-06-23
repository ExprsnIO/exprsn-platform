'use strict';

/**
 * Canonical list of the domain modules that make up the unified platform.
 *
 * Each module is a former standalone microservice, now loaded in-process and
 * mounted behind the single HTTPS gateway. The original network topology
 * (one port per service) is collapsed to path prefixes on one port.
 *
 * Module contract — each `entry` file must export:
 *   module.exports = {
 *     name:    'auth',
 *     app,                       // Express app/router. No listen(), no view
 *                                // engine, no static, no setup routes.
 *     registerSockets(io) {},    // optional. Attach this module's namespace(s)
 *                                // to the shared Socket.IO server.
 *     async init(ctx) {},        // optional. ctx = { config, logger, schema }.
 *                                // Connect models/queues/etc. MUST NOT listen.
 *   }
 *
 * `prefix`  — gateway mount path. A request to the module's internal
 *             `/api/foo` route is reached at `<prefix>/api/foo`.
 * `schema`  — Postgres schema the module's tables live in (single shared DB).
 * `socketNs`— Socket.IO namespace(s) the module owns, or null.
 */

const MODULES = [
  { name: 'ca',        prefix: '/ca',        schema: 'ca',        entry: '../../services/ca/index.js',            socketNs: ['/ca'] },
  { name: 'auth',      prefix: '/auth',      schema: 'auth',      entry: '../../services/auth/src/index.js',       socketNs: null },
  { name: 'spark',     prefix: '/spark',     schema: 'spark',     entry: '../../services/spark/src/index.js',      socketNs: ['/spark'] },
  { name: 'nexus',     prefix: '/nexus',     schema: 'nexus',     entry: '../../services/nexus/src/index.js',      socketNs: null },
  { name: 'filevault', prefix: '/filevault', schema: 'filevault', entry: '../../services/filevault/src/index.js',  socketNs: null },
  { name: 'vault',     prefix: '/vault',     schema: 'vault',     entry: '../../services/vault/src/index.js',      socketNs: ['/vault'] },
  { name: 'timeline',  prefix: '/timeline',  schema: 'timeline',  entry: '../../services/timeline/src/index.js',   socketNs: ['/timeline'] },
  { name: 'prefetch',  prefix: '/prefetch',  schema: 'prefetch',  entry: '../../services/prefetch/src/index.js',   socketNs: null },
  { name: 'moderator', prefix: '/moderator', schema: 'moderator', entry: '../../services/moderator/src/index.js',  socketNs: ['/moderation', '/notifications'] },
  { name: 'live',      prefix: '/live',      schema: 'live',      entry: '../../services/live/src/index.js',        socketNs: ['/live'] },
  { name: 'atproto',   prefix: '/atproto',   schema: 'atproto',   entry: '../../services/atproto/src/index.js',     socketNs: null },
];

module.exports = { MODULES };
