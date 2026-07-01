'use strict';

/**
 * ═══════════════════════════════════════════════════════════
 * Event + surface registry — what the platform owns.
 *
 * A manifest's `events` must reference known events and its `appliesTo` must
 * reference known module surfaces (PLUGINS_PLAN.md §3). The hook bus
 * (pluginHost) only dispatches events listed here, so a typo or a probe for an
 * un-instrumented event is rejected at validation time rather than silently
 * never firing.
 *
 * Adding an emit point = add the event here AND call pluginHost.emit() at the
 * instrumented site. Keeping the two in sync is intentional.
 * ═══════════════════════════════════════════════════════════
 */

/** Known module surfaces a plugin may declare in `appliesTo`. */
const MODULE_SURFACES = ['timeline', 'spark', 'moderator', 'lowcode', 'nexus', 'live', 'auth', 'filevault'];

/**
 * Known events. `module` is the emitting surface; `payload` documents the
 * context shape passed to pluginHost.emit (informational).
 */
const EVENTS = [
  { key: 'timeline.post.created', module: 'timeline', description: 'A timeline post was created.' },
  { key: 'spark.message.created', module: 'spark', description: 'A spark message was sent.' },
  { key: 'moderator.content.flagged', module: 'moderator', description: 'Moderation flagged a piece of content.' },
  { key: 'lowcode.record.created', module: 'lowcode', description: 'A low-code entity record was created.' },
  { key: 'lowcode.record.updated', module: 'lowcode', description: 'A low-code entity record was updated.' },
  // Registered as known triggers so flows can be authored against them; the
  // emitting call sites are wired in the platform-interaction pass.
  { key: 'live.room.created', module: 'live', description: 'A live room was created.' },
  { key: 'nexus.group.member.joined', module: 'nexus', description: 'A member joined a Nexus group.' },
  { key: 'auth.user.registered', module: 'auth', description: 'A user completed registration.' },
];

const EVENT_KEYS = new Set(EVENTS.map((e) => e.key));
const SURFACE_SET = new Set(MODULE_SURFACES);

function isKnownEvent(key) { return EVENT_KEYS.has(key); }
function isKnownSurface(name) { return SURFACE_SET.has(name); }
function unknownEvents(keys) { return (keys || []).filter((k) => !EVENT_KEYS.has(k)); }
function unknownSurfaces(names) { return (names || []).filter((n) => !SURFACE_SET.has(n)); }

/** The module that emits an event, or null. */
function eventModule(key) {
  const e = EVENTS.find((x) => x.key === key);
  return e ? e.module : null;
}

module.exports = {
  MODULE_SURFACES,
  EVENTS,
  eventKeys: () => [...EVENT_KEYS],
  isKnownEvent,
  isKnownSurface,
  unknownEvents,
  unknownSurfaces,
  eventModule,
};
