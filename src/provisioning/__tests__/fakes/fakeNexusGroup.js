/**
 * Fake for services/nexus/src/services/groupService — the nexus social-group
 * façade the engine's S7 (slice-2 glue) creates and its compensator cascade-deletes.
 *
 * Real nexus lives in its own Postgres schema (not synced into the provisioning
 * test DB), so it is mocked here: createGroup is idempotent by the deterministic
 * `options.slug` the engine passes (`org-<orgId>`), and state lives in caState so
 * S7 create + compensation delete are observable ("zero orphans"). Every method is
 * a plain async function so tests can jest.spyOn(...) to inject an S7 failure.
 */

'use strict';

const crypto = require('crypto');
const { state } = require('./caState');

module.exports = {
  async createGroup(userId, data, options = {}) {
    const slug = (options && options.slug) || (data && data.slug) || null;
    if (slug && state.nexusGroupBySlug.has(slug)) {
      return state.nexusGroupBySlug.get(slug); // idempotent reuse
    }
    const group = {
      id: crypto.randomUUID(),
      slug,
      name: data && data.name,
      ownerId: userId,
      visibility: data && data.visibility,
      joinMode: data && data.joinMode
    };
    state.nexusGroupById.set(group.id, group);
    if (slug) {
      state.nexusGroupBySlug.set(slug, group);
    }
    return group;
  },

  async deleteGroupCascade(groupId) {
    const group = state.nexusGroupById.get(groupId);
    if (group) {
      if (group.slug) {
        state.nexusGroupBySlug.delete(group.slug);
      }
      state.nexusGroupById.delete(groupId);
    }
  }
};
