'use strict';

/**
 * ═══════════════════════════════════════════════════════════
 * Manifest validation — structural (ajv) + semantic (trust) checks.
 *
 * Layers (PLUGINS_PLAN.md §3):
 *  1. ajv structural validation against MANIFEST_SCHEMA.
 *  2. semver `version`.
 *  3. capabilities ⊆ the closed capability registry (the core trust control).
 *  4. events ⊆ known events; appliesTo ⊆ known module surfaces.
 *  5. webhook kind: endpoint required, https-in-prod, SSRF block of private/
 *     loopback targets unless explicitly allowlisted.
 *  6. declarative kind: a `behavior` with a match tree and/or actions.
 *  7. internal kind: rejected in MVP (post-MVP, first-party-only tier).
 *  8. configSchema, if present, must itself be a compilable JSON Schema.
 * ═══════════════════════════════════════════════════════════
 */

const Ajv = require('ajv');
const semver = require('semver');
const capabilities = require('../capabilities');
const events = require('../events');

const ajv = new Ajv({ allErrors: true });

const SURFACE_TYPES = ['admin-section', 'widget', 'menu-item'];
const SCOPE_TYPES = ['platform', 'organization', 'group', 'user'];

const MANIFEST_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['key', 'name', 'version', 'kind'],
  properties: {
    key: { type: 'string', pattern: '^[a-z][a-z0-9_-]*$', maxLength: 128 },
    name: { type: 'string', minLength: 1, maxLength: 255 },
    description: { type: 'string', maxLength: 2000 },
    version: { type: 'string' },
    publisher: { type: 'string', maxLength: 255 },
    kind: { type: 'string', enum: ['declarative', 'webhook', 'script', 'internal'] },
    appliesTo: { type: 'array', items: { type: 'string' } },
    events: { type: 'array', items: { type: 'string' } },
    scopes: { type: 'array', items: { type: 'string', enum: SCOPE_TYPES } },
    capabilities: { type: 'array', items: { type: 'string' } },
    endpoint: {
      type: 'object',
      additionalProperties: false,
      required: ['url'],
      properties: {
        url: { type: 'string' },
        timeoutMs: { type: 'integer', minimum: 250, maximum: 30000 },
        secretRef: { type: 'string' },
      },
    },
    behavior: { type: 'object' },
    script: {
      type: 'object',
      additionalProperties: false,
      required: ['source'],
      properties: {
        source: { type: 'string', minLength: 1, maxLength: 100000 },
        timeoutMs: { type: 'integer', minimum: 50, maximum: 10000 },
        memoryMb: { type: 'integer', minimum: 8, maximum: 256 },
      },
    },
    configSchema: { type: 'object' },
    surfaces: {
      type: 'array',
      items: {
        type: 'object',
        required: ['type', 'id', 'title'],
        properties: {
          type: { type: 'string', enum: SURFACE_TYPES },
          id: { type: 'string' },
          title: { type: 'string' },
          path: { type: 'string' },
          icon: { type: 'string' },
        },
      },
    },
  },
};

const validateStructure = ajv.compile(MANIFEST_SCHEMA);

/** Hostnames/IPs that must not be webhook targets unless explicitly allowlisted. */
function isPrivateOrLoopback(hostname) {
  const h = String(hostname).toLowerCase();
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local')) return true;
  if (h === '0.0.0.0' || h === '::1' || h === '[::1]') return true;
  // IPv4 private/loopback/link-local ranges.
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    if (a === 127 || a === 10 || a === 0) return true;
    if (a === 169 && b === 254) return true; // link-local
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
  }
  return false;
}

/**
 * Validate a manifest. Returns { valid, errors:[…], manifest }.
 * Pure — does not touch the DB.
 */
