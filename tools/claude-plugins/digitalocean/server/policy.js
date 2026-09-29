'use strict';

/**
 * Safety policy for the DigitalOcean MCP server.
 *
 * Every tool declares a level:
 *   read    — GETs only; always allowed.
 *   write   — creates / updates / power actions; needs DO_MCP_MODE=read-write or full.
 *   destroy — deletes and disk-wiping actions; needs DO_MCP_MODE=full AND an exact
 *             `confirm` argument echoing the target.
 *
 * Resources tagged with DO_MCP_PROTECTED_TAG (default "protected") refuse
 * write/destroy droplet actions regardless of mode.
 */

const MODES = ['read-only', 'read-write', 'full'];
const LEVEL_RANK = { read: 0, write: 1, destroy: 2 };
const MODE_RANK = { 'read-only': 0, 'read-write': 1, full: 2 };

class PolicyError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PolicyError';
  }
}

function loadPolicy(env = process.env) {
  const raw = (env.DO_MCP_MODE || 'read-only').trim().toLowerCase();
  const mode = MODES.includes(raw) ? raw : 'read-only';
  const protectedTag = env.DO_MCP_PROTECTED_TAG === undefined ? 'protected' : env.DO_MCP_PROTECTED_TAG.trim();
  return { mode, protectedTag, invalidMode: MODES.includes(raw) ? null : raw };
}

function assertAllowed(policy, level, toolName) {
  if (LEVEL_RANK[level] <= MODE_RANK[policy.mode]) return;
  const needed = level === 'destroy' ? 'full' : 'read-write';
  throw new PolicyError(
    `${toolName} is a ${level} operation but the server is in ${policy.mode} mode. ` +
    `Restart Claude Code with DO_MCP_MODE=${needed} to allow it.`
  );
}

function assertConfirmed(expected, confirm, what) {
  const want = String(expected);
  if (confirm === undefined || confirm === null || String(confirm) !== want) {
    throw new PolicyError(
      `Refusing to ${what}: pass confirm="${want}" exactly, after the user has explicitly approved this action.`
    );
  }
}

function assertNotProtected(policy, resource, what) {
  if (!policy.protectedTag || !resource) return;
  const tags = resource.tags || [];
  if (tags.includes(policy.protectedTag)) {
    throw new PolicyError(
      `Refusing to ${what}: ${resource.name || resource.id} carries the "${policy.protectedTag}" tag. ` +
      'Remove the tag in the DigitalOcean console first if this is really intended.'
    );
  }
}

function levelForMethod(method) {
  const m = String(method || 'GET').toUpperCase();
  if (m === 'GET' || m === 'HEAD') return 'read';
  if (m === 'DELETE') return 'destroy';
  return 'write';
}

module.exports = {
  MODES,
  PolicyError,
  loadPolicy,
  assertAllowed,
  assertConfirmed,
  assertNotProtected,
  levelForMethod,
};
