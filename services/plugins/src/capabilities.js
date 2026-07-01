'use strict';

/**
 * ═══════════════════════════════════════════════════════════
 * Closed capability vocabulary — the core trust control.
 *
 * A manifest may only declare capabilities drawn from this registry; an unknown
 * capability is rejected at validation time (PLUGINS_PLAN.md §3). Grants stored
 * in plugins.plugin_grants must be a subset of a plugin's declared capabilities,
 * and requirePluginCapability() (Phase 2) checks a requested capability against
 * those grants.
 *
 * Naming: `<verb>:<module>.<noun>` (read/write/emit/call). Keep this list small
 * and auditable; widening it is a deliberate security decision.
 *
 * IMPORTANT (moderator interaction, PLUGINS_PLAN.md §3): a `write:*content*`
 * capability does NOT let a plugin bypass moderation — produced/modified content
 * is routed back through services/moderator before it lands. Plugins default to
 * read/emit; write capabilities are flagged `routesThroughModerator`.
 * ═══════════════════════════════════════════════════════════
 */

/** @typedef {{ key:string, description:string, routesThroughModerator?:boolean }} Capability */

/** The authoritative closed set. */
const CAPABILITIES = [
  // ── read ──
  { key: 'read:timeline.posts', description: 'Read timeline post events and content.' },
  { key: 'read:spark.messages', description: 'Read spark message events (metadata; bodies are E2EE).' },
  { key: 'read:moderator.content', description: 'Read moderation content/verdict events.' },
  { key: 'read:lowcode.records', description: 'Read low-code entity record events.' },
  { key: 'read:nexus.groups', description: 'Read group membership/context.' },

  // ── emit (side-effects that fan back into the platform, always re-moderated) ──
  { key: 'emit:notifications', description: 'Emit an in-app notification to a user.' },
  { key: 'emit:audit', description: 'Write an entry to the plugin audit/delivery log.' },
  { key: 'emit:moderator.flag', description: 'Flag content for moderator review (never auto-acts).' },

  // ── write (produced content is force-routed through moderator) ──
  { key: 'write:timeline.posts', description: 'Create timeline posts on a user\'s behalf.', routesThroughModerator: true },
  { key: 'write:spark.messages', description: 'Send spark messages on a user\'s behalf.', routesThroughModerator: true },
  { key: 'write:lowcode.records', description: 'Create/update low-code entity records.', routesThroughModerator: true },
  { key: 'write:nexus.posts', description: 'Post to a Nexus group on a user\'s behalf.', routesThroughModerator: true },
  { key: 'write:filevault.files', description: 'Write files into FileVault.' },

  // ── call (webhook plugins + low-code module actions) ──
  { key: 'call:webhook', description: 'Receive signed outbound webhook deliveries.' },
  { key: 'call:queues.enqueue', description: 'Enqueue a job onto a moderation/job queue.' },
  { key: 'read:vault.secrets', description: 'Read a named secret from Vault (value never logged).' },
];

const BY_KEY = new Map(CAPABILITIES.map((c) => [c.key, c]));

/** Is `cap` a member of the closed vocabulary? */
function isKnownCapability(cap) {
  return BY_KEY.has(cap);
}

/** Validate a list of capabilities; returns the unknown ones (empty = all valid). */
function unknownCapabilities(caps) {
  if (!Array.isArray(caps)) return [];
  return caps.filter((c) => !BY_KEY.has(c));
}

/** Does this capability route any produced content back through moderation? */
function routesThroughModerator(cap) {
  const c = BY_KEY.get(cap);
  return !!(c && c.routesThroughModerator);
}

/** Subset check — every member of `requested` must be in `declared`. */
function isSubset(requested, declared) {
  const set = new Set(declared || []);
  return (requested || []).every((c) => set.has(c));
}

module.exports = {
  CAPABILITIES,
  capabilityKeys: () => CAPABILITIES.map((c) => c.key),
  isKnownCapability,
  unknownCapabilities,
  routesThroughModerator,
  isSubset,
};