function validateManifest(manifest) {
  const errors = [];

  if (!validateStructure(manifest)) {
    for (const e of validateStructure.errors || []) {
      errors.push(`manifest${e.dataPath || ''} ${e.message}`);
    }
    return { valid: false, errors };
  }

  // semver
  if (!semver.valid(manifest.version)) {
    errors.push(`version "${manifest.version}" is not valid semver`);
  }

  // closed capability vocabulary
  const unknownCaps = capabilities.unknownCapabilities(manifest.capabilities);
  if (unknownCaps.length) {
    errors.push(`unknown capabilities: ${unknownCaps.join(', ')}`);
  }

  // known events + surfaces
  const unknownEv = events.unknownEvents(manifest.events);
  if (unknownEv.length) errors.push(`unknown events: ${unknownEv.join(', ')}`);
  const unknownSurf = events.unknownSurfaces(manifest.appliesTo);
  if (unknownSurf.length) errors.push(`unknown appliesTo surfaces: ${unknownSurf.join(', ')}`);

  // kind-specific rules
  if (manifest.kind === 'internal') {
    errors.push('kind "internal" is a post-MVP, first-party-only tier and cannot be registered yet');
  }

  if (manifest.kind === 'webhook') {
    if (!manifest.endpoint || !manifest.endpoint.url) {
      errors.push('webhook plugins require endpoint.url');
    } else {
      try {
        const u = new URL(manifest.endpoint.url);
        const prod = process.env.NODE_ENV === 'production';
        if (prod && u.protocol !== 'https:') {
          errors.push('webhook endpoint must use https in production');
        }
        if (u.protocol !== 'https:' && u.protocol !== 'http:') {
          errors.push('webhook endpoint must be http(s)');
        }
        const allowPrivate = process.env.PLUGINS_WEBHOOK_ALLOW_PRIVATE === 'true';
        if (!allowPrivate && isPrivateOrLoopback(u.hostname)) {
          errors.push(`webhook endpoint host "${u.hostname}" is private/loopback (set PLUGINS_WEBHOOK_ALLOW_PRIVATE=true to allow)`);
        }
      } catch {
        errors.push('webhook endpoint.url is not a valid URL');
      }
    }
    if (!manifest.capabilities || !manifest.capabilities.includes('call:webhook')) {
      errors.push('webhook plugins must declare the "call:webhook" capability');
    }
  }

  if (manifest.kind === 'declarative') {
    if (!manifest.behavior || (manifest.behavior.match === undefined && !Array.isArray(manifest.behavior.actions))) {
      errors.push('declarative plugins require a behavior with a match tree and/or actions');
    }
  }

  if (manifest.kind === 'script') {
    if (!manifest.script || !manifest.script.source) {
      errors.push('script plugins require script.source');
    }
    // Cheap static guard against the obvious escape hatches. The real boundary
    // is the worker-thread sandbox (no require/process/fs in scope), but a
    // pre-flight reject of these tokens fails fast and documents intent.
    const banned = /\b(require|process|globalThis|__proto__|constructor\s*\(|child_process|import\s*\()/;
    if (manifest.script && banned.test(manifest.script.source || '')) {
      errors.push('script.source references a banned token (require/process/import/child_process/...) — sandboxed scripts may only use ctx + platform');
    }
  }

  // configSchema must itself be a valid JSON Schema
  if (manifest.configSchema) {
    try {
      ajv.compile(manifest.configSchema);
    } catch (e) {
      errors.push(`configSchema is not a valid JSON Schema: ${e.message}`);
    }
  }

  return { valid: errors.length === 0, errors, manifest };
}

/**
 * Validate an installation `config` against the manifest's configSchema.
 * Returns { valid, errors }.
 */
function validateConfig(manifest, config) {
  if (!manifest || !manifest.configSchema) return { valid: true, errors: [] };
  let check;
  try {
    check = ajv.compile(manifest.configSchema);
  } catch (e) {
    return { valid: false, errors: [`configSchema invalid: ${e.message}`] };
  }
  if (check(config || {})) return { valid: true, errors: [] };
  return {
    valid: false,
    errors: (check.errors || []).map((e) => `config${e.dataPath || ''} ${e.message}`),
  };
}

module.exports = { validateManifest, validateConfig, isPrivateOrLoopback, MANIFEST_SCHEMA };
