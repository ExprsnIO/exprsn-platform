/**
 * Fake for services/ca/services/directory — the CA directory-group façade the
 * engine's S2 (create group + owner membership) and its compensators call.
 *
 * Group + membership state lives in caState so: (a) the token fake's scope check
 * sees the same groups; (b) compensation deletes are observable ("zero orphans").
 * Idempotent by slug, matching the real Group.findOrCreate({ where: { slug } }).
 */

'use strict';

const crypto = require('crypto');
const { state } = require('./caState');

module.exports = {
  async ensureOrgDirectoryGroup({ name, slug, description = null }) {
    let group = state.groupBySlug.get(slug);
    let created = false;
    if (!group) {
      group = {
        // caGroupId lands in Organization.ca_group_id (a UUID column) — must be a UUID.
        id: crypto.randomUUID(),
        name,
        slug,
        description,
        type: 'organizational_unit',
        status: 'active'
      };
      state.groupBySlug.set(slug, group);
      state.groupById.set(group.id, group);
      created = true;
    }
    return { group, created };
  },

  async addOrgGroupMember(authUserId, groupId, role = 'owner') {
    const existing = state.members.find((m) => m.userId === authUserId && m.groupId === groupId);
    if (existing) {
      return { membership: existing, created: false };
    }
    const membership = { userId: authUserId, groupId, role };
    state.members.push(membership);
    return { membership, created: true };
  },

  async deleteOrgDirectoryGroup(groupId) {
    const group = state.groupById.get(groupId);
    if (group) {
      state.groupBySlug.delete(group.slug);
      state.groupById.delete(groupId);
    }
    for (let i = state.members.length - 1; i >= 0; i -= 1) {
      if (state.members[i].groupId === groupId) {
        state.members.splice(i, 1);
      }
    }
  },

  async removeOrgGroupMember(authUserId, groupId) {
    for (let i = state.members.length - 1; i >= 0; i -= 1) {
      if (state.members[i].userId === authUserId && state.members[i].groupId === groupId) {
        state.members.splice(i, 1);
      }
    }
  }
};
