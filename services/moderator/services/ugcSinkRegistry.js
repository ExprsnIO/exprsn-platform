'use strict';

/**
 * ═══════════════════════════════════════════════════════════
 * UGC moderation sink registry  (FEAT-009 / ADR 0004 §4.2)
 *
 * The moderation worker MUST NOT write `timeline.posts` / `spark.messages` — or
 * their side tables — directly: that would break the one-schema-per-module
 * invariant (ADR 0004 §Consequences 2, non-negotiable). Instead each producing
 * module PUBLISHES an in-process "sink" that writes ONLY its own schema and
 * performs its own enforcement. This registry resolves the sink for a
 * `sourceService` via a lazy DOWNWARD require into that module's *service* layer
 * (never its models) — acyclic, and the same seam FileVault's worker already
 * uses in the other direction (`services/filevault/src/worker.js:133`).
 *
 * ─────────────────────────────────────────────────────────────
 * THE SINK CONTRACT — what timeline/spark/filevault must export (next phase)
 * at  services/<module>/src/services/moderationSink.js :
 * ─────────────────────────────────────────────────────────────
 *
 *   async applyVerdict(verdict) -> { applied: boolean, superseded?: boolean, status?: string }
 *
 *     Writes the module's OWN side table (timeline.post_moderation /
 *     spark.message_moderation) for one content item and performs local
 *     enforcement. MUST be a content-hash COMPARE-AND-SET (BUG-022): update the
 *     row ONLY where content_hash still equals `verdict.contentHash`; if zero
 *     rows match, the content was edited mid-flight — return
 *     { applied:false, superseded:true } and write NOTHING (a fresh job for the
 *     new bytes is already queued, and the row stays `pending`).
 *     `verdict` shape (all keys the worker may send):
 *        { sourceService, contentType, contentId,   // routing/identity
 *          status,        // 'approved'|'rejected'|'skipped'|'failed'|'pending'
 *          reason,        // 'clean'|'flagged'|'no_ai_provider'|'error'|...
 *          action,        // moderator action enum, mirrored for local enforcement
 *          riskScore, verdict, moderationItemId,     // verdict detail (may be null)
 *          contentHash,   // compare-and-set token
 *          lastError,     // on 'failed'/transient 'error' (never raw content)
 *          bumpAttempts } // true ⇒ increment the row's `attempts` counter
 *     Enforcement (module-owned): status='rejected' ⇒ retract (timeline:
 *     visibility→'private' + socket retraction; spark: redact + `message:redacted`
 *     emit on /spark). status in {approved,skipped,pending} ⇒ servable
 *     (fail-OPEN text visibility, §5b). Missing row ⇒ servable (C6) — treat an
 *     absent row as a no-op, do not resurrect it.
 *
 *   async listStalePending({ graceMs, limit }) -> Array<submitPayload>
 *
 *     Returns rows stuck at status='pending' older than `graceMs`, each shaped as
 *     a re-submittable payload:
 *        { sourceService, contentType, contentId, userId,
 *          contentText, contentUrl, contentMetadata, contentHash }
 *     Reads ONLY the module's own schema. This is how the worker's reconcile
 *     sweep (§4.2 step 6) re-enqueues stranded content WITHOUT the worker ever
 *     reading another module's tables — schema isolation is preserved because
 *     each module reports its own pending rows. Best-effort; never throws.
 *
 * The SAME `applyVerdict` also backs the HTTP fallback
 * `POST /<module>/api/moderation/action` (ADR 0004 §4.2) — the out-of-process
 * seam `moderationActions.js:394` already POSTs into. That route ships WITH
 * `authenticateService` (shared/middleware/auth.js:221) from day one — an
 * unauthenticated mutation sink is exactly BUG-006.
 * ═══════════════════════════════════════════════════════════
 */

const logger = require('../src/utils/logger');

// sourceService discriminator → the module's published sink module path.
// Lazy-required so the worker boots even for a deployment where a given module
// (or its sink, in this phase) is not present.
const SINK_PATHS = {
  timeline: '../../timeline/src/services/moderationSink',
  spark: '../../spark/src/services/moderationSink',
  // FileVault's IMAGE lane keeps its own worker/side-table (FEAT-031); this
  // entry exists so a human reviewer's decision routed by sourceService still
  // resolves, and so the HTTP action sink is symmetric across modules.
  filevault: '../../filevault/src/services/moderationSink',
};

// Test/override hook: register a sink instance directly, bypassing require.
const overrides = new Map();

function registerSink(sourceService, sink) {
  overrides.set(sourceService, sink);
}

function clearOverrides() {
  overrides.clear();
}

/**
 * Resolve the sink for a sourceService, or null if none is published yet.
 * Never throws — a missing sink is logged once and treated as "verdict cannot
 * be written back locally" (the moderator-side moderation_items row is still
 * created; only the module-local enforcement is deferred until its sink ships).
 */
const warned = new Set();
function resolveSink(sourceService) {
  if (overrides.has(sourceService)) return overrides.get(sourceService);
  const modPath = SINK_PATHS[sourceService];
  if (!modPath) {
    if (!warned.has(sourceService)) {
      warned.add(sourceService);
      logger.warn('no moderation sink registered for sourceService', { sourceService });
    }
    return null;
  }
  try {
    // eslint-disable-next-line global-require
    return require(modPath);
  } catch (err) {
    if (!warned.has(sourceService)) {
      warned.add(sourceService);
      logger.warn('moderation sink not available (module or sink not present yet)', {
        sourceService, error: err.message,
      });
    }
    return null;
  }
}

/** The sourceServices this registry knows how to route to. */
function knownSinks() {
  return Object.keys(SINK_PATHS);
}

module.exports = {
  resolveSink,
  registerSink,
  clearOverrides,
  knownSinks,
  SINK_PATHS,
};
