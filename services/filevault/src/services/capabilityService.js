'use strict';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * FEAT-077 — Capability façade (Shape A, architect-approved 2026-07-27)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * ONE enforcement point for resource capabilities, backed by per-resource-type
 * adapters. This is a service export, not a route or module: the module
 * contract (JSON-API-only), src/modules/registry.js and API_SURFACE.md are
 * untouched — the façade adds ZERO HTTP surface. `revokeByResource` /
 * `listByResource` are service-layer only this slice.
 *
 * Backend registry, not a growing enum: a resource type is usable ONLY once a
 * backend is registered for it. There are NO per-type conditionals in this
 * file — type is purely a dispatch key into the adapter map. Adding a type =
 * registering an adapter; never editing façade internals. The FileVault
 * adapter ('file') is registered below; services/live registers its RoomFile
 * adapter for 'roomFile' at its own init (TASK-057) — dependency direction is
 * one-way (consumers require this façade; filevault requires nothing back).
 *
 * Fail-closed: every denial — unknown type, unregistered type, missing,
 * expired, exhausted, revoked, provenance-dead, moderation-held,
 * permission-short, or an UNEXPECTED adapter error (DB down, bug) — surfaces
 * to the caller as CapabilityError('CAP_NOT_FOUND'). Denied and missing are
 * indistinguishable (FEAT-031/BUG-020 same-404 posture). The one codified
 * exception (CA unreachable ≠ deny for a locally-valid link) lives INSIDE the
 * FileVault adapter, not here — it is backend policy, not façade policy.
 *
 * Invalidation semantics (normative, Rick's 2026-07-13 provenance decision):
 * owner-minted capabilities survive a private-flip; non-owner-minted ones die
 * with the visibility they were minted under, enforced lazily at authorize
 * time by the adapter's grant predicate (no event hooks, no active revocation
 * on visibility change). Explicit revoke/revokeByResource kills grants
 * regardless of provenance.
 */

const logger = require('../utils/logger');
const CapabilityError = require('./capability/CapabilityError');

/**
 * Frozen resource-type name registry. 'file' is live this slice; 'roomFile'
 * and 'album' are RESERVED NAMES ONLY — no behavior, no code, no adapter
 * stubs (contract §5). Unknown/unregistered type => CapabilityError.
 */
const RESOURCE_TYPES = Object.freeze({
  FILE: 'file',          // slice: FileVault adapter (this sprint)
  ROOM_FILE: 'roomFile', // reserved: TASK-057 (2026-12)
  ALBUM: 'album'         // reserved: FEAT-047/048 (name reserved ONLY)
});

const VALID_TYPE_NAMES = new Set(Object.values(RESOURCE_TYPES));
const ADAPTER_METHODS = ['mint', 'authorize', 'revoke', 'revokeByResource', 'listByResource'];

/** @type {Map<string, object>} resourceType -> adapter */
const backends = new Map();

/**
 * Register a backend adapter for a resource type. Wiring-time programming
 * errors (unknown name, duplicate, malformed adapter) throw plain Errors so
 * they explode loudly at require/init — runtime lookups fail closed instead.
 */
function registerBackend(resourceType, adapter) {
  if (!VALID_TYPE_NAMES.has(resourceType)) {
    throw new Error(`Unknown capability resource type: '${resourceType}' — add it to RESOURCE_TYPES first`);
  }
  if (backends.has(resourceType)) {
    throw new Error(`Capability backend already registered for resource type '${resourceType}'`);
  }
  if (!adapter || typeof adapter.backendName !== 'string') {
    throw new Error(`Capability adapter for '${resourceType}' must expose a backendName`);
  }
  for (const method of ADAPTER_METHODS) {
    if (typeof adapter[method] !== 'function') {
      throw new Error(`Capability adapter '${adapter.backendName}' is missing required method '${method}'`);
    }
  }
  backends.set(resourceType, adapter);
  logger.info(`Capability backend registered: '${resourceType}' -> ${adapter.backendName}`);
}

