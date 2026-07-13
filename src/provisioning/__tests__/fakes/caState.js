/**
 * Shared in-memory CA state for the provisioning test fakes.
 *
 * The CA (certificate / token / directory) primitives are mocked in this suite so
 * we never do real RSA keygen or touch a CA database, but we DO model just enough
 * contract for the saga's assertions:
 *   • directory groups (so S2 create + compensation delete are observable, and the
 *     deactivation-as-revocation lever is testable);
 *   • certs keyed by id with a status (so "compensation REVOKES, never DELETES" is
 *     assertable — the row stays present with status='revoked');
 *   • tokens keyed by id with a scope group id (so validateToken can honor the
 *     SCOPE_INACTIVE lever when the token's directory group is deactivated).
 *
 * A single shared module keeps the token fake's scope check consistent with the
 * directory fake's group store.
 */

'use strict';

const state = {
  seq: 0,
  // directory groups
  groupById: new Map(),
  groupBySlug: new Map(),
  members: [], // { userId, groupId, role }
  // certificates
  certs: new Map(), // id -> { id, type, status, organizationalUnit, issuerId, commonName }
  // tokens
  tokens: new Map(), // id -> { id, status, userId, organizationId }
  // nexus social groups (S7) — slice-2 glue, mocked so happy/rollback are observable
  nexusGroupById: new Map(), // id -> { id, slug, name, ownerId }
  nexusGroupBySlug: new Map(),
  // spark group channels (S8) — groupId -> { chat, announcement }
  sparkChannelsByGroup: new Map(),
  // preflight levers
  root: { id: 'root-cert-1', status: 'active', type: 'root' },
  keyUsable: true
};

function nextId(prefix) {
  state.seq += 1;
  return `${prefix}-${state.seq}`;
}

function reset() {
  state.seq = 0;
  state.groupById.clear();
  state.groupBySlug.clear();
  state.members.length = 0;
  state.certs.clear();
  state.tokens.clear();
  state.nexusGroupById.clear();
  state.nexusGroupBySlug.clear();
  state.sparkChannelsByGroup.clear();
  state.root = { id: 'root-cert-1', status: 'active', type: 'root' };
  state.keyUsable = true;
}

module.exports = { state, nextId, reset };