/** Runtime lookup — unknown or unregistered type is a denial, fail closed. */
function getBackend(resourceType) {
  const adapter = backends.get(resourceType);
  if (!adapter) {
    throw new CapabilityError('CAP_NOT_FOUND', `NO_BACKEND:${resourceType}`);
  }
  return adapter;
}

/**
 * Normalize any adapter failure into the single denial. CapabilityErrors pass
 * through untouched (the adapter already decided); anything else is an
 * unexpected error (DB down, bug) that propagates as denial — never fail open
 * — after logging with context.
 */
function asDenial(err, context) {
  if (err instanceof CapabilityError) {
    return err;
  }
  logger.error('Capability operation failed closed on unexpected error', {
    ...context,
    error: err.message
  });
  return new CapabilityError('CAP_NOT_FOUND', err.message);
}

/**
 * grant — mint a capability against a resource. Provenance is derived by the
 * adapter from the verified resource, never from caller input (BUG-026).
 * @returns {Promise<{capability, credential, url?}>}
 */
async function grant(resourceType, resourceId, grantorId, opts = {}) {
  const adapter = getBackend(resourceType);
  try {
    return await adapter.mint(resourceId, grantorId, opts);
  } catch (err) {
    throw asDenial(err, { op: 'grant', resourceType, resourceId });
  }
}

/**
 * authorize — resolve + enforce in one call. There is deliberately NO
 * resolve-only public method: resolving without enforcing is how BUG-020
 * happened. Enforcement lives entirely in the adapter (exactly one place per
 * backend); the façade adds nothing on top.
 * @returns {Promise<{resource, capability}>}
 */
async function authorize(resourceType, credential, ctx = {}) {
  const adapter = getBackend(resourceType);
  try {
    return await adapter.authorize(credential, ctx);
  } catch (err) {
    throw asDenial(err, { op: 'authorize', resourceType });
  }
}

/**
 * revoke — revoke one capability by id, actor-checked by the adapter.
 * @returns {Promise<true>}
 */
async function revoke(resourceType, capabilityId, actorId) {
  const adapter = getBackend(resourceType);
  try {
    return await adapter.revoke(capabilityId, actorId);
  } catch (err) {
    throw asDenial(err, { op: 'revoke', resourceType, capabilityId });
  }
}

/**
 * revokeByResource — kill EVERY outstanding capability on a resource (all
 * kinds, all provenance — owner-minted included). Platform-internal; not
 * exposed as a route this slice. Subsumes TASK-055.
 * @returns {Promise<{revoked: number}>} — 0 is success, not an error.
 */
async function revokeByResource(resourceType, resourceId, opts = {}) {
  const adapter = getBackend(resourceType);
  try {
    return await adapter.revokeByResource(resourceId, opts);
  } catch (err) {
    throw asDenial(err, { op: 'revokeByResource', resourceType, resourceId });
  }
}

/**
 * listByResource — owner's management view of live grants (descriptors only,
 * never secret material).
 * @returns {Promise<object[]>}
 */
async function listByResource(resourceType, resourceId, requesterId) {
  const adapter = getBackend(resourceType);
  try {
    return await adapter.listByResource(resourceId, requesterId);
  } catch (err) {
    throw asDenial(err, { op: 'listByResource', resourceType, resourceId });
  }
}

// ── Backend registration ────────────────────────────────────────────────
// FileVault's own ShareLink/CA-token backend is the only adapter this slice.
// 'roomFile' stays unregistered until services/live registers its adapter
// (TASK-057); 'album' is a reserved name with no code anywhere.
registerBackend(RESOURCE_TYPES.FILE, require('./capability/filevaultShareLinkAdapter'));

module.exports = {
  RESOURCE_TYPES,
  CapabilityError,
  registerBackend,
  grant,
  authorize,
  revoke,
  revokeByResource,
  listByResource
};
